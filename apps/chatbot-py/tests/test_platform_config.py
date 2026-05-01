"""Unit tests for app.services.platform_config — cached JSONB loader."""

from __future__ import annotations

import json
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import platform_config as pc


@pytest.fixture(autouse=True)
def _reset_cache() -> Iterator[None]:
    pc.reset_platform_config_cache()
    yield
    pc.reset_platform_config_cache()


@pytest.mark.asyncio
async def test_load_returns_native_object_when_pool_decodes_jsonb() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"config_value": {"a": 1, "b": [2, 3]}})
    out = await pc.load_platform_config_value(pool, "demo_key")
    assert out == {"a": 1, "b": [2, 3]}


@pytest.mark.asyncio
async def test_load_decodes_string_when_pool_returns_raw_json() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"config_value": json.dumps({"x": [1, 2]})})
    out = await pc.load_platform_config_value(pool, "demo_key")
    assert out == {"x": [1, 2]}


@pytest.mark.asyncio
async def test_load_caches_first_call_and_skips_pool_on_second() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"config_value": {"v": 42}})
    await pc.load_platform_config_value(pool, "k")
    await pc.load_platform_config_value(pool, "k")
    assert pool.fetchrow.await_count == 1


@pytest.mark.asyncio
async def test_load_raises_on_missing_key() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value=None)
    with pytest.raises(pc.PlatformConfigMissingError) as exc_info:
        await pc.load_platform_config_value(pool, "absent_key")
    assert exc_info.value.key == "absent_key"


@pytest.mark.asyncio
async def test_reset_cache_drops_every_entry() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"config_value": {"v": 1}})
    await pc.load_platform_config_value(pool, "k")
    pc.reset_platform_config_cache()
    pool.fetchrow.reset_mock()
    pool.fetchrow.return_value = {"config_value": {"v": 2}}
    out = await pc.load_platform_config_value(pool, "k")
    assert out == {"v": 2}
    assert pool.fetchrow.await_count == 1
