"""
Integration tests for the full document ingestion and library membership flow.

Test order:
    1. Upload a document  → 202, status eventually becomes 'ready'
    2. Create a library   → 201
    3. Add the document to the library → 201
    4. Verify the document appears when listing the library's documents

Cleanup (DELETE document + library) is handled by yield fixtures so it runs
even when an assertion fails mid-test.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
import httpx

from tests.conftest import wait_for_ingestion


# ---------------------------------------------------------------------------
# Resource fixtures with built-in teardown
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def uploaded_document(
    client: httpx.AsyncClient,
    user_headers: dict[str, str],
    sample_document: tuple[str, bytes, str],
):
    """
    Upload the sample document and yield its ID.
    Deletes the document (and its Qdrant vectors) in teardown.
    """
    filename, content, content_type = sample_document

    response = await client.post(
        "/v1/documents",
        files={"file": (filename, content, content_type)},
        headers=user_headers,
    )
    assert response.status_code == 202, response.text
    document_id = response.json()["id"]

    yield document_id

    # Teardown — ignore 404 in case the test itself deleted the document
    await client.delete(f"/v1/documents/{document_id}", headers=user_headers)


@pytest_asyncio.fixture
async def created_library(
    client: httpx.AsyncClient,
    user_headers: dict[str, str],
):
    """
    Create a test library and yield its ID.
    Deletes the library in teardown.
    """
    response = await client.post(
        "/v1/libraries",
        json={"name": "Integration Test Library", "description": "Created by pytest"},
        headers=user_headers,
    )
    assert response.status_code == 201, response.text
    library_id = response.json()["id"]

    yield library_id

    await client.delete(f"/v1/libraries/{library_id}", headers=user_headers)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestIngestionFlow:
    async def test_step1_upload_document(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        uploaded_document: str,
    ):
        """Uploaded document eventually reaches status='ready' with chunk_count > 0."""
        doc = await wait_for_ingestion(client, uploaded_document, user_headers)

        assert doc["status"] == "ready"
        assert isinstance(doc["chunk_count"], int)
        assert doc["chunk_count"] > 0
        assert doc["error_message"] is None

    async def test_step2_create_library(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        created_library: str,
    ):
        """Created library is retrievable and has the correct metadata."""
        response = await client.get(
            f"/v1/libraries/{created_library}", headers=user_headers
        )
        assert response.status_code == 200, response.text

        library = response.json()
        assert library["id"] == created_library
        assert library["name"] == "Integration Test Library"

    async def test_step3_add_document_to_library(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        uploaded_document: str,
        created_library: str,
    ):
        """Document can be added to a library; endpoint returns 201 with join metadata."""
        # Ensure ingestion finished before attempting to add to a library
        await wait_for_ingestion(client, uploaded_document, user_headers)

        response = await client.post(
            f"/v1/libraries/{created_library}/documents",
            json={"document_id": uploaded_document},
            headers=user_headers,
        )
        assert response.status_code == 201, response.text

        membership = response.json()
        assert membership["document_id"] == uploaded_document
        assert membership["library_id"] == created_library

    async def test_step4_document_appears_in_library(
        self,
        client: httpx.AsyncClient,
        user_headers: dict[str, str],
        uploaded_document: str,
        created_library: str,
    ):
        """
        After adding the document, GET /v1/libraries/{id}/documents lists it.
        This is the full happy-path end-to-end assertion.
        """
        await wait_for_ingestion(client, uploaded_document, user_headers)

        # Add the document (idempotent if test_step3 already ran)
        await client.post(
            f"/v1/libraries/{created_library}/documents",
            json={"document_id": uploaded_document},
            headers=user_headers,
        )

        response = await client.get(
            f"/v1/libraries/{created_library}/documents", headers=user_headers
        )
        assert response.status_code == 200, response.text

        doc_ids = [d["id"] for d in response.json()]
        assert uploaded_document in doc_ids, (
            f"Expected document {uploaded_document!r} in library {created_library!r}, "
            f"got: {doc_ids}"
        )


# ---------------------------------------------------------------------------
# Additional edge-case tests
# ---------------------------------------------------------------------------


async def test_upload_unsupported_file_type(
    client: httpx.AsyncClient,
    user_headers: dict[str, str],
):
    """Uploading an unsupported file type returns 415."""
    response = await client.post(
        "/v1/documents",
        files={"file": ("image.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        headers=user_headers,
    )
    assert response.status_code == 415


async def test_get_nonexistent_document(
    client: httpx.AsyncClient,
    user_headers: dict[str, str],
):
    """Fetching a document that doesn't exist returns 404."""
    response = await client.get(
        "/v1/documents/00000000-0000-0000-0000-deadbeef0000",
        headers=user_headers,
    )
    assert response.status_code == 404


async def test_missing_user_id_header(client: httpx.AsyncClient):
    """Requests without X-User-Id return 401."""
    response = await client.get("/v1/documents")
    assert response.status_code == 401


async def test_health_endpoint(client: httpx.AsyncClient):
    """Health check always returns 200 without auth."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
