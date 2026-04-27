"""IngestorXMLAgent — deterministic XML header parser.

Phase 3 minimal scope: extract the `<Entete>` metadata
(`CodeAnnexe`, `DateAnnexe`, `CodeBanque`) and a coarse
`rubriques_count`. The rich dual-nomenclature parsing already
lives in the TS package `@regflow/bct-xml-parser` (Livrable 4) and
is invoked by the engine; this agent provides a Python-side view
for the chatbot's pre-validation pipeline.

Zero LLM, zero DB. Pure CPU XML walk via `xml.etree.ElementTree`.
External-entity resolution is disabled by stdlib defaults — the
parser does not fetch network URIs and ignores DTD declarations.

`DateAnnexe` may appear as `YYYYMMDD` (BCT convention) or
`YYYY-MM-DD` (ISO); both are normalised to ISO `YYYY-MM-DD` in
the output.
"""

from __future__ import annotations

import time
import xml.etree.ElementTree as ET
from typing import Any

from app.agents.base import AgentResult


class IngestorXMLAgent:
    """Parse the BCT XML envelope and surface header metadata."""

    name: str = "t0_ingestor_xml"

    async def ingest(self, xml_content: str) -> AgentResult:
        """Return an AgentResult describing the parsed header."""
        start = time.monotonic()
        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as exc:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"XML parse error: {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        entete = root.find(".//Entete")
        if entete is None:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error="missing <Entete> element",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        code_banque = _text_or_none(entete.find("CodeBanque"))
        code_annexe = _text_or_none(entete.find("CodeAnnexe"))
        date_annexe_raw = _text_or_none(entete.find("DateAnnexe"))
        date_annexe = _normalise_iso_date(date_annexe_raw)

        rubriques_count = sum(1 for _ in root.iter("Rubrique"))

        output: dict[str, Any] = {
            "code_banque": code_banque,
            "code_annexe": code_annexe,
            "date_annexe": date_annexe,
            "rubriques_count": rubriques_count,
        }
        return AgentResult(
            agent_name=self.name,
            success=True,
            output=output,
            latency_ms=int((time.monotonic() - start) * 1000),
        )


def _text_or_none(element: ET.Element | None) -> str | None:
    """Return stripped text content, or None when the element is missing."""
    if element is None or element.text is None:
        return None
    stripped = element.text.strip()
    return stripped if stripped else None


def _normalise_iso_date(raw: str | None) -> str | None:
    """Convert BCT `YYYYMMDD` or ISO `YYYY-MM-DD` to ISO. Returns None on failure."""
    if raw is None:
        return None
    candidate = raw.strip()
    # ISO already.
    if len(candidate) == 10 and candidate[4] == "-" and candidate[7] == "-":
        try:
            year_part = int(candidate[0:4])
            month_part = int(candidate[5:7])
            day_part = int(candidate[8:10])
        except ValueError:
            return None
        if _is_valid_calendar_date(year_part, month_part, day_part):
            return candidate
        return None
    # BCT compact.
    if len(candidate) == 8 and candidate.isdigit():
        year_part = int(candidate[0:4])
        month_part = int(candidate[4:6])
        day_part = int(candidate[6:8])
        if _is_valid_calendar_date(year_part, month_part, day_part):
            return f"{year_part:04d}-{month_part:02d}-{day_part:02d}"
        return None
    return None


def _is_valid_calendar_date(year: int, month: int, day: int) -> bool:
    """Return True when (year, month, day) is a valid calendar date."""
    from datetime import date

    try:
        date(year, month, day)
    except ValueError:
        return False
    return True
