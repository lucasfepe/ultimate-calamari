"""
Integration tests for POST /v1/libraries/{library_id}/query.

Tests in TestQueryEndpoint are marked @pytest.mark.slow because they make real
Cohere (embed + rerank) and Anthropic (Claude) API calls.  They are skipped
by default and only run when pytest is invoked with the --slow flag:

    pytest -v --slow tests/test_query_flow.py

Error / edge-case tests at the bottom of this file do NOT make any external
API calls and run unconditionally.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
import httpx

from tests.conftest import wait_for_ingestion, SAMPLE_DOCUMENT_BYTES


# ---------------------------------------------------------------------------
# Module-scoped fixture: ingest once, query many times
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session")
async def query_context(
    client: httpx.AsyncClient,
    user_headers: dict[str, str],
) -> dict:
    """
    Upload and ingest the sample document, create a library, add the document
    to it, and yield a dict with document_id and library_id.

    Teardown deletes both resources even if assertions fail.
    """
    doc_id: str | None = None
    lib_id: str | None = None

    # Upload document
    upload_resp = await client.post(
        "/v1/documents",
        files={"file": ("rag_overview.txt", SAMPLE_DOCUMENT_BYTES, "text/plain")},
        headers=user_headers,
    )
    assert upload_resp.status_code == 202, upload_resp.text
    doc_id = upload_resp.json()["id"]

    # Wait for ingestion to finish
    await wait_for_ingestion(client, doc_id, user_headers)

    # Create library
    lib_resp = await client.post(
        "/v1/libraries",
        json={"name": "Query Test Library"},
        headers=user_headers,
    )
    assert lib_resp.status_code == 201, lib_resp.text
    lib_id = lib_resp.json()["id"]

    # Add document to library
    add_resp = await client.post(
        f"/v1/libraries/{lib_id}/documents",
        json={"document_id": doc_id},
        headers=user_headers,
    )
    assert add_resp.status_code == 201, add_resp.text

    yield {"document_id": doc_id, "library_id": lib_id}

    # Teardown
    if doc_id:
        await client.delete(f"/v1/documents/{doc_id}", headers=user_headers)
    if lib_id:
        await client.delete(f"/v1/libraries/{lib_id}", headers=user_headers)


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


@pytest.mark.slow
class TestQueryEndpoint:
    async def test_returns_200_with_answer(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        query_context: dict,
    ):
        """A well-formed query returns 200 with a non-empty answer."""
        response = await client.post(
            f"/v1/libraries/{query_context['library_id']}/query",
            json={"prompt": "What is retrieval-augmented generation?"},
            headers=user_headers,
        )
        assert response.status_code == 200, response.text

        body = response.json()
        assert isinstance(body["answer"], str)
        assert len(body["answer"]) > 0

    async def test_sources_present_and_well_formed(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        query_context: dict,
    ):
        """Response includes source chunks with required fields."""
        response = await client.post(
            f"/v1/libraries/{query_context['library_id']}/query",
            json={"prompt": "How does the retrieval step work?"},
            headers=user_headers,
        )
        assert response.status_code == 200, response.text

        body = response.json()
        assert len(body["sources"]) > 0

        for source in body["sources"]:
            assert "document_id" in source
            assert "filename" in source
            assert "chunk_index" in source
            assert "text" in source
            assert isinstance(source["relevance_score"], float)
            assert 0.0 <= source["relevance_score"] <= 1.0

    async def test_tokens_used_positive(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        query_context: dict,
    ):
        """tokens_used reflects actual LLM consumption (input + output)."""
        response = await client.post(
            f"/v1/libraries/{query_context['library_id']}/query",
            json={"prompt": "What is the purpose of this document?"},
            headers=user_headers,
        )
        assert response.status_code == 200, response.text

        body = response.json()
        assert body["tokens_used"] > 0

    async def test_latency_ms_recorded(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        query_context: dict,
    ):
        """latency_ms is a non-negative integer."""
        response = await client.post(
            f"/v1/libraries/{query_context['library_id']}/query",
            json={"prompt": "Summarise the context."},
            headers=user_headers,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json()["latency_ms"], int)
        assert response.json()["latency_ms"] >= 0

    async def test_top_n_respected(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        query_context: dict,
    ):
        """Requesting top_n=1 returns at most 1 source chunk."""
        response = await client.post(
            f"/v1/libraries/{query_context['library_id']}/query",
            json={"prompt": "What is RAG?", "top_n": 1},
            headers=user_headers,
        )
        assert response.status_code == 200, response.text
        assert len(response.json()["sources"]) <= 1

    async def test_sources_scoped_to_library_documents(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        query_context: dict,
    ):
        """Every source chunk must belong to a document in the library."""
        response = await client.post(
            f"/v1/libraries/{query_context['library_id']}/query",
            json={"prompt": "Tell me about vector search."},
            headers=user_headers,
        )
        assert response.status_code == 200, response.text

        expected_doc_id = query_context["document_id"]
        for source in response.json()["sources"]:
            assert source["document_id"] == expected_doc_id


# ---------------------------------------------------------------------------
# Error / edge-case tests (no shared fixture needed)
# ---------------------------------------------------------------------------


async def test_query_nonexistent_library(
    client: httpx.AsyncClient,
    user_headers: dict[str, str],
):
    """Querying a library that doesn't exist returns 404."""
    response = await client.post(
        "/v1/libraries/00000000-0000-0000-0000-deadbeef0001/query",
        json={"prompt": "anything"},
        headers=user_headers,
    )
    assert response.status_code == 404


async def test_query_empty_library(
    client: httpx.AsyncClient,
    user_headers: dict[str, str],
):
    """Querying a library with no documents returns 422."""
    # Create an empty library just for this test
    lib_resp = await client.post(
        "/v1/libraries",
        json={"name": "Empty Library"},
        headers=user_headers,
    )
    assert lib_resp.status_code == 201
    lib_id = lib_resp.json()["id"]

    try:
        response = await client.post(
            f"/v1/libraries/{lib_id}/query",
            json={"prompt": "anything"},
            headers=user_headers,
        )
        assert response.status_code == 422
        assert "no documents" in response.json()["detail"].lower()
    finally:
        await client.delete(f"/v1/libraries/{lib_id}", headers=user_headers)


async def test_query_requires_user_id(client: httpx.AsyncClient):
    """Missing X-User-Id header returns 401."""
    response = await client.post(
        "/v1/libraries/00000000-0000-0000-0000-000000000001/query",
        json={"prompt": "anything"},
    )
    assert response.status_code == 401


async def test_query_rejects_empty_prompt(
    client: httpx.AsyncClient,
    user_headers: dict[str, str],
):
    """An empty prompt string is rejected by Pydantic validation (422)."""
    response = await client.post(
        "/v1/libraries/00000000-0000-0000-0000-000000000001/query",
        json={"prompt": ""},
        headers=user_headers,
    )
    assert response.status_code == 422
