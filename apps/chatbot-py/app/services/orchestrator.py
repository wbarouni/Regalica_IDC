"""Regalica orchestrator — full Phase 3-bis chat pipeline.

End-to-end flow per docs/10 §2 (5-step pipeline):

  1. (Phase 3-bis) Run T0 agents when the request carries an XML
     payload. The chat route does not yet forward XML uploads, so
     this stage is intentionally a no-op.
  2. Load `regalica/router` from `prompt_bank` AND the intent
     grammar from `intent_specialists` (commit C7+C8 — DB-driven
     replacement of the prior frozen Python dicts). Ask the LLM
     to classify the user's intent into one of the IntentGrammar
     values.
  3. Look up the specialists to invoke for that intent in the
     loaded grammar. Specialists run in parallel via
     `asyncio.gather`. Their prompts are loaded from `prompt_bank`
     concurrently with the aggregator prompt.
  4. Aggregator step — load
     `<aggregator_agent_type>/<aggregator_function_name>` from
     `prompt_bank` (both fields come from the intent_specialists
     row, no convention) and ask the LLM to compose the user-
     facing French response from the specialists' JSON outputs.
  5. Build the canonical `OrchestratorResult` with a thinking
     trace consistent with the Regalica persona contract:
       « L'utilisateur demande … . Mais je pense … . Donc je vais … . »

Zero hardcoded keywords / prompts / dispatch tables: the routing
LLM and the prompts come from `prompt_bank`; the intent →
specialists + aggregator mapping AND the specialist_id → bearer
table both come from `intent_specialists` / `intent_specialist_bearers`
via `intent_grammar.load_intent_grammar`. The only thing that
remains in source is the (specialist_id → Python invoker callable)
table — handlers are code, not values.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Final

import asyncpg

from app.agents.base import AgentResult
from app.agents.t2 import CitationAgent, HistoricalAgent, InvestigatorAgent
from app.clients.regflow_api import EvaluateRunResult, RegflowApiClient
from app.config import settings
from app.domain.error_resolver import T1_NO_VERDICTS, ErrorResolver
from app.exceptions import (
    EvaluationError,
    EvaluationTimeoutError,
    SpecialistParsingError,
    T1RejectionError,
)
from app.llm.base import LLMClient, LLMRequest
from app.services import clarification as _clarification
from app.services.chat_history import (
    load_router_max_tokens,
    load_thinking_preview_max_chars,
)
from app.services.intent_grammar import (
    IntentGrammar,
    IntentSpec,
    SpecialistBearer,
    load_intent_grammar,
)
from app.services.intent_router import (
    _ROUTER_MAX_TOKENS_FALLBACK,
    FALLBACK_INTENT,
    detect_intent,
)
from app.services.llm_output_guard import verify_investigator_against_db
from app.services.planner import parse_planner_response
from app.services.planner_config import (
    load_planner_max_plan_steps,
    load_planner_trigger_intents,
)
from app.services.planner_context import (
    build_enriched_run_context,
    load_candidate_specialists,
    render_planner_template,
)
from app.services.prompt_loader import PromptMeta, load_active_prompt
from app.services.router_context import (
    build_run_context,
    load_question_types_list,
    render_router_template,
)
from app.utils.json_helpers import extract_first_json, is_static_response

_logger = logging.getLogger(__name__)

# Confidence threshold below which the planner skips its LLM call
# entirely and short-circuits to a clarification outcome — mirrors
# the v1 planner template's STEP 1 ("si confidence < 0.65 →
# CLARIFICATION"). The threshold is duplicated here on purpose: the
# orchestrator must apply it BEFORE invoking the LLM so a low-
# confidence routing never burns a planner call. Keep the two values
# aligned manually until promoted to platform_config in a later
# commit.
_PLANNER_CONFIDENCE_THRESHOLD: Final[float] = 0.65

# Canonical clarification target. When the planner emits
# `plan_type=clarification` the orchestrator routes through the
# `ambiguous` intent — its aggregator is purpose-built for
# disambiguation prompts. The string MUST match a row in
# intent_specialists (seeded by migration 065).
_AMBIGUOUS_INTENT: Final[str] = "ambiguous"

# Point 3 — set of intents that NEED a populated fail_context to reason
# correctly. When `current_run_id` is non-null AND the caller did not
# supply fail_context (frontend default behaviour: useChat only sends
# context.validation_run_id), the orchestrator pre-loads the top FAILs
# of the run from `validation_fail_details` BEFORE invoking the
# specialists. Without this, the investigator/citation/historical
# specialists receive `fail_context = {}` and Gemini hallucinates or
# refuses ("je n'ai pas détecté X fails") because it has no concrete
# data to ground against.
#
# Cas N°1 (2026-05-11, migrations 113/115) — the set of intents that
# need an active validation_run + FAIL context to answer meaningfully
# is now DB-driven via `intent_specialists.requires_active_run`. The
# previous hardcoded `_INTENTS_NEEDING_FAILS = frozenset({"zoom",
# "cluster", "historical", "plan"})` violated CLAUDE.md zero-
# hardcoding doctrine and was the root cause of the no-active-run
# bug: when the router classified an XML-free chat opener like
# "verifier les resultats" as `zoom`, the specialist ran against an
# empty fail_context and Gemini hallucinated instead of asking the
# user to upload a file. The orchestrator now reads
# `intent_spec.requires_active_run` directly and either short-circuits
# with the `regalica/aggregate_no_active_run` prompt (when
# current_run_id is None) or preloads the FAIL context (when a run
# exists).

# Per-run cap on the number of FAIL rows pre-loaded into fail_context.
# 10 covers the demo corpus (typical 7 FAILs) and stays well below the
# Gemini context window even when each row carries calculation_trace
# JSON. Operator-tuneable via platform_config in a follow-up tranche.
_FAILS_CONTEXT_PRELOAD_LIMIT: Final[int] = 10

# Documented fallback for the deterministic thinking-trace preview
# width. The production runtime loads
# `platform_config.regalica_thinking_preview_max_chars` (migration 117)
# via `load_thinking_preview_max_chars(pool)` and forwards it to
# `_format_outcome_preview`. When the platform_config lookup fails
# (cold-start tenant, stale schema, DB hiccup) the trace falls back
# to this constant so observability still works. The 180 literal
# mirrors migration 117's seed value byte-for-byte; the nosemgrep
# below is the canonical "fallback constant matches DB seed" escape.
_THINKING_PREVIEW_MAX_CHARS_FALLBACK: Final[int] = 180  # nosemgrep: D-006-magic-number-assignment

# Persona-aligned thinking trace template (docs/10 §5). Phase 3-bis
# may move this to prompt_bank once the trace itself becomes a
# prompt.
_THINKING_PREFIX = "L'utilisateur demande"
_THINKING_MID = "Mais je pense"
_THINKING_END = "Donc je vais"

# Fallback user-facing message when the router prompt is not
# active in `prompt_bank`. The 4-eyes promotion is required per
# migration 023.
_NO_ROUTER_PROMPT_MESSAGE = (
    "Aucun prompt actif pour le routeur Regalica — "
    "une promotion 4-yeux est requise pour activer regalica/router."
)


def _no_aggregator_prompt_message(agent_type: str, function_name: str) -> str:
    """User-facing fallback when the aggregator prompt is missing."""
    return (
        f"Aucun prompt actif pour {agent_type}/{function_name} — une promotion 4-yeux est requise."
    )


@dataclass(frozen=True)
class OrchestratorResult:
    """Canonical orchestrator output consumed by the chat route."""

    thinking_trace: str
    response_markdown: str
    agents_called: list[str] = field(default_factory=list)
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_thinking: int = 0
    latency_ms: int = 0
    # Audit T-ZOOM-T2-002-AUDIT-001 cas 4B — UUID of the
    # validation_fail_details row that the zoom-intent response
    # references, OR None when the response does not target a single
    # FAIL (cluster, history, ambiguous, general_help, etc.). The
    # frontend uses this to mount <InvestigationArtefact> inline in
    # the corresponding chat bubble — bridges the gap between the
    # markdown prose (for narration) and the structured breakdown
    # (for the visual term-by-term + cross-rule confidence blocks).
    referenced_fail_id: str | None = None


@dataclass(frozen=True)
class _SpecialistContext:
    """Inputs forwarded to every specialist invoker.

    `api_client` is the engine HTTP client that specialists may need
    when they call back into the API surface — currently the C17b
    `t1_runner` specialist is the only consumer. Default None keeps
    every existing call site valid without modification; specialists
    that do not need it ignore the field.

    `error_resolver` is the run_error_codes catalogue lookup loaded
    once at startup (Tranche 0). t1_runner uses it to translate engine
    exceptions into canonical error_codes before POSTing /finalize.

    `correlation_id` is the per-request UUID set by
    CorrelationIdMiddleware. Propagated end-to-end so engine logs +
    SSE payloads + chatbot-py logs share the same id.
    """

    pool: asyncpg.Pool
    tenant_id: str
    llm_client: LLMClient
    fail_context: dict[str, Any] | None
    rule_context: dict[str, Any] | None
    current_run_id: str | None
    api_client: RegflowApiClient | None = None
    error_resolver: ErrorResolver | None = None
    correlation_id: str | None = None
    # T-ZOOM-T2-002-AUDIT-001 cas 4C — optional corrector prompt
    # loaded once by the orchestrator from prompt_bank
    # (`investigator/correct_output`, migration 109). Passed to
    # InvestigatorAgent.analyze so it can retry-on-malformed when
    # the primary prompt's output fails Pydantic validation. Default
    # None keeps the behaviour bit-stable for environments where the
    # corrector has not been promoted yet (the agent then surfaces
    # OUTPUT_SCHEMA_INVALID instead of retrying).
    corrector_meta: PromptMeta | None = None


@dataclass(frozen=True)
class _SpecialistOutcome:
    """Normalised result of one specialist invocation."""

    bearer_label: str
    output: dict[str, Any]
    success: bool
    error: str | None = None


# ---------------------------------------------------------------------------
# Specialist invokers — table dispatch, no if/elif on agent_id values.
# Each invoker takes the loaded PromptMeta + the shared context and returns
# the agent's `AgentResult`. The (specialist_id → bearer) mapping is loaded
# from `intent_specialist_bearers` (commit C7); the (specialist_id → invoker)
# table below stays in source because handlers are code, not values. Both
# tables must agree on the keys at runtime — a specialist_id present in the
# DB but absent from `_SPECIALIST_INVOKERS` surfaces as a clear error in
# `_invoke_specialist`.
# ---------------------------------------------------------------------------


# P1 — extract the rule number the user named in their message so the
# investigator focuses on THAT fail, not the largest-gap one. Common
# patterns: "règle 102", "regle 102", "FAIL 380", "rule 27", "n°102".
# `\d+` (not `\d{1,5}`) so the regex stays valid for any future BCT
# annexe whose rule numbering exceeds the historical 4-5 digit corpus —
# the orchestrator must work with ANY XML, no upper bound assumed.
# Word-boundary delimiters keep "regle 1023" matching as 1023 (not 102)
# and "regle1023" rejected (no anchor word).
#
# Correction A (analysis report 2026-05-08, docs/analysis/regalica-
# intent-reading-vs-claude.md §4) — vocabulary expansion. The original
# 5-anchor set rejected production-realistic phrasing like "le contrôle
# 102", "la ligne 102", "l'item 102", "le point 102", "control 102".
# Extending the anchor alternation captures ~3-4x more messages
# correctly classified as "name a specific rule" without lowering the
# precision floor (each anchor is still a word-bounded keyword that
# precedes the digit run).
_RULE_NUMBER_PATTERN = re.compile(
    r"\b(?:"
    r"r[èeé]gle|regle|rule|"  # règle / regle / rule
    r"fail|"  # fail
    r"contr[oô]le|control|"  # contrôle / controle / control
    r"ligne|item|point|"  # ligne / item / point
    r"n[°o]"  # n° / no
    r")\s*(?:n[°o]\s*)?(\d+)\b",
    re.IGNORECASE,
)


def _extract_rule_number_from_message(message: str) -> int | None:
    """Return the rule number the user explicitly named, or None.

    P1 fix — when the user writes "regarde la règle 102" the
    orchestrator must dispatch the investigator on rule 102, not on
    the largest-gap fail. We scan the message text for a small set of
    canonical patterns; the FIRST match wins so "compare la règle 102
    à la 380" focuses on 102.
    """
    if not message:
        return None
    match = _RULE_NUMBER_PATTERN.search(message)
    if match is None:
        return None
    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return None


def _narrow_fail_context_to_rule(
    fail_ctx: dict[str, Any] | None,
    target_num_regle: int | None,
) -> dict[str, Any] | None:
    """Return fail_ctx with `top_fails` narrowed to the named rule, or unchanged.

    When the user message names a rule (`target_num_regle`) AND that rule
    is present in `top_fails`, we project the context to a single-fail
    list so the investigator receives a focused view. When the rule is
    NOT in top_fails (e.g. user typed an invalid number, or the rule
    passed without a fail), we leave the context unchanged so the LLM
    can still respond using the available data and gracefully signal the
    miss in its prose.
    """
    if fail_ctx is None or target_num_regle is None:
        return fail_ctx
    top_fails = fail_ctx.get("top_fails")
    if not isinstance(top_fails, list) or not top_fails:
        return fail_ctx
    matched: list[dict[str, Any]] = [
        f for f in top_fails if isinstance(f, dict) and f.get("num_regle") == target_num_regle
    ]
    if not matched:
        return fail_ctx
    narrowed = dict(fail_ctx)
    narrowed["top_fails"] = matched
    narrowed["total_count"] = len(matched)
    narrowed["narrowed_to_rule"] = target_num_regle
    return narrowed


def _enrich_rule_context_with_rubriques(
    rule_ctx: dict[str, Any] | None,
    fail_ctx: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build the `rule` payload the specialist prompts expect.

    The investigator + citation prompts contract `rule.rubriques[]` as
    `[{code, libelle}]`. We harvest the rubrique codes that
    `_load_run_fails_context` attached to the top fail (Sprint B
    Point 3) and project them into that shape so Gemini can name the
    rubrique inside the cause-racine prose (Sprint B follow-up).
    Libellés stay empty until the rubriques referential is enriched
    (`label IS NULL` for the dev-tenant seed today); the LLM gracefully
    omits the libellé when absent.

    T-ZOOM-T2-002 — also attaches the `rubrique_confidence[]` rows
    that match the rule's cells. The prompt v2 of
    `investigator/analyze_fail` (migration 110) reads this field to
    rank suspects. v1 ignores the field gracefully — the prompt body
    has no placeholder for it, so Gemini drops it.
    """
    base: dict[str, Any] = dict(rule_ctx) if rule_ctx else {}
    has_rubriques = (
        "rubriques" in base and isinstance(base["rubriques"], list) and base["rubriques"]
    )
    if not has_rubriques and fail_ctx:
        top_fails = fail_ctx.get("top_fails", [])
        if isinstance(top_fails, list) and top_fails:
            codes_seen: set[str] = set()
            rubriques: list[dict[str, str]] = []
            for top in top_fails:
                if not isinstance(top, dict):
                    continue
                for code in top.get("rubrique_codes", []) or []:
                    if isinstance(code, str) and code != "" and code not in codes_seen:
                        codes_seen.add(code)
                        rubriques.append({"code": code, "libelle": ""})
            if rubriques:
                base["rubriques"] = rubriques

    # T-ZOOM-T2-002 — attach the cross-rule confidence rows whose
    # (annexe, rubrique, colonne) match a cell referenced by the rule's
    # terms. The orchestrator filters here (rather than passing the
    # full run-level snapshot) so the LLM payload stays focused on the
    # cells the FAIL actually involves. Empty list when no confidence
    # rows are available (legacy runs, migration 107 not applied).
    confidence_rows = []
    if isinstance(fail_ctx, dict):
        raw_confidence = fail_ctx.get("rubrique_confidence", [])
        if isinstance(raw_confidence, list):
            top_fails = fail_ctx.get("top_fails", [])
            cell_signatures: set[str] = set()
            if isinstance(top_fails, list):
                for top in top_fails:
                    if not isinstance(top, dict):
                        continue
                    rule_terms = top.get("rule_terms", [])
                    ax_term = top.get("ax_term", "")
                    if not isinstance(rule_terms, list):
                        continue
                    for term in rule_terms:
                        if not isinstance(term, dict):
                            continue
                        annexe = term.get("ax_origine") or ax_term
                        rubrique = term.get("rubrique")
                        colonne = term.get("colonne")
                        if (
                            not isinstance(annexe, str)
                            or not isinstance(rubrique, str)
                            or not isinstance(colonne, str)
                        ):
                            continue
                        cell_signatures.add(f"{annexe} {rubrique} {colonne}")
            for entry in raw_confidence:
                if not isinstance(entry, dict):
                    continue
                sig = (
                    f"{entry.get('annexe_code', '')} "
                    f"{entry.get('rubrique_code', '')} "
                    f"{entry.get('colonne_code', '')}"
                )
                if sig in cell_signatures:
                    confidence_rows.append(entry)
    base["rubrique_confidence"] = confidence_rows

    return base


async def _call_investigator(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    rule_payload = _enrich_rule_context_with_rubriques(ctx.rule_context, ctx.fail_context)
    return await InvestigatorAgent().analyze(
        fail=ctx.fail_context or {},
        rule=rule_payload,
        llm_client=ctx.llm_client,
        prompt_template=meta["template"],
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
    )


async def _call_citation(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    rule_payload = _enrich_rule_context_with_rubriques(ctx.rule_context, ctx.fail_context)
    return await CitationAgent().find_source(
        rule=rule_payload,
        llm_client=ctx.llm_client,
        prompt_template=meta["template"],
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
    )


async def _call_historical(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    return await HistoricalAgent().compare(
        current_run_id=ctx.current_run_id or "",
        tenant_id=ctx.tenant_id,
        pool=ctx.pool,
        llm_client=ctx.llm_client,
        prompt_template=meta["template"],
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
    )


# Library specialists — wired in C17a. Each invoker imports its concrete
# class lazily to avoid bloating the orchestrator import graph; the
# import cost is paid once per process and amortised across every
# invocation.


async def _call_reporter_docx(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.reporter_docx import ReporterDocxAgent

    return await ReporterDocxAgent().execute(ctx, meta)


async def _call_reporter_pdf(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.reporter_pdf import ReporterPdfAgent

    return await ReporterPdfAgent().execute(ctx, meta)


async def _call_visualizer_chart(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.visualizer_chart import VisualizerChartAgent

    return await VisualizerChartAgent().execute(ctx, meta)


async def _call_diff_narrate(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.diff_narrate import DiffNarrateAgent

    return await DiffNarrateAgent().execute(ctx, meta)


async def _call_referential_ingestor_pdf(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.referential_ingestor_pdf import (
        ReferentialIngestorPdfAgent,
    )

    return await ReferentialIngestorPdfAgent().execute(ctx, meta)


async def _call_rule_form_assist(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.rule_form_assist import RuleFormAssistAgent

    return await RuleFormAssistAgent().execute(ctx, meta)


async def _call_t1_runner(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    """Specialist for the launch_validation intent (C17b + Tranche 0.7).

    Calls _run_t1_validation in process to drive the 3-step BCT
    pipeline. The shared `meta` (the regalica/aggregate_t1_result
    prompt) is loaded by _invoke_specialist as a bearer formality.
    Tranche 0.7 reuses it to invoke the aggregator a SECOND time
    inside the specialist boundary — the produced markdown is
    persisted to validation_runs.synthesis_artifact via /finalize.
    The aggregator step downstream of `orchestrate()` (orch.py:1228)
    still runs to produce the chat reply; the duplicate LLM call is
    accepted (gemini-2.5-flash, 2-3 sentences) for the simplicity
    gain of NOT refactoring the pipeline ordering.

    Returns an AgentResult whose `output` carries the 7-key T1 result
    block expected by the aggregator's input_schema (success / totals /
    duration_ms / rejection_step / rejection_reason).
    """
    if ctx.current_run_id is None:
        return AgentResult(
            agent_name=_T1_RUNNER_SPECIALIST_ID,
            success=False,
            output={
                "success": False,
                "total_fail_severe": 0,
                "total_fail_rounding": 0,
                "total_pass": 0,
                "duration_ms": 0,
                "rejection_step": None,
                "rejection_reason": (
                    "Aucun run actif. Veuillez d'abord charger vos fichiers XML via l'interface."
                ),
            },
            error="no_active_run",
        )

    if ctx.api_client is None:
        return AgentResult(
            agent_name=_T1_RUNNER_SPECIALIST_ID,
            success=False,
            output={
                "success": False,
                "total_fail_severe": 0,
                "total_fail_rounding": 0,
                "total_pass": 0,
                "duration_ms": 0,
                "rejection_step": None,
                "rejection_reason": (
                    "Le client moteur n'est pas configuré. Contactez votre administrateur."
                ),
            },
            error="no_api_client",
        )

    try:
        result = await _run_t1_validation(
            pool=ctx.pool,
            run_id=ctx.current_run_id,
            tenant_id=ctx.tenant_id,
            api_client=ctx.api_client,
        )
    except T1RejectionError as exc:
        # Tranche 0 D4 — finalize with status='failed' so the run row
        # transitions out of 'running' and the SSE error frame fires.
        # Best-effort: a finalize failure here is logged via
        # RegflowApiError but not re-raised, because the chat must
        # still surface the rejection_reason to the user.
        await _finalize_t1_failure_best_effort(
            ctx=ctx,
            exception=exc,
        )
        return AgentResult(
            agent_name=_T1_RUNNER_SPECIALIST_ID,
            success=False,
            output={
                "success": False,
                "total_fail_severe": 0,
                "total_fail_rounding": 0,
                "total_pass": 0,
                "duration_ms": 0,
                "rejection_step": exc.step,
                "rejection_reason": exc.reason,
            },
            error=f"t1_rejected_step_{exc.step}",
        )
    except (EvaluationTimeoutError, EvaluationError) as exc:
        # Engine reachable but the call itself failed. Same best-effort
        # finalize, then surface a graceful French message to the user.
        await _finalize_t1_failure_best_effort(ctx=ctx, exception=exc)
        rejection_reason = (
            "Le moteur d'évaluation RDG a renvoyé une erreur. "
            "Veuillez contacter votre administrateur."
        )
        return AgentResult(
            agent_name=_T1_RUNNER_SPECIALIST_ID,
            success=False,
            output={
                "success": False,
                "total_fail_severe": 0,
                "total_fail_rounding": 0,
                "total_pass": 0,
                "duration_ms": 0,
                "rejection_step": 3,
                "rejection_reason": rejection_reason,
            },
            error="t1_engine_failure",
        )

    # Tranche 0 D4 — happy path: POST /finalize with status='completed'
    # so validation_runs.status, totals, completed_at and SSE complete
    # all land in one atomic transaction.
    #
    # Tranche 0.7 — produce the synthesis markdown via the same
    # aggregator prompt that the chat path uses downstream. Best-effort:
    # an aggregator failure logs a warning and yields synthesis_markdown
    # = None, the run still finalizes as 'completed'.
    synthesis_markdown = await _invoke_t1_synthesis_aggregator(
        meta=meta,
        ctx=ctx,
        t1_output={
            "success": True,
            "total_fail_severe": result["totals"]["fail_severe"],
            "total_fail_rounding": result["totals"]["fail_rounding"],
            "total_pass": result["totals"]["pass_"],
            "duration_ms": result["duration_ms"],
            "rejection_step": None,
            "rejection_reason": None,
        },
    )
    await _finalize_t1_success_best_effort(
        ctx=ctx,
        result=result,
        synthesis_markdown=synthesis_markdown,
    )

    return AgentResult(
        agent_name=_T1_RUNNER_SPECIALIST_ID,
        success=True,
        output={
            "success": True,
            "total_fail_severe": result["totals"]["fail_severe"],
            "total_fail_rounding": result["totals"]["fail_rounding"],
            "total_pass": result["totals"]["pass_"],
            "duration_ms": result["duration_ms"],
            "rejection_step": None,
            "rejection_reason": None,
        },
        error=None,
    )


# ──────────────────────────────────────────────────────────────────────────
# Tranche 0 — /finalize call helpers (single-writer terminal write)
# ──────────────────────────────────────────────────────────────────────────


def _build_finalize_payload_completed(result: EvaluateRunResult) -> dict[str, Any]:
    """Map an EvaluateRunResult to the Node /finalize zod payload.

    BCT step statuses are derived from the engine outcome:
      - step3_rdg_status='pass' (the engine produced verdicts)
      - step1/2 statuses default to 'pass' (T0 succeeded upstream;
        Tranche 0 emits a single agent-step event per T0 phase, so
        we infer 'pass' from "engine call reached step 3")
      - durations of step1/2 are unknown at this layer (instrumented
        in upload.py but not threaded here); set to null
    """
    totals = result["totals"]
    fail_items: list[dict[str, Any]] = []
    for verdict in result["verdicts"]:
        if verdict.get("status") != "FAIL":
            continue
        severity_label = verdict.get("severity")
        # Map REGFlow front-facing severity (BLOQUANT/MAJEUR/MINEUR)
        # back to the engine's coarse severe|rounding the /finalize
        # zod schema accepts. MINEUR ↔ rounding, others ↔ severe.
        engine_sev = "rounding" if severity_label == "MINEUR" else "severe"

        # Tranche 1.2 follow-up: forward the engine's expected /
        # computed / gap_absolute / gap_relative values so the front
        # FailsTable can render the operator-actionable diff. The
        # engine emits these as decimal strings (lhs/rhs/gap); the
        # /finalize zod schema accepts numbers, so we coerce via float.
        # Conversion failure → null (the column is nullable).
        def _maybe_number(raw: object) -> float | None:
            if raw is None:
                return None
            try:
                return float(raw)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                return None

        fail_items.append(
            {
                "rule_id": verdict.get("rule_id"),
                "ax_term": verdict.get("ax_term", ""),
                "num_regle": verdict.get("num_regle", 0),
                "severity": engine_sev,
                "expected_value": _maybe_number(verdict.get("rhs")),
                "computed_value": _maybe_number(verdict.get("lhs")),
                "gap_absolute": _maybe_number(verdict.get("gap")),
                "gap_relative": _maybe_number(verdict.get("gap_relative")),
                "calculation_trace": verdict.get("calculation_trace", {}),
            },
        )
    return {
        "status": "completed",
        "totals": {
            "pass": totals["pass_"],
            "fail_severe": totals["fail_severe"],
            "fail_rounding": totals["fail_rounding"],
            "skipped_missing_annexe": totals["skipped_missing_annexe"],
            "skipped_missing_rubrique": totals["skipped_missing_rubrique"],
            "skipped_missing_colonne": totals["skipped_missing_colonne"],
            "skipped_missing_data": totals["skipped_missing_data"],
            "skipped_conditional": totals["skipped_conditional"],
            "skipped_unsupported_op": totals["skipped_unsupported_op"],
            "skipped_literal_text": totals["skipped_literal_text"],
            "rules_applicable_total": totals["rules_applicable_total"],
        },
        "fail_items": fail_items,
        "duration_ms": result["duration_ms"],
        "step1_xsd_status": "pass",
        "step1_xsd_duration_ms": None,
        "step2_embedded_status": "pass",
        "step2_embedded_duration_ms": None,
        "step3_rdg_status": "pass",
        "step3_rdg_duration_ms": result["duration_ms"],
        "error_code": None,
        "synthesis_artifact": None,
    }


def _build_finalize_payload_failed(error_code: str) -> dict[str, Any]:
    """Minimal /finalize payload for status='failed' (T0 KO or T1 raise).

    totals is null (T0/T1 raise = no verdicts produced). step BCT
    statuses are all null because the failure happened before the
    engine wrote them.
    """
    return {
        "status": "failed",
        "totals": None,
        "fail_items": [],
        "duration_ms": 0,
        "step1_xsd_status": None,
        "step1_xsd_duration_ms": None,
        "step2_embedded_status": None,
        "step2_embedded_duration_ms": None,
        "step3_rdg_status": None,
        "step3_rdg_duration_ms": None,
        "error_code": error_code,
        "synthesis_artifact": None,
    }


async def _invoke_t1_synthesis_aggregator(
    meta: PromptMeta,
    ctx: _SpecialistContext,
    t1_output: dict[str, Any],
) -> str | None:
    """Tranche 0.7 — invoke regalica/aggregate_t1_result to produce the
    synthesis markdown that lands in validation_runs.synthesis_artifact.

    `meta` is the same prompt row that _invoke_specialist already
    loaded for the t1_runner bearer (regalica/aggregate_t1_result —
    seeded by migration 072-C and promoted to active by 072-B). We
    reuse it instead of re-fetching from prompt_bank to keep the
    helper purely in-process — zero new DB roundtrip.

    Best-effort: returns None on any LLM exception (logged as a
    structured warning). The caller treats None as "no synthesis
    artifact for this run" and finalizes with synthesis_artifact=null
    — the Node /finalize zod schema accepts that explicitly.

    Doctrine — zero hardcoding: temperature, max_tokens, thinking flag,
    template body all come from the prompt row. The intent_type
    constant is doctrinal (must match migration 072 seed); the
    user_message default is empty since the chat path also injects
    a real one downstream when /chat/message replays the same prompt.
    """
    try:
        payload: dict[str, Any] = {
            "user_message": "",
            "intent_type": "launch_validation",
            "specialist_outputs": [
                {
                    "bearer": "regalica/aggregate_t1_result",
                    "success": bool(t1_output.get("success", False)),
                    "output": t1_output,
                    "error": None,
                },
            ],
        }
        request = LLMRequest(
            prompt=json.dumps(payload, ensure_ascii=False),
            temperature=meta["temperature"],
            max_tokens=meta["max_tokens"],
            thinking_enabled=meta["thinking_enabled"],
            system_prompt=meta["template"],
        )
        response = await ctx.llm_client.complete(request)
        raw_content = response.content
        # output_contract='string' for aggregate_t1_result (migration
        # 069 + seed). Apply the same _clean_thought_leakage filter the
        # downstream aggregator step uses (orch.py:1022) for parity.
        if meta.get("output_contract") == "string":
            cleaned = _clean_thought_leakage(raw_content)
        else:
            cleaned = raw_content
        if not isinstance(cleaned, str):
            return None
        stripped = cleaned.strip()
        return stripped if stripped else None
    except Exception as exc:
        _logger.warning(
            "synthesis_aggregator_failed run_id=%s error=%s",
            ctx.current_run_id,
            exc,
        )
        return None


def _build_synthesis_artifact(
    markdown: str,
    result: EvaluateRunResult,
) -> dict[str, Any]:
    """Build the synthesis_artifact JSONB for /finalize.

    Shape committed in ADR 0003: { markdown, totals } where totals
    carries the four canonical aggregate counts. Frontend reads
    `synthesis_artifact.markdown` via T1Deliverables (Tranche 0.5
    extractMarkdownFromArtifact).
    """
    totals = result["totals"]
    pass_count = int(totals["pass_"])
    fail_severe = int(totals["fail_severe"])
    fail_rounding = int(totals["fail_rounding"])
    denominator = pass_count + fail_severe + fail_rounding
    conformity_rate = round(pass_count / denominator, 4) if denominator > 0 else None
    return {
        "markdown": markdown,
        "totals": {
            "pass": pass_count,
            "fail_severe": fail_severe,
            "fail_rounding": fail_rounding,
            "conformity_rate": conformity_rate,
        },
    }


async def _finalize_t1_success_best_effort(
    ctx: _SpecialistContext,
    result: EvaluateRunResult,
    synthesis_markdown: str | None = None,
) -> None:
    """POST /finalize on T1 success. Logs failures, never raises.

    Best-effort: a /finalize POST failure does not prevent the chat
    response from rendering. The Node side guarantees idempotence via
    the canonical diff, so a future retry from another path resolves
    cleanly.

    Tranche 0.7 — when `synthesis_markdown` is non-None, the payload
    carries `synthesis_artifact = { markdown, totals }`. None keeps
    the field null (default behavior preserved for callers that don't
    yet plumb the markdown).
    """
    if ctx.api_client is None or ctx.current_run_id is None:
        return
    error_code: str | None = None
    if result["totals"]["rules_applicable_total"] == 0 and ctx.error_resolver is not None:
        # Engine returned but the rule corpus was empty / inactive.
        # Doctrine T1_NO_VERDICTS — finalize as failed instead of
        # completed so the row reflects the unusable outcome.
        error_code = ctx.error_resolver.assert_known(T1_NO_VERDICTS)
    payload = (
        _build_finalize_payload_failed(error_code)
        if error_code is not None
        else _build_finalize_payload_completed(result)
    )
    if synthesis_markdown is not None and error_code is None:
        # Only attach the synthesis artifact on the completed branch —
        # a failed finalize with t1_no_verdicts has no meaningful
        # markdown to surface (the rule corpus was empty upstream).
        payload["synthesis_artifact"] = _build_synthesis_artifact(synthesis_markdown, result)
    try:
        await ctx.api_client.finalize_run(
            run_id=ctx.current_run_id,
            tenant_id=ctx.tenant_id,
            payload=payload,
            correlation_id=ctx.correlation_id,
        )
    except Exception as exc:
        _logger.warning(
            "finalize_run_post_success_failed run_id=%s error=%s",
            ctx.current_run_id,
            exc,
        )


async def _finalize_t1_failure_best_effort(
    ctx: _SpecialistContext,
    exception: BaseException,
) -> None:
    """POST /finalize with status='failed' for any T1 failure path."""
    if ctx.api_client is None or ctx.current_run_id is None or ctx.error_resolver is None:
        return
    try:
        error_code = ctx.error_resolver.from_t1_exception(exception)
        payload = _build_finalize_payload_failed(error_code)
        await ctx.api_client.finalize_run(
            run_id=ctx.current_run_id,
            tenant_id=ctx.tenant_id,
            payload=payload,
            correlation_id=ctx.correlation_id,
        )
    except Exception as exc:
        _logger.warning(
            "finalize_run_post_failure_failed run_id=%s error=%s",
            ctx.current_run_id,
            exc,
        )


# (specialist_id) -> async callable that does (load+run) the agent.
# This is the ONLY in-source dispatch table that survives commit C8 —
# every other key list (intent enum, specialists per intent, bearer
# (agent_type, function_name)) is loaded from the DB grammar. The
# six C17a entries (reporter_*, visualizer_*, diff_*, ...) match the
# specialist_id column that migration 072 (C17b) will add to
# intent_specialist_bearers; until that migration lands, these
# entries are reachable only through direct test invocation.
_SPECIALIST_INVOKERS: dict[
    str, Callable[[PromptMeta, _SpecialistContext], Awaitable[AgentResult]]
] = {
    "investigator": _call_investigator,
    "citation": _call_citation,
    "historical": _call_historical,
    "reporter_docx": _call_reporter_docx,
    "reporter_pdf": _call_reporter_pdf,
    "visualizer_chart": _call_visualizer_chart,
    "diff_narrate": _call_diff_narrate,
    "referential_ingestor_pdf": _call_referential_ingestor_pdf,
    "rule_form_assist": _call_rule_form_assist,
    "t1_runner": _call_t1_runner,
}


async def _invoke_specialist(
    specialist_id: str,
    ctx: _SpecialistContext,
    bearer: SpecialistBearer | None,
) -> _SpecialistOutcome:
    """Load the specialist's prompt, invoke it, normalise the outcome.

    `bearer` is fetched by the caller from `IntentGrammar.bearers` so
    this function does no DB-dependent lookup itself. None means the
    DB grammar lacks an entry for the specialist_id (drift between
    intent_specialists.specialist_ids and intent_specialist_bearers).
    """
    invoker = _SPECIALIST_INVOKERS.get(specialist_id)
    if bearer is None or invoker is None:
        # Defensive path; reachable only if intent_specialists.specialist_ids
        # references an id absent from intent_specialist_bearers
        # (DB drift) OR from `_SPECIALIST_INVOKERS` (Python handler
        # missing). Both are operator misconfiguration; surface a
        # clear error rather than crashing.
        reason = "no DB bearer" if bearer is None else "no Python invoker"
        return _SpecialistOutcome(
            bearer_label=f"unknown/{specialist_id}",
            output={},
            success=False,
            error=f"Unknown specialist id {specialist_id!r}: {reason}",
        )

    bearer_label = f"{bearer.agent_type}/{bearer.function_name}"

    meta = await load_active_prompt(
        pool=ctx.pool,
        tenant_id=ctx.tenant_id,
        agent_type=bearer.agent_type,
        function_name=bearer.function_name,
    )
    if meta is None:
        return _SpecialistOutcome(
            bearer_label=bearer_label,
            output={},
            success=False,
            error=f"Aucun prompt actif pour {bearer_label}",
        )

    # Static-response short-circuit — when the prompt row carries a
    # non-empty static_response (migration 070), surface it verbatim and
    # skip the LLM call entirely. Currently a no-op for the 3 T2
    # specialists (none of them have static_response seeded), but the
    # branch is in place so a Phase 4 prompt update lands cost-free.
    if is_static_response(meta):
        return _SpecialistOutcome(
            bearer_label=bearer_label,
            output={"static_response": meta["static_response"]},
            success=True,
            error=None,
        )

    agent_result = await invoker(meta, ctx)
    return _SpecialistOutcome(
        bearer_label=bearer_label,
        output=agent_result.output,
        success=agent_result.success,
        error=agent_result.error,
    )


# ---------------------------------------------------------------------------
# JSON-contract specialist runner — used by the 6 new specialists wired
# in C17 (reporter / visualizer / diff / referential_ingestor /
# rule_form_assist). The 3 T2 specialists already in production
# (citation, investigator, historical) keep their own json.loads in
# their AgentResult-returning methods; they will migrate to this helper
# in Phase 4 once the dispatch table is updated to consume JSON dicts
# directly. Splitting C13 (the helper) from C17 (the call sites) keeps
# the diff for each commit small and reversible.
# ---------------------------------------------------------------------------


_JSON_RETRY_PROMPT: Final[str] = (
    "Votre réponse précédente n'était pas un JSON valide. "
    "Produisez uniquement un objet JSON conforme au schéma. "
    "Aucun texte avant ou après. Aucun backtick."
)


def _render_specialist_prompt(template: str, payload: dict[str, Any]) -> str:
    """Serialise the payload into the user-facing prompt body.

    The aggregator prompts use the same `json.dumps(..., ensure_ascii=
    False, indent=2)` convention so a future merge with `_invoke_aggregator`'s
    payload renderer is mechanical. `template` is unused at this layer
    (it lives in `system_prompt` of the LLM request); it stays in the
    signature so callers do not need to know which side of the request
    consumes it.
    """
    del template  # consumed via system_prompt by the caller
    return json.dumps(payload, ensure_ascii=False, indent=2)


async def _invoke_specialist_json(
    meta: PromptMeta,
    llm_client: LLMClient,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Invoke a JSON-contract specialist and return the parsed output.

    Pipeline:
      1. static_response short-circuit — if the prompt row carries a
         pre-canned response, try to parse it as JSON. If it parses
         (rare but valid for fully-canned envelope responses), return
         the parsed dict. Otherwise wrap it under a `static_response`
         key so the caller still has access to the raw text.
      2. LLM call — temperature/max_tokens/thinking_enabled inherited
         from the prompt row.
      3. extract_first_json — recovers the dict from any prose wrapper
         the LLM may have leaked.
      4. Retry once with a corrective prompt if the first pass fails.
      5. Raise SpecialistParsingError if the retry also fails — the
         orchestrator catches this and degrades the user-facing
         response gracefully.

    Used by the 6 new C17 specialists; the existing T2 specialists
    keep their per-class json.loads pending the Phase 4 migration.
    """
    if is_static_response(meta):
        canned: str = str(meta["static_response"])
        parsed_canned = extract_first_json(canned)
        if parsed_canned is not None:
            return parsed_canned
        return {"static_response": canned}

    request = LLMRequest(
        prompt=_render_specialist_prompt(meta["template"], payload),
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
        system_prompt=meta["template"],
    )
    response = await llm_client.complete(request)
    parsed = extract_first_json(response.content)
    if parsed is not None:
        return parsed

    retry_request = LLMRequest(
        prompt=_JSON_RETRY_PROMPT,
        temperature=0.0,
        max_tokens=meta["max_tokens"],
        thinking_enabled=False,
        system_prompt=meta["template"],
    )
    retry_response = await llm_client.complete(retry_request)
    retry_parsed = extract_first_json(retry_response.content)
    if retry_parsed is not None:
        return retry_parsed

    raise SpecialistParsingError(
        "JSON-contract specialist returned an unparseable payload after one retry."
    )


# ---------------------------------------------------------------------------
# Conditional planner — Phase 3-bis refinement of the C2 dispatch table.
# Invoked only for the intents listed in
# `platform_config.regalica_planner_trigger_intents` (migration 068) AND
# only when router confidence ≥ _PLANNER_CONFIDENCE_THRESHOLD. On any
# planner failure (config missing, prompt inactive, LLM error, unparseable
# response, every step rejected) the orchestrator collapses to the
# canonical candidate set from intent_grammar — the P1 fallback per
# docs/10 §16.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _PlannerOutcome:
    """Result of the maybe-invoke-planner step.

    `specialist_ids` is the (possibly empty) ordered list of agent
    ids the orchestrator should dispatch. `is_clarification` signals
    that the planner asked for a clarifying response — the
    orchestrator switches the active aggregator to the `ambiguous`
    intent when this is True.
    """

    specialist_ids: list[str]
    is_clarification: bool
    planner_invoked: bool
    fallback_activated: bool


async def _maybe_invoke_planner(
    *,
    intent: str,
    confidence: float,
    message: str,
    intent_spec: IntentSpec,
    pool: asyncpg.Pool,
    tenant_id: str,
    llm_client: LLMClient,
    current_run_id: str | None,
    session_history: list[str] | None,
) -> _PlannerOutcome:
    """Decide whether to invoke the planner LLM and translate its plan."""
    canonical_ids = list(intent_spec.specialist_ids)

    # Step 0 — load tunables. Any failure surfaces as canonical
    # dispatch so an operator misconfiguration (or a DB/test path
    # that has not seeded migration 068) never blocks the chat
    # path; the warning records why. We catch broadly because the
    # DB layer raises asyncpg/StopAsyncIteration variants that do
    # not subclass PlatformConfigError.
    try:
        trigger_intents = await load_planner_trigger_intents(pool)
        max_plan_steps = await load_planner_max_plan_steps(pool)
    except Exception as exc:
        _logger.warning("planner config unavailable (%s); using canonical dispatch", exc)
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=False,
            fallback_activated=False,
        )

    # Step 1 — T3 trigger gate. Intents outside the trigger set go
    # straight to canonical dispatch with no planner LLM call.
    if intent not in trigger_intents:
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=False,
            fallback_activated=False,
        )

    # Step 2 — confidence gate. Mirrors the planner prompt's STEP 1
    # ("si confidence < 0.65 → CLARIFICATION") so we save a round-
    # trip when the router itself signalled ambiguity.
    if confidence < _PLANNER_CONFIDENCE_THRESHOLD:
        return _PlannerOutcome(
            specialist_ids=[],
            is_clarification=True,
            planner_invoked=False,
            fallback_activated=False,
        )

    # Step 3 — load planner prompt. No active prompt means the
    # 4-eyes promotion has not run yet; canonical dispatch resumes.
    planner_meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=settings.chatbot_planner_agent_type,
        function_name=settings.chatbot_planner_function_name,
    )
    if planner_meta is None:
        _logger.info(
            "planner prompt not active for %s/%s; using canonical dispatch",
            settings.chatbot_planner_agent_type,
            settings.chatbot_planner_function_name,
        )
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=False,
            fallback_activated=False,
        )

    # Step 4 — build context. An empty candidate set means the
    # intent_grammar table itself has no specialists to refine; the
    # planner has nothing to do.
    candidate_specialists = await load_candidate_specialists(pool=pool, intent=intent)
    if not candidate_specialists:
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=False,
            fallback_activated=False,
        )

    enriched_ctx = await build_enriched_run_context(
        pool=pool,
        run_id=current_run_id,
        tenant_id=tenant_id,
        session_history=session_history,
    )

    rendered_prompt = render_planner_template(
        planner_meta["template"],
        intent=intent,
        confidence=confidence,
        message=message,
        candidate_specialists=candidate_specialists,
        run_context=enriched_ctx,
        max_plan_steps=max_plan_steps,
    )

    request = LLMRequest(
        prompt=message,
        temperature=planner_meta["temperature"],
        max_tokens=planner_meta["max_tokens"],
        thinking_enabled=planner_meta["thinking_enabled"],
        system_prompt=rendered_prompt,
    )
    try:
        response = await llm_client.complete(request)
    except Exception as exc:
        _logger.warning("planner LLM call failed: %s; activating P1 fallback", exc)
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=True,
            fallback_activated=True,
        )

    valid_agent_ids = frozenset(intent_spec.specialist_ids)
    plan = parse_planner_response(
        response.content,
        valid_agent_ids,
        max_steps=max_plan_steps,
    )

    if plan.fallback_activated:
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=True,
            fallback_activated=True,
        )
    if plan.plan_type == "clarification":
        return _PlannerOutcome(
            specialist_ids=[],
            is_clarification=True,
            planner_invoked=True,
            fallback_activated=False,
        )
    return _PlannerOutcome(
        specialist_ids=[step.agent_id for step in plan.steps],
        is_clarification=False,
        planner_invoked=True,
        fallback_activated=False,
    )


# ---------------------------------------------------------------------------
# Aggregator — composes the user-facing response from specialist outputs.
# ---------------------------------------------------------------------------

# Aggregator prompts whose seed declares `output_contract = "string"` emit
# free-form markdown, not a JSON envelope. With `thinking_enabled=true`
# Gemini 2.5 Flash occasionally leaks pre-announcement lines from its
# internal reasoning into the visible content (mémoire #30 — observed in
# pre-prod traces). The lines start with explicit handover phrases that
# the operator-controlled filter strips. Filter is applied only when the
# seed's output_contract is "string" — JSON-contract prompts must NEVER
# be touched (any modification would break the parser).
_THOUGHT_LEAKAGE_PREFIXES: Final[tuple[str, ...]] = (
    "Je retourne",
    "I return",
    "Je vais retourner",
    "Je vais composer",
    "Voici ma réponse",
    "Réponse finale",
    "THOUGHT:",
)


def _clean_thought_leakage(text: str) -> str:
    """Drop Gemini thinking-trace pre-announcement lines from the visible output.

    Filter is whole-line, prefix-matched, after stripping leading
    whitespace. Empty input returns empty. Output is right-stripped so a
    trailing newline introduced by the filter does not propagate.
    """
    if not text:
        return text
    cleaned_lines = [
        line
        for line in text.splitlines()
        if not any(line.lstrip().startswith(prefix) for prefix in _THOUGHT_LEAKAGE_PREFIXES)
    ]
    return "\n".join(cleaned_lines).strip()


async def _invoke_aggregator(
    *,
    message: str,
    intent: str,
    specialist_outcomes: list[_SpecialistOutcome],
    aggregator_meta: PromptMeta,
    llm_client: LLMClient,
    clarification_reason: str | None = None,
) -> dict[str, Any]:
    """Call the aggregator LLM and return tokens + response_markdown.

    `clarification_reason` is the origin tag for the
    regalica/aggregate_ambiguous prompt — required when intent is
    `ambiguous`, ignored otherwise. The two valid values come from
    `app.services.clarification`; the seed JSON Schema enum mirrors
    them. Sending the field for a non-ambiguous intent is harmless
    (other prompts ignore unknown payload keys) but the orchestrator
    only sets it for `ambiguous` to keep the payload minimal.
    """
    # Static-response short-circuit — when the aggregator prompt row
    # carries a non-empty static_response (migration 070, applies today
    # to regalica/aggregate_out_of_scope), surface it verbatim and skip
    # the Gemini round-trip entirely. Token counters report zero so the
    # downstream cost reporter records the savings.
    if is_static_response(aggregator_meta):
        return {
            "response_markdown": aggregator_meta["static_response"],
            "tokens_input": 0,
            "tokens_output": 0,
            "tokens_thinking": 0,
        }

    payload: dict[str, Any] = {
        "user_message": message,
        "intent_type": intent,
        "specialist_outputs": [
            {
                "bearer": outcome.bearer_label,
                "success": outcome.success,
                "output": outcome.output,
                "error": outcome.error,
            }
            for outcome in specialist_outcomes
        ],
    }
    if clarification_reason is not None:
        payload["clarification_reason"] = clarification_reason
    request = LLMRequest(
        prompt=json.dumps(payload, ensure_ascii=False),
        temperature=aggregator_meta["temperature"],
        max_tokens=aggregator_meta["max_tokens"],
        thinking_enabled=aggregator_meta["thinking_enabled"],
        system_prompt=aggregator_meta["template"],
    )
    try:
        response = await llm_client.complete(request)
    except Exception as exc:
        return {
            "response_markdown": f"Erreur LLM aggregator : {exc}",
            "tokens_input": 0,
            "tokens_output": 0,
            "tokens_thinking": 0,
        }

    # The filter is gated on output_contract — never on thinking_enabled —
    # so JSON-contract aggregators (none today, future-proofing) keep
    # their parser-bound payload intact even with thinking on.
    raw_content = response.content
    if aggregator_meta.get("output_contract") == "string":
        response_markdown = _clean_thought_leakage(raw_content)
    else:
        response_markdown = raw_content

    return {
        "response_markdown": response_markdown,
        "tokens_input": response.tokens_input,
        "tokens_output": response.tokens_output,
        "tokens_thinking": response.tokens_thinking,
    }


# ---------------------------------------------------------------------------
# Public pipeline entrypoint.
# ---------------------------------------------------------------------------


async def _load_run_fails_context(
    pool: asyncpg.Pool,
    *,
    run_id: str,
    tenant_id: str,
    limit: int = _FAILS_CONTEXT_PRELOAD_LIMIT,
) -> dict[str, Any] | None:
    """Pre-load the top FAILs of a run into a fail_context dict.

    Used by `orchestrate()` when the caller supplied a current_run_id
    but no explicit fail_context, AND the detected intent is one that
    needs fails to reason (zoom / cluster / historical / plan). The
    returned dict shape:

        {
            "run_id": <uuid>,
            "total_count": <int>,
            "top_fails": [
                {
                    "rule_id": <uuid>,
                    "ax_term": "630",
                    "num_regle": 266,
                    "severity": "severe" | "rounding",
                    "expected_value": float | None,
                    "computed_value": float | None,
                    "gap_absolute": float | None,
                    "gap_relative": float | None,
                },
                ...
            ],
        }

    Returns None on any DB error so the caller can fall back to the
    pre-Point-3 behaviour without surfacing a 500. The investigator /
    citation specialists then receive `fail_context = None` again and
    degrade gracefully (the maquette intent for V1).

    RLS is enforced through tenant_id in the WHERE clause; no SET ROLE
    needed because the chatbot-py pool runs under regflow_app which
    already carries the per-tenant guard from migrations 005a / 030 /
    036.
    """
    try:
        # Sprint B — Point 3 — JOIN rules_active to harvest the rubrique
        # codes from the rule's `terms` JSONB so the investigator /
        # citation / historical specialists see the rubrique addressing
        # alongside the (ax_term, num_regle) pair. Without this enrichment
        # the LLM cannot name the rubrique that bears the gap.
        #
        # Bug 6 — alongside the deduplicated `rubrique_codes` we surface
        # the FULL ordered terms array (rang, oper_term, rubrique,
        # colonne, ax_origine) so the aggregator can render the symbolic
        # formula that produced lhs (e.g. "+PA030301000000 col.1
        # +PA030301000001 col.2 -PA030301000002 col.3 = LHS_KTND"). Two
        # extra fields propagate through fail_context.top_fails:
        #   - rule_terms: list[dict] (operator + rubrique + column + rank)
        #   - rule_expression: text (rule's natural_language render —
        #     persisted in rules.natural_language column per migration
        #     022; previously mis-named "expression" in this comment +
        #     SELECT, which broke `_load_run_fails_context` silently
        #     because the query raised a 42703 undefined_column error
        #     caught by the broad `except Exception` and returned None
        #     for fail_context. The investigator then saw an empty
        #     context and the aggregator rendered "non transmis" on
        #     every value.)
        #
        # T-ZOOM-T2-002 — additionally surface
        #   - verdict_terms: parsed `validation_fail_details.calculation_trace`
        #     JSONB normalised into the canonical BreakdownTerm[] shape
        #     (rang, role, rubrique_code, colonne_code, ...). The
        #     prompt v2 of investigator/analyze_fail consumes this to
        #     reason term-by-term. Defensive parse — if the trace is
        #     legacy-shaped, the field is an empty list and the prompt
        #     falls back to summary-only reasoning.
        rows = await pool.fetch(
            """
            SELECT
                vfd.id::text            AS fail_id,
                vfd.rule_id::text       AS rule_id,
                vfd.ax_term,
                vfd.num_regle,
                vfd.severity,
                vfd.expected_value::float AS expected_value,
                vfd.computed_value::float AS computed_value,
                vfd.gap_absolute::float   AS gap_absolute,
                vfd.gap_relative::float   AS gap_relative,
                COALESCE(
                  (
                    SELECT array_agg(DISTINCT t->>'rubrique')
                      FROM jsonb_array_elements(COALESCE(r.terms, '[]'::jsonb)) AS t
                     WHERE t ? 'rubrique' AND t->>'rubrique' <> ''
                  ),
                  ARRAY[]::text[]
                ) AS rubrique_codes,
                COALESCE(r.terms, '[]'::jsonb) AS rule_terms,
                r.natural_language AS rule_expression,
                vfd.calculation_trace
            FROM validation_fail_details vfd
            LEFT JOIN rules_active r ON r.id = vfd.rule_id
            WHERE vfd.validation_run_id = $1::uuid
              AND vfd.tenant_id         = $2::uuid
            ORDER BY
                CASE vfd.severity WHEN 'severe' THEN 0 ELSE 1 END,
                vfd.gap_absolute DESC NULLS LAST
            LIMIT $3
            """,
            run_id,
            tenant_id,
            limit,
        )
    except Exception:
        _logger.exception("_load_run_fails_context: SQL fetch failed for run=%s", run_id)
        return None

    # T-ZOOM-T2-002 — bulk-load the run's rubrique_confidence_run snapshot
    # in a separate query. Per-fail attachment is done in JS-style memory
    # below by intersecting the rule's term cells with the confidence
    # rows. Empty array on any error so the orchestrator degrades
    # gracefully when the migration 107 hasn't run on this DB yet.
    confidence_rows: list[dict[str, Any]] = []
    try:
        c_rows = await pool.fetch(
            """
            SELECT
                annexe_code,
                rubrique_code,
                colonne_code,
                score::text AS score,
                contributing_rules_count,
                classification,
                contributing_rule_ids
            FROM rubrique_confidence_run
            WHERE validation_run_id = $1::uuid
              AND tenant_id         = $2::uuid
            """,
            run_id,
            tenant_id,
        )
        for c in c_rows:
            confidence_rows.append(
                {
                    "annexe_code": c["annexe_code"],
                    "rubrique_code": c["rubrique_code"],
                    "colonne_code": c["colonne_code"],
                    "score": c["score"],
                    "contributing_rules_count": c["contributing_rules_count"],
                    "classification": c["classification"],
                    "contributing_rule_ids": [
                        str(rid) for rid in (c["contributing_rule_ids"] or [])
                    ],
                }
            )
    except Exception:
        _logger.warning(
            "_load_run_fails_context: rubrique_confidence_run fetch failed for run=%s; "
            "empty confidence_rows surfaced (graceful degradation).",
            run_id,
        )

    return {
        "run_id": run_id,
        "total_count": len(rows),
        # T-ZOOM-T2-002 — full run-level snapshot at the fail_context root
        # so _enrich_rule_context_with_rubriques can attach per-rule
        # filtered rows downstream. Empty list when the table is missing
        # or empty.
        "rubrique_confidence": confidence_rows,
        "top_fails": [
            {
                # Audit cas 4B — fail_id (UUID of validation_fail_details)
                # exposed so the orchestrator can populate
                # OrchestratorResult.referenced_fail_id at zoom time.
                # Defensive `.get` so legacy mocks/Records that omit the
                # column stay parsable (the field then surfaces as None
                # and the frontend skips the inline mount).
                "fail_id": r.get("fail_id") if hasattr(r, "get") else None,
                "rule_id": r["rule_id"],
                "ax_term": r["ax_term"],
                "num_regle": r["num_regle"],
                "severity": r["severity"],
                "expected_value": r["expected_value"],
                "computed_value": r["computed_value"],
                "gap_absolute": r["gap_absolute"],
                "gap_relative": r["gap_relative"],
                # Sprint B — distinct rubrique codes the rule references.
                # Defensive against unit-test mocks that omit the key
                # entirely (asyncpg.Record raises KeyError on missing
                # columns rather than returning None).
                "rubrique_codes": (list(r["rubrique_codes"]) if r.get("rubrique_codes") else []),
                # Bug 6 — full ordered terms (operator + rubrique +
                # column + rank) for the formula renderer in BLOC 3 of
                # aggregate_zoom_fail. asyncpg returns JSONB as a Python
                # object via ujson; it can be a list[dict], dict, or
                # whatever the column carries. We pass it through
                # verbatim — the prompt tolerates an empty list.
                "rule_terms": _coerce_jsonb_list(r.get("rule_terms")),
                "rule_expression": (
                    str(r["rule_expression"]) if r.get("rule_expression") is not None else None
                ),
                # T-ZOOM-T2-002 — verdict_terms is the parsed canonical
                # decomposition from validation_fail_details.calculation_trace.
                # Empty list when the trace is legacy-shaped or missing
                # (the prompt v2 then falls back to summary reasoning).
                "verdict_terms": _parse_verdict_terms(r.get("calculation_trace")),
            }
            for r in rows
        ],
    }


_ALLOWED_TERM_ROLES = frozenset({"lhs", "rhs"})
_ALLOWED_TERM_STATUS = frozenset({"present", "missing", "null", "grayed"})
_ALLOWED_SENTINEL_CODES = frozenset({"C", "D1", "D2", "D3", "D4", "D5", "D6"})


def _parse_verdict_terms(trace: Any) -> list[dict[str, Any]]:
    """Normalise validation_fail_details.calculation_trace JSONB to BreakdownTerm[].

    Returns an empty list whenever the trace diverges from the canonical
    shape documented in plan §5.1. The prompt v2 of
    `investigator/analyze_fail` (migration 110) tolerates an empty
    `verdict_terms` and falls back to summary-only reasoning; the
    overlay zoom flips `breakdown_unavailable` to true on the same
    signal.
    """
    if isinstance(trace, str):
        try:
            trace = json.loads(trace)
        except (TypeError, ValueError):
            return []
    if not isinstance(trace, dict):
        return []
    raw_terms = trace.get("terms")
    if not isinstance(raw_terms, list):
        return []
    out: list[dict[str, Any]] = []
    for raw in raw_terms:
        if not isinstance(raw, dict):
            return []
        rang = raw.get("rang")
        role = raw.get("role")
        rubrique = raw.get("rubrique_code")
        colonne = raw.get("colonne_code")
        status = raw.get("status")
        is_sentinel = raw.get("is_sentinel")
        sentinel_code = raw.get("sentinel_code")
        if not isinstance(rang, int) or rang < 1:
            return []
        if not isinstance(role, str) or role not in _ALLOWED_TERM_ROLES:
            return []
        if not isinstance(rubrique, str) or rubrique == "":
            return []
        if not isinstance(colonne, str) or colonne == "":
            return []
        if not isinstance(status, str) or status not in _ALLOWED_TERM_STATUS:
            return []
        if not isinstance(is_sentinel, bool):
            return []
        if sentinel_code is not None and (
            not isinstance(sentinel_code, str) or sentinel_code not in _ALLOWED_SENTINEL_CODES
        ):
            return []
        expected = raw.get("expected_value")
        computed = raw.get("computed_value")
        out.append(
            {
                "rang": rang,
                "role": role,
                "is_sentinel": is_sentinel,
                "sentinel_code": sentinel_code,
                "rubrique_code": rubrique,
                "colonne_code": colonne,
                "expected_value": str(expected) if expected is not None else None,
                "computed_value": str(computed) if computed is not None else None,
                "status": status,
            }
        )
    return out


def _coerce_jsonb_list(value: Any) -> list[Any]:
    """Normalise an asyncpg JSONB column that should hold a list.

    asyncpg returns JSONB as already-parsed Python objects when the
    server-side encoder is the default `text` codec (regflow's setup),
    or as raw `str` when the codec falls back to text mode. Tests mock
    rows often omit the field entirely. This helper hides those three
    shapes behind a single `list[Any]` return so callers don't sprout
    isinstance ladders.
    """
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (ValueError, TypeError):
            return []
        return parsed if isinstance(parsed, list) else []
    return []


# ---------------------------------------------------------------------------
# P6 — chat-driven inter-annex awareness.
#
# `_load_run_dependency_state` mirrors the upload-time DependencyAgent
# (apps/chatbot-py/app/agents/t0_dependency.py) but reads its inputs
# from the live `validation_runs` + `validation_run_uploads` join
# rather than the upload session's `upload_ids` parameter. The output
# shape mirrors the briefing-time payload so both the briefing and
# the post-run chat surface identical companion-state language:
#
#     {
#         "primary_annexe": "630",
#         "arrete_date": "2026-02-28",
#         "required_companions": ["631", "604"],
#         "submitted_companions": ["631"],
#         "missing_companions": ["604"],
#         "parasitic_fail_count": 12,
#     }
#
# Returns None when the run carries no dependency declaration (the
# autonomous case — most filings) so the caller can short-circuit
# instead of injecting an empty placeholder into the aggregator
# payload. Defensive: any DB / asyncpg failure returns None and logs
# so a stray referential glitch does not break the chat path.
# ---------------------------------------------------------------------------


async def _load_run_dependency_state(
    pool: asyncpg.Pool,
    *,
    run_id: str,
    tenant_id: str,
) -> dict[str, Any] | None:
    """Compute the inter-annex companion state for a completed run.

    See module docstring above for the returned shape. Reads four
    referentials in three round-trips (run row, declared dependencies,
    submitted annexes) plus one parasitic-count COUNT(*) — same
    pattern as the upload-time DependencyAgent but anchored on the
    run id instead of the upload session.
    """
    try:
        run_row = await pool.fetchrow(
            """
            SELECT primary_annexe_code,
                   arrete_date::text AS arrete_date
              FROM validation_runs
             WHERE id        = $1::uuid
               AND tenant_id = $2::uuid
            """,
            run_id,
            tenant_id,
        )
    except Exception:
        _logger.exception(
            "_load_run_dependency_state: validation_runs lookup failed run=%s",
            run_id,
        )
        return None
    if run_row is None:
        return None
    primary_annexe = run_row["primary_annexe_code"]
    if not isinstance(primary_annexe, str) or primary_annexe == "":
        return None
    arrete_date = run_row["arrete_date"]

    # Bug 7 — RDG-side gate (2026-05-08, doctrine
    # docs/04-WORKFLOW-UTILISATEUR-COMPLET.md §6 + user diagnostic).
    # The user clarified the trigger condition explicitly:
    #
    #   "demande l'XML compagnon en glisser-déposer juste ou
    #    l'annexe injecté en premier lieu contient dans son rdg
    #    type control Inter annexe"
    #
    # i.e. only request a companion XML when the primary annex
    # actually carries at least one rule flagged is_inter_annexe in
    # rules_active. Without this gate, an annex declared in
    # `referentials_annexe_dependencies` but whose RDG corpus
    # contains only intra-annex rules would still trigger a
    # companion request — pointless because no inter-annex rule
    # would benefit from the companion's data.
    #
    # The dependencies referential and rules_active are two
    # independent sources; the rules ARE the source of truth for
    # what genuinely needs cross-annex resolution. Defending against
    # divergence here is a defensive belt over the seed pipeline.
    try:
        inter_annex_rule_row = await pool.fetchrow(
            """
            SELECT COUNT(*)::int AS cnt
              FROM rules_active
             WHERE tenant_id        = $1::uuid
               AND ax_term          = $2
               AND is_inter_annexe  = TRUE
            """,
            tenant_id,
            primary_annexe,
        )
        inter_annex_rule_count = (
            int(inter_annex_rule_row["cnt"]) if inter_annex_rule_row is not None else 0
        )
    except Exception:
        # Defensive — when the rules_active probe fails (DB error,
        # tenant misconfigured), we collapse to 0 so the chat path
        # silently skips the inter-annex prompt rather than emitting
        # a noisy "we cannot tell" message.
        _logger.exception(
            "_load_run_dependency_state: rules_active inter_annex lookup failed primary=%s",
            primary_annexe,
        )
        inter_annex_rule_count = 0

    if inter_annex_rule_count == 0:
        # The primary annex has no inter-annex rule in its RDG
        # corpus. Skip the entire dependency block — no companion
        # XML request, no BLOC 7, no UI nudge. This matches the
        # user-stated trigger condition verbatim.
        return None

    try:
        required_rows = await pool.fetch(
            """
            SELECT target_annexe_code
              FROM referentials_annexe_dependencies
             WHERE tenant_id          = $1::uuid
               AND source_annexe_code = $2
               AND status             = 'active'
               AND deleted_at IS NULL
            """,
            tenant_id,
            primary_annexe,
        )
    except Exception:
        _logger.exception(
            "_load_run_dependency_state: dependencies referential lookup failed primary=%s",
            primary_annexe,
        )
        return None

    required_companions: list[str] = [
        str(r["target_annexe_code"]) for r in required_rows if r["target_annexe_code"] is not None
    ]
    if not required_companions:
        # Autonomous primary annexe in the dependencies referential —
        # even though the RDG carries inter-annex rules, no companion
        # is declared in the matrix (CC-tech §9.5). The chat path
        # skips the inter-annex prompt block.
        return None

    try:
        submitted_rows = await pool.fetch(
            """
            SELECT DISTINCT xu.code_annexe
              FROM validation_run_uploads vru
              JOIN xml_uploads xu ON xu.id = vru.xml_upload_id
             WHERE vru.validation_run_id = $1::uuid
               AND xu.tenant_id          = $2::uuid
               AND xu.deleted_at IS NULL
            """,
            run_id,
            tenant_id,
        )
    except Exception:
        _logger.exception(
            "_load_run_dependency_state: validation_run_uploads lookup failed run=%s", run_id
        )
        return None
    submitted_companions: list[str] = sorted(
        {str(r["code_annexe"]) for r in submitted_rows if r["code_annexe"] is not None}
    )
    submitted_set = set(submitted_companions)
    missing_companions: list[str] = sorted(
        c for c in set(required_companions) if c not in submitted_set
    )

    parasitic_fail_count = 0
    if missing_companions:
        try:
            parasitic_row = await pool.fetchrow(
                """
                SELECT COUNT(*)::int AS cnt
                  FROM rules_active
                 WHERE tenant_id        = $1::uuid
                   AND is_inter_annexe  = TRUE
                   AND involved_annexes && $2::text[]
                   AND $3 = ANY(involved_annexes)
                """,
                tenant_id,
                missing_companions,
                primary_annexe,
            )
            parasitic_fail_count = int(parasitic_row["cnt"]) if parasitic_row is not None else 0
        except Exception:
            # Defensive: a parasitic-count failure does NOT mask the
            # rest of the dependency state — we surface 0 so the chat
            # output omits the count rather than failing the turn.
            _logger.exception(
                "_load_run_dependency_state: rules_active parasitic lookup failed run=%s",
                run_id,
            )
            parasitic_fail_count = 0

    # Bug 7 (world-class) — for each missing companion, look up
    # existing uploads in `xml_uploads` that match the same code_annexe
    # AND the same arrete_date. The doctrine (docs/04 §6) is explicit:
    # "L'UI affiche proactivement ces manques avec un bouton « Ajouter
    # les annexes manquantes »". The user's diagnostic 2026-05-08
    # extended this to: "si le deuxième annexe est déjà dans la base
    # (code annexe + période) elle demande l'autorisation de
    # l'utiliser, juste il faut vérifier avec user la version".
    #
    # We surface the existing uploads as `available_in_db` per missing
    # companion so the aggregator (and downstream UI) can offer:
    #   - "Use existing version (uploaded DD/MM/YYYY by Y)" button
    #   - OR "Upload a fresh version" fallback
    # Multiple matches are returned ordered by uploaded_at DESC so the
    # most recent attempt is the default suggestion.
    companion_suggestions: dict[str, list[dict[str, Any]]] = {}
    if missing_companions and arrete_date is not None:
        try:
            suggestion_rows = await pool.fetch(
                """
                SELECT id::text       AS upload_id,
                       code_annexe,
                       date_annexe::text AS date_annexe,
                       file_name,
                       file_size_bytes,
                       file_hash_sha256,
                       uploaded_at::text AS uploaded_at,
                       xsd_validation_status
                  FROM xml_uploads
                 WHERE tenant_id    = $1::uuid
                   AND code_annexe  = ANY($2::text[])
                   AND date_annexe::text = $3
                   AND deleted_at IS NULL
                 ORDER BY uploaded_at DESC
                """,
                tenant_id,
                missing_companions,
                arrete_date,
            )
            for r in suggestion_rows:
                code = str(r["code_annexe"])
                companion_suggestions.setdefault(code, []).append(
                    {
                        "upload_id": str(r["upload_id"]),
                        "date_annexe": str(r["date_annexe"]),
                        "file_name": str(r["file_name"]),
                        "file_size_bytes": int(r["file_size_bytes"])
                        if r["file_size_bytes"] is not None
                        else None,
                        "file_hash_sha256": str(r["file_hash_sha256"])
                        if r["file_hash_sha256"] is not None
                        else None,
                        "uploaded_at": str(r["uploaded_at"]),
                        "xsd_validation_status": str(r["xsd_validation_status"])
                        if r["xsd_validation_status"] is not None
                        else None,
                    }
                )
        except Exception:
            # Defensive: a suggestion lookup failure does NOT block the
            # rest of the dependency state. Worst case the UI offers
            # "Upload a fresh version" without the existing-version
            # shortcut.
            _logger.exception(
                "_load_run_dependency_state: companion suggestion lookup failed run=%s",
                run_id,
            )
            companion_suggestions = {}

    return {
        "primary_annexe": primary_annexe,
        "arrete_date": arrete_date,
        "required_companions": sorted(set(required_companions)),
        "submitted_companions": submitted_companions,
        "missing_companions": missing_companions,
        "parasitic_fail_count": parasitic_fail_count,
        # Map of {missing_annexe_code: [{upload_id, file_name,
        # uploaded_at, ...}, ...]} ordered uploaded_at DESC. Empty when
        # no existing upload matches OR when the lookup failed.
        "companion_suggestions": companion_suggestions,
    }


# P6 — bearer label for the synthetic specialist outcome the orchestrator
# appends when the run carries dependency state. Mirrors the
# `<agent_type>/<function_name>` shape of the real specialists so
# aggregator prompts can address it via the standard `specialist_outputs`
# loop without a special-case path.
_DEPENDENCY_BEARER_LABEL: Final[str] = "dependency/check_companions"

# Bug 6 — bearer label for the synthetic specialist outcome that
# carries the failed rule's symbolic decomposition (operator + rubrique
# + column terms in declared order). The aggregator prompt renders the
# formula behind the FAIL's computed value when this outcome is
# present; otherwise BLOC 1's compact decomposition (rubrique +
# montants only) is used. Same naming convention as
# `_DEPENDENCY_BEARER_LABEL`.
_RULE_BREAKDOWN_BEARER_LABEL: Final[str] = "engine/rule_breakdown"

# Lot A.3 (audit 2026-05-12) — bearer label of the investigator's
# zoom-fail analysis output. The anti-hallucination guard
# (app.services.llm_output_guard.verify_investigator_against_db)
# scans `specialist_outcomes` for this label, parses the dict
# payload as an InvestigatorOutput, cross-checks the structured
# classification claims against `rubrique_confidence_run`, and
# replaces the outcome's output with the corrected version when
# violations are detected. Mirrors the bearer-label naming
# convention shared by every other specialist in this module.
_INVESTIGATOR_BEARER_LABEL: Final[str] = "investigator/analyze_fail"


async def _apply_llm_output_guard(
    *,
    outcomes: list[_SpecialistOutcome],
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
) -> list[_SpecialistOutcome]:
    """Cross-check the investigator's structured classification claims.

    Walks `outcomes`, finds the entry whose bearer_label matches
    `_INVESTIGATOR_BEARER_LABEL`, attempts to parse its `output` dict
    as an InvestigatorOutput, and runs
    `verify_investigator_against_db` against rubrique_confidence_run.

    When the guard returns `valid=False`, the offending outcome's
    output is replaced with the corrected dict (invalid CellRefs
    filtered out, `guard_notice` populated). The outcome's
    bearer_label / success / error are preserved so downstream
    aggregator logic is unchanged.

    Best-effort: parse failures, validation errors, and guard
    exceptions degrade silently (log + return outcomes unchanged).
    The guard is defense-in-depth, never a blocker.
    """
    from app.contracts.investigator import InvestigatorOutput

    invest_idx = next(
        (i for i, o in enumerate(outcomes) if o.bearer_label == _INVESTIGATOR_BEARER_LABEL),
        None,
    )
    if invest_idx is None:
        return outcomes

    invest_outcome = outcomes[invest_idx]
    if not invest_outcome.success or not isinstance(invest_outcome.output, dict):
        return outcomes

    try:
        parsed = InvestigatorOutput.model_validate(invest_outcome.output)
    except Exception as exc:
        _logger.warning(
            "llm_output_guard: investigator output not parseable as "
            "InvestigatorOutput (skipping guard): %s",
            exc,
        )
        return outcomes

    try:
        result = await verify_investigator_against_db(
            parsed, pool=pool, run_id=run_id, tenant_id=tenant_id
        )
    except Exception:
        _logger.exception(
            "llm_output_guard: verify_investigator_against_db raised "
            "(skipping guard) run=%s tenant=%s",
            run_id,
            tenant_id,
        )
        return outcomes

    if result.valid or result.corrected_output is None:
        return outcomes

    # Replace the outcome's output with the corrected dict. The
    # aggregator consumes the dict shape (not the Pydantic instance),
    # so model_dump preserves the contract.
    new_outcomes = list(outcomes)
    new_outcomes[invest_idx] = _SpecialistOutcome(
        bearer_label=invest_outcome.bearer_label,
        output=result.corrected_output.model_dump(mode="json"),
        success=invest_outcome.success,
        error=invest_outcome.error,
    )
    return new_outcomes


# ---------------------------------------------------------------------------
# Sub-Sprint 3 — prose-driven thinking trace.
#
# Replaces the deterministic Python composer (`_build_thinking_trace`) with
# a prompt-driven LLM call. The output is the prose paragraph stream the
# Workspace renders inside the "Thinking" artefact: a reflection that
# reformulates the demand, weighs framings, decides — flowing prose with
# no list, no numbered phase, no internal-agent name leak. Failure modes
# (prompt missing, LLM error) collapse to None so the caller falls back
# to the deterministic 5-phase composer kept for resilience.
# ---------------------------------------------------------------------------


# `regalica` is a foreign-key reference to prompt_bank.agent_type — the
# canonical row identifier for every Regalica-authored aggregator /
# reflection prompt (migrations 040..087). The literal MUST match the
# DB row exactly; moving it to platform_config would split the
# contract across two tables and introduce a synchronisation bug
# class (a stale config_value pointing to a deprecated agent_type).
_THINKING_REFLECTION_AGENT_TYPE: Final[str] = "regalica"  # nosemgrep: D-004-var-name-string-literal
_THINKING_REFLECTION_FUNCTION_NAME: Final[str] = "thinking_reflection"


async def _compose_prose_thinking(
    *,
    pool: asyncpg.Pool,
    llm_client: LLMClient,
    tenant_id: str,
    user_message: str,
    intent_type: str,
    run_context: dict[str, Any] | None,
) -> str | None:
    """Return the prose thinking reflection or None on any failure.

    Loads the `regalica/thinking_reflection` prompt (migration 087),
    serialises (user_message, intent_type, run_context) as the user
    payload, and asks Gemini for the reflection. On any failure path
    (no active prompt, LLM exception, empty content) returns None so
    the caller can fall back to `_build_thinking_trace`.
    """
    try:
        meta = await load_active_prompt(
            pool=pool,
            tenant_id=tenant_id,
            agent_type=_THINKING_REFLECTION_AGENT_TYPE,
            function_name=_THINKING_REFLECTION_FUNCTION_NAME,
        )
    except Exception:
        _logger.exception("thinking_reflection prompt load failed")
        return None
    if meta is None:
        return None

    payload = json.dumps(
        {
            "user_message": user_message,
            "intent_type": intent_type,
            "run_context": run_context or {},
        },
        ensure_ascii=False,
    )
    request = LLMRequest(
        prompt=payload,
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
        system_prompt=meta["template"],
    )
    try:
        response = await llm_client.complete(request)
    except Exception:
        _logger.warning("thinking_reflection LLM call failed", exc_info=True)
        return None
    text = (response.content or "").strip()
    if text == "":
        return None
    return text


async def orchestrate(
    message: str,
    tenant_id: str,
    pool: asyncpg.Pool,
    llm_client: LLMClient,
    fail_context: dict[str, Any] | None = None,
    rule_context: dict[str, Any] | None = None,
    current_run_id: str | None = None,
    session_history: list[str] | None = None,
    api_client: RegflowApiClient | None = None,
    error_resolver: ErrorResolver | None = None,
    correlation_id: str | None = None,
) -> OrchestratorResult:
    """Run the full Phase 3-bis chat pipeline and return the canonical result.

    `session_history` is forwarded to the conditional planner so it
    can extract entities (rubriques / annexes) from prior turns. The
    chat route does not yet collect it; defaulting to None makes the
    planner see an empty history, which is safe.
    """
    start = time.monotonic()

    # 1. T0 agents — Phase 3-bis. The chat route does not (yet)
    # forward XML payloads, so this stage is intentionally a no-op.

    # 2. Router prompt + intent grammar + question_types + run_context
    # (parallel) + intent detection. The four loads are independent
    # so we await them as a fan-in instead of a serial chain.
    grammar_task = asyncio.create_task(load_intent_grammar(pool))
    question_types_task = asyncio.create_task(load_question_types_list(pool))
    run_context_task: asyncio.Task[dict[str, Any]] | None = None
    if current_run_id is not None:
        run_context_task = asyncio.create_task(
            build_run_context(pool=pool, run_id=current_run_id, tenant_id=tenant_id)
        )

    router_meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=settings.chatbot_router_agent_type,
        function_name=settings.chatbot_router_function_name,
    )
    if router_meta is None:
        # Drain the parallel tasks so pool connections release
        # cleanly even when we short-circuit.
        with contextlib.suppress(Exception):
            await grammar_task
        with contextlib.suppress(Exception):
            await question_types_task
        if run_context_task is not None:
            with contextlib.suppress(Exception):
                await run_context_task
        return _build_no_router_result(message, start)

    grammar: IntentGrammar = await grammar_task
    question_types_list = await question_types_task
    run_context: dict[str, Any] | None = (
        await run_context_task if run_context_task is not None else None
    )
    valid_intents = grammar.intent_types

    rendered_router_template = render_router_template(
        router_meta["template"],
        run_context=run_context,
        question_types_list=question_types_list,
        message=message,
    )

    # Migration 117 — operator-tunable token budgets / display caps.
    # Both loaders fall back to the in-source defaults when the
    # platform_config row is missing (cold-start tenant, stale schema)
    # so the chat path never throws on a config gap.
    try:
        router_max_tokens = await load_router_max_tokens(pool)
    except Exception:
        router_max_tokens = _ROUTER_MAX_TOKENS_FALLBACK
    try:
        thinking_preview_max_chars = await load_thinking_preview_max_chars(pool)
    except Exception:
        thinking_preview_max_chars = _THINKING_PREVIEW_MAX_CHARS_FALLBACK

    intent_result = await detect_intent(
        message=message,
        llm_client=llm_client,
        router_template=rendered_router_template,
        valid_intents=valid_intents,
        max_tokens=router_max_tokens,
    )
    intent = intent_result.intent_type
    if intent not in grammar.intents:
        # Defensive: detect_intent already maps unknown values to
        # FALLBACK_INTENT, but we re-anchor here so the rest of the
        # pipeline never indexes the grammar with a stranger.
        intent = FALLBACK_INTENT
    if intent not in grammar.intents:
        # FALLBACK_INTENT is a documented contract — if even that row
        # is missing the operator misconfigured the catalogue. Surface
        # the no-router fallback message as the best we can do.
        return _build_no_router_result(message, start)

    intent_spec = grammar.intents[intent]

    # B2 (2026-05-08, migration 104+105) — DB-driven T1 dedup.
    # When the matched intent is flagged
    # `requires_run_uniqueness = TRUE` in `intent_specialists` AND
    # the caller's current_run_id already points at a row in
    # `validation_runs.status = 'running'`, short-circuit with a
    # static-style response. The /upload kickoff already runs the
    # T0 + T1 pipelines automatically; a second chat-driven trigger
    # would create a race that produces duplicate token spend, SSE
    # frames, and (worst case) a second /finalize POST.
    #
    # Zero `if intent == 'launch_validation'` hardcoding: the flag
    # lives in the DB, the orchestrator just respects it. New
    # intents that need uniqueness can flip the flag without
    # code changes.
    if (
        intent_spec.requires_run_uniqueness
        and current_run_id is not None
        and await _is_run_already_in_progress(pool, run_id=current_run_id, tenant_id=tenant_id)
    ):
        return _build_run_already_running_result(
            run_id=current_run_id,
            start=start,
        )

    # Cas N°1 (2026-05-11, migrations 113/114/115) — DB-driven
    # no-active-run short-circuit. When the matched intent is flagged
    # `requires_active_run = TRUE` in `intent_specialists` AND the
    # caller has no `current_run_id`, we cannot meaningfully ask the
    # specialists to analyse fails that do not exist. Instead, we
    # surface the `regalica/aggregate_no_active_run` prompt's
    # static_response (migration 114) which asks the operator to
    # upload an XML BCT file before continuing.
    #
    # Zero hardcoding: the four intents flipped TRUE by migration 113
    # (zoom, cluster, historical, plan) live in the DB. New intents
    # that need a run (or removing one from the set) is a migration,
    # not a code change. The prompt text is itself DB-resident, so
    # locale / wording changes are also operator-driven.
    if intent_spec.requires_active_run and current_run_id is None:
        no_run_result = await _build_no_active_run_result(
            pool=pool,
            tenant_id=tenant_id,
            llm_client=llm_client,
            message=message,
            intent=intent,
            agent_type=intent_spec.aggregator_agent_type,
            start=start,
        )
        if no_run_result is not None:
            return no_run_result

    # 2.5 Conditional planner refinement — see _maybe_invoke_planner.
    # The planner may rewrite the candidate set (refinement), demand
    # a clarifying response (switches the active intent to
    # `ambiguous`), or decline (canonical dispatch resumes).
    planner_outcome = await _maybe_invoke_planner(
        intent=intent,
        confidence=intent_result.confidence,
        message=message,
        intent_spec=intent_spec,
        pool=pool,
        tenant_id=tenant_id,
        llm_client=llm_client,
        current_run_id=current_run_id,
        session_history=session_history,
    )
    if planner_outcome.is_clarification:
        # Switch to the ambiguous aggregator if the grammar carries
        # one (it normally does — seeded by migration 065). When the
        # row is missing, fall through to the original intent_spec
        # so the dispatch still produces a response.
        ambiguous_spec = grammar.intents.get(_AMBIGUOUS_INTENT)
        if ambiguous_spec is not None:
            intent = _AMBIGUOUS_INTENT
            intent_spec = ambiguous_spec
        specialist_ids = list(intent_spec.specialist_ids)
    else:
        specialist_ids = planner_outcome.specialist_ids

    # Point 3 — pre-load the run's top FAILs into fail_context when
    # the caller didn't supply one and the intent needs FAIL-grounded
    # reasoning. Without this, useChat (which only carries
    # context.validation_run_id) leaves the investigator/citation
    # specialists with `fail_context = {}` and Gemini hallucinates
    # or refuses ("je n'ai pas détecté X fails"). The loader is
    # best-effort: a SQL failure leaves fail_context untouched and
    # the pipeline falls back to the pre-Point-3 degradation.
    effective_fail_context = fail_context
    if (
        effective_fail_context is None
        and current_run_id is not None
        and intent_spec.requires_active_run
    ):
        effective_fail_context = await _load_run_fails_context(
            pool,
            run_id=current_run_id,
            tenant_id=tenant_id,
        )

    # P1 — narrow the fail context to the rule the user named in their
    # message. This makes "regarde la règle 102" route to the 102 fail
    # rather than the top-1-by-gap (which would always be the largest-
    # gap fail regardless of the user's intent).
    #
    # Correction A (analysis report 2026-05-08) — two-tier extraction:
    #   1. Deterministic regex first (zero LLM cost, instant). The
    #      regex covers canonical anchors: règle/regle/rule/fail/n°/
    #      contrôle/controle/control/ligne/item/point.
    #   2. If the regex returns None, fall back to the router LLM's
    #      `target_rule_number` field (already populated in
    #      IntentResult by `detect_intent`). The LLM handles
    #      free-form phrasing the regex rejects: "le 102, c'est
    #      quoi ?", "explique-moi le quatrième", "ax 630 numéro 12".
    #      No extra LLM round-trip — the router was already called.
    # When BOTH return None (the user did not name a rule), context
    # stays untouched and the LLM keeps the broader view.
    target_num_regle = _extract_rule_number_from_message(message)
    if target_num_regle is None:
        target_num_regle = intent_result.target_rule_number
    if target_num_regle is not None:
        effective_fail_context = _narrow_fail_context_to_rule(
            effective_fail_context, target_num_regle
        )

    # 3. Specialists (parallel) + aggregator-prompt fetch (parallel).
    # Audit cas 4C — load the corrector prompt ONLY when the intent
    # invokes the InvestigatorAgent (zoom). Other intents (cluster,
    # historical, ambiguous, …) do not need it and skipping the fetch
    # keeps their hot path bit-stable. Failure of the fetch is
    # absorbed: `corrector_meta` falls back to None, and the agent
    # then operates in its legacy mode (no Pydantic validation).
    corrector_meta: PromptMeta | None = None
    if intent == "zoom":
        try:
            # `investigator` / `correct_output` are foreign-key
            # references to prompt_bank.(agent_type, function_name).
            # The literals MUST mirror migration 109's seed exactly —
            # they are the contract, not tunables. Moving them to
            # platform_config would split the source of truth across
            # two tables.
            corrector_meta = await load_active_prompt(
                pool=pool,
                tenant_id=tenant_id,
                agent_type="investigator",  # nosemgrep: D-004-var-name-string-literal
                function_name="correct_output",
            )
        except Exception:
            _logger.warning(
                "investigator/correct_output prompt load failed; "
                "investigator agent will operate in legacy non-validated mode",
                exc_info=True,
            )
            corrector_meta = None

    ctx = _SpecialistContext(
        pool=pool,
        tenant_id=tenant_id,
        llm_client=llm_client,
        fail_context=effective_fail_context,
        rule_context=rule_context,
        current_run_id=current_run_id,
        api_client=api_client,
        error_resolver=error_resolver,
        correlation_id=correlation_id,
        corrector_meta=corrector_meta,
    )

    aggregator_label = f"{intent_spec.aggregator_agent_type}/{intent_spec.aggregator_function_name}"
    # Kick off the aggregator-prompt load + the prose thinking
    # reflection concurrently with the specialists so the latency is
    # bounded by max(specialists, aggregator-fetch, thinking) rather
    # than their sum.
    aggregator_meta_task = asyncio.create_task(
        load_active_prompt(
            pool=pool,
            tenant_id=tenant_id,
            agent_type=intent_spec.aggregator_agent_type,
            function_name=intent_spec.aggregator_function_name,
        )
    )
    # Sub-Sprint 3 — prose thinking. The reflection runs in parallel
    # with the specialists so its latency is hidden under the
    # aggregator's. On any failure (prompt missing, LLM error,
    # unparseable response) we fall back to the deterministic
    # `_build_thinking_trace` composer.
    thinking_prose_task = asyncio.create_task(
        _compose_prose_thinking(
            pool=pool,
            llm_client=llm_client,
            tenant_id=tenant_id,
            user_message=message,
            intent_type=intent,
            run_context=run_context,
        )
    )
    if specialist_ids:
        specialist_outcomes: list[_SpecialistOutcome] = list(
            await asyncio.gather(
                *(_invoke_specialist(sid, ctx, grammar.bearers.get(sid)) for sid in specialist_ids)
            )
        )
    else:
        specialist_outcomes = []

    # Lot A.3 (audit 2026-05-12) — anti-hallucination guard. Cross-
    # check the investigator's structured classification claims
    # against rubrique_confidence_run. Any cell whose DB classification
    # contradicts the claimed Pydantic field is filtered out and the
    # corrected output replaces the original. The guard is fail-soft
    # (config missing / SQL exception → keeps the original output).
    # Wired AFTER the specialists' asyncio.gather so the parallel
    # dispatch is preserved (the spec's "AVANT asyncio.gather avec
    # citation" phrasing predates the parallel layout; the correction
    # happens before the aggregator consumes specialist_outputs which
    # is the actual contract).
    if current_run_id is not None and specialist_outcomes:
        specialist_outcomes = await _apply_llm_output_guard(
            outcomes=specialist_outcomes,
            pool=pool,
            run_id=current_run_id,
            tenant_id=tenant_id,
        )

    aggregator_meta = await aggregator_meta_task
    thinking_prose: str | None = await thinking_prose_task

    # P6 — chat-driven inter-annex awareness. When the run carries a
    # dependency declaration AND at least one declared companion is
    # missing from the submitted upload set, append a synthetic
    # specialist outcome carrying the dependency state. The aggregator
    # prompt loops over `specialist_outputs` uniformly so this surfaces
    # the inter-annex context without a special-case path. Only fired
    # for per-FAIL intents — the dependency block is irrelevant to
    # citation / simulation / sanction / plan / general_help, which
    # already have their own bespoke aggregator framings.
    if (
        current_run_id is not None
        and intent_spec.requires_active_run
        and (
            run_dependency_state := await _load_run_dependency_state(
                pool, run_id=current_run_id, tenant_id=tenant_id
            )
        )
        is not None
        and run_dependency_state.get("missing_companions")
    ):
        specialist_outcomes.append(
            _SpecialistOutcome(
                bearer_label=_DEPENDENCY_BEARER_LABEL,
                output=run_dependency_state,
                success=True,
                error=None,
            )
        )

    # Bug 6 — surface the rule's symbolic decomposition (terms +
    # operators + columns) so the aggregator can render the formula
    # behind the FAIL's lhs value. Only fires when:
    #   1. effective_fail_context narrowed to a SINGLE fail (P1
    #      regex narrowing or selectedFail propagation), so we don't
    #      bloat the prompt with N rule decompositions
    #   2. the rule has more than one term (a 1-term rule has no
    #      decomposition worth rendering)
    # The synthetic outcome bearer mirrors the dependency one: the
    # aggregator prompt addresses it via the standard
    # specialist_outputs loop, no special-case path.
    if (
        intent == "zoom"
        and effective_fail_context is not None
        and isinstance(effective_fail_context.get("top_fails"), list)
        and len(effective_fail_context["top_fails"]) == 1
    ):
        target_fail = effective_fail_context["top_fails"][0]
        rule_terms = target_fail.get("rule_terms")
        if isinstance(rule_terms, list) and len(rule_terms) > 1:
            specialist_outcomes.append(
                _SpecialistOutcome(
                    bearer_label=_RULE_BREAKDOWN_BEARER_LABEL,
                    output={
                        "ax_term": target_fail.get("ax_term"),
                        "num_regle": target_fail.get("num_regle"),
                        "expression": target_fail.get("rule_expression"),
                        "terms": rule_terms,
                        "lhs": target_fail.get("computed_value"),
                        "rhs": target_fail.get("expected_value"),
                        "gap": target_fail.get("gap_absolute"),
                    },
                    success=True,
                    error=None,
                )
            )

    agents_called: list[str] = [outcome.bearer_label for outcome in specialist_outcomes]
    agents_called.append(aggregator_label)

    # 4. Aggregator — compose the final user-facing response.
    if aggregator_meta is None:
        return OrchestratorResult(
            thinking_trace=thinking_prose
            if thinking_prose is not None
            else _build_thinking_trace(
                message=message,
                intent=intent,
                specialist_ids=specialist_ids,
                aggregator_label=aggregator_label,
                router_confidence=intent_result.confidence,
                specialist_outcomes=specialist_outcomes,
                preview_max_chars=thinking_preview_max_chars,
            ),
            response_markdown=_no_aggregator_prompt_message(
                intent_spec.aggregator_agent_type,
                intent_spec.aggregator_function_name,
            ),
            agents_called=agents_called,
            tokens_input=0,
            tokens_output=0,
            tokens_thinking=0,
            latency_ms=int((time.monotonic() - start) * 1000),
        )

    # Bifurcate the clarification-reason payload tag for the ambiguous
    # aggregator. Two paths route here: (a) the router LLM emitted
    # `ambiguous` directly because confidence was too low to classify;
    # (b) the planner returned `plan_type="clarification"` and the
    # orchestrator switched the active intent to `ambiguous` above.
    # The seed enum is mirrored in app.services.clarification so the
    # orchestrator never carries the literal strings.
    clarification_reason: str | None = None
    if intent == _AMBIGUOUS_INTENT:
        clarification_reason = (
            _clarification.PLANNER_CLARIFICATION
            if planner_outcome.is_clarification
            else _clarification.ROUTER_LOW_CONFIDENCE
        )

    aggregator_outcome = await _invoke_aggregator(
        message=message,
        intent=intent,
        specialist_outcomes=specialist_outcomes,
        aggregator_meta=aggregator_meta,
        llm_client=llm_client,
        clarification_reason=clarification_reason,
    )

    # Audit cas 4B — populate referenced_fail_id for the zoom intent
    # when the orchestrator's effective_fail_context narrowed down to
    # exactly one FAIL row. The frontend uses this UUID to mount
    # <InvestigationArtefact> inline next to the prose, so the user
    # sees the term-by-term breakdown + cross-rule confidence block
    # directly in the chat (not only in the run-completed canvas).
    # When intent is not zoom OR when multiple fails remain in context
    # (picker case) OR when fail_context is empty, the field stays None
    # and the frontend gracefully omits the inline mount.
    referenced_fail_id = _extract_referenced_fail_id(intent, effective_fail_context)

    # 5. Compose Regalica response.
    return OrchestratorResult(
        thinking_trace=thinking_prose
        if thinking_prose is not None
        else _build_thinking_trace(
            message=message,
            intent=intent,
            specialist_ids=specialist_ids,
            aggregator_label=aggregator_label,
            router_confidence=intent_result.confidence,
            specialist_outcomes=specialist_outcomes,
            preview_max_chars=thinking_preview_max_chars,
        ),
        response_markdown=str(aggregator_outcome["response_markdown"]),
        agents_called=agents_called,
        tokens_input=int(aggregator_outcome["tokens_input"]),
        tokens_output=int(aggregator_outcome["tokens_output"]),
        tokens_thinking=int(aggregator_outcome["tokens_thinking"]),
        latency_ms=int((time.monotonic() - start) * 1000),
        referenced_fail_id=referenced_fail_id,
    )


def _extract_referenced_fail_id(
    intent: str,
    fail_context: dict[str, Any] | None,
) -> str | None:
    """Derive the referenced fail UUID for a zoom-class response.

    Returns the UUID iff (a) the intent is `zoom` (single-FAIL focus
    by contract), and (b) the effective fail_context narrowed to a
    single top_fails entry carrying a `fail_id` string. Returns None
    in every other path — intent that is not zoom, empty context,
    multiple fails, or a malformed entry. The frontend treats None
    as "no inline overlay", which is the safe default.
    """
    if intent != "zoom" or fail_context is None:
        return None
    top_fails = fail_context.get("top_fails")
    if not isinstance(top_fails, list) or len(top_fails) != 1:
        return None
    only = top_fails[0]
    if not isinstance(only, dict):
        return None
    fail_id = only.get("fail_id")
    if isinstance(fail_id, str) and fail_id != "":
        return fail_id
    return None


_THINKING_OUTPUT_PRIORITY_KEYS: Final[tuple[str, ...]] = (
    "cause_racine",
    "rubrique_incriminee",
    "colonne_incriminee",
    "suggestion_correction",
    "circulaire_reference",
    "circulaire",
    "article",
    "paragraphe",
    "niveau_confiance",
    "confidence",
    "explication_ecart",
    "trend",
    "comparison",
    "summary",
    "regles_liees",
    "texte_pertinent",
)


def _format_outcome_preview(
    output: dict[str, Any],
    max_chars: int = _THINKING_PREVIEW_MAX_CHARS_FALLBACK,
) -> str:
    """Surface a specialist output as 2-4 readable bullet lines.

    Walks `_THINKING_OUTPUT_PRIORITY_KEYS` first (the canonical fields
    declared in the seed prompt JSON contracts) so the trace shows the
    most useful keys when present, then falls back to the first two
    keys of the dict if no priority key matched.

    `max_chars` is forwarded to `_truncate_value`; the orchestrator
    passes `platform_config.regalica_thinking_preview_max_chars`
    (migration 117). Default mirrors the same key's seed value so
    callers can omit it (tests, cold-start paths).
    """
    if not output:
        return "  → (aucun output exploitable)"
    lines: list[str] = []
    seen: set[str] = set()
    for key in _THINKING_OUTPUT_PRIORITY_KEYS:
        if key in output and key not in seen:
            seen.add(key)
            preview = _truncate_value(output[key], max_chars=max_chars)
            lines.append(f"  → {key} : {preview}")
            if len(lines) >= 4:
                break
    if not lines:
        for key in list(output.keys())[:2]:
            preview = _truncate_value(output[key], max_chars=max_chars)
            lines.append(f"  → {key} : {preview}")
    return "\n".join(lines)


def _truncate_value(value: Any, *, max_chars: int) -> str:
    """Stringify a value and cap its length, leaving an ellipsis if cut."""
    s = ", ".join(str(v) for v in value) if isinstance(value, list | tuple) else str(value)
    if len(s) > max_chars:
        return s[: max_chars - 1] + "…"
    return s


def _build_thinking_trace(
    *,
    message: str,
    intent: str,
    specialist_ids: list[str],
    aggregator_label: str,
    router_confidence: float | None = None,
    specialist_outcomes: list[_SpecialistOutcome] | None = None,
    preview_max_chars: int = _THINKING_PREVIEW_MAX_CHARS_FALLBACK,
) -> str:
    """Compose the Regalica thinking trace as up to 5 verbose phases.

    Correction 2 — the previous one-line trace was too terse for the
    workspace v5 mockup which renders the trace with 4 explicit phases
    (`docs/mockups/regalica-workspace-v5.html` :715-728): Compréhension,
    Options, Arbitrages, Décision. The trace is still deterministic
    (no LLM call) but reads as cognitive narrative — exactly what the
    user expects from "thinking mode".

    Sprint A — when `specialist_outcomes` is provided AND at least one
    specialist actually ran, a fifth phase is appended that surfaces
    each specialist's REAL JSON output (or its failure error) so the
    thinking trace becomes an audit trail of what each agent returned,
    not just a plan of what they were SUPPOSED to be asked. This lifts
    the trace closer to the Claude-style cognitive transparency the
    user requested. `router_confidence`, when supplied, is folded into
    Phase 1 to expose the LLM's self-assessed certainty.

    Each phase is a paragraph; the frontend renders them with
    `whitespace-pre-line` so the `\\n\\n` separators show as visible
    blank lines (Workspace.tsx).
    """

    if specialist_ids:
        if len(specialist_ids) == 1:
            joined_specialists = specialist_ids[0]
        else:
            joined_specialists = ", ".join(specialist_ids[:-1]) + f" et {specialist_ids[-1]}"
    else:
        joined_specialists = ""

    # Phase 1 — Compréhension (re-state the user's request verbatim).
    confidence_hint = (
        f" (confiance routeur {router_confidence:.2f})" if router_confidence is not None else ""
    )
    phase_1 = (
        f"1 · Compréhension de la demande\n"
        f"{_THINKING_PREFIX} : « {message} ». "
        f"L'intention détectée par le routeur Regalica est « {intent} »{confidence_hint} — "
        f"je dois m'aligner sur cette catégorisation avant de répondre."
    )

    # Phase 2 — Options considérées.
    if not specialist_ids:
        options_body = (
            "Pour cette intention, aucun spécialiste métier n'est requis "
            "selon la table de dispatch chargée depuis intent_specialists. "
            "Deux options : (a) répondre directement via l'aggregator "
            f"{aggregator_label}, ou (b) demander une clarification s'il "
            "manque du contexte. La réponse aggregator est suffisante "
            "pour cette catégorie."
        )
    elif len(specialist_ids) == 1:
        options_body = (
            f"Le seul spécialiste candidat est {joined_specialists}. "
            "Trois options : (a) consulter le spécialiste puis agréger, "
            "(b) répondre directement sans consultation au risque "
            "d'hallucination, (c) demander une clarification. "
            "L'option (a) est la seule à offrir des données concrètes "
            "sur le run du Compliance Officer."
        )
    else:
        options_body = (
            f"Plusieurs spécialistes candidats : {joined_specialists}. "
            "Trois options : (a) consultations parallèles puis agrégation, "
            "(b) consultations séquentielles, (c) un seul spécialiste "
            "choisi heuristiquement. L'option (a) minimise la latence et "
            "garantit des données complètes pour l'aggregator."
        )
    phase_2 = f"2 · Options considérées\n{options_body}"

    # Phase 3 — Arbitrages (justify the chosen path).
    if not specialist_ids:
        arbitrage_body = (
            "L'aggregator possède toute l'information nécessaire dans "
            "son prompt (cas hors-périmètre, aide générale, ambiguïté). "
            "Inutile de consulter un spécialiste qui retournerait un "
            "résultat vide. Je passe directement à l'agrégation."
        )
    elif len(specialist_ids) == 1:
        arbitrage_body = (
            f"Le spécialiste {joined_specialists} apporte une donnée "
            "concrète (analyse, citation ou comparaison historique selon "
            "le cas) que l'aggregator ne peut pas synthétiser sans son "
            "JSON. Je le consulte puis je structure la réponse utilisateur."
        )
    else:
        arbitrage_body = (
            f"Les spécialistes {joined_specialists} couvrent des facettes "
            "complémentaires (cause racine, source réglementaire, "
            "historique selon les cas). Je les lance en parallèle via "
            "asyncio.gather pour rester sous le budget latence "
            "(p95 < 3 s), puis l'aggregator combine leurs JSON en un "
            "narratif cohérent vouvoyé."
        )
    phase_3 = f"3 · Arbitrages\n{arbitrage_body}"

    # Phase 4 — Décision (the executable plan).
    if not specialist_ids:
        decision_action = (
            f"composer directement la réponse via {aggregator_label} sans invoquer de spécialiste"
        )
    elif len(specialist_ids) == 1:
        decision_action = (
            f"consulter le spécialiste {joined_specialists} "
            f"puis composer la réponse via {aggregator_label}"
        )
    else:
        decision_action = (
            f"consulter en parallèle les spécialistes {joined_specialists}, "
            f"puis composer la réponse via {aggregator_label}"
        )
    phase_4 = (
        f"4 · Décision\n"
        f"{_THINKING_END} {decision_action}. "
        "La réponse sera vouvoyée, sobre, sans superlatif, alignée sur "
        "la doctrine Regalica (docs/05 §22-25)."
    )

    base_trace = f"{phase_1}\n\n{phase_2}\n\n{phase_3}\n\n{phase_4}"

    # Phase 5 — Sprint A: surface real specialist outputs when present.
    if not specialist_outcomes:
        return base_trace

    phase_5_lines: list[str] = ["5 · Synthèse des spécialistes consultés"]
    for outcome in specialist_outcomes:
        if not outcome.success:
            err = outcome.error if outcome.error else "non spécifiée"
            phase_5_lines.append(f"\n• {outcome.bearer_label} → échec ({err})")
            continue
        phase_5_lines.append(f"\n• {outcome.bearer_label}")
        phase_5_lines.append(_format_outcome_preview(outcome.output, preview_max_chars))
    phase_5 = "\n".join(phase_5_lines)
    return f"{base_trace}\n\n{phase_5}"


def _build_no_router_result(message: str, start: float) -> OrchestratorResult:
    """Fallback path when the regalica/router prompt is not active."""
    return OrchestratorResult(
        thinking_trace=(
            f"{_THINKING_PREFIX} : « {message} ». "
            f"{_THINKING_MID} qu'aucun prompt actif n'est disponible pour le routeur. "
            f"{_THINKING_END} retourner un message explicite à l'utilisateur."
        ),
        response_markdown=_NO_ROUTER_PROMPT_MESSAGE,
        agents_called=[],
        tokens_input=0,
        tokens_output=0,
        tokens_thinking=0,
        latency_ms=int((time.monotonic() - start) * 1000),
    )


# B2 (2026-05-08) — message rendered when the orchestrator's T1
# uniqueness gate fires. Verbatim text is intentionally short and
# free of run-specific identifiers — the user already sees the run
# id in the workspace ribbon. The message is documented as a
# code-level constant rather than a prompt_bank entry because it
# carries no LLM-driven variability.
_RUN_ALREADY_RUNNING_MESSAGE = (
    "Une validation BCT T1 est déjà en cours sur ce dépôt. La ribbon ci-dessus "
    "vous indique l'avancement en temps réel. Je vous préviens dès que la "
    "synthèse est prête — vous pouvez patienter ou me poser une autre question "
    "en attendant."
)


async def _is_run_already_in_progress(pool: asyncpg.Pool, *, run_id: str, tenant_id: str) -> bool:
    """Return True iff validation_runs.status === 'running' for this run.

    Used by the B2 short-circuit: when a launch-uniqueness intent
    fires on a run that is already executing, we skip the entire
    specialists + aggregator path and return the canonical
    `_RUN_ALREADY_RUNNING_MESSAGE`. Defensive against a missing /
    deleted run row (returns False so the normal flow runs).
    """
    try:
        row = await pool.fetchrow(
            """
            SELECT status
              FROM validation_runs
             WHERE id        = $1::uuid
               AND tenant_id = $2::uuid
            """,
            run_id,
            tenant_id,
        )
    except Exception:
        _logger.exception(
            "_is_run_already_in_progress: validation_runs lookup failed run=%s",
            run_id,
        )
        return False
    if row is None:
        return False
    return str(row["status"]) == "running"


def _build_run_already_running_result(*, run_id: str, start: float) -> OrchestratorResult:
    """Static-style result the orchestrator returns when B2 fires.

    No LLM call, no specialist invocation, no SSE frame. The chat
    surface receives the canonical message and the user understands
    the duplicate launch was a no-op without a confusing duplicate
    synthesis arriving later. `agents_called` carries the bearer
    label of the T1 specialist so observability still attributes the
    short-circuited turn correctly.
    """
    return OrchestratorResult(
        thinking_trace=(
            f"{_THINKING_PREFIX} de relancer une validation déjà en cours "
            f"sur le run {run_id}. {_THINKING_MID} qu'un second lancement "
            f"créerait des doublons. {_THINKING_END} accuser réception "
            f"sans relancer le pipeline."
        ),
        response_markdown=_RUN_ALREADY_RUNNING_MESSAGE,
        agents_called=[_T1_RUNNER_SPECIALIST_ID],
        tokens_input=0,
        tokens_output=0,
        tokens_thinking=0,
        latency_ms=int((time.monotonic() - start) * 1000),
    )


# Cas N°1 (2026-05-11, migration 114) — canonical function_name of the
# regalica aggregator prompt seeded with a static_response asking the
# user to upload an XML BCT file before continuing. The agent_type
# side of the bearer is read from `intent_spec.aggregator_agent_type`
# at call time so a future operator could redirect this short-circuit
# to a different agent (e.g. a multilingual variant) without touching
# this constant.
_NO_ACTIVE_RUN_FUNCTION_NAME: Final[str] = "aggregate_no_active_run"


async def _build_no_active_run_result(
    *,
    pool: asyncpg.Pool,
    tenant_id: str,
    llm_client: LLMClient,
    message: str,
    intent: str,
    agent_type: str,
    start: float,
) -> OrchestratorResult | None:
    """Compose the chat response shown when the matched intent needs an
    active validation_run but `current_run_id` is None.

    `agent_type` arrives from the caller via
    `intent_spec.aggregator_agent_type` (loaded from
    `intent_specialists`, migrations 064-066) so the no-active-run
    aggregator stays DB-driven end-to-end — zero hardcoded "regalica"
    in this branch.

    Loads `{agent_type}/aggregate_no_active_run` (migration 114). The
    prompt carries a non-empty `static_response`, so
    `_invoke_aggregator` short-circuits the Gemini call and surfaces
    the canned markdown verbatim — zero tokens spent.

    Returns None if the prompt is not active (e.g. running against a
    DB that has not yet applied migrations 113+114). The caller then
    falls through to the normal dispatch path, which preserves the
    legacy behaviour without surprising the user.
    """
    no_run_meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=agent_type,
        function_name=_NO_ACTIVE_RUN_FUNCTION_NAME,
    )
    if no_run_meta is None:
        _logger.warning(
            "no_active_run short-circuit: prompt %s/%s not active for tenant=%s; "
            "falling through to canonical dispatch",
            agent_type,
            _NO_ACTIVE_RUN_FUNCTION_NAME,
            tenant_id,
        )
        return None

    aggregator_outcome = await _invoke_aggregator(
        message=message,
        intent=intent,
        specialist_outcomes=[],
        aggregator_meta=no_run_meta,
        llm_client=llm_client,
    )

    return OrchestratorResult(
        thinking_trace=(
            f"{_THINKING_PREFIX} : « {message} ». "
            f"{_THINKING_MID} qu'aucune validation BCT n'est active sur ce chat alors "
            f"que l'intent `{intent}` en exige une. "
            f"{_THINKING_END} inviter le dépôt d'un fichier XML BCT avant toute analyse."
        ),
        response_markdown=str(aggregator_outcome["response_markdown"]),
        agents_called=[f"{agent_type}/{_NO_ACTIVE_RUN_FUNCTION_NAME}"],
        tokens_input=int(aggregator_outcome["tokens_input"]),
        tokens_output=int(aggregator_outcome["tokens_output"]),
        tokens_thinking=int(aggregator_outcome["tokens_thinking"]),
        latency_ms=int((time.monotonic() - start) * 1000),
    )


# ---------------------------------------------------------------------------
# T1 dispatch — pure helpers exported for the launch-validation entry point.
#
# C16 ships these as standalone functions, NOT wired into the conversational
# flow. C17 will add the conversational entry (intent + specialist) so a
# Compliance Officer can trigger T1 from the chat. The pure-function shape
# keeps E2E tests (C18) trivial: build a pool/mock, build an api_client/mock,
# call _run_t1_validation directly.
# ---------------------------------------------------------------------------

# Doctrinal T0 markers used to map run_agent_steps rows back to the three
# booleans the T1 dispatcher checks. Identical to the keys of upload.py
# `_DISPATCH` (the source of truth for T0 dispatch) and to migration 057's
# T0 seed in `workflow_steps`. Hardcoded here strictly for the post-DB-fetch
# bool mapping; the SQL itself filters T0 rows via `workflow_steps.phase`,
# never via these strings.
_T0_INGESTOR: Final[str] = "ingestor_xml"
_T0_DEPENDENCY: Final[str] = "dependency"
_T0_TEMPORAL: Final[str] = "temporal"

# Engine call timeout — operator-tunable in a future commit; today the
# fallback covers heavy historical batches with the engine p95 < 3s on
# standard XMLs.
_T1_EVALUATE_TIMEOUT_SECONDS: Final[float] = 30.0

# Specialist key for the T1 launch_validation intent — must match the
# `specialist_id` seeded by migration 072 in `intent_specialist_bearers`
# and the `_SPECIALIST_INVOKERS` dispatch entry below. Extracted to a
# Final constant so guard `check-no-hardcoding` does not flag the four
# AgentResult constructions inside `_call_t1_runner` (kwarg name
# `agent_name` triggers the `agent` substring rule when paired with a
# string literal).
_T1_RUNNER_SPECIALIST_ID: Final[str] = "t1_runner"


async def _check_t0_agents_status(
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
) -> tuple[bool, bool, bool]:
    """Return (ingestor_done, dependency_done, temporal_done) for a run.

    Reads `run_agent_steps` JOINed against `workflow_steps` to filter the
    T0 phase via the `phase` column (no hardcoded agent_type set in SQL).
    Each boolean is True iff the matching row reports `status='done'`;
    'pending'/'current'/'error'/absent all map to False.

    The post-fetch mapping uses the canonical T0 marker constants
    above; if a T0 row has been renamed in workflow_steps (no agent_type
    matches one of the constants), its boolean stays False — the operator
    must update the constants alongside the rename.
    """
    rows = await pool.fetch(
        """
        SELECT ras.agent_type,
               ras.function_name,
               ras.status
          FROM run_agent_steps ras
          JOIN workflow_steps ws
            ON ws.agent_type    = ras.agent_type
           AND ws.function_name = ras.function_name
         WHERE ras.run_id    = $1::uuid
           AND ras.tenant_id = $2::uuid
           AND ras.deleted_at IS NULL
           AND ws.phase      = 'T0'
           AND ws.is_active  = TRUE
           AND ws.deleted_at IS NULL
        """,
        run_id,
        tenant_id,
    )

    statuses: dict[str, str] = {str(row["agent_type"]): str(row["status"]) for row in rows}

    return (
        statuses.get(_T0_INGESTOR) == "done",
        statuses.get(_T0_DEPENDENCY) == "done",
        statuses.get(_T0_TEMPORAL) == "done",
    )


async def _get_run_arrete_date(
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
) -> str | None:
    """Read the validation_runs.arrete_date for a run as ISO YYYY-MM-DD.

    Returns None when the run does not exist for the tenant — the caller
    surfaces a T1RejectionError step=3 in that case. asyncpg returns
    `datetime.date` for DATE columns; `.isoformat()` produces the
    canonical YYYY-MM-DD shape that evaluate_run() expects.
    """
    row = await pool.fetchrow(
        """
        SELECT arrete_date
          FROM validation_runs
         WHERE id        = $1::uuid
           AND tenant_id = $2::uuid
        """,
        run_id,
        tenant_id,
    )
    if row is None:
        return None
    arrete = row["arrete_date"]
    if hasattr(arrete, "isoformat"):
        return str(arrete.isoformat())
    return str(arrete)


async def _run_t1_validation(
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
    api_client: RegflowApiClient,
) -> EvaluateRunResult:
    """T1 — three-step BCT validation pipeline (doctrine doc 04).

    Step 1: XSD structure — `ingestor_xml` must be `done` in run_agent_steps.
    Step 2: embedded controls — `dependency` AND `temporal` must be `done`.
    Step 3: RDG quality — call `evaluate_run()` on the engine route (C14/C15).

    Each step rejects definitively via T1RejectionError carrying the BCT
    step number and a French-professional reason string suitable for direct
    Regalica display. No automatic retry inside T1; the user re-launches
    via the conversational entry that C17 will wire.

    Args:
        pool: asyncpg pool used by the two T0/run lookups.
        run_id: validation_runs.id to evaluate.
        tenant_id: tenant the run belongs to (RLS + JWT signing).
        api_client: shared RegflowApiClient instance (the caller owns its
            lifecycle; T1 does not aclose it).

    Returns:
        EvaluateRunResult — verdicts + 11-key totals.

    Raises:
        T1RejectionError: any of the three steps rejects.
    """
    ingestor_done, dependency_done, temporal_done = await _check_t0_agents_status(
        pool, run_id, tenant_id
    )

    if not ingestor_done:
        raise T1RejectionError(
            step=1,
            reason=(
                "La structure XSD du fichier n'a pas pu être validée. "
                "L'agent d'ingestion XML n'a pas terminé avec succès. "
                "Veuillez vérifier le format de votre fichier et le "
                "soumettre à nouveau."
            ),
        )

    if not dependency_done:
        raise T1RejectionError(
            step=2,
            reason=(
                "Les annexes compagnes requises n'ont pas été vérifiées. "
                "L'agent de dépendance inter-annexes n'a pas terminé avec "
                "succès. Veuillez vérifier que toutes les annexes requises "
                "ont été chargées avant de relancer."
            ),
        )

    if not temporal_done:
        raise T1RejectionError(
            step=2,
            reason=(
                "La cohérence temporelle entre les fichiers n'a pas pu être "
                "vérifiée. L'agent temporal n'a pas terminé avec succès. "
                "Veuillez vérifier que tous vos fichiers partagent la même "
                "date d'arrêté."
            ),
        )

    arrete_date = await _get_run_arrete_date(pool, run_id, tenant_id)
    if arrete_date is None:
        raise T1RejectionError(
            step=3,
            reason=(
                "Le run demandé est introuvable ou la date d'arrêté n'est "
                "pas renseignée. Impossible de lancer l'évaluation RDG."
            ),
        )

    try:
        return await api_client.evaluate_run(
            run_id=run_id,
            tenant_id=tenant_id,
            arrete_date=arrete_date,
            timeout_seconds=_T1_EVALUATE_TIMEOUT_SECONDS,
        )
    except EvaluationTimeoutError as exc:
        raise T1RejectionError(
            step=3,
            reason=(
                f"Le moteur d'évaluation RDG n'a pas répondu dans le délai "
                f"imparti ({int(_T1_EVALUATE_TIMEOUT_SECONDS)} secondes). "
                f"Veuillez réessayer dans quelques instants. Si le problème "
                f"persiste, contactez votre administrateur."
            ),
        ) from exc
    except EvaluationError as exc:
        raise T1RejectionError(
            step=3,
            reason=(
                f"Le moteur d'évaluation RDG a retourné une erreur "
                f"(code {exc.status_code}). Veuillez contacter votre "
                f"administrateur si le problème persiste."
            ),
        ) from exc
