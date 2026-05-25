"""
FastAPI dependency that authenticates requests via a Bearer API key.

Usage:
    ctx: ApiKeyContext = Depends(require_api_key)
    # ctx.owner_id  — UUID of the key's owner
    # ctx.key_hash  — SHA-256 digest (used for usage_logs)

The raw key is never stored.  On each request we hash the presented token and
do a single indexed lookup in the api_keys table.  last_used_at is updated
asynchronously so it does not add latency to the hot path.
"""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.db import api_keys as api_keys_db
from app.dependencies import get_supabase

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class ApiKeyContext:
    owner_id: UUID
    key_hash: str
    key_id: UUID


async def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    supabase: Client = Depends(get_supabase),
) -> ApiKeyContext:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer API key required. Include 'Authorization: Bearer sk-...' in the request.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_key = credentials.credentials
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    row = await api_keys_db.get_api_key_by_hash(supabase, key_hash)

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if row["revoked_at"] is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has been revoked.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Update last_used_at without blocking the response
    asyncio.create_task(
        api_keys_db.update_last_used(supabase, UUID(row["id"]))
    )

    return ApiKeyContext(
        owner_id=UUID(row["owner_id"]),
        key_hash=key_hash,
        key_id=UUID(row["id"]),
    )
