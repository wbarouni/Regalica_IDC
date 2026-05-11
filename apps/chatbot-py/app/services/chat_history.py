"""Loaders for per-conversation chat history (Cas N°2, 2026-05-11).

Reads the last N messages of a single conversation from the `messages`
table (rôles `user` + `regalica_response`, immutable trigger-protected
rows, RLS-enforced for tenant + user isolation) and projects them
into the flat `list[str]` shape that `orchestrator.orchestrate` already
accepts via its `session_history` parameter.

Two concerns are kept separate:

  * `load_chat_history_max(pool)` — operator-controlled cap (DB-driven
    via platform_config key `chat_history_max_messages`, migration
    116). Zero-hardcoding doctrine.

  * `load_session_history(pool, conversation_id, tenant_id, max_n)` —
    cross-conversation isolation is enforced at TWO layers in the
    SELECT WHERE clause: by `conversation_id` (the natural key for
    a thread) AND by `tenant_id` (defence-in-depth against a stale
    or maliciously crafted conversation_id from a different tenant).

Doctrine reference: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3
("Niveau 3 — toute valeur opérée par l'opérateur").
"""

from __future__ import annotations

from typing import Final

import asyncpg

from app.services.platform_config import (
    PlatformConfigShapeError,
    load_platform_config_value,
)

# platform_config key seeded by migration 116. Code references the
# constant; the migration owns the literal so a rename only happens
# in one place. Mirrors the convention in planner_config.py.
_HISTORY_MAX_KEY: Final[str] = "chat_history_max_messages"

# platform_config key seeded by migration 117. Token budget for the
# regalica/router LLM call. Read by the orchestrator and forwarded
# to detect_intent() as the `max_tokens` kwarg. Kept in this module
# (rather than spawning a fresh router_config.py) because
# chat_history already owns the "cap-loaded-from-platform-config"
# pattern for the chat route and a co-located loader is one less
# import per call site.
_ROUTER_MAX_TOKENS_KEY: Final[str] = "regalica_router_max_tokens"

# platform_config key seeded by migration 117. Display cap on the
# specialist-output preview line surfaced in the deterministic
# thinking trace. Consumed by orchestrator._build_thinking_trace.
_THINKING_PREVIEW_MAX_CHARS_KEY: Final[str] = "regalica_thinking_preview_max_chars"

# The two message roles that surface in the chat thread (see
# apps/api/src/routes/conversations.ts SURFACED_ROLES). Other rôles
# (regalica_thinking, agent_internal, system_notification) are skipped
# so the LLM only sees the cleaned, user-visible thread.
_HISTORY_ROLES: Final[tuple[str, ...]] = ("user", "regalica_response")


async def load_chat_history_max(pool: asyncpg.Pool) -> int:
    """Return the operator-defined cap on conversational history depth."""
    raw = await load_platform_config_value(pool, _HISTORY_MAX_KEY)
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise PlatformConfigShapeError(_HISTORY_MAX_KEY, "int", raw)
    if raw < 0:
        raise PlatformConfigShapeError(_HISTORY_MAX_KEY, "int >= 0", raw)
    return int(raw)


async def load_router_max_tokens(pool: asyncpg.Pool) -> int:
    """Return the operator-defined max_tokens budget for the router LLM."""
    raw = await load_platform_config_value(pool, _ROUTER_MAX_TOKENS_KEY)
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise PlatformConfigShapeError(_ROUTER_MAX_TOKENS_KEY, "int", raw)
    if raw < 1:
        raise PlatformConfigShapeError(_ROUTER_MAX_TOKENS_KEY, "int >= 1", raw)
    return int(raw)


async def load_thinking_preview_max_chars(pool: asyncpg.Pool) -> int:
    """Return the operator-defined cap on the thinking-trace preview width."""
    raw = await load_platform_config_value(pool, _THINKING_PREVIEW_MAX_CHARS_KEY)
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise PlatformConfigShapeError(_THINKING_PREVIEW_MAX_CHARS_KEY, "int", raw)
    if raw < 1:
        raise PlatformConfigShapeError(_THINKING_PREVIEW_MAX_CHARS_KEY, "int >= 1", raw)
    return int(raw)


async def load_session_history(
    pool: asyncpg.Pool,
    *,
    conversation_id: str,
    tenant_id: str,
    max_n: int,
) -> list[str]:
    """Return the last `max_n` chat messages of a conversation as `list[str]`.

    Returned strings follow the convention `"user: ..."` / `"regalica: ..."`.
    The list is **chronologically ordered** (oldest first) so a downstream
    consumer can render it as a transcript. When `max_n == 0` or the
    conversation has no prior messages, the function returns `[]`.

    Cross-conversation isolation:
      * WHERE conversation_id = $1   ← natural key
      * AND   tenant_id        = $2  ← defence in depth (rejects a stale or
                                      maliciously crafted id from another
                                      tenant even if the caller skipped its
                                      own tenant check)

    Best-effort: on any SQL error, returns `[]` so the chat route never
    fails the turn just because history loading misbehaves. The
    orchestrator's `session_history=None` and `session_history=[]`
    branches are equivalent, so no behaviour difference downstream.
    """
    if max_n <= 0:
        return []
    try:
        rows = await pool.fetch(
            """
            SELECT role, content_markdown, sequence_number
              FROM messages
             WHERE conversation_id = $1::uuid
               AND tenant_id       = $2::uuid
               AND role            = ANY($3::text[])
             ORDER BY sequence_number DESC
             LIMIT $4
            """,
            conversation_id,
            tenant_id,
            list(_HISTORY_ROLES),
            max_n,
        )
    except Exception:
        return []
    # We fetched DESC + LIMIT to get the *latest* N; flip back to ASC for
    # chronological rendering. `sequence_number` is unique + monotonic
    # per conversation (msg_uk_sequence in migration 032).
    rows = sorted(rows, key=lambda r: int(r["sequence_number"]))
    out: list[str] = []
    for row in rows:
        role = "user" if str(row["role"]) == "user" else "regalica"
        content = str(row["content_markdown"])
        out.append(f"{role}: {content}")
    return out
