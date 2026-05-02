"""Origin tags for the regalica/aggregate_ambiguous prompt.

The aggregator that handles ambiguous user requests is invoked from
two distinct places in the orchestrator pipeline:

  * `ROUTER_LOW_CONFIDENCE` — the router LLM emitted
    `intent="ambiguous"` directly because it could not classify the
    user message with sufficient confidence. The user's question was
    too vague, monosyllabic or off-pattern;
  * `PLANNER_CLARIFICATION` — the conditional planner returned
    `plan_type="clarification"`. The router did classify cleanly,
    but on a triggered intent (simulation / sanction / plan) the
    planner determined the request needs a precision before any
    specialist plan can be built.

The two cases route through the same aggregator prompt — the prompt
template branches on `clarification_reason` for Phrase 1 wording.
The constants are the single source of truth shared between the
orchestrator (which sets the value on the payload) and the seed
JSON Schema enum (which constrains the LLM-visible contract).

Anything outside this module that emits a clarification-reason
literal is a Guard D-004 violation.
"""

from __future__ import annotations

from typing import Final

ROUTER_LOW_CONFIDENCE: Final[str] = "router_low_confidence"
PLANNER_CLARIFICATION: Final[str] = "planner_clarification"
