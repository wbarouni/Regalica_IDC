"""SchemaInferencerAgent — Phase 1.

Given one or more XML samples, infers missing or drifted XSD schema elements.
The LLM generates an XSD structure proposal for human review.

Guardrails enforced:
- Confidence ≥ 0.95 (critical path).
- ≥ 1 citation (rubrique code or annexe ID from context).
- Output is a PROPOSAL — never applied automatically (Suggest Don't Repair).
"""

from __future__ import annotations

import decimal
import json
from typing import Any

import structlog
from pydantic import BaseModel, ConfigDict, Field

from app.agents.base import AgentContext, AgentResult, BaseAgent
from app.llm.base import LLMClient

decimal.getcontext().prec = 38

logger = structlog.get_logger(__name__)

_SYSTEM_PROMPT = """\
Tu es un expert XML/XSD spécialisé dans les déclarations prudentielles BCT \
(Banque Centrale de Tunisie). Ta mission est d'inférer les éléments XSD manquants \
ou mal définis à partir d'échantillons XML fournis.

RÈGLES ABSOLUES :
1. Tu proposes un schéma XSD — tu ne l'appliques jamais toi-même.
2. Chaque proposition doit citer l'identifiant d'annexe ou de rubrique source.
3. Si un type de données est ambigu (montant vs identifiant), indique-le explicitement.
4. Format de sortie : JSON structuré selon le schéma fourni.
5. Réponds en français pour les explications, XSD en anglais technique.
"""


class SchemaInferencerInput(BaseModel):
    """Input for the SchemaInferencerAgent."""

    model_config = ConfigDict(frozen=True)

    annexe_code: str
    xml_samples: list[str] = Field(
        min_length=1,
        description="Raw XML sample strings — at least one required",
    )
    known_rubriques: list[str] = Field(
        default_factory=list,
        description="Rubrique codes already defined in the DB for grounding",
    )
    context_snippets: list[str] = Field(
        default_factory=list,
        description="KB chunks for grounding",
    )


class XsdElementProposal(BaseModel):
    """A single proposed XSD element."""

    model_config = ConfigDict(frozen=True)

    element_name: str
    xsd_type: str
    min_occurs: int = 0
    max_occurs: str = "1"
    annotation_fr: str
    inferred_from_sample: int = Field(description="0-based index into xml_samples")


class SchemaInferencerOutput(BaseModel):
    """Output of the SchemaInferencerAgent."""

    model_config = ConfigDict(frozen=True)

    annexe_code: str
    proposed_elements: list[XsdElementProposal]
    drift_summary_fr: str
    citations: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "annexe_code": {"type": "string"},
        "proposed_elements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "element_name": {"type": "string"},
                    "xsd_type": {"type": "string"},
                    "min_occurs": {"type": "integer"},
                    "max_occurs": {"type": "string"},
                    "annotation_fr": {"type": "string"},
                    "inferred_from_sample": {"type": "integer"},
                },
                "required": [
                    "element_name",
                    "xsd_type",
                    "min_occurs",
                    "max_occurs",
                    "annotation_fr",
                    "inferred_from_sample",
                ],
            },
        },
        "drift_summary_fr": {"type": "string"},
        "citations": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
    "required": [
        "annexe_code",
        "proposed_elements",
        "drift_summary_fr",
        "citations",
        "confidence",
    ],
}


class SchemaInferencerAgent(BaseAgent):
    """Infers missing XSD schema elements from XML samples."""

    agent_id = "schema_inferencer"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    async def execute(
        self,
        input_data: dict[str, Any],
        ctx: AgentContext,
    ) -> AgentResult:
        t0 = self._now_ms()
        log = logger.bind(agent=self.agent_id, tenant_id=ctx.tenant_id)

        si_input = SchemaInferencerInput.model_validate(input_data)
        user_prompt = _build_user_prompt(si_input)

        log.info("schema_inferencer.start", annexe_code=si_input.annexe_code)

        try:
            resp = await self._llm.generate(
                system=_SYSTEM_PROMPT,
                user=user_prompt,
                json_schema=_OUTPUT_SCHEMA,
                max_tokens=3000,
            )
        except Exception as exc:
            log.error("schema_inferencer.llm_error", error=str(exc))
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
            log.warning("schema_inferencer.guardrail_fail", reason=str(exc))
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
            si_output = SchemaInferencerOutput.model_validate(parsed)
        except Exception as exc:
            log.error("schema_inferencer.parse_error", error=str(exc), raw=resp.text[:500])
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
            "schema_inferencer.done",
            annexe_code=si_output.annexe_code,
            proposals=len(si_output.proposed_elements),
        )

        return AgentResult(
            status="success",
            output=si_output.model_dump(),
            citations=si_output.citations,
            confidence=si_output.confidence,
            tokens_used=resp.tokens_used,
            latency_ms=self._now_ms() - t0,
        )


def _build_user_prompt(inp: SchemaInferencerInput) -> str:
    samples_block = "\n\n".join(
        f"### Échantillon {i}\n```xml\n{s}\n```" for i, s in enumerate(inp.xml_samples)
    )
    known_block = ", ".join(inp.known_rubriques) or "(aucune)"
    kb_block = "\n---\n".join(inp.context_snippets) or "(aucun)"

    return f"""\
## Annexe : {inp.annexe_code}

## Rubriques déjà définies en base
{known_block}

## Échantillons XML à analyser
{samples_block}

## Extraits KB
{kb_block}

## Mission
Identifie les éléments XML présents dans les échantillons mais absents ou mal typés \
dans le schéma XSD actuel. Pour chaque élément manquant ou divergent, propose un \
élément XSD avec annotation en français. Cite l'identifiant d'annexe ou de rubrique source.
"""
