"""
FastAPI dependency that authenticates query requests via Bearer token.

Accepts two token shapes:
  1. sk-...  — a DocuMind API key (hashed, stored in api_keys table).
               Used by external developers integrating via the API.
  2. <supabase_jwt>  — the session token of a logged-in user.
               Used by the web app so logged-in users can query without
               generating an API key first.

Usage:
    ctx: ApiKeyContext = Depends(require_api_key)
    # ctx.owner_id — UUID of the authenticated user / key owner
    # ctx.key_hash — SHA-256 of the API key, or a synthetic value for JWTs
"""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from supabase import Client

from app.config import get_settings
from app.core.jwt_utils import decode_supabase_jwt
from app.db import api_keys as api_keys_db
from app.dependencies import get_supabase

_bearer = HTTPBearer(auto_error=False)

# Prefix that every DocuMind-issued API key starts with
_SK_PREFIX = "sk-"

# Sentinel used as key_hash for JWT-authenticated requests (not stored in api_keys)
_JWT_KEY_HASH = "jwt-session"


@dataclass(frozen=True)
class ApiKeyContext:
    owner_id: UUID
    key_hash: str
    key_id: UUID | None  # None for JWT-authenticated requests


async def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    supabase: Client = Depends(get_supabase),
) -> ApiKeyContext:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer API key or sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # ── Path 1: API key (starts with "sk-") ──────────────────────────────────
    if token.startswith(_SK_PREFIX):
        key_hash = hashlib.sha256(token.encode()).hexdigest()

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

        asyncio.create_task(
            api_keys_db.update_last_used(supabase, UUID(row["id"]))
        )

        return ApiKeyContext(
            owner_id=UUID(row["owner_id"]),
            key_hash=key_hash,
            key_id=UUID(row["id"]),
        )

    # ── Path 2: Supabase JWT (logged-in web user) ─────────────────────────────
    settings = get_settings()
    try:
        payload = decode_supabase_jwt(token, settings.supabase_url)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token. Provide a valid API key or sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing the user identifier.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return ApiKeyContext(
        owner_id=UUID(sub),
        key_hash=_JWT_KEY_HASH,
        key_id=None,
    )
