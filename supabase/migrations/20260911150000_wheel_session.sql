-- Resumable wheel turns.
--
-- Holds the in-progress turn (entry list, spin mode, elimination progress, a
-- result awaiting acceptance, and what the turn has already cost in tickets) so
-- closing the tab doesn't lose it. NULL means no turn is underway; advanceTurn
-- clears it on every finalize.
--
-- Shape is `WheelSession` in lib/wheel-session.ts, versioned via its `v` field;
-- anything unrecognised is discarded by restoreSession rather than trusted.
--
-- This lives in its own migration rather than in *_init_schema.sql because that
-- file is regenerated wholesale from production by `npm run db:migration`, and
-- production won't have this column until the ALTER below is run there by hand.
-- Once it has, a regenerated init schema will include it and this becomes a
-- harmless no-op.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wheel_session JSONB;
