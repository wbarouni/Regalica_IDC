"""Async loader for the `platform_config` catalogue.

Retrieves operator-controlled tunables stored as JSONB in the
shared `platform_config` table. The catalogue is system-global —
no tenant_id filter — and rows are unique on `config_key`.

Caching strategy
  Module-level dict, populated on first read per key. Phase 6 will
  add LISTEN/NOTIFY-based invalidation; until then a chatbot-py
  restart is the cache invalidation signal (same convention as the
  Node API's `getPlatformConfig` in apps/api/src/lib/platformConfig.ts).

Failure modes
  - `PlatformConfigMissingError` when the key has no row (or is
    soft-deleted). Caller decides whether that's recoverable
    (e.g. fall back to a different feature).
  - `PlatformConfigShapeError` raised by typed accessors when the
    JSONB value doesn't match the expected structure. Both errors
    inherit from `PlatformConfigError` for catch-all handling.
"""

from __future__ import annotations

from typing import Any

import asyncpg


class PlatformConfigError(Exception):
    """Base class for platform_config loader errors."""


class PlatformConfigMissingError(PlatformConfigError):
    """Raised when the requested config_key has no active row."""

    def __init__(self, key: str) -> None:
        super().__init__(f"platform_config key {key!r} not found")
        self.key = key


class PlatformConfigShapeError(PlatformConfigError):
    """Raised when a typed accessor receives a JSONB value of an unexpected shape."""

    def __init__(self, key: str, expected: str, actual: Any) -> None:
        super().__init__(
            f"platform_config key {key!r} has wrong shape: expected {expected}, got {actual!r}"
        )
        self.key = key
        self.expected = expected
        self.actual = actual


_CACHE: dict[str, Any] = {}


async def load_platform_config_value(pool: asyncpg.Pool, config_key: str) -> Any:
    """Return the JSONB-decoded value for `config_key`. Cached."""
    if config_key in _CACHE:
        return _CACHE[config_key]
    row = await pool.fetchrow(
        """
        SELECT config_value
          FROM platform_config
         WHERE config_key = $1 AND deleted_at IS NULL
        """,
        config_key,
    )
    if row is None:
        raise PlatformConfigMissingError(config_key)
    raw_value = row["config_value"]
    # asyncpg decodes JSONB to a Python str by default unless a JSONB
    # codec is registered on the pool. Handle both branches so this
    # loader works regardless of the pool's codec configuration.
    if isinstance(raw_value, str):
        import json

        value = json.loads(raw_value)
    else:
        value = raw_value
    _CACHE[config_key] = value
    return value


def reset_platform_config_cache() -> None:
    """Drop every cached entry. Used by tests; production restarts cover the same."""
    _CACHE.clear()
