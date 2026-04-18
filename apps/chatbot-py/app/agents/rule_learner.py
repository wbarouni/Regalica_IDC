"""RuleLearnerAgent — Phase 5.

Extracts candidate BCT rules from PDF circulaires (text snippets).
Proposes structured rules for human 4-eyes validation — never inserts directly.

Guardrails enforced:
- Confidence ≥ 0.95 on critical responses.
- ≥ 1 citation (circulaire reference or rubrique ID).
- ZERO HARDCODING: proposed rules go through the human validation queue.
- Suggest Don't Repair: no automatic insertion into DB.
"""

from __future__ import annotations

import decimal
import json
from typing import Any, Literal

import structlog
from pydantic import BaseModel, ConfigDict, Field

from app.agents.base import AgentContext, AgentResult, BaseAgent
from app.llm.base import LLMClient

decimal.getcontext().prec = 38

logger = structlog.get_logger(__name__)

_SYSTEM_PROMPT = """\
Tu es un expert juriste-quantitatif spécialisé dans les circulaires prudentielles \
de la BCT (Banque Centrale de Tunisie). Ta mission est d'extraire des règles \
de conformité candidates à partir de textes de circulaires fournis.

RÈGLES ABSOLUES :
1. Tu extrais, tu n'inventes pas. Chaque règle proposée doit être directement \
   justifiable par le texte source.
2. Tu ne calcules JAMAIS. Si une règle implique un seuil numérique, \
   tu le recopies tel quel depuis le texte source.
3. Les règles proposées sont soumises à validation humaine (4-yeux). \
   Tu ne les insères pas toi-même en base de données.
4. Chaque règle doit citer l'identifiant de la circulaire et, si possible, \
   l'article ou le paragraphe source.
5. Format de sortie : JSON structuré selon le schéma fourni.
6. Réponse en français.
"""


class RuleLearnerInput(BaseModel):
    """Input for the RuleLearnerAgent."""

    model_config = ConfigDict(frozen=True)

    circulaire_ref: str = Field(description="e.g. 'BCT 2023-07'")
    text_snippets: list[str] = Field(
        min_length=1,
        description="Extracted text chunks from the circulaire PDF",
    )
    annexe_codes: list[str] = Field(
        default_factory=list,
        description="Annexes potentially affected",
    )
    context_snippets: list[str] = Field(
        default_factory=list,
        description="KB chunks for grounding",
    )


class CandidateRule(BaseModel):
    """A single candidate rule extracted from a circulaire."""

    model_config = ConfigDict(frozen=True)

    oper_regle: Literal["=", "<=", ">=", "<", ">", "!="]
    lhs_description: str = Field(description="Natural language description of LHS aggregate")
    rhs_description: str = Field(description="Natural language description of RHS aggregate")
    domaine: str
    annexe_code: str
    rubrique_codes_lhs: list[str] = Field(default_factory=list)
    rubrique_codes_rhs: list[str] = Field(default_factory=list)
    rule_text_fr: str
    source_article: str = Field(description="Article/paragraph reference in the circulaire")
    confidence: float = Field(ge=0.0, le=1.0)


class RuleLearnerOutput(BaseModel):
    """Output of the RuleLearnerAgent."""

    model_config = ConfigDict(frozen=True)

    circulaire_ref: str
    candidate_rules: list[CandidateRule]
    summary_fr: str
    citations: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "circulaire_ref": {"type": "string"},
        "candidate_rules": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "oper_regle": {"type": "string", "enum": ["=", "<=", ">=", "<", ">", "!="]},
                    "lhs_description": {"type": "string"},
                    "rhs_description": {"type": "string"},
                    "domaine": {"type": "string"},
                    "annexe_code": {"type": "string"},
                    "rubrique_codes_lhs": {"type": "array", "items": {"type": "string"}},
                    "rubrique_codes_rhs": {"type": "array", "items": {"type": "string"}},
                    "rule_text_fr": {"type": "string"},
                    "source_article": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                },
                "required": [
                    "oper_regle",
                    "lhs_description",
                    "rhs_description",
                    "domaine",
                    "annexe_code",
                    "rule_text_fr",
                    "source_article",
                    "confidence",
                ],
            },
        },
        "summary_fr": {"type": "string"},
        "citations": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
    "required": [
        "circulaire_ref",
        "candidate_rules",
        "summary_fr",
        "citations",
        "confidence",
    ],
}


class RuleLearnerAgent(BaseAgent):
    """Extracts candidate BCT rules from circulaire text for 4-eyes validation."""

    agent_id = "rule_learner"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    async def execute(
        self,
        input_data: dict[str, Any],
        ctx: AgentContext,
    ) -> AgentResult:
        t0 = self._now_ms()
        log = logger.bind(agent=self.agent_id, tenant_id=ctx.tenant_id)

        rl_input = RuleLearnerInput.model_validate(input_data)
        user_prompt = _build_user_prompt(rl_input)

        log.info("rule_learner.start", circulaire_ref=rl_input.circulaire_ref)

        try:
            resp = await self._llm.generate(
                system=_SYSTEM_PROMPT,
                user=user_prompt,
                json_schema=_OUTPUT_SCHEMA,
                max_tokens=3000,
            )
        except Exception as exc:
            log.error("rule_learner.llm_error", error=str(exc))
            return AgentResult(
                status="failure",
                output={},
                citations=[],
                confidence=0.0,
                tokens_used=0,
                latency_ms=self._now_ms() - t0,
                error=str(exc),
            )

        try:
            self._validate_response(resp, critical=True)
        except ValueError as exc:
            log.warning("rule_learner.guardrail_fail", reason=str(exc))
            return AgentResult(
                status="failure",
                output={"guardrail_error": str(exc)},
                citations=resp.citations,
                confidence=resp.confidence,
                tokens_used=resp.tokens_used,
                latency_ms=self._now_ms() - t0,
                error=str(exc),
            )

        try:
            parsed = json.loads(resp.text)
            rl_output = RuleLearnerOutput.model_validate(parsed)
        except Exception as exc:
            log.error("rule_learner.parse_error", error=str(exc), raw=resp.text[:500])
            return AgentResult(
                status="failure",
                output={"parse_error": str(exc), "raw": resp.text},
                citations=resp.citations,
                confidence=resp.confidence,
                tokens_used=resp.tokens_used,
                latency_ms=self._now_ms() - t0,
                error=str(exc),
            )

        log.info(
            "rule_learner.done",
            circulaire_ref=rl_output.circulaire_ref,
            candidates=len(rl_output.candidate_rules),
            confidence=rl_output.confidence,
        )

        return AgentResult(
            status="success",
            output=rl_output.model_dump(),
            citations=rl_output.citations,
            confidence=rl_output.confidence,
            tokens_used=resp.tokens_used,
            latency_ms=self._now_ms() - t0,
        )


def _build_user_prompt(inp: RuleLearnerInput) -> str:
    snippets_block = "\n\n---\n\n".join(
        f"### Extrait {i + 1}\n{s}" for i, s in enumerate(inp.text_snippets)
    )
    annexes_block = ", ".join(inp.annexe_codes) or "(non spécifié)"
    kb_block = "\n---\n".join(inp.context_snippets) or "(aucun)"

    return f"""\
## Circulaire : {inp.circulaire_ref}
## Annexes concernées : {annexes_block}

## Extraits de texte de la circulaire

{snippets_block}

## Extraits KB pour ancrage contextuel

{kb_block}

## Mission

Identifie toutes les règles de conformité qui peuvent être formalisées à partir \
de ces extraits. Pour chaque règle, précise l'opérateur (=, <=, >=, <, >, !=), \
les rubriques LHS/RHS si identifiables, le domaine et l'article source. \
Ces règles sont des PROPOSITIONS soumises à validation humaine, \
jamais insérées automatiquement en base.
"""
