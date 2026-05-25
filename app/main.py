from contextlib import asynccontextmanager

import anthropic
import cohere
import httpx
from fastapi import FastAPI
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PayloadSchemaType, VectorParams
from supabase import create_client

from app.config import get_settings
from app.api.v1.routes import api_keys, documents, libraries


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Create every external client inside the running event loop, store them on
    app.state, and tear them down on shutdown.

    This avoids the 'Event loop closed' error that occurs when async clients
    (Qdrant, Cohere, Anthropic) are created via @lru_cache outside the loop
    that actually drives requests (especially during tests).
    """
    settings = get_settings()

    qdrant = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)

    app.state.supabase = create_client(
        settings.supabase_url, settings.supabase_service_role_key
    )
    app.state.qdrant = qdrant
    app.state.cohere = cohere.AsyncClientV2(
        api_key=settings.cohere_api_key,
        httpx_client=httpx.AsyncClient(timeout=120.0),
    )
    app.state.anthropic = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    # ── Qdrant collection ────────────────────────────────────────────────────
    existing = await qdrant.get_collections()
    if settings.qdrant_collection not in {c.name for c in existing.collections}:
        await qdrant.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(
                size=settings.cohere_embed_dimensions,
                distance=Distance.COSINE,
            ),
        )

    # ── Payload index on document_id (required for filtered search) ──────────
    # create_payload_index is idempotent: safe to call on every startup.
    await qdrant.create_payload_index(
        collection_name=settings.qdrant_collection,
        field_name="document_id",
        field_schema=PayloadSchemaType.KEYWORD,
    )

    yield

    await qdrant.close()


app = FastAPI(
    title="RAG-as-a-Service API",
    version="0.1.0",
    description="Document ingestion and retrieval-augmented generation platform.",
    lifespan=lifespan,
)

app.include_router(documents.router, prefix="/v1/documents", tags=["documents"])
app.include_router(libraries.router, prefix="/v1/libraries", tags=["libraries"])
app.include_router(api_keys.router, prefix="/v1/api-keys", tags=["api-keys"])


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok"}
