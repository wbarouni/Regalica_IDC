"""Unit tests for app.services.chat_history (Cas N°2, 2026-05-11).

Covers:
  * `load_chat_history_max` reads the cap from platform_config
    (migration 116 key `chat_history_max_messages`) with type +
    bounds validation.
  * `load_session_history` returns the last N user + regalica_response
    messages of a conversation, ordered chronologically, with
    cross-conversation AND cross-tenant isolation enforced in the SQL
    WHERE clause.
  * Best-effort posture: SQL failures degrade to [] rather than 500.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import chat_history as ch
from app.services import platform_config as pc
from app.services.platform_config import (
    PlatformConfigMissingError,
    PlatformConfigShapeError,
)

_TENANT_A = "00000000-0000-0000-0000-000000000001"
_TENANT_B = "00000000-0000-0000-0000-000000000002"
_CONV_A = "11111111-1111-1111-1111-111111111111"
_CONV_B = "22222222-2222-2222-2222-222222222222"


@pytest.fixture(autouse=True)
def _reset_caches() -> Iterator[None]:
    pc.reset_platform_config_cache()
    yield
    pc.reset_platform_config_cache()


# ─────────────────────────────────────────────────────────────────────
# load_chat_history_max
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_load_chat_history_max_returns_seeded_value() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"config_value": 20})
    out = await ch.load_chat_history_max(pool)
    assert out == 20


@pytest.mark.asyncio
async def test_load_chat_history_max_rejects_non_integer() -> None:
    """Float values (and any other non-int) must raise rather than truncate."""
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"config_value": 2.5})
    with pytest.raises(PlatformConfigShapeError):
        await ch.load_chat_history_max(pool)


@pytest.mark.asyncio
async def test_load_chat_history_max_rejects_boolean() -> None:
    """`True` is an int in Python — guard against the accidental cast."""
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"config_value": True})
    with pytest.raises(PlatformConfigShapeError):
        await ch.load_chat_history_max(pool)


@pytest.mark.asyncio
async def test_load_chat_history_max_rejects_negative() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"config_value": -1})
    with pytest.raises(PlatformConfigShapeError):
        await ch.load_chat_history_max(pool)


@pytest.mark.asyncio
async def test_load_chat_history_max_raises_missing_when_unseeded() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value=None)
    with pytest.raises(PlatformConfigMissingError):
        await ch.load_chat_history_max(pool)


# ─────────────────────────────────────────────────────────────────────
# load_session_history
# ─────────────────────────────────────────────────────────────────────


def _make_pool_with_rows(per_conv: dict[str, list[dict[str, Any]]]) -> MagicMock:
    """Build a pool whose `fetch` returns rows partitioned by conversation_id."""

    async def fake_fetch(query: str, *args: Any) -> list[dict[str, Any]]:
        del query
        conversation_id = args[0] if args else None
        tenant_id = args[1] if len(args) > 1 else None
        roles = args[2] if len(args) > 2 else []
        limit = args[3] if len(args) > 3 else 0
        rows = per_conv.get(str(conversation_id), [])
        # Mirror the SQL WHERE clause so tests can confirm the isolation
        # contract is in fact applied by the loader (not only by RLS).
        rows = [r for r in rows if r["tenant_id"] == tenant_id]
        rows = [r for r in rows if r["role"] in roles]
        rows = sorted(rows, key=lambda r: int(r["sequence_number"]), reverse=True)[:limit]
        return rows

    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=fake_fetch)
    return pool


@pytest.mark.asyncio
async def test_load_session_history_returns_chronological_list() -> None:
    rows_a = [
        {"role": "user", "content_markdown": "salut", "sequence_number": 1, "tenant_id": _TENANT_A},
        {
            "role": "regalica_response",
            "content_markdown": "bonjour",
            "sequence_number": 2,
            "tenant_id": _TENANT_A,
        },
        {
            "role": "user",
            "content_markdown": "rubrique 5 ?",
            "sequence_number": 3,
            "tenant_id": _TENANT_A,
        },
    ]
    pool = _make_pool_with_rows({_CONV_A: rows_a})
    out = await ch.load_session_history(
        pool, conversation_id=_CONV_A, tenant_id=_TENANT_A, max_n=10
    )
    assert out == [
        "user: salut",
        "regalica: bonjour",
        "user: rubrique 5 ?",
    ]


@pytest.mark.asyncio
async def test_load_session_history_caps_at_max_n_keeping_latest() -> None:
    """max_n=2 → only the 2 most recent turns, still chronological."""
    rows = [
        {
            "role": "user",
            "content_markdown": f"q{i}",
            "sequence_number": i,
            "tenant_id": _TENANT_A,
        }
        for i in range(1, 6)
    ]
    pool = _make_pool_with_rows({_CONV_A: rows})
    out = await ch.load_session_history(pool, conversation_id=_CONV_A, tenant_id=_TENANT_A, max_n=2)
    assert out == ["user: q4", "user: q5"]


@pytest.mark.asyncio
async def test_load_session_history_skips_non_surfaced_roles() -> None:
    """Only `user` + `regalica_response` are loaded — never agent_internal etc."""
    rows = [
        {"role": "user", "content_markdown": "hi", "sequence_number": 1, "tenant_id": _TENANT_A},
        {
            "role": "regalica_thinking",  # NOT a surfaced role
            "content_markdown": "thinking trace…",
            "sequence_number": 2,
            "tenant_id": _TENANT_A,
        },
        {
            "role": "regalica_response",
            "content_markdown": "réponse",
            "sequence_number": 3,
            "tenant_id": _TENANT_A,
        },
    ]
    pool = _make_pool_with_rows({_CONV_A: rows})
    out = await ch.load_session_history(
        pool, conversation_id=_CONV_A, tenant_id=_TENANT_A, max_n=10
    )
    assert out == ["user: hi", "regalica: réponse"]


@pytest.mark.asyncio
async def test_load_session_history_isolates_by_conversation_id() -> None:
    """Conversation A must NEVER see conversation B's messages."""
    rows_a = [
        {
            "role": "user",
            "content_markdown": "secret A",
            "sequence_number": 1,
            "tenant_id": _TENANT_A,
        }
    ]
    rows_b = [
        {
            "role": "user",
            "content_markdown": "secret B",
            "sequence_number": 1,
            "tenant_id": _TENANT_A,
        }
    ]
    pool = _make_pool_with_rows({_CONV_A: rows_a, _CONV_B: rows_b})
    out_a = await ch.load_session_history(
        pool, conversation_id=_CONV_A, tenant_id=_TENANT_A, max_n=10
    )
    out_b = await ch.load_session_history(
        pool, conversation_id=_CONV_B, tenant_id=_TENANT_A, max_n=10
    )
    assert out_a == ["user: secret A"]
    assert out_b == ["user: secret B"]


@pytest.mark.asyncio
async def test_load_session_history_isolates_by_tenant_id() -> None:
    """A conversation_id reused across tenants must NOT leak rows
    across tenants (defence-in-depth on top of RLS)."""
    rows = [
        {
            "role": "user",
            "content_markdown": "tenant A secret",
            "sequence_number": 1,
            "tenant_id": _TENANT_A,
        },
        {
            "role": "user",
            "content_markdown": "tenant B secret",
            "sequence_number": 2,
            "tenant_id": _TENANT_B,
        },
    ]
    pool = _make_pool_with_rows({_CONV_A: rows})
    out_a = await ch.load_session_history(
        pool, conversation_id=_CONV_A, tenant_id=_TENANT_A, max_n=10
    )
    out_b = await ch.load_session_history(
        pool, conversation_id=_CONV_A, tenant_id=_TENANT_B, max_n=10
    )
    assert out_a == ["user: tenant A secret"]
    assert out_b == ["user: tenant B secret"]


@pytest.mark.asyncio
async def test_load_session_history_returns_empty_when_max_n_zero() -> None:
    """max_n=0 must short-circuit without touching the pool."""
    pool = MagicMock()
    pool.fetch = AsyncMock()
    out = await ch.load_session_history(pool, conversation_id=_CONV_A, tenant_id=_TENANT_A, max_n=0)
    assert out == []
    pool.fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_load_session_history_degrades_to_empty_on_db_failure() -> None:
    """Any SQL exception must return [] — never raise."""
    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=RuntimeError("db down"))
    out = await ch.load_session_history(
        pool, conversation_id=_CONV_A, tenant_id=_TENANT_A, max_n=10
    )
    assert out == []
