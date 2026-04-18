"""ReporterAgent — Phase 3.

Generates a 10-section world-class compliance report from a ValidationRunSummary.
The LLM provides narrative prose; all numbers are pre-computed and passed in.
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
Tu es un rédacteur expert en conformité réglementaire BCT (Banque Centrale de Tunisie). \
Tu rédiges des rapports de validation prudentielle de niveau institutionnel.

RÈGLES ABSOLUES :
1. Tu ne calcules JAMAIS. Tous les chiffres sont fournis dans le contexte.
2. Tes réponses narratives sont en français, clair et professionnel.
3. Chaque section doit citer au moins un identifiant (rubrique, règle, annexe) du contexte.
4. Format de sortie : JSON structuré selon le schéma fourni.
5. Les 10 sections sont obligatoires. Aucune ne peut être vide.
"""


class FailDetail(BaseModel):
    """Summary of a single FAIL verdict."""

    model_config = ConfigDict(frozen=True)

    rule_id: str
    annexe_code: str
    gap: str
    explanation_fr: str | None = None
    rubriques: list[str] = Field(default_factory=list)


class SkipDetail(BaseModel):
    """Summary of a single SKIP verdict."""

    model_config = ConfigDict(frozen=True)

    rule_id: str
    annexe_code: str
    reason: str


class ValidationRunSummary(BaseModel):
    """Input DTO aggregating a full validation run for the ReporterAgent."""

    model_config = ConfigDict(frozen=True)

    run_id: str
    tenant_id: str
    bank_name: str
    report_date: str
    annexes_analyzed: list[str]

    total_rules: int
    pass_count: int
    fail_count: int
    skip_count: int

    global_score: str = Field(description="Decimal 0–100, pre-computed")
    risk_level: Literal["FAIBLE", "MODERE", "ELEVE", "CRITIQUE"]

    fail_details: list[FailDetail] = Field(default_factory=list)
    skip_details: list[SkipDetail] = Field(default_factory=list)

    historical_scores: list[dict[str, str]] = Field(
        default_factory=list,
        description="[{date, score}] sorted ascending — empty if no history",
    )
    kb_citations: list[str] = Field(
        default_factory=list,
        description="KB chunk IDs used for grounding",
    )


class ReportSection(BaseModel):
    """One section of the 10-section report."""

    model_config = ConfigDict(frozen=True)

    section_number: int
    title: str
    content: str
    citations: list[str] = Field(default_factory=list)


class ReporterOutput(BaseModel):
    """Full 10-section compliance report."""

    model_config = ConfigDict(frozen=True)

    run_id: str
    sections: list[ReportSection] = Field(min_length=10, max_length=10)
    citations: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "run_id": {"type": "string"},
        "sections": {
            "type": "array",
            "minItems": 10,
            "maxItems": 10,
            "items": {
                "type": "object",
                "properties": {
                    "section_number": {"type": "integer", "minimum": 1, "maximum": 10},
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "citations": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["section_number", "title", "content", "citations"],
            },
        },
        "citations": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
    "required": ["run_id", "sections", "citations", "confidence"],
}

_SECTION_TITLES = [
    "Résumé Exécutif",
    "Métadonnées du Run",
    "Synthèse des Résultats de Validation",
    "Détail des Verdicts FAIL",
    "Analyse des Verdicts SKIP",
    "Heatmap Inter-Annexes",
    "Évaluation des Risques",
    "Comparaison Historique",
    "Recommandations",
    "Annexe — Règles Appliquées",
]


class ReporterAgent(BaseAgent):
    """Generates the 10-section compliance report for a validation run."""

    agent_id = "reporter"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    async def execute(
        self,
        input_data: dict[str, Any],
        ctx: AgentContext,
    ) -> AgentResult:
        t0 = self._now_ms()
        log = logger.bind(agent=self.agent_id, tenant_id=ctx.tenant_id, run_id=ctx.run_id)

        summary = ValidationRunSummary.model_validate(input_data)
        user_prompt = _build_user_prompt(summary)

        log.info("reporter.start", run_id=summary.run_id)

        try:
            resp = await self._llm.generate(
                system=_SYSTEM_PROMPT,
                user=user_prompt,
                json_schema=_OUTPUT_SCHEMA,
                max_tokens=4000,
            )
        except Exception as exc:
            log.error("reporter.llm_error", error=str(exc))
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
            log.warning("reporter.guardrail_fail", reason=str(exc))
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
            reporter_output = ReporterOutput.model_validate(parsed)
        except Exception as exc:
            log.error("reporter.parse_error", error=str(exc), raw=resp.text[:500])
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
            "reporter.done",
            run_id=summary.run_id,
            confidence=reporter_output.confidence,
        )

        return AgentResult(
            status="success",
            output=reporter_output.model_dump(),
            citations=reporter_output.citations,
            confidence=reporter_output.confidence,
            tokens_used=resp.tokens_used,
            latency_ms=self._now_ms() - t0,
        )


def _build_user_prompt(s: ValidationRunSummary) -> str:
    """Assemble grounded prompt — numbers copied verbatim, never re-computed."""

    def fmt_fails(fails: list[FailDetail]) -> str:
        if not fails:
            return "(aucun verdict FAIL)"
        return "\n".join(
            f"- Règle {f.rule_id} | Annexe {f.annexe_code} | Écart : {f.gap} | "
            f"Rubriques : {', '.join(f.rubriques) or 'N/A'}\n  "
            f"{f.explanation_fr or 'Analyse non disponible'}"
            for f in fails
        )

    def fmt_skips(skips: list[SkipDetail]) -> str:
        if not skips:
            return "(aucun verdict SKIP)"
        return "\n".join(
            f"- Règle {sk.rule_id} | Annexe {sk.annexe_code} | Raison : {sk.reason}"
            for sk in skips
        )

    def fmt_history(history: list[dict[str, str]]) -> str:
        if not history:
            return "(aucun historique disponible)"
        return "\n".join(f"- {h.get('date', '?')} : {h.get('score', '?')}/100" for h in history)

    kb_block = ", ".join(s.kb_citations) if s.kb_citations else "(aucun)"
    sections_list = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(_SECTION_TITLES))

    return (
        f"## Contexte du Run de Validation\n\n"
        f"- **Run ID** : {s.run_id}\n"
        f"- **Banque** : {s.bank_name}\n"
        f"- **Date** : {s.report_date}\n"
        f"- **Annexes analysées** : {', '.join(s.annexes_analyzed)}\n\n"
        f"## Métriques pré-calculées (ne pas recalculer)\n\n"
        f"- Règles totales : {s.total_rules}\n"
        f"- PASS : {s.pass_count} | FAIL : {s.fail_count} | SKIP : {s.skip_count}\n"
        f"- Score global : {s.global_score} / 100\n"
        f"- Niveau de risque : {s.risk_level}\n\n"
        f"## Verdicts FAIL\n\n{fmt_fails(s.fail_details)}\n\n"
        f"## Verdicts SKIP\n\n{fmt_skips(s.skip_details)}\n\n"
        f"## Historique\n\n{fmt_history(s.historical_scores)}\n\n"
        f"## Citations KB\n\n{kb_block}\n\n"
        f"## Mission\n\n"
        f"Rédige le rapport en 10 sections JSON. Sections obligatoires :\n{sections_list}\n\n"
        f"Cite les identifiants pertinents. Recopie les chiffres tels quels."
    )
