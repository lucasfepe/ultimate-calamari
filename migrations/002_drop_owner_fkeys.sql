-- =============================================================================
-- Drop auth.users foreign keys from owner_id columns.
-- These constraints require a real Supabase Auth user to exist before any
-- document or library can be created.  While auth is not yet implemented
-- the application accepts arbitrary UUIDs via the X-User-Id header, so the
-- FK would reject every insert.
--
-- Both constraints will be re-added (or replaced by RLS policies) once the
-- Supabase JWT auth layer is wired in.
-- =============================================================================

ALTER TABLE public.documents
    DROP CONSTRAINT IF EXISTS documents_owner_id_fkey;

ALTER TABLE public.libraries
    DROP CONSTRAINT IF EXISTS libraries_owner_id_fkey;
