-- Admin-curated exe -> game links, shared across every user.
--
-- Run this once per database: production (Supabase dashboard -> SQL Editor)
-- and/or the local stack (http://127.0.0.1:54323 -> SQL Editor).
--
-- After running it against PRODUCTION, mirror it locally the usual way:
--   npm run db:dump && npm run db:migration && npm run db:reset
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.global_exe_links (
  exe_name TEXT PRIMARY KEY,
  igdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  cover_image_url TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.global_exe_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read global exe links" ON public.global_exe_links;
CREATE POLICY "Signed-in users can read global exe links" ON public.global_exe_links
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage global exe links" ON public.global_exe_links;
CREATE POLICY "Admins manage global exe links" ON public.global_exe_links
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin));
