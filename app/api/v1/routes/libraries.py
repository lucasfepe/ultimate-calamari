"""
Library management endpoints.

Libraries are named collections of documents.  The same document can belong
to many libraries without re-embedding (the join is resolved at query time).
"""

from __future__ import annotations

import hashlib
import time
from typing import Annotated
from uuid import UUID

import anthropic
import cohere
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from qdrant_client import AsyncQdrantClient
from supabase import Client

from app.config import get_settings
from app.core.query import run_rag_query
from app.db import supabase as supa_db
from app.dependencies import get_anthropic, get_cohere, get_qdrant, get_supabase
from app.models.schemas import (
    DocumentLibraryAdd,
    DocumentLibraryRow,
    DocumentResponse,
    LibraryCreate,
    LibraryResponse,
    QueryRequest,
    QueryResponse,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared dependency (mirrors documents.py — will be unified under auth later)
# ---------------------------------------------------------------------------


async def get_caller_id(x_user_id: Annotated[str | None, Header()] = None) -> UUID:
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-User-Id header is required (temporary pre-auth mechanism).",
        )
    try:
        return UUID(x_user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="X-User-Id must be a valid UUID.",
        )


# ---------------------------------------------------------------------------
# POST /v1/libraries
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=LibraryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new library",
)
async def create_library(
    body: LibraryCreate,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> LibraryResponse:
    row = await supa_db.insert_library(
        supabase, owner_id, body.name, body.description
    )
    return LibraryResponse(**row)


# ---------------------------------------------------------------------------
# GET /v1/libraries
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[LibraryResponse],
    summary="List all libraries owned by the caller",
)
async def list_libraries(
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> list[LibraryResponse]:
    rows = await supa_db.list_libraries(supabase, owner_id)
    return [LibraryResponse(**r) for r in rows]


# ---------------------------------------------------------------------------
# GET /v1/libraries/{library_id}
# ---------------------------------------------------------------------------


@router.get(
    "/{library_id}",
    response_model=LibraryResponse,
    summary="Get a library by ID",
)
async def get_library(
    library_id: UUID,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> LibraryResponse:
    row = await _require_library(supabase, library_id, owner_id)
    return LibraryResponse(**row)


# ---------------------------------------------------------------------------
# DELETE /v1/libraries/{library_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{library_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a library (documents are NOT deleted)",
)
async def delete_library(
    library_id: UUID,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> Response:
    await _require_library(supabase, library_id, owner_id)
    await supa_db.delete_library_row(supabase, library_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# POST /v1/libraries/{library_id}/documents  — add document to library
# ---------------------------------------------------------------------------


@router.post(
    "/{library_id}/documents",
    response_model=DocumentLibraryRow,
    status_code=status.HTTP_201_CREATED,
    summary="Add a document to a library",
)
async def add_document_to_library(
    library_id: UUID,
    body: DocumentLibraryAdd,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> DocumentLibraryRow:
    await _require_library(supabase, library_id, owner_id)

    # Verify the document exists and belongs to the caller
    doc = await supa_db.get_document(supabase, body.document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if UUID(doc["owner_id"]) != owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    row = await supa_db.add_document_to_library(supabase, body.document_id, library_id)
    return DocumentLibraryRow(**row)


# ---------------------------------------------------------------------------
# DELETE /v1/libraries/{library_id}/documents/{document_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{library_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Remove a document from a library (document is NOT deleted)",
)
async def remove_document_from_library(
    library_id: UUID,
    document_id: UUID,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> Response:
    await _require_library(supabase, library_id, owner_id)
    await supa_db.remove_document_from_library(supabase, document_id, library_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GET /v1/libraries/{library_id}/documents  — list documents in a library
# ---------------------------------------------------------------------------


@router.get(
    "/{library_id}/documents",
    response_model=list[DocumentResponse],
    summary="List all documents in a library",
)
async def list_library_documents(
    library_id: UUID,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> list[DocumentResponse]:
    await _require_library(supabase, library_id, owner_id)

    doc_ids = await supa_db.get_document_ids_for_library(supabase, library_id)
    if not doc_ids:
        return []

    # Fetch each document; skip any that have been deleted
    import asyncio

    async def _fetch(doc_id: str) -> dict | None:
        return await supa_db.get_document(supabase, UUID(doc_id))

    rows = await asyncio.gather(*[_fetch(did) for did in doc_ids])
    return [DocumentResponse(**r) for r in rows if r]


# ---------------------------------------------------------------------------
# POST /v1/libraries/{library_id}/query  — RAG query
# ---------------------------------------------------------------------------


@router.post(
    "/{library_id}/query",
    response_model=QueryResponse,
    summary="Query a library using retrieval-augmented generation",
)
async def query_library(
    library_id: UUID,
    body: QueryRequest,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
    qdrant: AsyncQdrantClient = Depends(get_qdrant),
    cohere_client: cohere.AsyncClientV2 = Depends(get_cohere),
    anthropic_client: anthropic.AsyncAnthropic = Depends(get_anthropic),
) -> QueryResponse:
    await _require_library(supabase, library_id, owner_id)

    # Resolve document scope for this library
    document_ids = await supa_db.get_document_ids_for_library(supabase, library_id)
    if not document_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Library has no documents. Add documents before querying.",
        )

    settings = get_settings()
    started_at = time.monotonic()

    result = await run_rag_query(
        prompt=body.prompt,
        document_ids=document_ids,
        top_k=body.top_k,
        top_n=body.top_n,
        cohere_client=cohere_client,
        qdrant=qdrant,
        anthropic_client=anthropic_client,
        settings=settings,
    )

    latency_ms = int((time.monotonic() - started_at) * 1000)

    # Log usage (fire-and-forget; don't let logging failures break the response)
    api_key_hash = hashlib.sha256(str(owner_id).encode()).hexdigest()
    try:
        await supa_db.insert_usage_log(
            supabase,
            library_id=library_id,
            api_key_hash=api_key_hash,
            query_text=body.prompt,
            chunk_count=len(result.sources),
            tokens_used=result.tokens_used,
            latency_ms=latency_ms,
        )
    except Exception:  # noqa: BLE001
        pass  # usage logging must never break a query response

    return QueryResponse(
        answer=result.answer,
        sources=result.sources,
        tokens_used=result.tokens_used,
        latency_ms=latency_ms,
    )


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------


async def _require_library(supabase: Client, library_id: UUID, owner_id: UUID) -> dict:
    row = await supa_db.get_library(supabase, library_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library not found.")
    if UUID(row["owner_id"]) != owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return row
