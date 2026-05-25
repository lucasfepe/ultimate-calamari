-- =============================================================================
-- Restore owner_id foreign keys now that Supabase Auth is active.
-- Run this after migration 002 and after confirming that all owner_id values
-- in documents and libraries correspond to real auth.users rows.
-- =============================================================================

ALTER TABLE public.documents
    ADD CONSTRAINT documents_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.libraries
    ADD CONSTRAINT libraries_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
