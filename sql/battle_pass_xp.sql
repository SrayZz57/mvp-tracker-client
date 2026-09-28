-- Battle pass MVP Tracker — phase 2 : moteur d'XP et de défis (docs/battle-pass.md).
-- À exécuter APRÈS sql/battle_pass.sql, puis sql/battle_pass_mode_caps.sql et
-- sql/battle_pass_season_1.sql. Rejouable.
--
-- Principe : le client n'envoie JAMAIS de quantité d'XP. Il appelle
-- bp_award_xp() ; le serveur relit les scores du joueur, écarte ceux qui sont
-- impossibles, et calcule lui-même ce qu'il a gagné.
--
-- Ce que ça protège, et ce que ça ne protège pas :
--  - protège : s'octroyer de l'XP à volonté, antidater des scores pour
--    contourner le plafond quotidien, gonfler un score au-delà du plausible.
--  - ne protège pas : un score plausible mais faux (les scores sont écrits par
--    l'application). Le plafond quotidien borne ce qu'un tricheur en tire à ce
--    que gagnerait un joueur très assidu.

-- ============================================================================
-- Règles de la saison (semées depuis xpRules.js)
-- ============================================================================

alter table public.bp_seasons
  add column if not exists session_xp integer not null default 20 check (session_xp >= 0),
  add column if not exists session_daily_cap integer not null default 300 check (session_daily_cap >= 0),
  add column if not exists min_duration integer not null default 30 check (min_duration >= 0),
  add column if not exists min_hits integer not null default 10 check (min_hits >= 0);

-- Plafond de score plausible par mode. Un mode absent = aucune XP.
create table if not exists public.bp_mode_caps (
  mode       text primary key,
  max_score  integer not null check (max_score > 0)
);

-- Défis datés, générés depuis challenges.js (le tirage n'est fait qu'une fois,
-- côté JS ; le serveur ne fait qu'évaluer).
create table if not exists public.bp_challenges (
  season_id  text not null references public.bp_seasons (id) on delete cascade,
  id         text not null,
  period     text not null check (period in ('daily', 'weekly', 'season')),
  tier       text not null check (tier in ('easy', 'medium', 'hard', 'season')),
  metric     text not null check (metric in
               ('sessions', 'distinctModes', 'distinctDays', 'dailyChallenge', 'bestScore', 'accuracy')),
  mode       text,
  target     integer not null check (target > 0),
  min_hits   integer,
  xp         integer not null check (xp > 0),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  primary key (season_id, id),
  check (ends_at > starts_at),
  check ((metric = 'bestScore') = (mode is not null))
);
create index if not exists bp_challenges_active_idx on public.bp_challenges (season_id, starts_at, ends_at);

alter table public.bp_mode_caps enable row level security;
alter table public.bp_challenges enable row level security;
drop policy if exists "bp_mode_caps_read" on public.bp_mode_caps;
create policy "bp_mode_caps_read" on public.bp_mode_caps for select to authenticated using (true);
drop policy if exists "bp_challenges_read" on public.bp_challenges;
create policy "bp_challenges_read" on public.bp_challenges for select to authenticated using (true);
revoke insert, update, delete on public.bp_mode_caps, public.bp_challenges from anon, authenticated;
grant select on public.bp_mode_caps, public.bp_challenges to authenticated;

-- ============================================================================
-- Scores : heure du serveur, et un index pour les requêtes par joueur
-- ============================================================================

-- L'application n'envoie pas created_at (voir saveScore) : forcer l'heure du
-- serveur pour un client ne change rien au fonctionnement normal, et empêche
-- d'antidater des lignes pour toucher plusieurs plafonds quotidiens d'un coup.
create or replace function public.bp_force_score_time()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bp_force_score_time on public.aim_trainer_scores;
create trigger bp_force_score_time
  before insert or update on public.aim_trainer_scores
  for each row execute function public.bp_force_score_time();

create index if not exists aim_trainer_scores_user_created_idx
  on public.aim_trainer_scores (user_id, created_at desc);

-- ============================================================================
-- Scores plausibles d'un joueur sur une période
-- ============================================================================

-- Interne (droits retirés plus bas). Une session compte si : la période et la
-- saison la couvrent, son mode a un plafond, son score ne le dépasse pas, et
-- elle atteint la durée et le nombre de touches minimaux de la saison.
create or replace function public.bp_valid_scores(p_user uuid, p_season text, p_from timestamptz, p_to timestamptz)
returns setof public.aim_trainer_scores
language sql
stable
security definer
set search_path = public
as $$
  select s.*
    from public.aim_trainer_scores s
    join public.bp_seasons z on z.id = p_season
    join public.bp_mode_caps c on c.mode = s.mode
   where s.user_id = p_user
     and s.created_at >= greatest(p_from, z.starts_at)
     and s.created_at <  least(p_to, z.ends_at)
     and s.duration >= z.min_duration
     and s.hits >= z.min_hits
     and s.score between 0 and c.max_score;
$$;

-- Valeur d'un défi pour un joueur. La précision est RECALCULÉE depuis les
-- touches et les ratés, pas lue dans la colonne accuracy (qu'un client remplit
-- comme il veut).
create or replace function public.bp_challenge_value(p_user uuid, c public.bp_challenges)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  val numeric;
begin
  select case c.metric
           when 'sessions' then count(*)
           when 'distinctModes' then count(distinct s.mode) filter (where s.mode <> 'custom')
           when 'distinctDays' then count(distinct ((s.created_at at time zone 'UTC')::date))
           when 'dailyChallenge' then count(*) filter (where s.challenge_date is not null)
           when 'bestScore' then max(s.score) filter (where s.mode = c.mode)
           when 'accuracy' then max(s.hits * 100.0 / nullif(s.hits + coalesce(s.misses, 0), 0))
                                  filter (where s.hits >= coalesce(c.min_hits, 0))
         end
    into val
    from public.bp_valid_scores(p_user, c.season_id, c.starts_at, c.ends_at) s;
  return coalesce(val, 0);
end;
$$;

-- ============================================================================
-- Défis en cours, avec la progression du joueur connecté
-- ============================================================================

create or replace function public.bp_my_challenges(p_season text default null)
returns table (
  id text, period text, tier text, metric text, mode text, target integer, xp integer,
  starts_at timestamptz, ends_at timestamptz, value numeric, completed boolean, awarded boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sid text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  sid := coalesce(p_season, (public.bp_current_season()).id);

  return query
  select c.id, c.period, c.tier, c.metric, c.mode, c.target, c.xp, c.starts_at, c.ends_at,
         v.val, v.val >= c.target,
         exists (select 1 from public.bp_xp_events e
                  where e.user_id = uid and e.season_id = c.season_id
                    and e.source = c.period and e.ref = c.id)
    from public.bp_challenges c
   cross join lateral (select public.bp_challenge_value(uid, c) as val) v
   where c.season_id = sid and now() >= c.starts_at and now() < c.ends_at
   order by case c.period when 'daily' then 1 when 'weekly' then 2 else 3 end,
            case c.tier when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 4 end,
            c.id;
end;
$$;

-- ============================================================================
-- Attribuer l'XP
-- ============================================================================

-- À appeler après chaque score enregistré, et à l'ouverture de l'écran du pass.
-- Idempotent : rappeler ne rapporte rien de plus (unicité des événements).
-- Renvoie ce qui vient d'être gagné.
--
-- Sessions : seules celles des dernières 36 h sont éligibles (un appel manqué
-- ne perd pas la journée), et le plafond se compte par jour UTC d'attribution.
-- Défis : ceux en cours, plus ceux terminés depuis moins de 24 h.
create or replace function public.bp_award_xp(p_season text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  z            public.bp_seasons;
  c            public.bp_challenges;
  r            record;
  day_start    timestamptz := (date_trunc('day', now() at time zone 'UTC')) at time zone 'UTC';
  day_used     integer;
  amount       integer;
  before_xp    integer;
  after_xp     integer;
  session_xp   integer := 0;
  session_n    integer := 0;
  challenge_xp integer := 0;
  awarded      jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into z from public.bp_seasons
   where id = coalesce(p_season, (public.bp_current_season()).id);
  if not found or now() < z.starts_at or now() >= z.ends_at then
    return jsonb_build_object('status', 'no_season');
  end if;

  -- Deux appels simultanés du même joueur ne doivent pas dépasser le plafond.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select coalesce(sum(xp), 0) into before_xp from public.bp_xp_events
   where user_id = uid and season_id = z.id;

  -- Sessions
  select coalesce(sum(xp), 0) into day_used from public.bp_xp_events
   where user_id = uid and season_id = z.id and source = 'session' and created_at >= day_start;

  for r in
    select s.id, s.created_at
      from public.bp_valid_scores(uid, z.id, now() - interval '36 hours', now() + interval '1 minute') s
     where not exists (select 1 from public.bp_xp_events e
                        where e.user_id = uid and e.season_id = z.id
                          and e.source = 'session' and e.ref = s.id::text)
     order by s.created_at
  loop
    amount := least(z.session_xp, z.session_daily_cap - day_used);
    exit when amount <= 0;
    insert into public.bp_xp_events (user_id, season_id, source, ref, xp)
    values (uid, z.id, 'session', r.id::text, amount)
    on conflict do nothing;
    if found then
      day_used := day_used + amount;
      session_xp := session_xp + amount;
      session_n := session_n + 1;
    end if;
  end loop;

  -- Défis
  for c in
    select ch.* from public.bp_challenges ch
     where ch.season_id = z.id
       and ch.starts_at <= now()
       and ch.ends_at > now() - interval '24 hours'
       and not exists (select 1 from public.bp_xp_events e
                        where e.user_id = uid and e.season_id = z.id
                          and e.source = ch.period and e.ref = ch.id)
  loop
    if public.bp_challenge_value(uid, c) >= c.target then
      insert into public.bp_xp_events (user_id, season_id, source, ref, xp)
      values (uid, z.id, c.period, c.id, c.xp)
      on conflict do nothing;
      if found then
        challenge_xp := challenge_xp + c.xp;
        awarded := awarded || jsonb_build_object('id', c.id, 'period', c.period, 'metric', c.metric, 'xp', c.xp);
      end if;
    end if;
  end loop;

  select coalesce(sum(xp), 0) into after_xp from public.bp_xp_events
   where user_id = uid and season_id = z.id;

  return jsonb_build_object(
    'status', 'ok',
    'season', z.id,
    'xp_gained', after_xp - before_xp,
    'session_xp', session_xp,
    'sessions_awarded', session_n,
    'challenge_xp', challenge_xp,
    'challenges', awarded,
    'total_xp', after_xp,
    'level_before', public.bp_level_from_xp(z.id, before_xp),
    'level_after', public.bp_level_from_xp(z.id, after_xp)
  );
end;
$$;

-- ============================================================================
-- Droits : les fonctions internes ne sont pas appelables par un client
-- ============================================================================

revoke all on function public.bp_valid_scores(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.bp_challenge_value(uuid, public.bp_challenges) from public, anon, authenticated;
revoke all on function public.bp_my_challenges(text) from public, anon;
revoke all on function public.bp_award_xp(text) from public, anon;
grant execute on function public.bp_my_challenges(text) to authenticated;
grant execute on function public.bp_award_xp(text) to authenticated;
