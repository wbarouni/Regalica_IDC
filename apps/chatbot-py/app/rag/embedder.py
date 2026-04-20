"""Text-to-vector embedder with two backends.

Production backend (Gemini ``text-embedding-004``):
    POST https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent
    Requires ``GEMINI_API_KEY`` to be set in the environment.

Offline / fallback backend (hash pseudo-embedding):
    Uses ``hashlib.sha256`` repeated / truncated to 768 floats in [-1, 1].
    This is **NOT semantically meaningful** — it is deterministic and useful
    only for offline unit tests and CI environments without a Gemini key.
    It is clearly labelled in log output.

The choice between backends is made at ``Embedder.__init__`` time based on
whether ``settings.gemini_api_key`` is set AND ``settings.llm_provider`` is
``"gemini"``.
"""

from __future__ import annotations

import decimal
import hashlib
import struct
from typing import Final

import httpx
import structlog

from app.config import settings

decimal.getcontext().prec = 38

logger = structlog.get_logger(__name__)

_EMBEDDING_DIM: Final[int] = 768
_GEMINI_EMBED_URL: Final[str] = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "text-embedding-004:embedContent"
)


class Embedder:
    """Produces 768-dimensional embedding vectors for text strings.

    Instantiate once and reuse — the httpx ``AsyncClient`` is kept open for
    connection-pooling efficiency.

    Attributes:
        _use_gemini: True when Gemini API key is available and provider is
                     configured for Gemini.  False triggers hash fallback.
    """

    def __init__(self) -> None:
        self._api_key: str | None = settings.gemini_api_key
        self._use_gemini: bool = (
            bool(self._api_key) and settings.llm_provider == "gemini"
        )
        self._http: httpx.AsyncClient = httpx.AsyncClient(timeout=30.0)

        if self._use_gemini:
            logger.info(
                "embedder.backend",
                backend="gemini",
                model="text-embedding-004",
            )
        else:
            logger.warning(
                "embedder.backend",
                backend="hash_pseudo_embedding",
                reason="GEMINI_API_KEY not set or LLM_PROVIDER != gemini",
                note="NOT semantically meaningful — offline/test mode only",
            )

    async def embed(self, text: str) -> list[float]:
        """Return a 768-dim embedding vector for *text*.

        Args:
            text: The text string to embed.

        Returns:
            A list of 768 floats.  When using the Gemini backend these are
            real semantic embeddings.  When using the hash fallback they are
            deterministic but non-semantic pseudo-embeddings.
        """
        if self._use_gemini:
            return await self._embed_gemini(text)
        return _hash_embed(text)

    async def aclose(self) -> None:
        """Close the underlying HTTP client.  Call on application shutdown."""
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _embed_gemini(self, text: str) -> list[float]:
        """Call the Gemini REST embedding endpoint.

        Falls back to hash pseudo-embedding if the HTTP call fails, so callers
        never see an exception from this method.
        """
        assert self._api_key is not None  # guaranteed by _use_gemini check

        payload = {
            "model": "models/text-embedding-004",
            "content": {"parts": [{"text": text}]},
        }
        params = {"key": self._api_key}

        try:
            response = await self._http.post(
                _GEMINI_EMBED_URL,
                json=payload,
                params=params,
            )
            response.raise_for_status()
            data = response.json()
            values: list[float] = data["embedding"]["values"]
            logger.debug(
                "embedder.gemini_ok",
                dim=len(values),
                text_len=len(text),
            )
            return values
        except Exception as exc:
            logger.warning(
                "embedder.gemini_error",
                error=str(exc),
                fallback="hash_pseudo_embedding",
            )
            return _hash_embed(text)


# ---------------------------------------------------------------------------
# Offline hash pseudo-embedding (non-semantic, deterministic)
# ---------------------------------------------------------------------------


def _hash_embed(text: str) -> list[float]:
    """Return a deterministic 768-dim vector derived from the SHA-256 of *text*.

    Algorithm:
        1. Compute SHA-256 of the UTF-8 encoded text (32 bytes).
        2. Repeat the 32-byte digest until we have at least 768 * 4 bytes.
        3. Interpret every 4 bytes as a big-endian unsigned int, normalise to
           [-1, 1] by dividing by (2**32 - 1) and centering.

    This is intentionally NOT semantically meaningful.  It is used only for
    offline tests / CI environments without an API key.
    """
    digest = hashlib.sha256(text.encode("utf-8")).digest()  # 32 bytes

    # We need 768 floats × 4 bytes each = 3072 bytes.  Tile the 32-byte digest.
    needed_bytes = _EMBEDDING_DIM * 4
    repeat_count = -(-needed_bytes // len(digest))  # ceiling division
    raw = (digest * repeat_count)[:needed_bytes]

    # Unpack as unsigned 32-bit big-endian integers
    uint32_max: float = float(0xFFFFFFFF)
    floats: list[float] = []
    for i in range(_EMBEDDING_DIM):
        offset = i * 4
        (uint_val,) = struct.unpack_from(">I", raw, offset)
        # Normalise to [-1.0, 1.0]
        floats.append(uint_val / uint32_max * 2.0 - 1.0)

    return floats
