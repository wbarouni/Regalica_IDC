"""pgvector retriever — vector similarity search and chunk ingestion.

Uses ``asyncpg`` for direct, async PostgreSQL access (no SQLAlchemy overhead).

Design decisions:
  - ``search()`` never raises — graceful degradation returns [] on any DB
    error so the chatbot continues to function without the knowledge base.
  - ``ingest()`` returns the number of rows actually inserted; partial
    success is possible (e.g. if some embeddings fail).
  - Database URL is taken from ``settings.database_url``.  The ``postgres://``
    scheme is converted to ``postgresql://`` for asyncpg compatibility.
  - ``asyncpg`` is imported lazily inside each method so the module loads
    successfully even when asyncpg is not installed (import guard pattern).
"""

from __future__ import annotations

import decimal
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

from app.config import settings
from app.rag.embedder import Embedder
from app.rag.models import ChunkSearchResult, KbChunk

decimal.getcontext().prec = 38

logger = structlog.get_logger(__name__)

# SQL executed by search()
_SEARCH_SQL = """
    SELECT
        id,
        tenant_id,
        source_ref,
        chunk_text,
        1 - (embedding <=> $1::vector) AS similarity
    FROM kb_chunks
    WHERE tenant_id = $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3
"""

# SQL executed by ingest()
_INSERT_SQL = """
    INSERT INTO kb_chunks (id, tenant_id, source_ref, chunk_text, embedding, created_at)
    VALUES ($1, $2, $3, $4, $5::vector, $6)
    ON CONFLICT (id) DO NOTHING
"""


def _normalise_db_url(url: str) -> str:
    """Convert ``postgres://`` to ``postgresql://`` for asyncpg compatibility."""
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


class Retriever:
    """Encapsulates all read/write operations against the ``kb_chunks`` table.

    Args:
        embedder: An ``Embedder`` instance used to convert query strings and
                  raw text chunks into embedding vectors.
    """

    def __init__(self, embedder: Embedder | None = None) -> None:
        self._embedder: Embedder = embedder if embedder is not None else Embedder()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def search(
        self,
        query: str,
        tenant_id: str,
        top_k: int = 5,
    ) -> list[ChunkSearchResult]:
        """Return the *top_k* most similar chunks for *query* within *tenant_id*.

        Args:
            query:     The user's natural-language query.
            tenant_id: UUID string of the requesting tenant (enforces RLS).
            top_k:     Maximum number of results to return.

        Returns:
            Ordered list of ``ChunkSearchResult`` (highest similarity first).
            Returns an empty list — without raising — on any DB or embedding
            error.
        """
        try:
            query_embedding = await self._embedder.embed(query)
        except Exception as exc:
            logger.warning("retriever.embed_error", error=str(exc), query_len=len(query))
            return []

        try:
            asyncpg = _import_asyncpg()
        except ImportError:
            logger.warning(
                "retriever.asyncpg_unavailable",
                reason="asyncpg not installed — returning empty results",
            )
            return []

        db_url = _get_db_url()
        if db_url is None:
            logger.warning("retriever.no_database_url", reason="DATABASE_URL not configured")
            return []

        try:
            conn: Any = await asyncpg.connect(db_url)
        except Exception as exc:
            logger.warning("retriever.connect_error", error=str(exc))
            return []

        try:
            vector_str = _vector_to_pg(query_embedding)
            rows = await conn.fetch(_SEARCH_SQL, vector_str, tenant_id, top_k)
        except Exception as exc:
            logger.warning("retriever.search_error", error=str(exc))
            return []
        finally:
            await conn.close()

        results: list[ChunkSearchResult] = []
        for row in rows:
            chunk = KbChunk(
                id=str(row["id"]),
                tenant_id=str(row["tenant_id"]),
                source_ref=str(row["source_ref"]),
                chunk_text=str(row["chunk_text"]),
            )
            similarity = float(row["similarity"])
            results.append(ChunkSearchResult(chunk=chunk, similarity=similarity))

        logger.info(
            "retriever.search_ok",
            tenant_id=tenant_id,
            query_len=len(query),
            results=len(results),
            top_k=top_k,
        )
        return results

    async def ingest(
        self,
        chunks: list[str],
        source_ref: str,
        tenant_id: str,
    ) -> int:
        """Embed each chunk and insert it into ``kb_chunks``.

        Args:
            chunks:     List of raw text strings to embed and store.
            source_ref: Source identifier (e.g. ``"circulaire:2014-14"``).
            tenant_id:  UUID string of the tenant that owns these chunks.

        Returns:
            The number of rows successfully inserted.  May be less than
            ``len(chunks)`` if some embeddings or inserts fail.
        """
        if not chunks:
            logger.info("retriever.ingest_empty", source_ref=source_ref)
            return 0

        try:
            asyncpg = _import_asyncpg()
        except ImportError:
            logger.warning(
                "retriever.asyncpg_unavailable",
                reason="asyncpg not installed — ingest skipped",
            )
            return 0

        db_url = _get_db_url()
        if db_url is None:
            logger.warning("retriever.no_database_url", reason="DATABASE_URL not configured")
            return 0

        try:
            conn: Any = await asyncpg.connect(db_url)
        except Exception as exc:
            logger.warning("retriever.connect_error", error=str(exc))
            return 0

        inserted = 0
        now = datetime.now(tz=timezone.utc)

        try:
            for chunk_text in chunks:
                if not chunk_text.strip():
                    continue
                try:
                    embedding = await self._embedder.embed(chunk_text)
                    vector_str = _vector_to_pg(embedding)
                    row_id = str(uuid.uuid4())
                    await conn.execute(
                        _INSERT_SQL,
                        row_id,
                        tenant_id,
                        source_ref,
                        chunk_text,
                        vector_str,
                        now,
                    )
                    inserted += 1
                except Exception as exc:
                    logger.warning(
                        "retriever.ingest_chunk_error",
                        error=str(exc),
                        source_ref=source_ref,
                        chunk_preview=chunk_text[:80],
                    )
        finally:
            await conn.close()

        logger.info(
            "retriever.ingest_ok",
            source_ref=source_ref,
            tenant_id=tenant_id,
            total=len(chunks),
            inserted=inserted,
        )
        return inserted


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _import_asyncpg() -> Any:
    """Import asyncpg, raising ``ImportError`` with a helpful message if absent."""
    try:
        import asyncpg as _asyncpg  # type: ignore[import-untyped]

        return _asyncpg
    except ImportError as exc:
        raise ImportError(
            "asyncpg is required for Retriever — install with: pip install asyncpg"
        ) from exc


def _get_db_url() -> str | None:
    """Return the normalised database URL or None if not configured."""
    raw = settings.database_url
    if not raw:
        return None
    return _normalise_db_url(raw)


def _vector_to_pg(vector: list[float]) -> str:
    """Serialise a Python float list to pgvector's text literal format ``[f,f,…]``."""
    return "[" + ",".join(str(f) for f in vector) + "]"
