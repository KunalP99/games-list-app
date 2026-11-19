-- Code review batch 4 (part 1): per-user rate limits for the routes that call
-- IGDB (code review SEC-010). Run on BOTH Supabase projects and locally.
-- Safe to re-run, and safe to run before or after deploying: the app lets
-- requests through if this isn't there yet, so the order doesn't matter.

-- One row per user, bucket (e.g. 'igdb_search') and time window, counting
-- requests. Server-only: no policies, and only the service role may call the
-- function.
create table if not exists public.rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table public.rate_limits enable row level security;

-- Counts one request and says whether it's within the limit. Counting and
-- checking happen in one statement, so requests at the same moment can't
-- both slip under. The first request of a new window clears that user's
-- older windows for the bucket, so the table stays small.
create or replace function public.take_rate_limit(p_user_id uuid, p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (user_id, bucket, window_start, hits)
  values (p_user_id, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  if v_hits = 1 then
    delete from public.rate_limits
     where user_id = p_user_id and bucket = p_bucket and window_start < v_window;
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.take_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.take_rate_limit(uuid, text, integer, integer) to service_role;

-- Verify: expect anon = false, authed = false, service = true.
select has_function_privilege('anon', 'public.take_rate_limit(uuid, text, integer, integer)', 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'public.take_rate_limit(uuid, text, integer, integer)', 'EXECUTE') as authed,
       has_function_privilege('service_role', 'public.take_rate_limit(uuid, text, integer, integer)', 'EXECUTE') as service;
