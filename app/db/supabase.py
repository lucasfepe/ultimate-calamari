"""
Thin async-friendly wrappers around the Supabase Python client.

The supabase-py client is synchronous (PostgREST + Storage HTTP calls).
All functions that hit the network are run via asyncio.to_thread so they
don't block the event loop when called from async code or BackgroundTasks.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from supabase import Client

from app.config import get_settings
from app.models.schemas import DocumentCreate, DocumentStatus


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------


async def upload_file(
    client: Client,
    owner_id: UUID,
    document_id: UUID,
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> str:
    """
    Store raw file bytes in Supabase Storage.
    Returns the storage path (used as document.file_path).
    Storage layout: <bucket>/<owner_id>/<document_id>/<filename>
    """
    settings = get_settings()
    path = f"{owner_id}/{document_id}/{filename}"

    def _upload() -> None:
        client.storage.from_(settings.supabase_storage_bucket).upload(
            path=path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
        )

    await asyncio.to_thread(_upload)
    return path


async def delete_file(client: Client, file_path: str) -> None:
    settings = get_settings()

    def _delete() -> None:
        client.storage.from_(settings.supabase_storage_bucket).remove([file_path])

    await asyncio.to_thread(_delete)


# ---------------------------------------------------------------------------
# Document table
# ---------------------------------------------------------------------------


async def insert_document(client: Client, payload: DocumentCreate) -> dict[str, Any]:
    """Insert a new document row and return the created record."""

    def _insert() -> dict:
        result = (
            client.table("documents")
            .insert(
                {
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


async def get_document(client: Client, document_id: UUID) -> dict[str, Any] | None:
    def _get() -> dict | None:
        result = (
            client.table("documents")
            .select("*")
            .eq("id", str(document_id))
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    return await asyncio.to_thread(_get)


async def list_documents(client: Client, owner_id: UUID) -> list[dict[str, Any]]:
    def _list() -> list[dict]:
        result = (
            client.table("documents")
            .select("*")
            .eq("owner_id", str(owner_id))
            .order("created_at", desc=True)
            .execute()
        )
        return result.data

    return await asyncio.to_thread(_list)


async def update_document_status(
    client: Client,
    document_id: UUID,
    status: DocumentStatus,
    *,
    chunk_count: int | None = None,
    error_message: str | None = None,
) -> None:
    patch: dict[str, Any] = {
        "status": status.value,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if chunk_count is not None:
        patch["chunk_count"] = chunk_count
    if error_message is not None:
        patch["error_message"] = error_message

    def _update() -> None:
        client.table("documents").update(patch).eq("id", str(document_id)).execute()

    await asyncio.to_thread(_update)


async def delete_document_row(client: Client, document_id: UUID) -> None:
    def _delete() -> None:
        client.table("documents").delete().eq("id", str(document_id)).execute()

    await asyncio.to_thread(_delete)


# ---------------------------------------------------------------------------
# Library table
# ---------------------------------------------------------------------------


async def insert_library(
    client: Client, owner_id: UUID, name: str, description: str | None
) -> dict[str, Any]:
    def _insert() -> dict:
        result = (
            client.table("libraries")
            .insert(
                {
                    "owner_id": str(owner_id),
                    "name": name,
                    "description": description,
                }
            )
            .execute()
        )
        return result.data[0]

    return await asyncio.to_thread(_insert)


async def get_library(client: Client, library_id: UUID) -> dict[str, Any] | None:
    def _get() -> dict | None:
        result = (
            client.table("libraries")
            .select("*")
            .eq("id", str(library_id))
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    return await asyncio.to_thread(_get)


async def list_libraries(client: Client, owner_id: UUID) -> list[dict[str, Any]]:
    def _list() -> list[dict]:
        result = (
            client.table("libraries")
            .select("*")
            .eq("owner_id", str(owner_id))
            .order("created_at", desc=True)
            .execute()
        )
        return result.data

    return await asyncio.to_thread(_list)


async def delete_library_row(client: Client, library_id: UUID) -> None:
    def _delete() -> None:
        client.table("libraries").delete().eq("id", str(library_id)).execute()

    await asyncio.to_thread(_delete)


# ---------------------------------------------------------------------------
# document_library join table
# ---------------------------------------------------------------------------


async def add_document_to_library(
    client: Client, document_id: UUID, library_id: UUID
) -> dict[str, Any]:
    def _insert() -> dict:
        result = (
            client.table("document_library")
            .insert(
                {
                    "document_id": str(document_id),
                    "library_id": str(library_id),
                }
            )
            .execute()
        )
        return result.data[0]

    return await asyncio.to_thread(_insert)


async def remove_document_from_library(
    client: Client, document_id: UUID, library_id: UUID
) -> None:
    def _delete() -> None:
        (
            client.table("document_library")
            .delete()
            .eq("document_id", str(document_id))
            .eq("library_id", str(library_id))
            .execute()
        )

    await asyncio.to_thread(_delete)


async def insert_usage_log(
    client: Client,
    *,
    library_id: UUID,
    api_key_hash: str,
    query_text: str,
    chunk_count: int,
    tokens_used: int | None,
    latency_ms: int | None,
) -> None:
    def _insert() -> None:
        client.table("usage_logs").insert(
            {
                "library_id": str(library_id),
                "api_key_hash": api_key_hash,
                "query_text": query_text,
                "chunk_count": chunk_count,
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
            }
        ).execute()

    await asyncio.to_thread(_insert)


async def get_document_ids_for_library(
    client: Client, library_id: UUID
) -> list[str]:
    """Return a list of document_id strings belonging to a library."""

    def _query() -> list[str]:
        result = (
            client.table("document_library")
            .select("document_id")
            .eq("library_id", str(library_id))
            .execute()
        )
        return [row["document_id"] for row in result.data]

    return await asyncio.to_thread(_query)
