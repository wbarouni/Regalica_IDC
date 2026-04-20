"""Format detection and enforcement for the PersonaRegalicaAgent.

Implements the 7 adaptive response formats from master prompt v1.2 §5.3.
All enforcement is NON-BLOCKING: mismatches produce FORMAT_WARNING entries
rather than blocking the response.
"""

from __future__ import annotations

import re

_BCT_RULE_RE = re.compile(r"\d{2,3}/\d{1,4}")


# ---------------------------------------------------------------------------
# Format detection (§5.3)
# ---------------------------------------------------------------------------


def detect_format_type(question: str) -> str:
    """Select one of the 7 adaptive formats based on the user question text."""
    q = question.lower()

    if any(w in q for w in ["vs", "différence", "compare", "comparer"]):
        return "comparative"
    if any(w in q for w in ["liste", "quels sont", "combien", "énumérer"]):
        return "enumerative"
    if any(w in q for w in ["pourquoi", "comment se fait", "analyse", "expliquer"]):
        return "analytique"
    if any(w in q for w in ["formule", "sql", "code", "ast", "montre"]):
        return "technique"
    if _BCT_RULE_RE.search(question):  # e.g. "630/265"
        return "regle_bct"
    if len(question.split()) < 5:
        return "factuelle"
    return "factuelle"


# ---------------------------------------------------------------------------
# Per-format helpers
# ---------------------------------------------------------------------------


def _has_markdown_table(text: str) -> bool:
    return bool(re.search(r"\|.+\|", text))


def _has_bullet_points(text: str) -> bool:
    return bool(re.search(r"^[\-\*] ", text, re.MULTILINE))


def _has_code_block(text: str) -> bool:
    return "```" in text


def _has_headers(text: str) -> bool:
    return bool(re.search(r"^#{1,3} ", text, re.MULTILINE))


# ---------------------------------------------------------------------------
# Format enforcement
# ---------------------------------------------------------------------------


def apply_format(response: str, format_type: str) -> tuple[str, list[str]]:
    """Apply format-specific post-processing.

    Returns ``(formatted_text, format_warnings)``.
    Enforcement is always non-blocking.
    """
    warnings: list[str] = []

    if format_type == "factuelle":
        sentences = re.split(r"(?<=[.!?])\s+", response.strip())
        trimmed = " ".join(sentences[:3])
        if _has_headers(trimmed):
            warnings.append("FORMAT_WARNING:factuelle_has_headers")
        return trimmed, warnings

    if format_type == "comparative":
        if not _has_markdown_table(response):
            warnings.append("FORMAT_WARNING:comparative_missing_table")
        return response, warnings

    if format_type == "enumerative":
        if not _has_bullet_points(response):
            warnings.append("FORMAT_WARNING:enumerative_missing_bullets")
        return response, warnings

    if format_type == "analytique":
        # Full structured response with ## headers is expected and allowed
        return response, warnings

    if format_type == "technique":
        if not _has_code_block(response):
            warnings.append("FORMAT_WARNING:technique_missing_code_block")
        return response, warnings

    if format_type == "regle_bct":
        if not _BCT_RULE_RE.search(response):
            warnings.append("FORMAT_WARNING:regle_bct_missing_rule_number")
        return response, warnings

    if format_type == "ambigue":
        if not response.rstrip().endswith("?"):
            warnings.append("FORMAT_WARNING:ambigue_missing_question_mark")
        return response, warnings

    return response, warnings
