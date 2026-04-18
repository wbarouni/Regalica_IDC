"""InvestigatorAgent — Phase 3 PRIORITY agent.

Receives a FAIL verdict context and performs root-cause analysis.
Outputs an explanation in French with citations and a correction suggestion.

Guardrails enforced:
- Confidence ≥ 0.95 (critical path).
- ≥ 1 citation from KB chunks.
- LLM NEVER calculates — all numeric values are pre-computed by the evaluator.
- "Suggest Don't Repair" — no XML mutation, only suggestions.
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
Tu es un expert en conformité réglementaire BCT (Banque Centrale de Tunisie), \
spécialisé dans l'analyse des déclarations financières et des circulaires prudentielles.

RÔLE : Analyser un verdict FAIL produit par le moteur d'évaluation RDG et fournir \
une explication détaillée à l'officier de conformité.

RÈGLES ABSOLUES :
1. Tu ne calcules JAMAIS. Tous les montants (lhs, rhs, gap) sont pré-calculés \
   par le moteur d'évaluation et fournis dans le contexte. Tu ne fais que les interpréter.
2. Ta réponse doit être entièrement en français.
3. Tu dois citer au moins un identifiant de rubrique ou de règle fourni dans le contexte \
   (format : "rubrique_id" ou "regle_id").
4. Principe "Suggère sans Réparer" : tu identifies ce qui doit être corrigé et \
   COMMENT le corriger, mais tu n'affirmes JAMAIS avoir corrigé quoi que ce soit. \
   L'officier de conformité effectue lui-même la correction dans son XML.
5. Tout verdict FAIL sur les piliers prudentiels est de sévérité SEVERE. \
   Ne minimise pas la gravité.
6. Fonde ton analyse uniquement sur le contexte fourni. N'invente aucun fait.

FORMAT DE SORTIE : JSON structuré selon le schéma fourni.
"""


class InvestigatorInput(BaseModel):
    """Input schema for the InvestigatorAgent."""

    model_config = ConfigDict(frozen=True)

    rule_id: str
    annexe_code: str
    num_regle: int
    oper_regle: str
    domaine: str
    lhs: str = Field(description="Decimal string — pre-computed by evaluator")
    rhs: str = Field(description="Decimal string — pre-computed by evaluator")
    gap: str = Field(description="Signed decimal string — pre-computed by evaluator")
    rubrique_codes: list[str]
    rule_text: str | None = None
    context_snippets: list[str] = Field(
        description="KB chunks for grounding — at least one required"
    )


class InvestigatorOutput(BaseModel):
    """Output schema for the InvestigatorAgent."""

    model_config = ConfigDict(frozen=True)

    explanation_fr: str
    root_cause: str
    affected_rubriques: list[str]
    suggestion: str
    severity: Literal["SEVERE"]
    citations: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "explanation_fr": {"type": "string"},
        "root_cause": {"type": "string"},
        "affected_rubriques": {"type": "array", "items": {"type": "string"}},
        "suggestion": {"type": "string"},
        "severity": {"type": "string", "enum": ["SEVERE"]},
        "citations": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
    "required": [
        "explanation_fr",
        "root_cause",
        "affected_rubriques",
        "suggestion",
        "severity",
        "citations",
        "confidence",
    ],
}


class InvestigatorAgent(BaseAgent):
    """Analyses a FAIL verdict and proposes a correction path (Suggest Don't Repair)."""

    agent_id = "investigator"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    async def execute(
        self,
        input_data: dict[str, Any],
        ctx: AgentContext,
    ) -> AgentResult:
        t0 = self._now_ms()
        log = logger.bind(
            agent=self.agent_id,
            tenant_id=ctx.tenant_id,
            run_id=ctx.run_id,
        )

        inv_input = InvestigatorInput.model_validate(input_data)

        user_prompt = _build_user_prompt(inv_input)

        log.info("investigator.start", rule_id=inv_input.rule_id)

        try:
            resp = await self._llm.generate(
                system=_SYSTEM_PROMPT,
                user=user_prompt,
                json_schema=_OUTPUT_SCHEMA,
                max_tokens=2000,
            )
        except Exception as exc:
            log.error("investigator.llm_error", error=str(exc))
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
            log.warning("investigator.guardrail_fail", reason=str(exc))
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
            inv_output = InvestigatorOutput.model_validate(parsed)
        except Exception as exc:
            log.error("investigator.parse_error", error=str(exc), raw=resp.text[:500])
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
            "investigator.done",
            rule_id=inv_input.rule_id,
            confidence=inv_output.confidence,
            citations=inv_output.citations,
        )

        return AgentResult(
            status="success",
            output=inv_output.model_dump(),
            citations=inv_output.citations,
            confidence=inv_output.confidence,
            tokens_used=resp.tokens_used,
            latency_ms=self._now_ms() - t0,
        )


def _build_user_prompt(inv: InvestigatorInput) -> str:
    """Build the grounded user prompt — no calculations, only context assembly."""
    snippets_block = "\n---\n".join(inv.context_snippets) if inv.context_snippets else "(aucun)"
    rule_text_block = inv.rule_text or "(non renseigné)"
    rubriques_list = ", ".join(inv.rubrique_codes)

    return f"""\
## Contexte du verdict FAIL

- **ID règle** : {inv.rule_id}
- **Annexe** : {inv.annexe_code}
- **Numéro de règle** : {inv.num_regle}
- **Opérateur** : {inv.oper_regle}
- **Domaine** : {inv.domaine}
- **Texte de la règle** : {rule_text_block}
- **Rubriques impliquées** : {rubriques_list}

## Valeurs pré-calculées par le moteur d'évaluation (ne pas recalculer)

- **LHS** (valeur déclarée) : {inv.lhs}
- **RHS** (valeur attendue / référence) : {inv.rhs}
- **Écart (gap)** : {inv.gap}

## Extraits de la base de connaissances (KB) pour étayage

{snippets_block}

## Mission

Analyse ce verdict FAIL et produis le JSON de sortie demandé. \
Cite au moins un identifiant de rubrique ou de règle. \
Suggère la correction sans prétendre l'avoir appliquée. \
Réponds entièrement en français.
"""
