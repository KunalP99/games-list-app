-- Admin-curated / bulk-imported exe -> game links, shared across every user.
--
-- Run this once per database: production (Supabase dashboard -> SQL Editor)
-- and/or the local stack (http://127.0.0.1:54323 -> SQL Editor).
--
-- After running it against PRODUCTION, mirror it locally the usual way:
--   npm run db:dump && npm run db:migration && npm run db:reset
--
-- Safe to re-run, including against a database that still has the original
-- exe_name-primary-key version of this table.

CREATE TABLE IF NOT EXISTS public.global_exe_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exe_name TEXT NOT NULL,
  -- Lowercase install-folder substring, for disambiguating an exe name used
  -- by more than one title (e.g. a launcher's own exe vs. an unrelated game
  -- that happens to share the name). '' means "no hint" — the common case.
  folder_hint TEXT NOT NULL DEFAULT '',
  -- Nullable: a bulk-imported row starts without one and gets it resolved
  -- (and cached here) the first time any agent actually looks it up.
  igdb_id INTEGER,
  title TEXT NOT NULL,
  cover_image_url TEXT,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'import')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate a table created before id/folder_hint/source existed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'global_exe_links'
      AND constraint_type = 'PRIMARY KEY' AND constraint_name = 'global_exe_links_pkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'global_exe_links' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.global_exe_links ADD COLUMN id UUID DEFAULT gen_random_uuid();
    UPDATE public.global_exe_links SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.global_exe_links ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.global_exe_links DROP CONSTRAINT global_exe_links_pkey;
    ALTER TABLE public.global_exe_links ADD PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE public.global_exe_links ADD COLUMN IF NOT EXISTS folder_hint TEXT NOT NULL DEFAULT '';
ALTER TABLE public.global_exe_links ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'import'));
ALTER TABLE public.global_exe_links ALTER COLUMN igdb_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS global_exe_links_exe_folder_idx
  ON public.global_exe_links (exe_name, folder_hint);
CREATE INDEX IF NOT EXISTS global_exe_links_exe_idx ON public.global_exe_links (exe_name);

ALTER TABLE public.global_exe_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read global exe links" ON public.global_exe_links;
CREATE POLICY "Signed-in users can read global exe links" ON public.global_exe_links
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage global exe links" ON public.global_exe_links;
CREATE POLICY "Admins manage global exe links" ON public.global_exe_links
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin));
