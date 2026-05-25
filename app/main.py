from contextlib import asynccontextmanager

from fastapi import FastAPI
from qdrant_client.models import Distance, VectorParams

from app.config import get_settings
from app.dependencies import get_qdrant
from app.api.v1.routes import documents, libraries


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure the Qdrant collection exists before the server starts accepting requests."""
    settings = get_settings()
    qdrant = get_qdrant()

    existing = await qdrant.get_collections()
    names = {c.name for c in existing.collections}

    if settings.qdrant_collection not in names:
        await qdrant.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(
                size=settings.cohere_embed_dimensions,
                distance=Distance.COSINE,
            ),
        )

    yield


app = FastAPI(
    title="RAG-as-a-Service API",
    version="0.1.0",
    description="Document ingestion and retrieval-augmented generation platform.",
    lifespan=lifespan,
)

app.include_router(documents.router, prefix="/v1/documents", tags=["documents"])
app.include_router(libraries.router, prefix="/v1/libraries", tags=["libraries"])


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok"}
