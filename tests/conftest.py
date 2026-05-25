"""
Shared fixtures for integration tests.

The httpx client talks to the FastAPI app in-process via ASGITransport.
asgi-lifespan is used so the app's startup hook (Qdrant collection creation)
runs before any test sends a request.

NOTE: these tests hit real external services (Supabase, Qdrant, Cohere).
A populated .env file in the project root is required.
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator

import httpx
import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager

from app.main import app as fastapi_app

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Fixed owner UUID used across all tests.
# After migration 002 there is no FK to auth.users, so any valid UUID works.
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

# Minimal plain-text document that produces at least one chunk.
SAMPLE_DOCUMENT_BYTES = b"""\
Retrieval-Augmented Generation (RAG) is a technique that enhances large
language model responses by retrieving relevant documents from a knowledge
base before generating an answer.

The retrieval step uses dense vector search over embeddings produced by a
separate encoder model. The top-k results are appended to the prompt so the
LLM can ground its answer in factual source material.

This test document exists solely to exercise the ingestion pipeline end-to-end,
verifying that parsing, chunking, embedding, and Qdrant upsert all succeed.
"""

# ---------------------------------------------------------------------------
# Session-scoped client (spins up lifespan once for the whole test run)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session")
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    async with LifespanManager(fastapi_app) as manager:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=manager.app),
            base_url="http://test",
            timeout=60.0,
        ) as ac:
            yield ac


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def user_headers() -> dict[str, str]:
    return {"X-User-Id": TEST_USER_ID}


@pytest.fixture(scope="session")
def sample_document() -> tuple[str, bytes, str]:
    """Returns (filename, bytes, content_type) for a minimal test document."""
    return ("rag_overview.txt", SAMPLE_DOCUMENT_BYTES, "text/plain")


async def wait_for_ingestion(
    client: httpx.AsyncClient,
    document_id: str,
    user_headers: dict[str, str],
    *,
    timeout: float = 60.0,
    interval: float = 1.0,
) -> dict:
    """
    Poll GET /v1/documents/{id} until status is 'ready' or 'failed'.

    With ASGITransport, background tasks complete synchronously before the
    upload response is returned, so the first poll usually resolves immediately.
    The loop is retained as a safety net for future live-server test modes.
    """
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while True:
        response = await client.get(
            f"/v1/documents/{document_id}", headers=user_headers
        )
        response.raise_for_status()
        doc = response.json()

        if doc["status"] == "ready":
            return doc
        if doc["status"] == "failed":
            pytest.fail(
                f"Document ingestion failed. error_message={doc.get('error_message')!r}"
            )
        if loop.time() > deadline:
            pytest.fail(
                f"Timed out waiting for document {document_id!r} to become ready "
                f"(last status={doc['status']!r})"
            )

        await asyncio.sleep(interval)
