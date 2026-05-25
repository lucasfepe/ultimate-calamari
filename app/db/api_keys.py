"""
CRUD helpers for the api_keys table.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from supabase import Client


async def create_api_key(
    client: Client,
    *,
    owner_id: UUID,
    name: str,
    key_hash: str,
) -> dict[str, Any]:
    def _insert() -> dict:
        result = (
            client.table("api_keys")
            .insert(
                {
                    "owner_id": str(owner_id),
                    "name": name,
                    "key_hash": key_hash,
                }
            )
            .execute()
        )
        return result.data[0]

    return await asyncio.to_thread(_insert)


async def get_api_key_by_hash(
    client: Client,
    key_hash: str,
) -> dict[str, Any] | None:
    def _get() -> dict | None:
        result = (
            client.table("api_keys")
            .select("*")
            .eq("key_hash", key_hash)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    return await asyncio.to_thread(_get)


async def list_api_keys(
    client: Client,
    owner_id: UUID,
) -> list[dict[str, Any]]:
    def _list() -> list[dict]:
        result = (
            client.table("api_keys")
            .select("id, owner_id, name, created_at, last_used_at, revoked_at")
            .eq("owner_id", str(owner_id))
            .order("created_at", desc=True)
            .execute()
        )
        return result.data

    return await asyncio.to_thread(_list)


async def revoke_api_key(
    client: Client,
    *,
    key_id: UUID,
    owner_id: UUID,
) -> bool:
    """
    Set revoked_at to now for the given key if it belongs to owner_id.
    Returns True if a row was updated, False if not found / wrong owner.
    """
    now = datetime.now(timezone.utc).isoformat()

    def _revoke() -> bool:
        result = (
            client.table("api_keys")
            .update({"revoked_at": now})
            .eq("id", str(key_id))
            .eq("owner_id", str(owner_id))
            .is_("revoked_at", "null")   # idempotent: only revoke active keys
            .execute()
        )
        return len(result.data) > 0

    return await asyncio.to_thread(_revoke)


async def update_last_used(client: Client, key_id: UUID) -> None:
    now = datetime.now(timezone.utc).isoformat()

    def _update() -> None:
        client.table("api_keys").update({"last_used_at": now}).eq(
            "id", str(key_id)
        ).execute()

    await asyncio.to_thread(_update)
