"""
Library management endpoints.

Libraries are named collections of documents.  The same document can belong
to many libraries without re-embedding (the join is resolved at query time).
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from supabase import Client

from app.db import supabase as supa_db
from app.dependencies import get_supabase
from app.models.schemas import (
    DocumentLibraryAdd,
    DocumentLibraryRow,
    DocumentResponse,
    LibraryCreate,
    LibraryResponse,
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
    summary="Delete a library (documents are NOT deleted)",
)
async def delete_library(
    library_id: UUID,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> None:
    await _require_library(supabase, library_id, owner_id)
    await supa_db.delete_library_row(supabase, library_id)


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
    summary="Remove a document from a library (document is NOT deleted)",
)
async def remove_document_from_library(
    library_id: UUID,
    document_id: UUID,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> None:
    await _require_library(supabase, library_id, owner_id)
    await supa_db.remove_document_from_library(supabase, document_id, library_id)


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
# Internal helper
# ---------------------------------------------------------------------------


async def _require_library(supabase: Client, library_id: UUID, owner_id: UUID) -> dict:
    row = await supa_db.get_library(supabase, library_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library not found.")
    if UUID(row["owner_id"]) != owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return row
