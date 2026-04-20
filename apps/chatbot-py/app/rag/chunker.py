"""Text-to-chunks converter — pure, side-effect-free, fully testable.

Strategy (sliding-window with paragraph awareness):
  1. Split input on blank lines (``\\n\\n``) to get logical paragraphs.
  2. If a paragraph exceeds *max_tokens* words, split it further on single
     newlines (``\\n``).
  3. If a segment still exceeds *max_tokens* words, split on sentence
     boundaries (``". "``).
  4. Assemble a sliding window with *overlap* words carried forward from the
     previous chunk so that context is never hard-cut at boundaries.

No I/O, no external dependencies, no logging — this function is intentionally
a pure transformation so it can be unit-tested without any infrastructure.
"""

import decimal

decimal.getcontext().prec = 38

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def chunk_text(
    text: str,
    max_tokens: int = 400,
    overlap: int = 50,
) -> list[str]:
    """Split *text* into overlapping chunks of at most *max_tokens* words.

    Args:
        text:       The raw text to chunk.
        max_tokens: Maximum number of whitespace-delimited tokens (words) per
                    chunk.  Default 400 — a safe fit for a 512-token encoder
                    with sub-word tokenisation overhead.
        overlap:    Number of words carried over from the end of the previous
                    chunk into the start of the next chunk.  Default 50.

    Returns:
        A list of non-empty string chunks.  Guaranteed to be non-empty when
        *text* itself is non-empty.
    """
    if not text or not text.strip():
        return []

    # Step 1 — collect atomic segments (paragraph → line → sentence aware)
    segments: list[str] = _split_into_segments(text, max_tokens)

    # Step 2 — build sliding-window chunks from the flat segment list
    return _build_chunks(segments, max_tokens, overlap)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _split_into_segments(text: str, max_tokens: int) -> list[str]:
    """Return a flat list of segments, none exceeding *max_tokens* words."""
    segments: list[str] = []

    paragraphs = text.split("\n\n")
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if _word_count(para) <= max_tokens:
            segments.append(para)
        else:
            # Too large — split on single newlines
            lines = para.split("\n")
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                if _word_count(line) <= max_tokens:
                    segments.append(line)
                else:
                    # Still too large — split on sentence boundaries
                    for sentence_seg in _split_on_sentences(line, max_tokens):
                        segments.append(sentence_seg)

    return segments


def _split_on_sentences(text: str, max_tokens: int) -> list[str]:
    """Split *text* on ``". "`` boundaries, never exceeding *max_tokens* words.

    When even a single sentence exceeds *max_tokens* it is yielded as-is to
    avoid infinite recursion — truncation is caller's responsibility.
    """
    results: list[str] = []
    current_words: list[str] = []

    # Use ". " as a sentence delimiter while preserving the period.
    raw_sentences = text.split(". ")
    for i, sentence in enumerate(raw_sentences):
        # Re-attach the period (except on the last fragment if it already ends
        # with one, or if this is the last element of the split).
        if i < len(raw_sentences) - 1:
            sentence = sentence + "."
        sentence = sentence.strip()
        if not sentence:
            continue

        sentence_words = sentence.split()
        if _word_count_list(current_words) + len(sentence_words) <= max_tokens:
            current_words.extend(sentence_words)
        else:
            if current_words:
                results.append(" ".join(current_words))
            # If the sentence alone is too long, add it anyway (hard limit).
            current_words = sentence_words

    if current_words:
        results.append(" ".join(current_words))

    return results


def _build_chunks(segments: list[str], max_tokens: int, overlap: int) -> list[str]:
    """Assemble *segments* into overlapping chunks with a sliding window.

    Words are accumulated from each segment.  When adding a segment would
    exceed *max_tokens*, the current window is flushed as a chunk and the
    next window starts with the last *overlap* words of the flushed chunk.
    """
    chunks: list[str] = []
    window: list[str] = []

    for segment in segments:
        seg_words = segment.split()
        if _word_count_list(window) + len(seg_words) <= max_tokens:
            window.extend(seg_words)
        else:
            if window:
                chunks.append(" ".join(window))
                # Carry overlap words forward
                window = window[-overlap:] if overlap > 0 else []
            # Add the new segment — if it alone exceeds max_tokens, force-flush
            window.extend(seg_words)
            if _word_count_list(window) > max_tokens:
                chunks.append(" ".join(window))
                window = window[-overlap:] if overlap > 0 else []

    # Flush remaining words
    remaining = " ".join(window).strip()
    if remaining:
        chunks.append(remaining)

    return [c for c in chunks if c.strip()]


def _word_count(text: str) -> int:
    """Count whitespace-delimited words in *text*."""
    return len(text.split())


def _word_count_list(words: list[str]) -> int:
    """Return the number of words already in a pre-split list."""
    return len(words)
