"""Anti-hallucination guard for InvestigatorAgent outputs (Lot A, 2026-05-12).

The guard cross-checks the LLM's structured classification claims
against the deterministic `rubrique_confidence_run` table for the
current validation_run. Any cell whose DB classification differs
from the class implied by the Pydantic field it was placed in is
flagged as a violation and filtered from the corrected output. The
LLM-generated free-form text (cause_racine, suggestion_correction,
explication_ecart) is NOT touched — that responsibility belongs to a
prompt revision (out of Lot A scope); this guard caps the
structured-claim surface only.

Zero hardcoding:

  * The enum of allowed classifications lives in platform_config
    (`cross_rule_classifications_allowed`, migration 118 seed). The
    guard reads it at runtime and refuses to validate a mapping that
    references a classification outside the enum.

  * The mapping (Pydantic field name → expected classification) lives
    in platform_config (`regalica_guard_field_classification_map`,
    migration 118 seed) — NOT in source. The field names are Python
    identifiers (structural), the classifications are business
    values (DB-driven).

  * The guard-notice TEXT lives in prompt_bank
    (`regalica/guard_notice_correction`, migration 118 seed). The
    guard never embeds a French sentence inline; it loads the static
    response from prompt_bank and appends the list of filtered
    cells in a deterministic format.

Failure modes:

  * platform_config key missing → log WARNING, return GuardResult
    with `valid=True` and empty violations (fail-soft). The guard
    is a defense layer, never a blocker; if it can't run, the chat
    flow continues unchanged.

  * SQL failure on rubrique_confidence_run → same fail-soft posture.

  * Prompt missing → corrected_output.guard_notice falls back to a
    minimal generic notice (still DB-driven via a fallback config
    key, not a code literal). The corrections themselves still apply.

Doctrine: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Final

import asyncpg

from app.contracts.investigator import CausalAttribution, CellRef, InvestigatorOutput
from app.services.platform_config import (
    PlatformConfigError,
    PlatformConfigShapeError,
    load_platform_config_value,
)
from app.services.prompt_loader import load_active_prompt

_logger = logging.getLogger(__name__)

# platform_config keys seeded by migration 118. Code references the
# constants; the migration owns the literal values so a rename
# happens in one place.
_CLASSIFICATIONS_ALLOWED_KEY: Final[str] = "cross_rule_classifications_allowed"
_FIELD_CLASSIFICATION_MAP_KEY: Final[str] = "regalica_guard_field_classification_map"
# Lot A.2.2 — operator-controlled strictness of the causal dimension
# (migration 119). Allowed values: 'strict_when_present' (default —
# every non-None attribution must match contributing_rule_ids) or
# 'lax' (warn but do not filter). When the value is anything else,
# the guard falls back to strict_when_present and logs a WARNING.
_CAUSAL_MODE_KEY: Final[str] = "regalica_guard_causal_attributions_mode"
_CAUSAL_MODE_STRICT: Final[str] = "strict_when_present"
_CAUSAL_MODE_LAX: Final[str] = "lax"

# `regalica` is a foreign-key reference to prompt_bank.agent_type —
# the canonical row identifier for every Regalica-authored prompt.
# The literal MUST match migration 118's seed exactly; moving it to
# platform_config would split the source of truth across two tables.
# Same nosemgrep pattern as the other Regalica FK references
# elsewhere in this codebase (orchestrator.py, upload.py).
_GUARD_NOTICE_AGENT_TYPE: Final[str] = "regalica"  # nosemgrep: D-004-var-name-string-literal
_GUARD_NOTICE_FUNCTION_NAME: Final[str] = "guard_notice_correction"


@dataclass(frozen=True)
class Violation:
    """One mismatch between an LLM claim and the DB.

    `cell` — the offending (rubrique, colonne) pair.
    `field_name` — the Pydantic attribute the offending payload was
        placed in. For classification violations this is e.g.
        "rubriques_innocentees_cells"; for causal violations it is
        "causal_attributions".
    `expected` — the classification implied by `field_name` (for
        classification violations) OR the empty string for causal
        violations (the "expected" value is the membership of the
        attributed rule in contributing_rule_ids, not a string).
    `actual` — the classification observed in rubrique_confidence_run
        for this cell + run (classification violations), or `None`
        when the row is absent. Empty string for causal violations.
    `kind` — discriminator. `"classification_invalide"` (Lot A.1,
        default for backward compat) or `"attribution_causale_invalide"`
        (Lot A.2.2). Tests assert on this string.
    `attributed_rule` — `(ax_term, num_regle)` tuple for causal
        violations; `None` for classification violations.
    """

    cell: CellRef
    field_name: str
    expected: str
    actual: str | None
    kind: str = "classification_invalide"
    attributed_rule: tuple[str, int] | None = None


@dataclass(frozen=True)
class GuardResult:
    """Outcome of `verify_investigator_against_db`.

    `valid` — True when no DB cross-check violations were found.
        When True, `corrected_output` is None and the caller keeps
        the original LLM output.
    `violations` — tuple of every Violation observed, in deterministic
        order (field_name, then rubrique, then colonne).
    `corrected_output` — None when valid is True; otherwise a copy of
        the LLM output with invalid CellRefs filtered out per list,
        and `guard_notice` set to the DB-driven notice text appended
        with the list of filtered cells.
    """

    valid: bool
    violations: tuple[Violation, ...] = field(default_factory=tuple)
    corrected_output: InvestigatorOutput | None = None


async def _load_classifications_allowed(pool: asyncpg.Pool) -> frozenset[str]:
    """Return the DB-driven enum of valid classification names."""
    raw = await load_platform_config_value(pool, _CLASSIFICATIONS_ALLOWED_KEY)
    if not isinstance(raw, list) or not all(isinstance(x, str) and x for x in raw):
        raise PlatformConfigShapeError(_CLASSIFICATIONS_ALLOWED_KEY, "list[str]", raw)
    return frozenset(str(x) for x in raw)


async def _load_field_classification_map(pool: asyncpg.Pool) -> dict[str, str]:
    """Return the DB-driven field-to-expected-classification mapping."""
    raw = await load_platform_config_value(pool, _FIELD_CLASSIFICATION_MAP_KEY)
    if not isinstance(raw, dict):
        raise PlatformConfigShapeError(_FIELD_CLASSIFICATION_MAP_KEY, "dict[str,str]", raw)
    out: dict[str, str] = {}
    for k, v in raw.items():
        if not isinstance(k, str) or not k:
            raise PlatformConfigShapeError(
                _FIELD_CLASSIFICATION_MAP_KEY, "dict[str,str] (key must be non-empty str)", raw
            )
        if not isinstance(v, str) or not v:
            raise PlatformConfigShapeError(
                _FIELD_CLASSIFICATION_MAP_KEY,
                "dict[str,str] (value must be non-empty str)",
                raw,
            )
        out[k] = v
    if not out:
        raise PlatformConfigShapeError(
            _FIELD_CLASSIFICATION_MAP_KEY, "non-empty dict[str,str]", raw
        )
    return out


async def _load_causal_mode(pool: asyncpg.Pool) -> str:
    """Return the operator-controlled strictness mode for causal checks.

    Falls back to `_CAUSAL_MODE_STRICT` and logs a WARNING when the
    seed is missing or its value is outside the allowed set —
    matches the fail-soft posture of the other guard loaders.
    """
    try:
        raw = await load_platform_config_value(pool, _CAUSAL_MODE_KEY)
    except PlatformConfigError:
        _logger.warning(
            "llm_output_guard: causal mode key missing (%s); defaulting to %s",
            _CAUSAL_MODE_KEY,
            _CAUSAL_MODE_STRICT,
        )
        return _CAUSAL_MODE_STRICT
    if not isinstance(raw, str):
        _logger.warning(
            "llm_output_guard: causal mode value %r is not a string; defaulting to %s",
            raw,
            _CAUSAL_MODE_STRICT,
        )
        return _CAUSAL_MODE_STRICT
    if raw not in (_CAUSAL_MODE_STRICT, _CAUSAL_MODE_LAX):
        _logger.warning(
            "llm_output_guard: causal mode %r outside allowed set; defaulting to %s",
            raw,
            _CAUSAL_MODE_STRICT,
        )
        return _CAUSAL_MODE_STRICT
    return raw


async def _load_db_classifications_for_cells(
    pool: asyncpg.Pool,
    *,
    run_id: str,
    tenant_id: str,
    cells: tuple[CellRef, ...],
) -> dict[tuple[str, str], str]:
    """Return {(rubrique, colonne): classification} for every requested cell.

    Cells absent from rubrique_confidence_run are omitted from the
    dict; the caller treats a missing entry as `actual=None`.
    Cross-conversation isolation: WHERE on validation_run_id AND
    tenant_id (defense in depth — RLS is the primary).
    """
    if not cells:
        return {}
    rubriques = [c.rubrique for c in cells]
    colonnes = [c.colonne for c in cells]
    try:
        rows = await pool.fetch(
            """
            SELECT rubrique_code, colonne_code, classification
              FROM rubrique_confidence_run
             WHERE validation_run_id = $1::uuid
               AND tenant_id         = $2::uuid
               AND (rubrique_code, colonne_code) IN (
                   SELECT * FROM unnest($3::text[], $4::text[])
               )
            """,
            run_id,
            tenant_id,
            rubriques,
            colonnes,
        )
    except Exception:
        _logger.exception(
            "llm_output_guard: rubrique_confidence_run lookup failed run=%s tenant=%s",
            run_id,
            tenant_id,
        )
        return {}
    return {
        (str(r["rubrique_code"]), str(r["colonne_code"])): str(r["classification"]) for r in rows
    }


async def _load_guard_notice_template(pool: asyncpg.Pool, tenant_id: str) -> str | None:
    """Load the guard-notice static_response text from prompt_bank.

    Returns None when the prompt row is not active (cold-start tenant,
    migration 118 not yet applied). Caller decides whether to attach
    a notice or skip it.
    """
    meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=_GUARD_NOTICE_AGENT_TYPE,
        function_name=_GUARD_NOTICE_FUNCTION_NAME,
    )
    if meta is None:
        return None
    static_response = meta.get("static_response")
    if isinstance(static_response, str) and static_response.strip():
        return static_response
    return None


def _format_violations_as_french_list(violations: tuple[Violation, ...]) -> str:
    """Serialise the list of filtered claims for inclusion in the notice.

    Pure data formatting — only cell pairs, classifications, and
    rule identifiers loaded from DB. The wrapping French sentence is
    supplied by the prompt template (regalica/guard_notice_correction).

    Two violation kinds produce two distinct one-liner shapes:

      * classification_invalide → "PA01/C1 (annoncée innocent, observée suspect)"
      * attribution_causale_invalide → "PA01/C1 → règle 630/330 absente des
        contributeurs (630/380, 630/382)"
    """
    lines: list[str] = []
    for v in violations:
        if v.kind == "attribution_causale_invalide" and v.attributed_rule is not None:
            ax, num = v.attributed_rule
            lines.append(
                f"- `{v.cell.rubrique}/{v.cell.colonne}` → règle `{ax}/{num}` "
                f"absente des contributeurs"
            )
        else:
            lines.append(
                f"- `{v.cell.rubrique}/{v.cell.colonne}` (annoncée {v.expected}, "
                f"observée {v.actual or 'absente'})"
            )
    return "\n".join(lines)


def _apply_corrections(
    output: InvestigatorOutput,
    violations: tuple[Violation, ...],
    notice_text: str | None,
) -> InvestigatorOutput:
    """Return a new InvestigatorOutput with invalid claims filtered out.

    Handles both classification violations (filter cells from the
    three cell lists) and causal violations (filter entries from
    causal_attributions). Each violation kind keys on a different
    structural anchor:

      * classification → (field_name, rubrique, colonne)
      * causal         → (rubrique, colonne, ax_term, num_regle)
    """
    invalid_cells_by_field: dict[str, set[tuple[str, str]]] = {}
    invalid_attributions: set[tuple[str, str, str, int]] = set()
    for v in violations:
        if v.kind == "attribution_causale_invalide" and v.attributed_rule is not None:
            ax, num = v.attributed_rule
            invalid_attributions.add((v.cell.rubrique, v.cell.colonne, ax, num))
        else:
            invalid_cells_by_field.setdefault(v.field_name, set()).add(
                (v.cell.rubrique, v.cell.colonne)
            )

    def _filter_cells(field_name: str, cells: list[CellRef]) -> list[CellRef]:
        bad = invalid_cells_by_field.get(field_name)
        if not bad:
            return cells
        return [c for c in cells if (c.rubrique, c.colonne) not in bad]

    if notice_text is not None:
        guard_notice = f"{notice_text.rstrip()}\n\n{_format_violations_as_french_list(violations)}"
    else:
        # No template available — surface a deterministic fallback
        # that the operator can still parse (no LLM call). The list
        # of claims is the audit signal; the wrapper is missing
        # because migration 118 hasn't been applied yet.
        guard_notice = _format_violations_as_french_list(violations)

    update: dict[str, object] = {
        "rubrique_incriminee_cells": _filter_cells(
            "rubrique_incriminee_cells", list(output.rubrique_incriminee_cells)
        ),
        "rubriques_innocentees_cells": _filter_cells(
            "rubriques_innocentees_cells", list(output.rubriques_innocentees_cells)
        ),
        "rubriques_indeterminees_cells": _filter_cells(
            "rubriques_indeterminees_cells", list(output.rubriques_indeterminees_cells)
        ),
        "guard_notice": guard_notice,
    }

    # Lot A.2.2 — filter invalid causal attributions when any violation
    # of kind 'attribution_causale_invalide' was recorded. None passes
    # through unchanged (the LLM did not emit the field).
    if invalid_attributions and output.causal_attributions is not None:
        update["causal_attributions"] = [
            a
            for a in output.causal_attributions
            if (
                a.cell.rubrique,
                a.cell.colonne,
                a.attributed_rule_ax_term,
                a.attributed_rule_num_regle,
            )
            not in invalid_attributions
        ]

    return output.model_copy(update=update)


async def _load_contributing_rule_ids_for_cells(
    pool: asyncpg.Pool,
    *,
    run_id: str,
    tenant_id: str,
    cells: tuple[CellRef, ...],
) -> dict[tuple[str, str], frozenset[str]]:
    """Return {(rubrique, colonne): frozenset(rule_id_text)} for each cell.

    Cells absent from `rubrique_confidence_run` map to an empty
    frozenset. The guard treats an empty set as "no rule
    contributes to this cell" — every attribution to that cell
    becomes a violation. Cross-conversation isolation matches the
    classification loader (validation_run_id AND tenant_id).
    """
    if not cells:
        return {}
    rubriques = [c.rubrique for c in cells]
    colonnes = [c.colonne for c in cells]
    try:
        rows = await pool.fetch(
            """
            SELECT rubrique_code, colonne_code, contributing_rule_ids
              FROM rubrique_confidence_run
             WHERE validation_run_id = $1::uuid
               AND tenant_id         = $2::uuid
               AND (rubrique_code, colonne_code) IN (
                   SELECT * FROM unnest($3::text[], $4::text[])
               )
            """,
            run_id,
            tenant_id,
            rubriques,
            colonnes,
        )
    except Exception:
        _logger.exception(
            "llm_output_guard: rubrique_confidence_run contributing_rule_ids "
            "lookup failed run=%s tenant=%s",
            run_id,
            tenant_id,
        )
        return {}
    out: dict[tuple[str, str], frozenset[str]] = {}
    for r in rows:
        raw_ids = r["contributing_rule_ids"]
        # asyncpg may return UUID[] as list[UUID] or list[str] depending
        # on codec registration. Normalise to str for set membership.
        if isinstance(raw_ids, list):
            ids: frozenset[str] = frozenset(str(x) for x in raw_ids if x is not None)
        else:
            ids = frozenset()
        out[(str(r["rubrique_code"]), str(r["colonne_code"]))] = ids
    return out


async def _resolve_rule_ids(
    pool: asyncpg.Pool,
    attributions: tuple[CausalAttribution, ...],
) -> dict[tuple[str, int], str]:
    """Resolve every (ax_term, num_regle) pair to the matching rules.id.

    Returns a dict; pairs absent from the rules table are omitted.
    The guard treats a missing pair as "rule unknown" → the
    attribution is necessarily invalid (rule_id cannot be in the
    cell's contributing_rule_ids if the rule does not exist).
    Best-effort: SQL exceptions degrade to an empty dict (all
    attributions become violations with actual=None marker).
    """
    if not attributions:
        return {}
    ax_terms = [a.attributed_rule_ax_term for a in attributions]
    num_regles = [a.attributed_rule_num_regle for a in attributions]
    try:
        rows = await pool.fetch(
            """
            SELECT ax_term, num_regle, id::text AS rule_id
              FROM rules
             WHERE (ax_term, num_regle) IN (
                   SELECT * FROM unnest($1::text[], $2::int[])
               )
               AND status = 'active'
               AND deleted_at IS NULL
            """,
            ax_terms,
            num_regles,
        )
    except Exception:
        _logger.exception(
            "llm_output_guard: rules lookup failed for causal attributions",
        )
        return {}
    return {(str(r["ax_term"]), int(r["num_regle"])): str(r["rule_id"]) for r in rows}


async def verify_causal_attributions_against_db(
    output: InvestigatorOutput,
    *,
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
) -> tuple[Violation, ...]:
    """Cross-check every CausalAttribution against contributing_rule_ids.

    Returns a tuple of Violation rows (kind='attribution_causale_invalide')
    for every attribution whose attributed rule is NOT in the
    `contributing_rule_ids` of the targeted cell. Three semantic
    states observed:

      * `output.causal_attributions is None` → no causal pass. Returns ().
      * Strict mode (default, migration 119) → every entry checked.
      * Lax mode → logs the would-be violations but returns ().

    Pure async helper — the composition with the classification pass
    happens in `verify_investigator_against_db`. Fail-soft: any DB
    failure produces zero violations rather than 500.
    """
    if output.causal_attributions is None:
        return ()
    if not output.causal_attributions:
        return ()

    mode = await _load_causal_mode(pool)

    attributions = tuple(output.causal_attributions)
    unique_cells = tuple({(a.cell.rubrique, a.cell.colonne): a.cell for a in attributions}.values())
    db_contrib = await _load_contributing_rule_ids_for_cells(
        pool, run_id=run_id, tenant_id=tenant_id, cells=unique_cells
    )
    rule_id_map = await _resolve_rule_ids(pool, attributions)

    violations: list[Violation] = []
    for attr in attributions:
        cell_key = (attr.cell.rubrique, attr.cell.colonne)
        rule_key = (attr.attributed_rule_ax_term, attr.attributed_rule_num_regle)
        contributing = db_contrib.get(cell_key, frozenset())
        rule_id = rule_id_map.get(rule_key)
        if rule_id is None or rule_id not in contributing:
            violations.append(
                Violation(
                    cell=attr.cell,
                    field_name="causal_attributions",
                    expected="",
                    actual=None,
                    kind="attribution_causale_invalide",
                    attributed_rule=rule_key,
                )
            )

    if not violations:
        return ()

    if mode == _CAUSAL_MODE_LAX:
        _logger.warning(
            "llm_hallucination_blocked (lax mode, not filtered): %d causal attribution(s) "
            "rejected (run=%s tenant=%s)",
            len(violations),
            run_id,
            tenant_id,
        )
        return ()

    return tuple(
        sorted(
            violations,
            key=lambda v: (
                v.cell.rubrique,
                v.cell.colonne,
                v.attributed_rule[0] if v.attributed_rule else "",
                v.attributed_rule[1] if v.attributed_rule else 0,
            ),
        )
    )


async def verify_investigator_against_db(
    output: InvestigatorOutput,
    *,
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
) -> GuardResult:
    """Cross-check `output`'s structured classifications against the DB.

    Returns GuardResult.valid=True when:
      * no violations were found, OR
      * the guard could not run (config missing, SQL failure) — in
        which case the caller keeps the LLM output unchanged.

    Returns GuardResult.valid=False with a populated `corrected_output`
    when at least one CellRef contradicts rubrique_confidence_run.
    """
    # Load DB-driven config. Any failure → fail-soft (return valid).
    try:
        classifications_allowed = await _load_classifications_allowed(pool)
        field_map = await _load_field_classification_map(pool)
    except PlatformConfigError as exc:
        _logger.warning(
            "llm_output_guard: config unavailable, skipping guard (%s)",
            exc,
        )
        return GuardResult(valid=True)

    # Defensive: every mapping target must be an allowed classification.
    # If the operator typoed the seed, refuse to validate rather than
    # produce false-positive violations.
    for field_name, expected in field_map.items():
        if expected not in classifications_allowed:
            _logger.warning(
                "llm_output_guard: field %s maps to unknown classification %r "
                "(allowed=%s); skipping guard",
                field_name,
                expected,
                sorted(classifications_allowed),
            )
            return GuardResult(valid=True)

    # Collect every (cell, field, expected) the LLM claims.
    claims: list[tuple[CellRef, str, str]] = []
    for field_name, expected in field_map.items():
        cells = getattr(output, field_name, None)
        if not isinstance(cells, list):
            continue
        for cell in cells:
            if not isinstance(cell, CellRef):
                continue
            claims.append((cell, field_name, expected))

    # Pass 1 — classification check (Lot A.1). Only runs when at
    # least one cell is claimed via the 3 cell lists.
    classification_violations: list[Violation] = []
    if claims:
        unique_cells = tuple({(c.rubrique, c.colonne): c for c, _, _ in claims}.values())
        db_map = await _load_db_classifications_for_cells(
            pool, run_id=run_id, tenant_id=tenant_id, cells=unique_cells
        )
        for cell, field_name, expected in claims:
            actual = db_map.get((cell.rubrique, cell.colonne))
            if actual != expected:
                classification_violations.append(
                    Violation(
                        cell=cell,
                        field_name=field_name,
                        expected=expected,
                        actual=actual,
                        kind="classification_invalide",
                    )
                )

    # Pass 2 — causal-attribution check (Lot A.2.2). Skips entirely
    # when output.causal_attributions is None (legacy prompt).
    causal_violations = await verify_causal_attributions_against_db(
        output, pool=pool, run_id=run_id, tenant_id=tenant_id
    )

    all_violations = list(classification_violations) + list(causal_violations)
    if not all_violations:
        return GuardResult(valid=True)

    violations_t = tuple(
        sorted(
            all_violations,
            key=lambda v: (
                v.kind,
                v.field_name,
                v.cell.rubrique,
                v.cell.colonne,
                v.attributed_rule[0] if v.attributed_rule else "",
                v.attributed_rule[1] if v.attributed_rule else 0,
            ),
        )
    )

    notice_text = await _load_guard_notice_template(pool, tenant_id)
    corrected = _apply_corrections(output, violations_t, notice_text)

    _logger.warning(
        "llm_hallucination_blocked: %d claim(s) filtered from investigator output "
        "(%d classification + %d causal) (run=%s tenant=%s)",
        len(violations_t),
        len(classification_violations),
        len(causal_violations),
        run_id,
        tenant_id,
    )

    return GuardResult(
        valid=False,
        violations=violations_t,
        corrected_output=corrected,
    )
