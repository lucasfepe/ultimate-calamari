-- =============================================================================
-- API key table.
--
-- Only the SHA-256 hex-digest of each key is stored; the raw key is shown to
-- the user exactly once at creation time and never persisted.
-- owner_id intentionally has no FK to auth.users — same rationale as migration 002.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID        NOT NULL,
    name         TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    key_hash     TEXT        NOT NULL UNIQUE,    -- SHA-256 hex digest
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ             -- NULL means active
);

CREATE INDEX IF NOT EXISTS api_keys_owner_id_idx ON public.api_keys (owner_id);
-- Fast lookup on every authenticated request:
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx  ON public.api_keys (key_hash);
