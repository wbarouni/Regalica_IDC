"""Active-prompt loader for the prompt_bank table.

Returns the operative `(template, temperature, max_tokens,
thinking_enabled, target_model)` tuple for a given
(tenant_id, agent_type, function_name) where status='active'.
Returns None when no active row exists — the caller must handle
the "no active prompt" case explicitly (a 4-yeux promotion is
required to move a prompt from draft to active per migration 023).

Zero hardcoding: nothing in this file references a specific agent
key or template; the inputs come from the route handler which
itself reads them from `prompt_bank` via this loader.
"""

from __future__ import annotations

from typing import TypedDict

import asyncpg


class PromptMeta(TypedDict):
    """Parameters of an active prompt loaded from prompt_bank."""

    template: str
    temperature: float
    max_tokens: int
    thinking_enabled: bool
    target_model: str


async def load_active_prompt(
    pool: asyncpg.Pool,
    tenant_id: str,
    agent_type: str,
    function_name: str,
) -> PromptMeta | None:
    """Return the active prompt for the (tenant, agent, function) triple, or None."""
    row = await pool.fetchrow(
        """
        SELECT template, temperature, max_tokens, thinking_enabled, target_model
          FROM prompt_bank
         WHERE tenant_id = $1::uuid
           AND agent_type = $2
           AND function_name = $3
           AND status = 'active'
           AND deleted_at IS NULL
         LIMIT 1
        """,
        tenant_id,
        agent_type,
        function_name,
    )
    if row is None:
        return None
    return PromptMeta(
        template=str(row["template"]),
        temperature=float(row["temperature"]),
        max_tokens=int(row["max_tokens"]),
        thinking_enabled=bool(row["thinking_enabled"]),
        target_model=str(row["target_model"]),
    )
