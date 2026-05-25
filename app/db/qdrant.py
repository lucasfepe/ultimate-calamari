"""
Qdrant helpers: upsert chunks, delete by document_id, search (used later).

Each chunk stored in Qdrant has the following payload structure:
    {
        "document_id": str,
        "owner_id":    str,
        "filename":    str,
        "chunk_index": int,
        "text":        str,
        "char_start":  int,
        "char_end":    int,
    }
"""

from __future__ import annotations

import uuid
from typing import Any
from uuid import UUID

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchAny,
    PointStruct,
)

from app.config import get_settings
from app.models.schemas import EmbeddedChunk


async def upsert_chunks(
    client: AsyncQdrantClient,
    chunks: list[EmbeddedChunk],
) -> None:
    """Upsert a batch of embedded chunks into the Qdrant collection."""
    settings = get_settings()

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=chunk.vector,
            payload={
                "document_id": str(chunk.document_id),
                "owner_id": str(chunk.owner_id),
                "filename": chunk.filename,
                "chunk_index": chunk.chunk_index,
                "text": chunk.text,
                "char_start": chunk.char_start,
                "char_end": chunk.char_end,
            },
        )
        for chunk in chunks
    ]

    await client.upsert(
        collection_name=settings.qdrant_collection,
        points=points,
    )


async def delete_chunks_for_document(
    client: AsyncQdrantClient,
    document_id: UUID,
) -> None:
    """Remove all points whose payload.document_id matches the given document."""
    settings = get_settings()

    await client.delete(
        collection_name=settings.qdrant_collection,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="document_id",
                    match=MatchAny(any=[str(document_id)]),
                )
            ]
        ),
    )


async def search_by_document_ids(
    client: AsyncQdrantClient,
    query_vector: list[float],
    document_ids: list[str],
    top_k: int = 20,
) -> list[dict[str, Any]]:
    """
    Vector search scoped to a set of document_ids.
    Used by the query pipeline (not yet wired to a route).
    Returns a list of payload dicts sorted by score descending.
    """
    settings = get_settings()

    results = await client.query_points(
        collection_name=settings.qdrant_collection,
        query=query_vector,
        query_filter=Filter(
            must=[
                FieldCondition(
                    key="document_id",
                    match=MatchAny(any=document_ids),
                )
            ]
        ),
        limit=top_k,
        with_payload=True,
    )

    return [
        {**hit.payload, "score": hit.score}
        for hit in results.points
    ]
