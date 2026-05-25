-- =============================================================================
-- RAG-as-a-Service — initial Supabase Postgres schema
-- Run this in the Supabase SQL editor or via supabase db push.
-- =============================================================================

-- Enable UUID generation (available by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.documents (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         UUID        NOT NULL
                                 REFERENCES auth.users(id) ON DELETE CASCADE,
    filename         TEXT        NOT NULL,
    file_path        TEXT        NOT NULL,          -- Supabase Storage path
    content_type     TEXT        NOT NULL,
    file_size_bytes  BIGINT,
    status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    chunk_count      INTEGER,
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_owner_id_idx   ON public.documents (owner_id);
CREATE INDEX IF NOT EXISTS documents_status_idx     ON public.documents (status);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- libraries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.libraries (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL
                            REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS libraries_owner_id_idx ON public.libraries (owner_id);

DROP TRIGGER IF EXISTS libraries_updated_at ON public.libraries;
CREATE TRIGGER libraries_updated_at
    BEFORE UPDATE ON public.libraries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- document_library  (join table — many-to-many)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_library (
    document_id  UUID        NOT NULL
                             REFERENCES public.documents(id) ON DELETE CASCADE,
    library_id   UUID        NOT NULL
                             REFERENCES public.libraries(id)  ON DELETE CASCADE,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_id, library_id)
);

CREATE INDEX IF NOT EXISTS dl_library_id_idx  ON public.document_library (library_id);
CREATE INDEX IF NOT EXISTS dl_document_id_idx ON public.document_library (document_id);


-- ---------------------------------------------------------------------------
-- usage_logs  (populated by the query pipeline — created here for schema completeness)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usage_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id    UUID        REFERENCES public.libraries(id) ON DELETE SET NULL,
    api_key_hash  TEXT        NOT NULL,               -- hashed caller key
    query_text    TEXT        NOT NULL,
    chunk_count   INTEGER     NOT NULL DEFAULT 0,     -- chunks sent to LLM
    tokens_used   INTEGER,                            -- from Anthropic response (input + output)
    latency_ms    INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_logs_api_key_hash_idx ON public.usage_logs (api_key_hash);
CREATE INDEX IF NOT EXISTS usage_logs_library_id_idx   ON public.usage_logs (library_id);


-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Recommended: enable RLS and add policies once Supabase Auth is integrated.
-- The service-role key used by the backend bypasses RLS entirely.
-- ---------------------------------------------------------------------------

-- ALTER TABLE public.documents      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.libraries       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.document_library ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.usage_logs      ENABLE ROW LEVEL SECURITY;
