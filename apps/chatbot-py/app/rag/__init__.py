"""RAG pipeline — 4 independently testable components (Phase 4).

Chunker → Embedder → Clusterer → Reranker, each with a pydantic contract.

Public surface:
    chunk_text      — pure text → chunks function (no I/O)
    Retriever       — vector search + chunk ingestion against pgvector
    KbChunk         — Pydantic schema for a knowledge-base chunk
    ChunkSearchResult — Pydantic schema for a similarity search result
"""

from app.rag.chunker import chunk_text
from app.rag.models import ChunkSearchResult, KbChunk
from app.rag.retriever import Retriever

__all__ = ["chunk_text", "Retriever", "KbChunk", "ChunkSearchResult"]
