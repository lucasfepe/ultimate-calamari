"""
Conversation management endpoints — protected by Supabase JWT auth.

GET  /v1/conversations                     → list all conversations (filter by library_id)
GET  /v1/conversations/{id}/messages       → full message history for a conversation
DELETE /v1/conversations/{id}              → delete conversation + messages (cascade)
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from supabase import Client

from app.core.user_auth import get_current_user
from app.db import conversations as conv_db
from app.dependencies import get_supabase
from app.models.schemas import ConversationMessageResponse, ConversationResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /v1/conversations
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[ConversationResponse],
    summary="List conversations for the authenticated user",
)
async def list_conversations(
    library_id: UUID | None = Query(default=None, description="Filter by library"),
    owner_id: UUID = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[ConversationResponse]:
    rows = await conv_db.get_conversations(supabase, owner_id, library_id)
    return [ConversationResponse(**r) for r in rows]


# ---------------------------------------------------------------------------
# GET /v1/conversations/{conversation_id}/messages
# ---------------------------------------------------------------------------


@router.get(
    "/{conversation_id}/messages",
    response_model=list[ConversationMessageResponse],
    summary="Get the full message history of a conversation",
)
async def get_conversation_messages(
    conversation_id: UUID,
    owner_id: UUID = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[ConversationMessageResponse]:
    conv = await conv_db.get_conversation(supabase, conversation_id)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    if UUID(conv["owner_id"]) != owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    rows = await conv_db.get_conversation_messages(supabase, conversation_id)
    return [ConversationMessageResponse(**r) for r in rows]


# ---------------------------------------------------------------------------
# DELETE /v1/conversations/{conversation_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a conversation and all its messages",
)
async def delete_conversation(
    conversation_id: UUID,
    owner_id: UUID = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> Response:
    conv = await conv_db.get_conversation(supabase, conversation_id)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    if UUID(conv["owner_id"]) != owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    await conv_db.delete_conversation(supabase, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
