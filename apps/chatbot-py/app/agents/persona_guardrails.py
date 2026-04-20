"""Guardrail checks and servile-phrase stripping for the PersonaRegalicaAgent.

§5.4 of the master prompt v1.2.
"""

from __future__ import annotations

import re

SERVILE_PHRASES: list[str] = [
    "absolument",
    "excellente question",
    "bien sûr",
    "certainement",
    "je suis désolé",
    "avec plaisir",
]

_EMOJI_RE = re.compile(r"[\U00010000-\U0010ffff]", flags=re.UNICODE)


def check_guardrails(
    response: str,
    citations: list[str],
    confidence: float,
) -> list[str]:
    """Return a list of violated guardrail codes (empty = all clear).

    Hard blockers (cause guardrail_passed=False):
    - NO_CITATIONS
    - LOW_CONFIDENCE:<value>

    Soft violations (logged as warnings, non-blocking):
    - SERVILE_PHRASE:<phrase>
    - EMOJI_IN_RESPONSE
    """
    violations: list[str] = []

    # Pilier 3: citations mandatory
    if not citations:
        violations.append("NO_CITATIONS")

    # §5.4: no servile phrases
    resp_lower = response.lower()
    for phrase in SERVILE_PHRASES:
        if phrase in resp_lower:
            violations.append(f"SERVILE_PHRASE:{phrase}")

    # §5.4: no emoji (except allowed gauges)
    if _EMOJI_RE.search(response):
        violations.append("EMOJI_IN_RESPONSE")

    # Confidence gate
    if confidence < 0.95:
        violations.append(f"LOW_CONFIDENCE:{confidence:.2f}")

    return violations


def strip_servile_phrases(text: str) -> str:
    """Remove servile phrases from *text*, collapsing leftover whitespace."""
    cleaned = text
    for phrase in SERVILE_PHRASES:
        cleaned = re.sub(rf"\b{re.escape(phrase)}\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()
