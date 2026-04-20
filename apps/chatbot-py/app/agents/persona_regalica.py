"""PersonaRegalicaAgent — custodian of Regalica's voice (master prompt v1.2 §5.6).

Audits every AI response before display:
- Detects the correct response format from §5.3 (7 adaptive formats).
- Validates guardrails §5.4 (no hallucination markers, no servile phrases,
  citations mandatory, confidence >= 0.95).
- Post-processes the raw response (strips servile phrases, applies format).
- Returns a PersonaOutput; caller is responsible for audit persistence.

Guardrail hard blockers (guardrail_passed=False):
  NO_CITATIONS, LOW_CONFIDENCE:<value>

Soft violations (warnings only, response still returned):
  SERVILE_PHRASE:<phrase>, EMOJI_IN_RESPONSE, FORMAT_WARNING:<detail>
"""

from __future__ import annotations

import decimal
from typing import Any

import structlog
from pydantic import BaseModel, ConfigDict, Field

from app.agents.base import AgentContext, AgentResult, BaseAgent
from app.agents.persona_formatting import apply_format, detect_format_type
from app.agents.persona_guardrails import check_guardrails, strip_servile_phrases
from app.llm.base import LLMClient

decimal.getcontext().prec = 38

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class PersonaInput(BaseModel):
    """Input to the persona audit pass."""

    model_config = ConfigDict(frozen=True)

    user_question: str = Field(min_length=1)
    raw_response: str = Field(min_length=1)
    citations: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    agent_id: str
    session_id: str
    tenant_id: str


class PersonaOutput(BaseModel):
    """Output after persona enforcement."""

    model_config = ConfigDict(frozen=True)

    formatted_response: str
    format_type: str
    guardrail_passed: bool
    guardrail_violations: list[str]
    citations: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Hard-blocker classification
# ---------------------------------------------------------------------------

_HARD_BLOCKERS: frozenset[str] = frozenset(["NO_CITATIONS"])


def _is_hard_blocker(violation: str) -> bool:
    """Return True if *violation* is a hard blocker (response must not be shown)."""
    return violation in _HARD_BLOCKERS or violation.startswith("LOW_CONFIDENCE")


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class PersonaRegalicaAgent(BaseAgent):
    """Custodian of Regalica's voice — audits every AI response.

    Unlike other agents this one does NOT call an LLM; it is a deterministic
    post-processing pass.  It still inherits ``BaseAgent`` for consistency
    (shared ``agent_id`` convention, ``_now_ms`` helper).
    """

    agent_id = "persona-regalica"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    # ------------------------------------------------------------------
    # Primary entry point (typed)
    # ------------------------------------------------------------------

    async def audit(self, input_data: PersonaInput) -> PersonaOutput:
        """Run the full persona audit pipeline and return a PersonaOutput."""
        t0 = self._now_ms()
        log = logger.bind(
            agent=self.agent_id,
            tenant_id=input_data.tenant_id,
            session_id=input_data.session_id,
            source_agent=input_data.agent_id,
        )

        log.info("persona.audit.start", question_len=len(input_data.user_question))

        format_type = detect_format_type(input_data.user_question)
        log.debug("persona.format_detected", format_type=format_type)

        violations = check_guardrails(
            input_data.raw_response,
            input_data.citations,
            input_data.confidence,
        )

        # Strip servile phrases regardless of violations
        cleaned = strip_servile_phrases(input_data.raw_response)

        # Apply format-specific adjustments (non-blocking)
        formatted, format_warnings = apply_format(cleaned, format_type)
        violations.extend(format_warnings)

        guardrail_passed = not any(_is_hard_blocker(v) for v in violations)

        log.info(
            "persona.audit.done",
            format_type=format_type,
            guardrail_passed=guardrail_passed,
            violations=violations,
            latency_ms=self._now_ms() - t0,
        )

        return PersonaOutput(
            formatted_response=formatted,
            format_type=format_type,
            guardrail_passed=guardrail_passed,
            guardrail_violations=violations,
            citations=input_data.citations,
            confidence=input_data.confidence,
        )

    # ------------------------------------------------------------------
    # BaseAgent.execute — thin wrapper so the agent fits the registry
    # ------------------------------------------------------------------

    async def execute(
        self,
        input_data: dict[str, Any],
        ctx: AgentContext,
    ) -> AgentResult:
        t0 = self._now_ms()
        persona_input = PersonaInput.model_validate(input_data)
        output = await self.audit(persona_input)
        return AgentResult(
            status="success" if output.guardrail_passed else "failure",
            output=output.model_dump(),
            citations=output.citations,
            confidence=output.confidence,
            tokens_used=0,
            latency_ms=self._now_ms() - t0,
            error=None,
        )
