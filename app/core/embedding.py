"""
Cohere embedding wrapper.

Uses input_type="search_document" for chunks being ingested.
Batches requests to stay within Cohere's per-request limits (96 texts).
"""

from __future__ import annotations

import asyncio
from typing import Literal

import cohere

from app.config import get_settings

_COHERE_MAX_BATCH = 96


async def embed_texts(
    client: cohere.AsyncClientV2,
    texts: list[str],
    input_type: Literal["search_document", "search_query"] = "search_document",
) -> list[list[float]]:
    """
    Embed a list of texts and return a corresponding list of float vectors.
    Automatically splits into batches of ≤ 96 to respect Cohere's limit.
    """
    if not texts:
        return []

    settings = get_settings()
    batches = [texts[i : i + _COHERE_MAX_BATCH] for i in range(0, len(texts), _COHERE_MAX_BATCH)]

    results: list[list[float]] = []
    for batch in batches:
        response = await client.embed(
            texts=batch,
            model=settings.cohere_embed_model,
            input_type=input_type,
            embedding_types=["float"],
        )
        # response.embeddings.float_ is a list[list[float]]
        results.extend(response.embeddings.float_)

    return results
