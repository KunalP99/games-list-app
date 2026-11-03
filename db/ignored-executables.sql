-- Per-user "never track this program" list, the escape hatch for a wrong
-- identification (a launcher misidentified as an unrelated game, say).
--
-- Run this once per database: production (Supabase dashboard -> SQL Editor)
-- and/or the local stack (http://127.0.0.1:54323 -> SQL Editor).
--
-- After running it against PRODUCTION, mirror it locally the usual way:
--   npm run db:dump && npm run db:migration && npm run db:reset
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.ignored_executables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exe_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exe_name)
);
ALTER TABLE public.ignored_executables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own ignored exes" ON public.ignored_executables;
CREATE POLICY "Users manage own ignored exes" ON public.ignored_executables
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
