"""JSON parsing helpers for LLM outputs.

LLMs occasionally wrap their JSON payload in surrounding text even when
JSON mode is enabled (intro phrasing, trailing commentary, markdown
fences). `extract_first_json` recovers the first valid JSON object from
such strings without raising — callers get either the parsed dict or
None and decide on the retry path.

`is_static_response` is the canonical predicate for the static_response
short-circuit added in migration 070: when a prompt_bank row carries a
non-empty `static_response`, the orchestrator must skip the LLM call
and surface that string verbatim.

Pure module: no I/O, no logging, no DB. Safe to import from anywhere.
"""

from __future__ import annotations

import json
import re
from typing import Any

# Pre-compiled regex: greedy match from the first '{' to the last '}'.
# Greedy is intentional — when the LLM emits valid nested JSON wrapped in
# prose, `re.DOTALL` + greedy lets us capture the whole object including
# any inner braces. Non-greedy would stop at the first nested closing
# brace and yield invalid JSON.
_BRACE_BLOCK_RE: re.Pattern[str] = re.compile(r"\{.*\}", re.DOTALL)


def extract_first_json(text: object) -> dict[str, Any] | None:
    """Extract the first valid JSON object from an LLM output string.

    Returns the parsed dict on success, or None if no valid JSON object
    can be recovered. Never raises — every parse path is wrapped.

    Three-pass strategy:
      1. Direct parse — covers the nominal JSON-mode case.
      2. Greedy regex from first '{' to last '}' — covers prose
         wrappers like "Here is the result: {...}".
      3. Offset-scan with raw_decode — covers cases where the regex
         captures too much trailing text.

    Non-string inputs (None, bytes, ints) and empty strings return None.
    Top-level arrays / scalars also return None — only object dicts are
    accepted, matching the LLM-aggregator contract surface.
    """
    if not isinstance(text, str) or text == "":
        return None

    stripped = text.strip()
    if stripped == "":
        return None

    # Pass 1 — direct parse, the JSON-mode happy path.
    try:
        candidate = json.loads(stripped)
    except json.JSONDecodeError:
        candidate = None
    if isinstance(candidate, dict):
        return candidate

    # Pass 2 — greedy regex.
    match = _BRACE_BLOCK_RE.search(stripped)
    if match is not None:
        try:
            candidate = json.loads(match.group())
        except json.JSONDecodeError:
            candidate = None
        if isinstance(candidate, dict):
            return candidate

    # Pass 3 — offset scan with raw_decode. Tolerates trailing garbage.
    decoder = json.JSONDecoder()
    for index, char in enumerate(stripped):
        if char != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(stripped, index)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            return obj

    return None


def is_static_response(prompt_row: object) -> bool:
    """Return True iff the prompt row carries a non-empty static_response.

    The orchestrator uses this predicate to short-circuit the LLM call
    for prompts whose response is fully canned (e.g. out_of_scope
    perimeter declines, low-confidence ambiguous fallbacks). The canned
    text lives in `prompt_bank.static_response` (column added in
    migration 070); when it is present, surface it verbatim and skip the
    Gemini round-trip entirely.

    Accepts any mapping-like object so the helper composes equally with
    asyncpg Records, plain dicts, and pydantic models that expose the
    `.get` interface. Non-mapping inputs (None, lists, scalars) return
    False so the caller falls back to the live LLM path.
    """
    if not hasattr(prompt_row, "get"):
        return False
    value = prompt_row.get("static_response")
    if not isinstance(value, str):
        return False
    return value.strip() != ""
