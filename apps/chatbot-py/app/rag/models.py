"""Pydantic schemas for the RAG pipeline.

All models are frozen (immutable) per the zero-hallucination pillar —
once a chunk or search result is constructed it must not be mutated.
"""

import decimal

from pydantic import BaseModel, ConfigDict, Field

decimal.getcontext().prec = 38


class KbChunk(BaseModel):
    """A single knowledge-base chunk as stored in ``kb_chunks``.

    Note: the ``embedding`` column is intentionally excluded — it is a
    768-dim vector that lives only in the DB and is never serialised to
    API consumers.
    """

    model_config = ConfigDict(frozen=True)

    id: str = Field(description="UUID of the chunk row")
    tenant_id: str = Field(description="UUID of the owning tenant")
    source_ref: str = Field(
        description="Human-readable source identifier, e.g. 'circulaire:2014-14' or 'rule:630/266'"
    )
    chunk_text: str = Field(description="Raw text content of this chunk")


class ChunkSearchResult(BaseModel):
    """A chunk returned by a vector similarity search.

    ``similarity`` is a cosine similarity score in [0, 1] where 1 means
    identical embedding and 0 means orthogonal.  Derived from the pgvector
    ``<=>`` (cosine distance) operator as ``1 - distance``.
    """

    model_config = ConfigDict(frozen=True)

    chunk: KbChunk
    similarity: float = Field(
        ge=0.0,
        le=1.0,
        description="Cosine similarity between query embedding and chunk embedding",
    )
