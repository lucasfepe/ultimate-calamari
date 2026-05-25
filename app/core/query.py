"""
RAG query pipeline: embed → search → rerank → generate.

Called directly from the query route handler (not a background task, because
the caller waits for the answer synchronously).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import anthropic
import cohere
from qdrant_client import AsyncQdrantClient

from app.config import Settings
from app.core.embedding import embed_texts
from app.db import qdrant as qdrant_db
from app.models.schemas import SourceChunk

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a precise, helpful assistant. Answer the user's question using ONLY \
the context provided below. Cite the source filename when it adds clarity. \
If the provided context does not contain enough information to answer, say so \
clearly rather than guessing.\
"""


@dataclass
class RagResult:
    answer: str
    sources: list[SourceChunk]
    tokens_used: int


async def run_rag_query(
    *,
    prompt: str,
    document_ids: list[str],
    top_k: int,
    top_n: int,
    cohere_client: cohere.AsyncClientV2,
    qdrant: AsyncQdrantClient,
    anthropic_client: anthropic.AsyncAnthropic,
    settings: Settings,
) -> RagResult:
    """
    Full RAG pipeline for a single user prompt scoped to a set of document IDs.

    Steps:
        1. Embed the prompt with Cohere (input_type=search_query)
        2. Search Qdrant filtered by document_ids
        3. Rerank candidates with Cohere Rerank
        4. Build a context block from the top-n chunks
        5. Call Claude with [system + context + prompt]
        6. Return the answer, source metadata, and token counts
    """

    # ── 1. Embed query ────────────────────────────────────────────────────────
    logger.info("Embedding query for %d document(s)", len(document_ids))
    vectors = await embed_texts(cohere_client, [prompt], input_type="search_query")
    query_vector = vectors[0]

    # ── 2. Vector search ──────────────────────────────────────────────────────
    logger.info("Searching Qdrant (top_k=%d)", top_k)
    hits = await qdrant_db.search_by_document_ids(
        qdrant, query_vector, document_ids, top_k=top_k
    )

    if not hits:
        return RagResult(
            answer="The library contains no indexed content relevant to your query.",
            sources=[],
            tokens_used=0,
        )

    # ── 3. Rerank ─────────────────────────────────────────────────────────────
    effective_top_n = min(top_n, len(hits))
    logger.info("Reranking %d hits → top %d with Cohere", len(hits), effective_top_n)

    rerank_response = await cohere_client.rerank(
        model=settings.cohere_rerank_model,
        query=prompt,
        documents=[h["text"] for h in hits],
        top_n=effective_top_n,
    )

    reranked: list[dict] = [
        {**hits[r.index], "relevance_score": r.relevance_score}
        for r in rerank_response.results
    ]

    sources = [
        SourceChunk(
            document_id=c["document_id"],
            filename=c["filename"],
            chunk_index=c["chunk_index"],
            text=c["text"],
            relevance_score=c["relevance_score"],
        )
        for c in reranked
    ]

    # ── 4. Build context ──────────────────────────────────────────────────────
    context_blocks = [
        f"[{c.filename} · chunk {c.chunk_index}]\n{c.text}" for c in sources
    ]
    context = "\n\n---\n\n".join(context_blocks)

    # ── 5. Generate with Claude ───────────────────────────────────────────────
    logger.info("Calling Claude (%s)", settings.anthropic_model)
    user_message = f"Context:\n{context}\n\nQuestion: {prompt}"

    message = await anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    answer = message.content[0].text
    tokens_used = message.usage.input_tokens + message.usage.output_tokens

    logger.info("Query complete — %d tokens used", tokens_used)
    return RagResult(answer=answer, sources=sources, tokens_used=tokens_used)
