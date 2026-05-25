from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    supabase_url: str
    supabase_service_role_key: str
    supabase_storage_bucket: str = "documents"

    # Qdrant Cloud
    qdrant_url: str
    qdrant_api_key: str
    qdrant_collection: str = "rag_chunks"

    # Cohere
    cohere_api_key: str
    cohere_embed_model: str = "embed-english-v3.0"
    cohere_embed_dimensions: int = 1024
    cohere_rerank_model: str = "rerank-english-v3.0"

    # Anthropic (wired in later for the query pipeline)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Chunking
    chunk_size: int = 1000
    chunk_overlap: int = 200


@lru_cache
def get_settings() -> Settings:
    return Settings()
