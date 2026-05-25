"""
FastAPI dependency that authenticates management requests via a Supabase JWT.

Every management endpoint (documents, libraries, api-keys) requires:
    Authorization: Bearer <supabase_access_token>

The token is issued by Supabase Auth when the user signs in.  We verify it
locally using the project's JWKS endpoint — no round-trip to Supabase.

Usage:
    owner_id: UUID = Depends(get_current_user)
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from app.config import get_settings
from app.core.jwt_utils import decode_supabase_jwt

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UUID:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    try:
        payload = decode_supabase_jwt(credentials.credentials, settings.supabase_url)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing the user identifier.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token contains an invalid user identifier.",
            headers={"WWW-Authenticate": "Bearer"},
        )
