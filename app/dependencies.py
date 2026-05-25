"""
Shared FastAPI dependencies: typed singletons for every external client.
Each getter is safe to call from both route handlers and background tasks.
"""

from functools import lru_cache

import cohere
from qdrant_client import AsyncQdrantClient
from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


@lru_cache
def get_qdrant() -> AsyncQdrantClient:
    s = get_settings()
    return AsyncQdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key)


@lru_cache
def get_cohere() -> cohere.AsyncClientV2:
    return cohere.AsyncClientV2(api_key=get_settings().cohere_api_key)
