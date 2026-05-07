"""Build the run-context block injected into the Regalica router prompt.

The router LLM classifies the user's intent. With no context it tends
to default to general_help; with a structured snapshot of the active
validation run (annexe, arrete date, KPIs, top fails) it can route
chip-style queries to the right aggregator.

Doctrine
  Data only — no business logic, no decision-making. The query
  surfaces fields directly from `validation_runs` +
  `validation_fail_details` and the orchestrator JSON-serialises
  the result before injecting it into the router template's
  `{run_context}` placeholder.

Question-types loader
  `load_question_types_list(pool)` returns the
  `question_types.fn_name` strings ordered by `ordinal`. Joined as
  a comma-separated string, this fills the `{question_types_list}`
  placeholder so the router prompt template never carries a frozen
  enum.

Tolerant template renderer
  `render_router_template` uses `str.format_map` with a defensive
  mapping that returns `""` for any unknown placeholder rather than
  raising `KeyError`. Operators may evolve the prompt template (a
  later v2 may declare additional `{...}` slots) without forcing a
  Python release in lockstep.
"""

from __future__ import annotations

import json
from typing import Any

import asyncpg

# Cap on the number of fail rows surfaced in the run context. Top
# failures by severity (severe before rounding) are sufficient
# signal for the router; full enumeration would blow the prompt
# budget.
_TOP_FAILS_LIMIT = 5


async def load_question_types_list(pool: asyncpg.Pool) -> list[str]:
    """Return the active question_types.fn_name list in canonical order."""
    rows = await pool.fetch(
        """
        SELECT fn_name
          FROM question_types
         WHERE is_active = TRUE AND deleted_at IS NULL
         ORDER BY ordinal
        """
    )
    return [str(r["fn_name"]) for r in rows]


async def build_run_context(
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
) -> dict[str, Any]:
    """Return a JSON-serialisable snapshot of the run, or {} if absent.

    Tenant_id gates the read — RLS would also block, but an explicit
    predicate makes the query plan deterministic and the absent /
    cross-tenant case clearly returns {}.
    """
    run_row = await pool.fetchrow(
        """
        SELECT
          id::text                  AS run_id,
          status,
          primary_annexe_code,
          arrete_date::text         AS arrete_date,
          total_rules_evaluated,
          total_pass,
          total_fail_severe,
          total_fail_rounding,
          conformity_rate
        FROM validation_runs
        WHERE id = $1::uuid AND tenant_id = $2::uuid
        """,
        run_id,
        tenant_id,
    )
    if run_row is None:
        return {}

    # Sprint B — Point 3 — surface the rubrique codes carried by the
    # rule's `terms` JSONB column so they appear in the run context the
    # router and aggregator prompts consume. Without this enrichment the
    # LLM only saw `(ax_term, num_regle)` and could not name the rubrique
    # in its response — exactly the gap the user flagged ("où sont les
    # codes rubriques?"). The LATERAL unwrap deduplicates the rubrique
    # values per fail; absent terms (defensive: rule_id may be missing
    # for a synthetic fail) collapse to an empty array.
    fail_rows = await pool.fetch(
        """
        SELECT
          vfd.ax_term,
          vfd.num_regle,
          vfd.severity,
          vfd.expected_value::text AS expected_value,
          vfd.computed_value::text AS computed_value,
          vfd.gap_absolute::text   AS gap_absolute,
          COALESCE(
            (
              SELECT array_agg(DISTINCT t->>'rubrique')
                FROM jsonb_array_elements(COALESCE(r.terms, '[]'::jsonb)) AS t
               WHERE t ? 'rubrique' AND t->>'rubrique' <> ''
            ),
            ARRAY[]::text[]
          ) AS rubrique_codes
        FROM validation_fail_details vfd
        LEFT JOIN rules_active r ON r.id = vfd.rule_id
        WHERE vfd.validation_run_id = $1::uuid AND vfd.tenant_id = $2::uuid
        ORDER BY
          CASE vfd.severity WHEN 'severe' THEN 0 WHEN 'rounding' THEN 1 ELSE 2 END,
          vfd.ax_term, vfd.num_regle
        LIMIT $3
        """,
        run_id,
        tenant_id,
        _TOP_FAILS_LIMIT,
    )

    return {
        "run_id": str(run_row["run_id"]),
        "status": str(run_row["status"]),
        "primary_annexe_code": str(run_row["primary_annexe_code"])
        if run_row["primary_annexe_code"] is not None
        else None,
        "arrete_date": str(run_row["arrete_date"]) if run_row["arrete_date"] is not None else None,
        "total_rules_evaluated": run_row["total_rules_evaluated"],
        "total_pass": run_row["total_pass"],
        "total_fail_severe": run_row["total_fail_severe"],
        "total_fail_rounding": run_row["total_fail_rounding"],
        "conformity_rate": str(run_row["conformity_rate"])
        if run_row["conformity_rate"] is not None
        else None,
        "top_fails": [
            {
                "ax_term": str(r["ax_term"]),
                "num_regle": int(r["num_regle"]),
                "severity": str(r["severity"]),
                "expected_value": r["expected_value"],
                "computed_value": r["computed_value"],
                "gap_absolute": r["gap_absolute"],
                # Sprint B — distinct rubrique codes the rule references.
                # asyncpg returns Postgres text[] as a Python list[str].
                # `.get()` semantics on asyncpg.Record are unsafe; mock
                # rows in unit tests may omit the key entirely so we
                # tolerate KeyError defensively.
                "rubrique_codes": (list(r["rubrique_codes"]) if r.get("rubrique_codes") else []),
            }
            for r in fail_rows
        ],
    }


class _DefensiveFormatMap(dict[str, Any]):
    """str.format_map fallback that returns "" for unknown placeholders.

    Lets the orchestrator inject a known set of fields
    (`run_context`, `question_types_list`) into the router template
    without raising `KeyError` when the operator-controlled prompt
    references additional placeholders we haven't wired yet — the
    extra `{x}` becomes empty in the rendered string. The reverse
    case (we provide a key the template doesn't reference) is a
    no-op for `str.format_map`, so a missing wiring is also safe.
    """

    def __missing__(self, key: str) -> str:
        return ""


def render_router_template(
    template: str,
    *,
    run_context: dict[str, Any] | None,
    question_types_list: list[str],
    message: str,
) -> str:
    """Inject `{run_context}` + `{question_types_list}` + `{message}` into the template.

    `run_context` is JSON-serialised (or `"{}"` when empty / None) so
    the LLM sees a structured block. `question_types_list` is joined
    with `", "` to render as inline prose. `message` is the user's
    free-form input substituted verbatim into the `{message}` slot at
    the end of the router prompt.
    """
    rc = run_context if run_context else {}
    rendered = template.format_map(
        _DefensiveFormatMap(
            {
                "run_context": json.dumps(rc, ensure_ascii=False),
                "question_types_list": ", ".join(question_types_list),
                "message": message,
            }
        )
    )
    return rendered
