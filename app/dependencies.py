"""
FastAPI dependency injectors that read pre-built clients from app.state.

Clients are created once per process inside the lifespan() context manager
(app/main.py), which guarantees they are bound to the correct running event
loop.  Reading from app.state here is safe from any route handler or
BackgroundTask that receives the client as a resolved argument.
"""

from __future__ import annotations

import anthropic
import cohere
from fastapi import Request
from qdrant_client import AsyncQdrantClient
from supabase import Client


def get_supabase(request: Request) -> Client:
    return request.app.state.supabase


def get_qdrant(request: Request) -> AsyncQdrantClient:
    return request.app.state.qdrant


def get_cohere(request: Request) -> cohere.AsyncClientV2:
    return request.app.state.cohere


def get_anthropic(request: Request) -> anthropic.AsyncAnthropic:
    return request.app.state.anthropic
