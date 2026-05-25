"""
API key management endpoints — protected by Supabase JWT auth.
"""

from __future__ import annotations

import hashlib
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from supabase import Client

from app.core.user_auth import get_current_user
from app.db import api_keys as api_keys_db
from app.dependencies import get_supabase
from app.models.schemas import ApiKeyCreate, ApiKeyCreatedResponse, ApiKeyResponse

router = APIRouter()

_KEY_PREFIX = "sk-"


# ---------------------------------------------------------------------------
# POST /v1/api-keys  — create a new key
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an API key (raw key shown once)",
)
async def create_api_key(
    body: ApiKeyCreate,
    owner_id: UUID = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> ApiKeyCreatedResponse:
    raw_key = _KEY_PREFIX + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    row = await api_keys_db.create_api_key(
        supabase,
        owner_id=owner_id,
        name=body.name,
        key_hash=key_hash,
    )

    return ApiKeyCreatedResponse(
        id=row["id"],
        name=row["name"],
        raw_key=raw_key,
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# GET /v1/api-keys  — list caller's keys
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[ApiKeyResponse],
    summary="List API keys (raw key never returned)",
)
async def list_api_keys(
    owner_id: UUID = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[ApiKeyResponse]:
    rows = await api_keys_db.list_api_keys(supabase, owner_id)
    return [
        ApiKeyResponse(
            id=r["id"],
            name=r["name"],
            created_at=r["created_at"],
            last_used_at=r.get("last_used_at"),
            revoked_at=r.get("revoked_at"),
            is_active=r.get("revoked_at") is None,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# DELETE /v1/api-keys/{key_id}  — revoke a key
# ---------------------------------------------------------------------------


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Revoke an API key",
)
async def revoke_api_key(
    key_id: UUID,
    owner_id: UUID = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> Response:
    found = await api_keys_db.revoke_api_key(supabase, key_id=key_id, owner_id=owner_id)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found or already revoked.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
