"""
Shared Supabase JWT verification using the project's JWKS endpoint.

Supabase now signs JWTs with ES256 (asymmetric) by default.  We fetch the
public key from the JWKS endpoint and verify locally — no round-trip to
Supabase on each request.  PyJWKClient caches keys for 5 minutes by default,
so only the very first request incurs a network fetch.
"""

from __future__ import annotations

from jwt import PyJWKClient, decode as jwt_decode
from jwt.exceptions import InvalidTokenError

_clients: dict[str, PyJWKClient] = {}


def _get_client(supabase_url: str) -> PyJWKClient:
    """Return a cached PyJWKClient for this project URL."""
    if supabase_url not in _clients:
        jwks_uri = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _clients[supabase_url] = PyJWKClient(jwks_uri)
    return _clients[supabase_url]


def decode_supabase_jwt(token: str, supabase_url: str) -> dict:
    """
    Decode and verify a Supabase-issued JWT.

    Supports both ES256 (new default) and HS256 (legacy projects).
    Raises jwt.InvalidTokenError (or a subclass) on failure.
    """
    client = _get_client(supabase_url)
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt_decode(
        token,
        signing_key.key,
        algorithms=["ES256", "RS256", "HS256"],
        audience="authenticated",
    )


__all__ = ["decode_supabase_jwt", "InvalidTokenError"]
