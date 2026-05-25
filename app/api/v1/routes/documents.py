"""
Document ingestion endpoints.

Auth is intentionally omitted for now.  A temporary X-User-Id header is
used to identify the caller; this will be replaced with Supabase JWT
verification once the auth layer is wired in.
"""

from __future__ import annotations

import uuid
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Response,
    UploadFile,
    status,
)

import cohere
from qdrant_client import AsyncQdrantClient
from supabase import Client

from app.core.ingestion import run_ingestion
from app.core.parsing import SUPPORTED_CONTENT_TYPES, content_type_from_filename
from app.db import supabase as supa_db
from app.db import qdrant as qdrant_db
from app.dependencies import get_cohere, get_qdrant, get_supabase
from app.models.schemas import DocumentCreate, DocumentResponse, DocumentStatus

router = APIRouter()

# ---------------------------------------------------------------------------
# Dependency: resolve caller identity from header (temporary, pre-auth)
# ---------------------------------------------------------------------------

_MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB


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
# POST /v1/documents  — upload and enqueue ingestion
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a document and start ingestion",
)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
    qdrant: AsyncQdrantClient = Depends(get_qdrant),
    cohere_client: cohere.AsyncClientV2 = Depends(get_cohere),
) -> DocumentResponse:
    # --- Validate file type ---------------------------------------------------
    filename = file.filename or "upload"
    content_type = file.content_type or content_type_from_filename(filename) or ""

    if content_type not in SUPPORTED_CONTENT_TYPES:
        inferred = content_type_from_filename(filename)
        if inferred and inferred in SUPPORTED_CONTENT_TYPES:
            content_type = inferred
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=(
                    f"Unsupported file type: {content_type!r}. "
                    f"Accepted: {sorted(SUPPORTED_CONTENT_TYPES)}"
                ),
            )

    # --- Read bytes (enforce size limit) -------------------------------------
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {_MAX_FILE_BYTES // (1024 * 1024)} MB limit.",
        )

    # --- Generate document ID ------------------------------------------------
    document_id = uuid.uuid4()

    # --- Store file in Supabase Storage --------------------------------------
    file_path = await supa_db.upload_file(
        supabase, owner_id, document_id, filename, content_type, file_bytes
    )

    # --- Create document row in Postgres ------------------------------------
    doc_payload = DocumentCreate(
        owner_id=owner_id,
        filename=filename,
        file_path=file_path,
        content_type=content_type,
        file_size_bytes=len(file_bytes),
    )
    # Override the auto-generated id so it matches the storage path
    record = await _insert_document_with_id(supabase, document_id, doc_payload)

    # --- Enqueue background ingestion ----------------------------------------
    background_tasks.add_task(
        run_ingestion,
        document_id=document_id,
        owner_id=owner_id,
        filename=filename,
        content_type=content_type,
        file_bytes=file_bytes,
        supabase=supabase,
        qdrant=qdrant,
        cohere_client=cohere_client,
    )

    return DocumentResponse(**record)


# ---------------------------------------------------------------------------
# GET /v1/documents  — list caller's documents
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[DocumentResponse],
    summary="List all documents owned by the caller",
)
async def list_documents(
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> list[DocumentResponse]:
    rows = await supa_db.list_documents(supabase, owner_id)
    return [DocumentResponse(**r) for r in rows]


# ---------------------------------------------------------------------------
# GET /v1/documents/{document_id}  — fetch single document
# ---------------------------------------------------------------------------


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document status and metadata",
)
async def get_document(
    document_id: UUID,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
) -> DocumentResponse:
    row = await supa_db.get_document(supabase, document_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if UUID(row["owner_id"]) != owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return DocumentResponse(**row)


# ---------------------------------------------------------------------------
# DELETE /v1/documents/{document_id}  — delete document everywhere
# ---------------------------------------------------------------------------


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a document from Storage, Postgres, and Qdrant",
)
async def delete_document(
    document_id: UUID,
    owner_id: UUID = Depends(get_caller_id),
    supabase: Client = Depends(get_supabase),
    qdrant: AsyncQdrantClient = Depends(get_qdrant),
) -> Response:
    row = await supa_db.get_document(supabase, document_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if UUID(row["owner_id"]) != owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    # Remove Qdrant points first (non-destructive on failure)
    await qdrant_db.delete_chunks_for_document(qdrant, document_id)

    # Remove file from Storage
    await supa_db.delete_file(supabase, row["file_path"])

    # Remove Postgres row (cascades to document_library join rows)
    await supa_db.delete_document_row(supabase, document_id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Internal helper: insert document row with a pre-determined UUID
# ---------------------------------------------------------------------------


async def _insert_document_with_id(
    supabase: Client,
    document_id: uuid.UUID,
    payload: DocumentCreate,
) -> dict:
    """Insert with an explicit id instead of using the DB default."""
    import asyncio

    def _insert() -> dict:
        result = (
            supabase.table("documents")
            .insert(
                {
                    "id": str(document_id),
                    "owner_id": str(payload.owner_id),
                    "filename": payload.filename,
                    "file_path": payload.file_path,
                    "content_type": payload.content_type,
                    "file_size_bytes": payload.file_size_bytes,
                    "status": DocumentStatus.pending.value,
                }
            )
            .execute()
        )
        return result.data[0]

    return await asyncio.to_thread(_insert)
