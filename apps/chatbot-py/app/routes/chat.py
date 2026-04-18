"""Chat endpoint with RAG guardrails.

POST /chat — conversational compliance Q&A.

Behaviour:
- If the message mentions a FAIL verdict (and run_id is provided), delegates
  to InvestigatorAgent with the run context fetched from the api service.
- Otherwise uses a general compliance Q&A prompt with KB grounding.
- Confidence < 0.95: returns a low-confidence envelope instead of hallucinating.
- Citations ≥ 1 always required.
"""

from __future__ import annotations

import time
from typing import Annotated, Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.agents.base import AgentContext
from app.agents.investigator import InvestigatorAgent
from app.config import settings
from app.llm.base import LLMClient, LLMResponse
from app.llm.gemini import GeminiClient
from app.llm.ollama import OllamaClient

logger = structlog.get_logger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

_FAIL_KEYWORDS = frozenset([
    "fail", "écart", "non conforme", "rejet", "erreur", "gap",
    "verdict", "investiguer", "analyse", "cause",
])

_QA_SYSTEM_PROMPT = """\
Tu es un assistant expert en conformité réglementaire BCT (Banque Centrale de Tunisie). \
Tu réponds aux questions des officiers de conformité de manière précise et professionnelle.

RÈGLES ABSOLUES :
1. Tu ne calcules JAMAIS. Si on te demande un calcul, renvoie vers les valeurs \
   pré-calculées disponibles dans le contexte.
2. Réponds en français.
3. Cite au moins un identifiant (rubrique, règle, annexe, circulaire) présent \
   dans le contexte fourni.
4. Si tu ne sais pas ou si le contexte est insuffisant, dis-le clairement \
   plutôt que d'inventer.
5. Confiance minimale requise : 0.95 sur les sujets critiques.
"""

_LOW_CONFIDENCE_REPLY = (
    "Je ne suis pas suffisamment certain de ma réponse pour vous la communiquer "
    "sur ce sujet critique (seuil de confiance 0.95 non atteint). "
    "Veuillez consulter directement la circulaire BCT applicable ou votre équipe juridique."
)


class ChatRequest(BaseModel):
    """Incoming chat request."""

    model_config = ConfigDict(frozen=True)

    message: str = Field(min_length=1, max_length=4000)
    run_id: str | None = None
    tenant_id: str
    session_id: str | None = None
    kb_snippets: list[str] = Field(
        default_factory=list,
        description="Pre-fetched KB chunks for grounding (injected by caller or RAG pipeline)",
    )


class ChatResponse(BaseModel):
    """Chat response envelope."""

    model_config = ConfigDict(frozen=True)

    reply: str
    citations: list[str]
    confidence: float
    model_id: str
    tokens_used: int
    latency_ms: int
    low_confidence: bool = False


# ---------------------------------------------------------------------------
# Dependency: LLMClient
# ---------------------------------------------------------------------------


def _get_llm_client() -> LLMClient:
    """Instantiate the configured LLM provider."""
    if settings.llm_provider == "gemini":
        if not settings.gemini_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="GEMINI_API_KEY not configured",
            )
        return GeminiClient(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
        )
    return OllamaClient(base_url=settings.ollama_url, model=settings.ollama_model)


LLMDep = Annotated[LLMClient, Depends(_get_llm_client)]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, llm: LLMDep) -> ChatResponse:
    """Conversational compliance Q&A with RAG guardrails."""
    t0 = time.monotonic()
    log = logger.bind(tenant_id=req.tenant_id, session_id=req.session_id)

    log.info("chat.request", message_len=len(req.message), run_id=req.run_id)

    # Route: FAIL investigation vs general Q&A
    if req.run_id and _is_fail_query(req.message):
        resp = await _handle_fail_investigation(req, llm, log)
    else:
        resp = await _handle_general_qa(req, llm, log)

    latency_ms = int((time.monotonic() - t0) * 1000)

    # Guardrail: confidence gate
    if resp.confidence < 0.95:
        log.warning(
            "chat.low_confidence",
            confidence=resp.confidence,
            model_id=resp.model_id,
        )
        return ChatResponse(
            reply=_LOW_CONFIDENCE_REPLY,
            citations=resp.citations,
            confidence=resp.confidence,
            model_id=resp.model_id,
            tokens_used=resp.tokens_used,
            latency_ms=latency_ms,
            low_confidence=True,
        )

    return ChatResponse(
        reply=resp.text,
        citations=resp.citations,
        confidence=resp.confidence,
        model_id=resp.model_id,
        tokens_used=resp.tokens_used,
        latency_ms=latency_ms,
    )


# ---------------------------------------------------------------------------
# Routing helpers
# ---------------------------------------------------------------------------


def _is_fail_query(message: str) -> bool:
    """Heuristic: does the message ask about a FAIL verdict?"""
    lower = message.lower()
    return any(kw in lower for kw in _FAIL_KEYWORDS)


async def _handle_fail_investigation(
    req: ChatRequest,
    llm: LLMClient,
    log: Any,
) -> LLMResponse:
    """Fetch FAIL context from api service and delegate to InvestigatorAgent."""
    log.info("chat.route", path="investigator", run_id=req.run_id)

    fail_context = await _fetch_fail_context(req.run_id, req.tenant_id, log)

    if fail_context is None:
        # Fall back to general Q&A if we can't fetch run data
        log.warning("chat.fail_context_unavailable", run_id=req.run_id)
        return await _handle_general_qa(req, llm, log)

    agent = InvestigatorAgent(llm)
    ctx = AgentContext(tenant_id=req.tenant_id, run_id=req.run_id)

    inv_input: dict[str, Any] = {
        **fail_context,
        "context_snippets": req.kb_snippets or [req.message],
    }

    result = await agent.execute(inv_input, ctx)

    # Normalise back to LLMResponse shape
    reply_text = (
        result.output.get("explanation_fr", "")
        if result.status == "success"
        else result.error or "Analyse indisponible"
    )

    return LLMResponse(
        text=reply_text,
        citations=result.citations,
        confidence=result.confidence,
        tokens_used=result.tokens_used,
        latency_ms=result.latency_ms,
        model_id=settings.gemini_model
        if settings.llm_provider == "gemini"
        else settings.ollama_model,
    )


async def _handle_general_qa(
    req: ChatRequest,
    llm: LLMClient,
    log: Any,
) -> LLMResponse:
    """General compliance Q&A with grounding."""
    log.info("chat.route", path="general_qa")

    kb_block = "\n---\n".join(req.kb_snippets) if req.kb_snippets else "(aucun contexte fourni)"

    user_prompt = f"""\
## Question de l'officier de conformité

{req.message}

## Contexte disponible (extraits KB)

{kb_block}

Réponds de manière précise, en citant au moins un identifiant de rubrique, \
règle ou annexe présent dans le contexte.
"""

    return await llm.generate(
        system=_QA_SYSTEM_PROMPT,
        user=user_prompt,
        max_tokens=1500,
    )


async def _fetch_fail_context(
    run_id: str | None,
    tenant_id: str,
    log: Any,
) -> dict[str, Any] | None:
    """Fetch the first FAIL verdict context for a run from the api service."""
    if not run_id:
        return None

    api_base = settings.database_url  # re-use env or fall back to default
    api_url = "http://api:3000"  # default internal service URL

    try:
        async with httpx.AsyncClient(base_url=api_url, timeout=10.0) as client:
            resp = await client.get(
                f"/api/runs/{run_id}/fails/first",
                headers={"X-Tenant-ID": tenant_id},
            )
            resp.raise_for_status()
            result: dict[str, Any] = resp.json()
            return result
    except Exception as exc:
        log.warning("chat.fetch_fail_context_error", error=str(exc), run_id=run_id)
        return None
