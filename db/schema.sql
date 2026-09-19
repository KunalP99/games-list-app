--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: ticket_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_reason AS ENUM (
    'game_completed_short',
    'game_completed_medium',
    'game_completed_long',
    'game_completed_bonus_hours',
    'achievement_100_percent',
    'sequel_back_to_back',
    'series_back_to_back',
    'turn_skipped',
    'objective_completed',
    'spin',
    'spin_reroll',
    'choose_game',
    'choose_other_player_game',
    'assigned_game_incomplete',
    'objective_incomplete',
    'admin_adjustment'
);


--
-- Name: award_tickets(uuid, integer, public.ticket_reason, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_tickets(p_user_id uuid, p_amount integer, p_reason public.ticket_reason, p_game_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_balance_before INTEGER;
  v_wheel_turn     TEXT;
BEGIN
  SELECT ticket_balance, wheel_turn INTO v_balance_before, v_wheel_turn
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  UPDATE public.profiles
  SET
    ticket_balance       = ticket_balance + p_amount,
    tickets_earned_total = tickets_earned_total + GREATEST(p_amount, 0),
    updated_at           = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.ticket_transactions
    (user_id, amount, reason, game_id, wheel_turn_at_time, balance_before, balance_after, note)
  VALUES
    (p_user_id, p_amount, p_reason, p_game_id, v_wheel_turn,
     v_balance_before, v_balance_before + p_amount, p_note);
END;
$$;


--
-- Name: award_xp(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_xp(p_user_id uuid, p_amount integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.profiles SET xp = xp + p_amount WHERE id = p_user_id;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end; $$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end; $$;


--
-- Name: reverse_game_completion_tickets(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reverse_game_completion_tickets(p_user_id uuid, p_game_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM ticket_transactions
  WHERE user_id = p_user_id
    AND game_id = p_game_id;

  DELETE FROM ticket_transactions
  WHERE user_id = p_user_id
    AND game_id = p_game_id;

  UPDATE profiles
  SET ticket_balance = ticket_balance - v_total
  WHERE id = p_user_id;
END;
$$;


--
-- Name: reverse_game_dnf_tickets(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reverse_game_dnf_tickets(p_user_id uuid, p_game_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE v_sum integer;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.ticket_transactions
  WHERE user_id = p_user_id AND game_id = p_game_id AND reason = 'assigned_game_incomplete';

  IF v_sum <> 0 THEN
    DELETE FROM public.ticket_transactions
    WHERE user_id = p_user_id AND game_id = p_game_id AND reason = 'assigned_game_incomplete';
    UPDATE public.profiles SET ticket_balance = ticket_balance - v_sum WHERE id = p_user_id;
  END IF;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: changelog_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.changelog_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    released_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.games (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    developer text,
    status text DEFAULT 'backlog'::text NOT NULL,
    hours_played numeric(6,1),
    completion_date date,
    rating numeric,
    achievement_progress numeric(5,2),
    review text,
    notes text,
    assigned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    release_date date,
    image_url text,
    is_favourite boolean DEFAULT false NOT NULL,
    is_replay boolean DEFAULT false NOT NULL,
    platform text,
    is_sequel boolean DEFAULT false NOT NULL,
    rawg_id integer,
    description text,
    genres text[],
    release_date_precision text DEFAULT 'full'::text NOT NULL,
    completion_date_precision text DEFAULT 'full'::text NOT NULL,
    dominant_color text,
    youtube_playlist_url text,
    dlc jsonb DEFAULT '[]'::jsonb NOT NULL,
    start_date date,
    notes_public boolean DEFAULT false NOT NULL,
    youtube_videos jsonb,
    igdb_id integer,
    cover_image_url text,
    artwork_url text,
    youtube_item_count integer,
    release_notified boolean DEFAULT false NOT NULL,
    steam_deck boolean DEFAULT false NOT NULL,
    is_emulated boolean DEFAULT false NOT NULL,
    CONSTRAINT games_achievement_progress_check CHECK (((achievement_progress >= (0)::numeric) AND (achievement_progress <= (100)::numeric))),
    CONSTRAINT games_completion_date_precision_check CHECK ((completion_date_precision = ANY (ARRAY['full'::text, 'year'::text]))),
    CONSTRAINT games_hours_played_check CHECK ((hours_played >= (0)::numeric)),
    CONSTRAINT games_rating_check CHECK (((rating >= (1)::numeric) AND (rating <= (10)::numeric))),
    CONSTRAINT games_release_date_precision_check CHECK ((release_date_precision = ANY (ARRAY['full'::text, 'year'::text]))),
    CONSTRAINT games_status_check CHECK ((status = ANY (ARRAY['playing'::text, 'completed'::text, 'backlog'::text, 'dnf'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    game_id uuid,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notified_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notified_events (
    event_id bigint NOT NULL,
    notified_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: playlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlists (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    youtube_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    youtube_item_count integer,
    synced_at timestamp with time zone
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    display_name text,
    ticket_balance integer DEFAULT 0 NOT NULL,
    wheel_turn text DEFAULT 'spin'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    theme_preference text DEFAULT 'system'::text NOT NULL,
    accent_colour text,
    is_admin boolean DEFAULT false NOT NULL,
    pending_wheel_game_id uuid,
    pending_wheel_turn text,
    tickets_earned_total integer DEFAULT 0 NOT NULL,
    wheel_session jsonb,
    wheel_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT profiles_pending_wheel_turn_check CHECK ((pending_wheel_turn = ANY (ARRAY['spin'::text, 'spin_reroll'::text, 'choose'::text]))),
    CONSTRAINT profiles_theme_preference_check CHECK ((theme_preference = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text]))),
    CONSTRAINT profiles_wheel_turn_check CHECK ((wheel_turn = ANY (ARRAY['spin'::text, 'spin_reroll'::text, 'choose'::text])))
);


--
-- Name: ticket_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_transactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    amount integer NOT NULL,
    reason public.ticket_reason NOT NULL,
    game_id uuid,
    wheel_turn_at_time text,
    balance_before integer NOT NULL,
    balance_after integer NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_transactions_wheel_turn_at_time_check CHECK ((wheel_turn_at_time = ANY (ARRAY['spin'::text, 'spin_reroll'::text, 'choose'::text])))
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    achievement_id text NOT NULL,
    unlocked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    url text NOT NULL,
    kind text NOT NULL,
    youtube_id text NOT NULL,
    title text NOT NULL,
    author_name text,
    thumbnail_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    playlist_id uuid,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT videos_kind_check CHECK ((kind = ANY (ARRAY['video'::text, 'playlist'::text])))
);


--
-- Name: wheel_spins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wheel_spins (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    spin_type text NOT NULL,
    spin_mode text,
    result_name text,
    option_a_name text,
    option_b_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    games_list text[],
    tickets_spent integer,
    finalized_via text,
    ticket_spends jsonb,
    CONSTRAINT wheel_spins_finalized_via_check CHECK ((finalized_via = ANY (ARRAY['accept'::text, 'spin_again'::text, 'reroll_choice'::text, 'upgrade_choice'::text, 'choose_any'::text, 'choose'::text, 'skip'::text]))),
    CONSTRAINT wheel_spins_spin_mode_check CHECK ((spin_mode = ANY (ARRAY['elimination'::text, 'first_land'::text]))),
    CONSTRAINT wheel_spins_spin_type_check CHECK ((spin_type = ANY (ARRAY['spin'::text, 'spin_reroll'::text, 'choose'::text, 'choose_skip'::text])))
);


--
-- Name: changelog_entries changelog_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.changelog_entries
    ADD CONSTRAINT changelog_entries_pkey PRIMARY KEY (id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: notified_events notified_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notified_events
    ADD CONSTRAINT notified_events_pkey PRIMARY KEY (event_id);


--
-- Name: playlists playlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: ticket_transactions ticket_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transactions
    ADD CONSTRAINT ticket_transactions_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_user_id_achievement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_achievement_id_key UNIQUE (user_id, achievement_id);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);


--
-- Name: wheel_spins wheel_spins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wheel_spins
    ADD CONSTRAINT wheel_spins_pkey PRIMARY KEY (id);


--
-- Name: games_user_completion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX games_user_completion_idx ON public.games USING btree (user_id, completion_date DESC);


--
-- Name: games_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX games_user_status_idx ON public.games USING btree (user_id, status);


--
-- Name: games_user_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX games_user_updated_idx ON public.games USING btree (user_id, updated_at DESC);


--
-- Name: idx_games_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_games_user_id ON public.games USING btree (user_id);


--
-- Name: idx_tickets_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_created_at ON public.ticket_transactions USING btree (created_at DESC);


--
-- Name: idx_tickets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_user_id ON public.ticket_transactions USING btree (user_id);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: profiles_username_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_username_idx ON public.profiles USING btree (username);


--
-- Name: ticket_tx_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_tx_user_created_idx ON public.ticket_transactions USING btree (user_id, created_at DESC);


--
-- Name: wheel_spins_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wheel_spins_user_created_idx ON public.wheel_spins USING btree (user_id, created_at DESC);


--
-- Name: games trg_games_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_games_updated_at BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: games games_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: games games_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: playlists playlists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ticket_transactions ticket_transactions_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transactions
    ADD CONSTRAINT ticket_transactions_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE SET NULL;


--
-- Name: ticket_transactions ticket_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transactions
    ADD CONSTRAINT ticket_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: videos videos_playlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id) ON DELETE CASCADE;


--
-- Name: videos videos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: wheel_spins wheel_spins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wheel_spins
    ADD CONSTRAINT wheel_spins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: playlists Admins manage playlists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage playlists" ON public.playlists USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND p.is_admin)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND p.is_admin))));


--
-- Name: videos Admins manage videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage videos" ON public.videos USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND p.is_admin)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND p.is_admin))));


--
-- Name: changelog_entries Anyone authenticated can read changelog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can read changelog" ON public.changelog_entries FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: playlists Signed-in users can view playlists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Signed-in users can view playlists" ON public.playlists FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: videos Signed-in users can view videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Signed-in users can view videos" ON public.videos FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: wheel_spins Users can read all wheel spins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read all wheel spins" ON public.wheel_spins FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: user_achievements Users manage own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own achievements" ON public.user_achievements USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications Users manage own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own notifications" ON public.notifications USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: wheel_spins Users manage own wheel spins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own wheel spins" ON public.wheel_spins USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: changelog_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: games; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

--
-- Name: games games_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY games_delete_own ON public.games FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: games games_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY games_insert_own ON public.games FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: games games_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY games_select_all ON public.games FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: games games_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY games_update_own ON public.games FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notified_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notified_events ENABLE ROW LEVEL SECURITY;

--
-- Name: playlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: ticket_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_transactions tickets_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_insert_own ON public.ticket_transactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: ticket_transactions tickets_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_select_all ON public.ticket_transactions FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: user_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: user_achievements users_read_all_achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_all_achievements ON public.user_achievements FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

--
-- Name: wheel_spins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wheel_spins ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



--
-- Triggers on auth.users (outside the dumped schema, added by scripts/dump-schema.mjs).
-- Required: without this the signup trigger never fires, new users get no
-- profile row, and AppLayout signs them straight back out.
--

CREATE TRIGGER trg_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
