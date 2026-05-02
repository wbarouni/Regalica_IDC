"""Context builders + template renderer for the regalica/planner prompt.

The planner LLM refines a candidate set produced by `intent_grammar`
(C2 doctrine) within the depth cap loaded from `platform_config`. To
do so it needs three structured inputs beyond the user message:

  * `candidate_specialists` — a textual enumeration of the agents the
    intent dispatch already shortlisted, so the LLM cannot invent
    agent_id values outside the closed set;
  * `run_context` — the same `validation_runs` snapshot the router
    receives, augmented with the current session's question history
    so the planner can extract relevant rubriques / annexes from
    prior turns;
  * `max_plan_steps` — the depth cap, surfaced to the LLM as a hard
    constraint declared in the prompt.

The renderer mirrors `router_context.render_router_template` and uses
the same `_DefensiveFormatMap` so unknown placeholders fall back to
empty strings instead of raising `KeyError` — operators may evolve
the planner template with additional `{...}` slots without forcing a
Python release in lockstep.
"""

from __future__ import annotations

import json
from typing import Any

import asyncpg

from app.services.intent_grammar import (
    IntentGrammar,
    SpecialistBearer,
    load_intent_grammar,
)
from app.services.router_context import build_run_context

# How many session-history entries to surface in the enriched run
# context. Five is the orchestrator's UI history depth; surfacing
# more would inflate the prompt without helping the planner extract
# fresher entities.
_SESSION_HISTORY_LIMIT = 5


def _format_candidate_specialists(
    specialist_ids: tuple[str, ...],
    bearers: dict[str, SpecialistBearer],
) -> str:
    """Render the candidate set as `agent_id | agent_type | function_name`.

    The bearer triple is the only structured description the chatbot
    has of each specialist (commit C7 — `intent_specialist_bearers`).
    Empty when the intent has no candidates; the orchestrator treats
    that as the P1-fallback signal before invoking the planner.
    """
    lines: list[str] = []
    for sid in specialist_ids:
        bearer = bearers.get(sid)
        if bearer is None:
            # DB drift between intent_specialists.specialist_ids and
            # intent_specialist_bearers — surface as a clear marker
            # rather than skipping silently, so the planner can still
            # see the candidate but knows the wiring is incomplete.
            lines.append(f"{sid} | unknown | unknown")
            continue
        lines.append(f"{sid} | {bearer.agent_type} | {bearer.function_name}")
    return "\n".join(lines)


async def load_candidate_specialists(
    pool: asyncpg.Pool,
    intent: str,
) -> str:
    """Return the candidate specialists for `intent` as a printable block.

    Empty string when the intent has no specialists or is absent from
    the grammar. Callers (the orchestrator) interpret an empty block
    as "no candidate set" and skip the planner LLM call — there is
    nothing to refine.
    """
    grammar: IntentGrammar = await load_intent_grammar(pool)
    spec = grammar.intents.get(intent)
    if spec is None or not spec.specialist_ids:
        return ""
    return _format_candidate_specialists(spec.specialist_ids, grammar.bearers)


async def build_enriched_run_context(
    pool: asyncpg.Pool,
    run_id: str | None,
    tenant_id: str,
    session_history: list[str] | None = None,
) -> dict[str, Any]:
    """Return the run snapshot + session history for the planner prompt.

    `session_history` is the list of user messages already exchanged
    in the current chat session, capped to the last
    `_SESSION_HISTORY_LIMIT` for prompt-budget control. When
    `run_id` is None, returns `{}` augmented with a possibly-empty
    `session_history` key — the planner uses both signals together.
    """
    base: dict[str, Any] = {}
    if run_id is not None:
        base = await build_run_context(pool=pool, run_id=run_id, tenant_id=tenant_id)
    if session_history:
        base["session_history"] = list(session_history[-_SESSION_HISTORY_LIMIT:])
    return base


def render_planner_template(
    template: str,
    *,
    intent: str,
    confidence: float,
    message: str,
    candidate_specialists: str,
    run_context: dict[str, Any] | None,
    max_plan_steps: int,
) -> str:
    """Inject the six planner placeholders into `template`.

    `_DefensiveFormatMap` (re-imported from `router_context`) lets a
    later prompt revision declare additional `{...}` slots without
    forcing a Python release. Unknown placeholders render as empty.
    """
    # Local import avoids a cross-module re-export in router_context's
    # public surface; the class is an implementation detail of both
    # renderers.
    from app.services.router_context import _DefensiveFormatMap

    rc = run_context if run_context else {}
    rendered = template.format_map(
        _DefensiveFormatMap(
            {
                "intent": intent,
                "confidence": confidence,
                "message": message,
                "candidate_specialists": candidate_specialists,
                "run_context": json.dumps(rc, ensure_ascii=False),
                "max_plan_steps": max_plan_steps,
            }
        )
    )
    return rendered
