"""
Pydantic models used as request bodies, response bodies, and internal DTOs.
All IDs are UUIDs; timestamps are ISO-8601 strings as returned by Supabase.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class DocumentStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    failed = "failed"


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------


class DocumentBase(BaseModel):
    filename: str
    content_type: str
    file_size_bytes: Optional[int] = None


class DocumentCreate(DocumentBase):
    owner_id: UUID
    file_path: str


class DocumentRow(DocumentBase):
    id: UUID
    owner_id: UUID
    file_path: str
    status: DocumentStatus
    chunk_count: Optional[int] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str
    file_size_bytes: Optional[int]
    status: DocumentStatus
    chunk_count: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Library
# ---------------------------------------------------------------------------


class LibraryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None


class LibraryRow(LibraryCreate):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LibraryResponse(LibraryRow):
    pass


# ---------------------------------------------------------------------------
# Document ↔ Library membership
# ---------------------------------------------------------------------------


class DocumentLibraryAdd(BaseModel):
    document_id: UUID


class DocumentLibraryRow(BaseModel):
    document_id: UUID
    library_id: UUID
    added_at: datetime


# ---------------------------------------------------------------------------
# Ingestion internals
# ---------------------------------------------------------------------------


class TextChunk(BaseModel):
    """A single chunk produced by the chunker, before embedding."""

    text: str
    chunk_index: int
    char_start: int
    char_end: int


class EmbeddedChunk(TextChunk):
    """A chunk with its Cohere embedding attached."""

    vector: list[float]
    document_id: UUID
    owner_id: UUID
    filename: str


# ---------------------------------------------------------------------------
# RAG query
# ---------------------------------------------------------------------------


class QueryRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    top_k: int = Field(default=20, ge=1, le=100, description="Qdrant candidates before reranking")
    top_n: int = Field(default=5, ge=1, le=20, description="Chunks sent to the LLM after reranking")


class SourceChunk(BaseModel):
    document_id: str
    filename: str
    chunk_index: int
    text: str
    relevance_score: float


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
    tokens_used: int
    latency_ms: int


# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Human-readable label")


class ApiKeyCreatedResponse(BaseModel):
    """Returned once on creation. raw_key is never stored and cannot be retrieved again."""

    id: UUID
    name: str
    raw_key: str
    created_at: datetime


class ApiKeyResponse(BaseModel):
    """Safe representation — never includes the raw key or its hash."""

    id: UUID
    name: str
    created_at: datetime
    last_used_at: Optional[datetime]
    revoked_at: Optional[datetime]
    is_active: bool
