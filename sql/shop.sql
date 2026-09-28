-- Boutique de l'Aim Trainer et monnaie du jeu (les « MVP Points »).
-- À exécuter APRÈS sql/battle_pass.sql et sql/battle_pass_xp.sql, puis
-- sql/shop_catalog.sql et les offres de saison (sql/shop_offers_season_N.sql),
-- générés depuis le code.
--
-- Les MVP Points ne se gagnent QUE par le Battle Pass (récompenses « currency »
-- des niveaux sans autre récompense), plus un bonus de bienvenue unique que le
-- joueur réclame lui-même (shop_claim_welcome, pas automatique : le solde de
-- départ est 0).
--
-- Principes (mêmes que le pass) :
--   - le solde n'est JAMAIS stocké : c'est la somme d'un registre d'écritures ;
--   - le client ne peut rien écrire : tout passe par des fonctions serveur ;
--   - un achat n'est accepté que pour une offre EN COURS (heure du serveur).
-- Rejouable : `if not exists` / `create or replace`, rien n'est supprimé.

-- ============================================================================
-- Tables
-- ============================================================================

-- Réglages de l'économie (générés depuis src/renderer/shop/economy.js).
create table if not exists public.shop_settings (
  id                 boolean primary key default true check (id),
  welcome_bonus      integer not null default 1000,
  pass_level_points  integer not null default 100
);
-- Migration d'une base créée avec la première version (Éclats tirés de l'XP).
alter table public.shop_settings add column if not exists welcome_bonus integer not null default 1000;
alter table public.shop_settings add column if not exists pass_level_points integer not null default 100;
alter table public.shop_settings drop column if exists coins_per_xp;
alter table public.shop_settings drop column if exists level_up_coins;

-- Catalogue (généré depuis src/renderer/shop/catalog.js).
create table if not exists public.shop_items (
  id      text primary key,
  type    text not null,
  rarity  text not null,
  price   integer not null check (price > 0)
);
alter table public.shop_items drop constraint if exists shop_items_type_check;
alter table public.shop_items add constraint shop_items_type_check
  check (type in ('weaponSkin', 'handSkin', 'title', 'card', 'bundle'));

-- Contenu des packs (un pack s'achète comme un objet, et donne tout son contenu).
create table if not exists public.shop_bundle_items (
  bundle_id  text not null references public.shop_items (id),
  item_id    text not null references public.shop_items (id),
  primary key (bundle_id, item_id)
);

-- Offres datées (générées depuis src/renderer/shop/rotation.js).
create table if not exists public.shop_offers (
  id         text primary key,
  item_id    text not null references public.shop_items (id),
  kind       text not null,
  price      integer not null check (price > 0),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null check (ends_at > starts_at)
);
create index if not exists shop_offers_window_idx on public.shop_offers (starts_at, ends_at);
-- bundle = offre permanente d'un pack, hors rotation.
alter table public.shop_offers drop constraint if exists shop_offers_kind_check;
alter table public.shop_offers add constraint shop_offers_kind_check check (kind in ('daily', 'featured', 'bundle'));

-- Registre : une ligne par mouvement de MVP Points (+ gain, - achat). L'unicité
-- (joueur, source, ref) rend chaque gain idempotent : rappeler shop_award ne
-- crédite jamais deux fois la même récompense.
--   welcome  : bonus de bienvenue, ref = 'welcome'
--   pass     : récompense « currency » réclamée, ref = '<saison>:<récompense>'
--   purchase : ref = id de l'objet ou du pack acheté
--   pack     : achat avec de l'argent réel — PAS branché, réservé pour plus tard
create table if not exists public.shop_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  amount      integer not null check (amount <> 0),
  source      text not null,
  ref         text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, source, ref)
);
create index if not exists shop_ledger_user_idx on public.shop_ledger (user_id);
-- Première version : des Éclats étaient tirés de l'XP. Ces gains n'existent plus
-- (la boutique n'avait jamais été publiée) : ils sont retirés avant de poser la
-- nouvelle contrainte.
delete from public.shop_ledger where source in ('xp', 'level');
alter table public.shop_ledger drop constraint if exists shop_ledger_source_check;
alter table public.shop_ledger add constraint shop_ledger_source_check
  check (source in ('welcome', 'pass', 'purchase', 'pack'));

create table if not exists public.shop_purchases (
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     text not null references public.shop_items (id),
  price       integer not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ============================================================================
-- Droits : lecture seule pour les joueurs, rien en écriture
-- ============================================================================

alter table public.shop_settings enable row level security;
alter table public.shop_items enable row level security;
alter table public.shop_offers enable row level security;
alter table public.shop_ledger enable row level security;
alter table public.shop_purchases enable row level security;
alter table public.shop_bundle_items enable row level security;

drop policy if exists "shop_settings_read" on public.shop_settings;
create policy "shop_settings_read" on public.shop_settings for select to authenticated using (true);
drop policy if exists "shop_items_read" on public.shop_items;
create policy "shop_items_read" on public.shop_items for select to authenticated using (true);
drop policy if exists "shop_offers_read" on public.shop_offers;
create policy "shop_offers_read" on public.shop_offers for select to authenticated using (true);
drop policy if exists "shop_bundle_items_read" on public.shop_bundle_items;
create policy "shop_bundle_items_read" on public.shop_bundle_items for select to authenticated using (true);
drop policy if exists "shop_ledger_read_own" on public.shop_ledger;
create policy "shop_ledger_read_own" on public.shop_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists "shop_purchases_read_own" on public.shop_purchases;
create policy "shop_purchases_read_own" on public.shop_purchases for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.shop_settings, public.shop_items, public.shop_offers,
  public.shop_ledger, public.shop_purchases, public.shop_bundle_items from anon, authenticated;
grant select on public.shop_settings, public.shop_items, public.shop_offers,
  public.shop_ledger, public.shop_purchases, public.shop_bundle_items to authenticated;

-- ============================================================================
-- Fonctions
-- ============================================================================

-- Solde du joueur connecté.
create or replace function public.shop_balance()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::integer from public.shop_ledger where user_id = auth.uid();
$$;

-- Crédite ce qui est dû au joueur et ne l'a pas encore été : chaque récompense
-- « MVP Points » réclamée dans le pass. PAS le bonus de bienvenue (voir
-- shop_claim_welcome, à part : le joueur doit cliquer sur « Obtenir », le
-- solde de départ est 0). Idempotent. À appeler après une réclamation.
-- Renvoie { gained, balance }.
create or replace function public.shop_award()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  cfg     public.shop_settings;
  before  integer;
  after   integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into cfg from public.shop_settings where id;
  if not found then
    return jsonb_build_object('gained', 0, 'balance', 0);
  end if;

  -- Deux appels simultanés du même joueur ne doivent pas se marcher dessus.
  perform pg_advisory_xact_lock(hashtextextended('shop:' || uid::text, 0));

  select coalesce(sum(amount), 0) into before from public.shop_ledger where user_id = uid;

  insert into public.shop_ledger (user_id, amount, source, ref)
  select uid, cfg.pass_level_points, 'pass', c.season_id || ':' || c.reward_id
    from public.bp_claims c
    join public.bp_rewards r
      on r.season_id = c.season_id and r.track = c.track and r.reward_id = c.reward_id
   where c.user_id = uid and r.type = 'currency'
  on conflict (user_id, source, ref) do nothing;

  select coalesce(sum(amount), 0) into after from public.shop_ledger where user_id = uid;
  return jsonb_build_object('gained', after - before, 'balance', after);
end;
$$;

-- Bonus de bienvenue : crédité une seule fois, seulement quand le joueur clique
-- sur « Obtenir » (fenêtre affichée à la première entrée dans l'Aim Trainer,
-- tant que ce bonus n'a pas été réclamé — voir shop_ledger côté client).
-- Idempotent (rejouable sans risque). Renvoie { claimed, balance } : claimed
-- est false si déjà réclamé avant (le solde renvoyé reste correct).
create or replace function public.shop_claim_welcome()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  cfg     public.shop_settings;
  before  integer;
  after   integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into cfg from public.shop_settings where id;
  if not found then
    return jsonb_build_object('claimed', false, 'balance', 0);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('shop:' || uid::text, 0));

  select coalesce(sum(amount), 0) into before from public.shop_ledger where user_id = uid;

  insert into public.shop_ledger (user_id, amount, source, ref)
  values (uid, cfg.welcome_bonus, 'welcome', 'welcome')
  on conflict (user_id, source, ref) do nothing;

  select coalesce(sum(amount), 0) into after from public.shop_ledger where user_id = uid;
  return jsonb_build_object('claimed', after > before, 'balance', after);
end;
$$;

-- Achète une offre EN COURS. Renvoie { status, balance } avec status :
--   ok | owned (déjà possédé) | insufficient (solde trop bas) | unavailable
create or replace function public.shop_buy(p_offer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  o       public.shop_offers;
  balance integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:' || uid::text, 0));

  select coalesce(sum(amount), 0) into balance from public.shop_ledger where user_id = uid;
  -- Le test `found` doit suivre IMMÉDIATEMENT la recherche de l'offre (il porte
  -- sur la dernière requête exécutée).
  select * into o from public.shop_offers
   where id = p_offer and now() >= starts_at and now() < ends_at;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'balance', balance);
  end if;
  if exists (select 1 from public.shop_purchases where user_id = uid and item_id = o.item_id) then
    return jsonb_build_object('status', 'owned', 'balance', balance);
  end if;
  if balance < o.price then
    return jsonb_build_object('status', 'insufficient', 'balance', balance);
  end if;

  insert into public.shop_purchases (user_id, item_id, price) values (uid, o.item_id, o.price);
  -- Pack : chaque objet du contenu devient possédé (prix 0, payé via le pack).
  insert into public.shop_purchases (user_id, item_id, price)
  select uid, bi.item_id, 0 from public.shop_bundle_items bi where bi.bundle_id = o.item_id
  on conflict do nothing;
  insert into public.shop_ledger (user_id, amount, source, ref) values (uid, -o.price, 'purchase', o.item_id);
  return jsonb_build_object('status', 'ok', 'balance', balance - o.price);
end;
$$;

-- bp_equip accepte aussi les titres / cartes achetés en boutique (sinon un titre
-- exclusif acheté ne pourrait pas être affiché). Remplace la version de
-- battle_pass.sql, même signature, mêmes vérifications.
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

  if p_reward is not null
     and not exists (
       select 1
         from public.bp_claims c
         join public.bp_rewards r
           on r.season_id = c.season_id and r.track = c.track and r.reward_id = c.reward_id
        where c.user_id = uid and c.reward_id = p_reward and r.type = p_kind
     )
     and not exists (
       select 1
         from public.shop_purchases p
         join public.shop_items i on i.id = p.item_id
        where p.user_id = uid and p.item_id = p_reward and i.type = p_kind
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

revoke all on function public.shop_balance() from public, anon;
revoke all on function public.shop_award() from public, anon;
revoke all on function public.shop_claim_welcome() from public, anon;
revoke all on function public.shop_buy(text) from public, anon;
revoke all on function public.bp_equip(text, text) from public, anon;
grant execute on function public.shop_balance() to authenticated;
grant execute on function public.shop_award() to authenticated;
grant execute on function public.shop_claim_welcome() to authenticated;
grant execute on function public.shop_buy(text) to authenticated;
grant execute on function public.bp_equip(text, text) to authenticated;
