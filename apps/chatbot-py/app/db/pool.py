"""Singleton async Postgres pool.

Mirrors the apps/api/src/db/pool.ts pattern: a single process-wide
`asyncpg.Pool` is lazily created on first call to `get_pool()` and
closed via `close_pool()` at lifespan shutdown. The DSN is read
from `Settings.database_url`; absence is a hard error at first use
(zero-hardcoding doctrine — no fallback DSN baked into source).

Pool sizing (min_size=2, max_size=10) follows the apps/api default
and stays well below the Postgres `max_connections` ceiling.
"""

from __future__ import annotations

import asyncpg

from app.config import Settings

_pool: asyncpg.Pool | None = None


async def get_pool(settings: Settings) -> asyncpg.Pool:
    """Return the singleton pool, creating it on first call."""
    global _pool
    if _pool is None:
        if settings.database_url is None:
            raise ValueError(
                "DATABASE_URL is required to initialise the asyncpg pool",
            )
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool() -> None:
    """Close and reset the singleton pool. Idempotent."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
