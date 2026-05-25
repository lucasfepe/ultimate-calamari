"""
Document ingestion pipeline.

Called as a FastAPI BackgroundTask after the file has been uploaded to
Supabase Storage and the document row has been created (status=pending).

Pipeline:
    1. Mark document as "processing"
    2. Parse raw file bytes → plain text
    3. Chunk text → list[TextChunk]
    4. Embed all chunks with Cohere → list[EmbeddedChunk]
    5. Upsert points into Qdrant
    6. Mark document as "ready" with chunk_count

On any exception the document is marked "failed" with the error message.
"""

from __future__ import annotations

import logging
from uuid import UUID

import cohere
from qdrant_client import AsyncQdrantClient
from supabase import Client

from app.config import get_settings
from app.core.chunking import chunk_text
from app.core.embedding import embed_texts
from app.core.parsing import parse
from app.db import qdrant as qdrant_db
from app.db import supabase as supa_db
from app.models.schemas import DocumentStatus, EmbeddedChunk

logger = logging.getLogger(__name__)


async def run_ingestion(
    *,
    document_id: UUID,
    owner_id: UUID,
    filename: str,
    content_type: str,
    file_bytes: bytes,
    supabase: Client,
    qdrant: AsyncQdrantClient,
    cohere_client: cohere.AsyncClientV2,
) -> None:
    """
    Full ingestion pipeline for a single document.
    This function is designed to be passed directly to FastAPI BackgroundTasks.
    """
    settings = get_settings()

    # -- 1. Mark as processing ------------------------------------------------
    await supa_db.update_document_status(
        supabase, document_id, DocumentStatus.processing
    )

    try:
        # -- 2. Parse -----------------------------------------------------------
        logger.info("Parsing document %s (%s)", document_id, content_type)
        text = parse(file_bytes, content_type)

        # -- 3. Chunk -----------------------------------------------------------
        logger.info("Chunking document %s", document_id)
        chunks = chunk_text(
            text,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

        if not chunks:
            raise ValueError("Document produced no text chunks after parsing.")

        # -- 4. Embed -----------------------------------------------------------
        logger.info(
            "Embedding %d chunks for document %s via Cohere", len(chunks), document_id
        )
        texts = [c.text for c in chunks]
        vectors = await embed_texts(cohere_client, texts, input_type="search_document")

        if len(vectors) != len(chunks):
            raise RuntimeError(
                f"Cohere returned {len(vectors)} vectors for {len(chunks)} chunks."
            )

        embedded: list[EmbeddedChunk] = [
            EmbeddedChunk(
                text=chunk.text,
                chunk_index=chunk.chunk_index,
                char_start=chunk.char_start,
                char_end=chunk.char_end,
                vector=vector,
                document_id=document_id,
                owner_id=owner_id,
                filename=filename,
            )
            for chunk, vector in zip(chunks, vectors)
        ]

        # -- 5. Upsert into Qdrant ---------------------------------------------
        logger.info(
            "Upserting %d points for document %s into Qdrant", len(embedded), document_id
        )
        await qdrant_db.upsert_chunks(qdrant, embedded)

        # -- 6. Mark ready ------------------------------------------------------
        await supa_db.update_document_status(
            supabase,
            document_id,
            DocumentStatus.ready,
            chunk_count=len(embedded),
        )
        logger.info("Ingestion complete for document %s (%d chunks)", document_id, len(embedded))

    except Exception as exc:  # noqa: BLE001
        logger.exception("Ingestion failed for document %s: %s", document_id, exc)
        await supa_db.update_document_status(
            supabase,
            document_id,
            DocumentStatus.failed,
            error_message=str(exc),
        )
