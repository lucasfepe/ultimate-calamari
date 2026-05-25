"""
Recursive character-based text splitter.

Strategy (in order of preference):
  1. Split on paragraph boundaries  ("\n\n")
  2. Split on line boundaries        ("\n")
  3. Split on sentence boundaries    (". ")
  4. Split on word boundaries        (" ")
  5. Hard split on characters

Each chunk is at most *chunk_size* characters.  Consecutive chunks share
*chunk_overlap* characters of context from the end of the previous chunk.
"""

from __future__ import annotations

from app.models.schemas import TextChunk

_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[TextChunk]:
    """
    Split *text* into overlapping chunks and return a list of TextChunk objects.
    """
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    raw_chunks = _split(text, chunk_size, chunk_overlap)

    # Compute character offsets by scanning through the original text
    chunks: list[TextChunk] = []
    search_start = 0
    for index, chunk_text_content in enumerate(raw_chunks):
        pos = text.find(chunk_text_content, search_start)
        if pos == -1:
            # Overlap may shift the start; fall back to a wider search
            pos = text.find(chunk_text_content)
        char_start = pos if pos != -1 else search_start
        char_end = char_start + len(chunk_text_content)
        chunks.append(
            TextChunk(
                text=chunk_text_content,
                chunk_index=index,
                char_start=char_start,
                char_end=char_end,
            )
        )
        # Advance so the next search starts inside the current chunk (preserving overlap)
        search_start = max(search_start, char_end - chunk_overlap)

    return chunks


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _split(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Recursively split text, returning a flat list of chunk strings."""
    if len(text) <= chunk_size:
        stripped = text.strip()
        return [stripped] if stripped else []

    chunks: list[str] = []
    _recursive_split(text, chunk_size, chunk_overlap, _SEPARATORS, chunks)
    return chunks


def _recursive_split(
    text: str,
    chunk_size: int,
    chunk_overlap: int,
    separators: list[str],
    output: list[str],
) -> None:
    separator = separators[-1]  # default: hard character split

    for sep in separators:
        if sep and sep in text:
            separator = sep
            break

    if separator:
        splits = text.split(separator)
    else:
        # Hard character split: no separator found, split by length
        splits = [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]

    # Merge small splits into chunks ≤ chunk_size, respecting overlap
    _merge_splits(splits, separator, chunk_size, chunk_overlap, separators, output)


def _merge_splits(
    splits: list[str],
    separator: str,
    chunk_size: int,
    chunk_overlap: int,
    separators: list[str],
    output: list[str],
) -> None:
    current_parts: list[str] = []
    current_len = 0
    sep_len = len(separator)

    for split in splits:
        split = split.strip()
        if not split:
            continue

        split_len = len(split)

        if split_len > chunk_size:
            # This individual split is too large; recurse with a finer separator
            next_seps = separators[separators.index(separator) + 1 :] if separator in separators else [""]
            _recursive_split(split, chunk_size, chunk_overlap, next_seps, output)
            continue

        projected = current_len + sep_len + split_len if current_parts else split_len

        if projected > chunk_size and current_parts:
            # Emit what we have
            chunk = separator.join(current_parts).strip()
            if chunk:
                output.append(chunk)
            # Retain overlap: keep trailing parts whose total length ≤ chunk_overlap
            overlap_parts: list[str] = []
            overlap_len = 0
            for part in reversed(current_parts):
                part_len = len(part) + (sep_len if overlap_parts else 0)
                if overlap_len + part_len > chunk_overlap:
                    break
                overlap_parts.insert(0, part)
                overlap_len += part_len
            current_parts = overlap_parts
            current_len = overlap_len

        current_parts.append(split)
        current_len = sum(len(p) for p in current_parts) + sep_len * (len(current_parts) - 1)

    if current_parts:
        chunk = separator.join(current_parts).strip()
        if chunk:
            output.append(chunk)
