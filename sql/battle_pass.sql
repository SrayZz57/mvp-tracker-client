-- Battle pass MVP Tracker — phase 1 : fondations (voir docs/battle-pass.md).
-- À exécuter UNE FOIS dans le SQL Editor du projet Supabase, puis
-- sql/battle_pass_season_1.sql (semis de la saison, généré depuis le catalogue).
-- Rejouable : tout est `if not exists` / `create or replace`.
--
-- Principe de sécurité : les joueurs ne peuvent RIEN écrire directement dans
-- les tables du battle pass. Tout passe par des fonctions `security definer`
-- qui vérifient les règles (XP réellement gagnée, niveau atteint, possession).
--   bp_xp_events / bp_claims : lecture de ses propres lignes uniquement.
--   L'écriture des événements d'XP arrive en phase 2 (fonction award_xp).

-- ============================================================================
-- Calendrier et récompenses (semés depuis le catalogue JS)
-- ============================================================================

create table if not exists public.bp_seasons (
  id          text primary key,
  number      integer not null unique,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  max_level   integer not null check (max_level between 1 and 200),
  -- Courbe : passer du niveau L au suivant coûte level_base + level_step * (L-1).
  level_base  integer not null check (level_base > 0),
  level_step  integer not null check (level_step >= 0),
  check (ends_at > starts_at)
);

-- `track` : 'free' aujourd'hui. La colonne existe pour qu'une piste premium
-- puisse arriver plus tard sans migration lourde ; rien ne l'active encore.
create table if not exists public.bp_rewards (
  season_id  text not null references public.bp_seasons (id) on delete cascade,
  track      text not null default 'free' check (track in ('free', 'premium')),
  reward_id  text not null,
  level      integer not null check (level >= 1),
  type       text not null,
  primary key (season_id, track, reward_id)
);
-- Contrainte posée à part pour pouvoir l'élargir sur une base déjà créée.
-- currency = MVP Points de la boutique (crédités par shop_award, voir shop.sql).
alter table public.bp_rewards drop constraint if exists bp_rewards_type_check;
alter table public.bp_rewards add constraint bp_rewards_type_check check (type in
  ('weaponSkin', 'title', 'icon', 'card', 'handSkin', 'enemySkin', 'arenaVariant', 'currency'));

-- ============================================================================
-- Progression du joueur
-- ============================================================================

-- Une ligne par gain d'XP. Le niveau n'est JAMAIS stocké : il se recalcule à
-- partir de la somme, il ne peut donc pas diverger des événements.
-- Unicité (joueur, saison, source, ref) : un même défi ne rapporte qu'une fois.
create table if not exists public.bp_xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  season_id   text not null references public.bp_seasons (id),
  source      text not null,
  ref         text not null,
  xp          integer not null check (xp > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, season_id, source, ref)
);
create index if not exists bp_xp_events_user_season_idx
  on public.bp_xp_events (user_id, season_id);

-- Le `restrict` implicite de la clé étrangère est voulu : on ne peut pas
-- supprimer une récompense déjà réclamée (règle d'or du catalogue).
create table if not exists public.bp_claims (
  user_id     uuid not null references auth.users (id) on delete cascade,
  season_id   text not null,
  track       text not null default 'free',
  reward_id   text not null,
  claimed_at  timestamptz not null default now(),
  primary key (user_id, season_id, track, reward_id),
  foreign key (season_id, track, reward_id)
    references public.bp_rewards (season_id, track, reward_id)
);

-- ============================================================================
-- RLS : lecture seule côté client
-- ============================================================================

alter table public.bp_seasons enable row level security;
alter table public.bp_rewards enable row level security;
alter table public.bp_xp_events enable row level security;
alter table public.bp_claims enable row level security;

drop policy if exists "bp_seasons_read" on public.bp_seasons;
create policy "bp_seasons_read" on public.bp_seasons for select to authenticated using (true);

drop policy if exists "bp_rewards_read" on public.bp_rewards;
create policy "bp_rewards_read" on public.bp_rewards for select to authenticated using (true);

drop policy if exists "bp_xp_events_read_own" on public.bp_xp_events;
create policy "bp_xp_events_read_own" on public.bp_xp_events for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "bp_claims_read_own" on public.bp_claims;
create policy "bp_claims_read_own" on public.bp_claims for select to authenticated
  using (auth.uid() = user_id);

-- Défense en profondeur : pas de policy d'écriture = pas d'écriture, mais on
-- retire aussi les droits pour qu'un oubli futur de policy ne l'ouvre pas.
-- La lecture est accordée explicitement (les policies ci-dessus la restreignent
-- ensuite ligne par ligne) : on ne dépend pas des droits par défaut de Supabase.
revoke insert, update, delete on public.bp_seasons, public.bp_rewards,
  public.bp_xp_events, public.bp_claims from anon, authenticated;
grant select on public.bp_seasons, public.bp_rewards,
  public.bp_xp_events, public.bp_claims to authenticated;

-- ============================================================================
-- Niveaux
-- ============================================================================

-- XP cumulée pour ATTEINDRE `p_level` (le niveau 1 se possède à 0 XP).
-- Miroir exact de xpToReach() dans battlePass/levels.js.
create or replace function public.bp_xp_to_reach(p_base integer, p_step integer, p_level integer)
returns integer
language sql
immutable
as $$
  select ((p_level - 1) * p_base + (p_step * (p_level - 1) * (p_level - 2)) / 2)::integer;
$$;

-- Miroir exact de levelFromXp() dans battlePass/levels.js.
create or replace function public.bp_level_from_xp(p_season text, p_xp integer)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  s   public.bp_seasons;
  lvl integer := 1;
  xp  integer := greatest(coalesce(p_xp, 0), 0);
begin
  select * into s from public.bp_seasons where id = p_season;
  if not found then
    return null;
  end if;
  while lvl < s.max_level and public.bp_xp_to_reach(s.level_base, s.level_step, lvl + 1) <= xp loop
    lvl := lvl + 1;
  end loop;
  return lvl;
end;
$$;

-- Saison en cours selon l'horloge du SERVEUR (celle du poste est falsifiable).
create or replace function public.bp_current_season()
returns public.bp_seasons
language sql
stable
set search_path = public
as $$
  select * from public.bp_seasons where now() >= starts_at and now() < ends_at limit 1;
$$;

-- XP totale du joueur connecté sur une saison.
create or replace function public.bp_my_xp(p_season text)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(xp), 0)::integer from public.bp_xp_events
  where user_id = auth.uid() and season_id = p_season;
$$;

-- ============================================================================
-- Réclamer une récompense
-- ============================================================================

-- Renvoie true si la récompense vient d'être réclamée, false si elle l'était
-- déjà. Le niveau est recalculé ICI, depuis les événements d'XP : le client ne
-- peut pas affirmer « j'ai le niveau 50 ».
create or replace function public.bp_claim_reward(p_season text, p_reward text, p_track text default 'free')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  r        public.bp_rewards;
  total_xp integer;
  n        integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_track <> 'free' then
    raise exception 'track_unavailable' using errcode = 'P0001';
  end if;

  select * into r from public.bp_rewards
   where season_id = p_season and track = p_track and reward_id = p_reward;
  if not found then
    raise exception 'unknown_reward' using errcode = 'P0002';
  end if;

  select coalesce(sum(e.xp), 0) into total_xp from public.bp_xp_events e
   where e.user_id = uid and e.season_id = p_season;
  if public.bp_level_from_xp(p_season, total_xp) < r.level then
    raise exception 'level_too_low' using errcode = 'P0001';
  end if;

  insert into public.bp_claims (user_id, season_id, track, reward_id)
  values (uid, p_season, p_track, p_reward)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ============================================================================
-- Cosmétiques publics (titre, carte, icône) : visibles des autres joueurs
-- ============================================================================

alter table public.profiles add column if not exists title_id text;
alter table public.profiles add column if not exists card_id text;
alter table public.profiles add column if not exists icon_id text;

-- Un joueur ne peut PAS écrire ces colonnes directement (sa policy de mise à
-- jour de profil l'y autoriserait sinon) : il s'affublerait n'importe quel
-- titre. Seule la fonction bp_equip, qui s'exécute avec les droits de son
-- propriétaire, peut les modifier. Pour un client (rôles anon/authenticated),
-- toute valeur envoyée est écartée en silence ; le tableau de bord et
-- service_role, eux, ne sont pas concernés.
create or replace function public.bp_guard_profile_cosmetics()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.title_id := null;
      new.card_id := null;
      new.icon_id := null;
    else
      new.title_id := old.title_id;
      new.card_id := old.card_id;
      new.icon_id := old.icon_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bp_guard_profile_cosmetics on public.profiles;
create trigger bp_guard_profile_cosmetics
  before insert or update on public.profiles
  for each row execute function public.bp_guard_profile_cosmetics();

-- Équipe (ou retire, avec p_reward = null) un titre / une carte / une icône.
-- Exige d'avoir réclamé cette récompense, et du bon type.
create or replace function public.bp_equip(p_kind text, p_reward text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_kind not in ('title', 'card', 'icon') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  if p_reward is not null and not exists (
    select 1
      from public.bp_claims c
      join public.bp_rewards r
        on r.season_id = c.season_id and r.track = c.track and r.reward_id = c.reward_id
     where c.user_id = uid and c.reward_id = p_reward and r.type = p_kind
  ) then
    raise exception 'not_owned' using errcode = 'P0001';
  end if;

  update public.profiles set
    title_id = case when p_kind = 'title' then p_reward else title_id end,
    card_id  = case when p_kind = 'card'  then p_reward else card_id  end,
    icon_id  = case when p_kind = 'icon'  then p_reward else icon_id  end
   where id = uid;
end;
$$;

-- ============================================================================
-- Droits d'exécution : connectés uniquement (Supabase ouvre tout par défaut)
-- ============================================================================

revoke all on function public.bp_claim_reward(text, text, text) from public, anon;
revoke all on function public.bp_equip(text, text) from public, anon;
revoke all on function public.bp_my_xp(text) from public, anon;
revoke all on function public.bp_current_season() from public, anon;
grant execute on function public.bp_claim_reward(text, text, text) to authenticated;
grant execute on function public.bp_equip(text, text) to authenticated;
grant execute on function public.bp_my_xp(text) to authenticated;
grant execute on function public.bp_current_season() to authenticated;
