"""Persona audit endpoint — POST /persona/audit.

Every AI response passes through this endpoint before being displayed.
The PersonaRegalicaAgent enforces Regalica's voice (master prompt v1.2 §5.3-§5.6):
- 7 adaptive response formats
- Guardrails §5.4 (citations, confidence, no servile phrases, no emoji)
- Non-blocking format enforcement with warnings logged

HTTP behaviour:
- 200 on success (guardrail_passed may still be False — caller inspects it)
- 422 when NO_CITATIONS hard-blocker fires (HTTPException with violation list)
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status

from app.agents.persona_regalica import PersonaInput, PersonaOutput, PersonaRegalicaAgent
from app.llm.ollama import OllamaClient  # lightweight stub — persona agent makes no LLM calls
from app.config import settings

logger = structlog.get_logger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Dependency: persona agent singleton per request
# ---------------------------------------------------------------------------

# PersonaRegalicaAgent inherits BaseAgent which requires an LLMClient.
# The persona agent never calls the LLM, so we pass a no-op Ollama stub.
# This avoids API key requirements for a deterministic audit pass.
def _get_persona_agent() -> PersonaRegalicaAgent:
    stub_llm = OllamaClient(base_url=settings.ollama_url, model=settings.ollama_model)
    return PersonaRegalicaAgent(llm=stub_llm)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/audit",
    response_model=PersonaOutput,
    summary="Audit an AI response through Regalica persona guardrails",
    responses={
        200: {"description": "Audit complete — inspect guardrail_passed for soft failures"},
        422: {"description": "Hard guardrail violation — response must not be displayed"},
    },
)
async def audit_persona(body: PersonaInput) -> PersonaOutput:
    """Run the persona audit pipeline on a raw AI response.

    Returns 422 (Unprocessable Entity) when the NO_CITATIONS hard blocker fires,
    because displaying uncited responses violates Pilier 3 (ZERO HALLUCINATION).
    All other violations are returned in ``guardrail_violations`` with HTTP 200.
    """
    log = logger.bind(
        tenant_id=body.tenant_id,
        session_id=body.session_id,
        source_agent=body.agent_id,
    )

    log.info("persona.route.audit", confidence=body.confidence)

    agent = _get_persona_agent()
    result = await agent.audit(body)

    # Hard block: uncited responses must never reach the user
    if not result.guardrail_passed and "NO_CITATIONS" in result.guardrail_violations:
        log.warning(
            "persona.route.blocked",
            reason="NO_CITATIONS",
            violations=result.guardrail_violations,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "GUARDRAIL_HARD_BLOCK",
                "violations": result.guardrail_violations,
                "message": (
                    "La réponse IA ne contient aucune citation vérifiable. "
                    "Affichage bloqué (Pilier 3 — ZERO HALLUCINATION)."
                ),
            },
        )

    log.info(
        "persona.route.ok",
        guardrail_passed=result.guardrail_passed,
        format_type=result.format_type,
        violation_count=len(result.guardrail_violations),
    )

    return result
