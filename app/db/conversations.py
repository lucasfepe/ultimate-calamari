"""
Supabase helpers for conversations and messages.

Conversations group messages by library. A new conversation is created on the
first query if the caller does not supply an existing conversation_id; subsequent
queries in the same session append to it.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from supabase import Client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_conversation(
    supabase: Client,
    owner_id: UUID,
    library_id: UUID,
    title: str,
) -> dict:
    result = await asyncio.to_thread(
        lambda: supabase.table("conversations")
        .insert(
            {
                "owner_id": str(owner_id),
                "library_id": str(library_id),
                "title": title[:100],
            }
        )
        .execute()
    )
    return result.data[0]


async def get_conversation(supabase: Client, conversation_id: UUID) -> dict | None:
    result = await asyncio.to_thread(
        lambda: supabase.table("conversations")
        .select("*")
        .eq("id", str(conversation_id))
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_conversations(
    supabase: Client,
    owner_id: UUID,
    library_id: UUID | None = None,
) -> list[dict]:
    q = (
        supabase.table("conversations")
        .select("*")
        .eq("owner_id", str(owner_id))
        .order("updated_at", desc=True)
    )
    if library_id is not None:
        q = q.eq("library_id", str(library_id))
    result = await asyncio.to_thread(lambda: q.execute())
    return result.data or []


async def get_conversation_messages(
    supabase: Client,
    conversation_id: UUID,
) -> list[dict]:
    result = await asyncio.to_thread(
        lambda: supabase.table("messages")
        .select("*")
        .eq("conversation_id", str(conversation_id))
        .order("created_at")
        .execute()
    )
    return result.data or []


async def append_message(
    supabase: Client,
    conversation_id: UUID,
    role: str,
    content: str,
    sources: list[dict] | None = None,
    tokens_used: int | None = None,
) -> dict:
    payload: dict = {
        "conversation_id": str(conversation_id),
        "role": role,
        "content": content,
    }
    if sources is not None:
        payload["sources"] = sources
    if tokens_used is not None:
        payload["tokens_used"] = tokens_used

    msg_result = await asyncio.to_thread(
        lambda: supabase.table("messages").insert(payload).execute()
    )
    # Bump conversation updated_at so the sidebar sorts correctly
    await asyncio.to_thread(
        lambda: supabase.table("conversations")
        .update({"updated_at": _now()})
        .eq("id", str(conversation_id))
        .execute()
    )
    return msg_result.data[0]


async def delete_conversation(supabase: Client, conversation_id: UUID) -> None:
    # Messages are deleted by cascade
    await asyncio.to_thread(
        lambda: supabase.table("conversations")
        .delete()
        .eq("id", str(conversation_id))
        .execute()
    )
