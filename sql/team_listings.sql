-- Module Recherche de Team (LFG) — TeamListings.jsx
-- Réutilise le système d'amis déjà en place (table `friendships`, inchangée
-- ici) pour "répondre" à une annonce : cette table ne fait que stocker les
-- annonces elles-même + un petit historique des réponses pour que l'auteur
-- garde le message envoyé avec chaque demande d'ami.
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.

create table public.team_listings (
  id uuid primary key default gen_random_uuid(),
  listing_type text not null check (listing_type in ('looking_for_team', 'looking_for_players')),
  -- Vers profiles(id), pas auth.users(id) — même raison que sur clips/
  -- agent_techs : `author:profiles(...)` est chargé par un embed PostgREST
  -- qui a besoin d'une clé étrangère DIRECTE vers profiles pour la jointure.
  created_by uuid not null references public.profiles(id) on delete cascade,
  roles text[] not null default '{}', -- vide = peu importe
  rank_min integer, -- tier numérique (échelle valorant-api), null = pas de mini
  rank_max integer, -- idem, null = pas de maxi
  availability text,
  description text,
  team_name text, -- uniquement pour 'looking_for_players'
  slots_available integer, -- idem
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  -- Expiration à 14 jours, calculée côté requête (expires_at < now()) plutôt
  -- que par un statut à mettre à jour par une tâche planifiée — plus simple,
  -- et "active" reste vrai tant que l'auteur ne clôture pas lui-même.
  expires_at timestamptz not null default (now() + interval '14 days')
);

alter table public.team_listings enable row level security;

create policy "team_listings_select_all"
  on public.team_listings for select
  using (true);

create policy "team_listings_insert_own"
  on public.team_listings for insert
  with check (auth.uid() = created_by);

create policy "team_listings_update_own"
  on public.team_listings for update
  using (auth.uid() = created_by);

create policy "team_listings_delete_own_or_admin"
  on public.team_listings for delete
  using (auth.uid() = created_by or is_admin());

grant select, insert, update, delete on public.team_listings to authenticated;

-- Réponses à une annonce : garde le message envoyé avec la demande d'ami
-- (la demande elle-même passe par `friendships`, table existante,
-- inchangée) — sert à ce que l'auteur de l'annonce voie qui a répondu et
-- pourquoi, même avant d'accepter la demande.
create table public.team_listing_responses (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.team_listings(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  -- Demandé en plus du message : la demande d'ami (table `friendships`)
  -- prend du temps à être acceptée, le pseudo Discord permet à l'auteur de
  -- l'annonce de recontacter tout de suite si besoin, sans attendre.
  discord_tag text not null,
  created_at timestamptz not null default now(),
  unique (listing_id, responder_id)
);

alter table public.team_listing_responses enable row level security;

-- Lecture restreinte : le répondant voit ses propres réponses, l'auteur de
-- l'annonce voit toutes les réponses reçues sur SES annonces — jamais les
-- réponses des autres sur des annonces qui ne sont pas les siennes.
create policy "team_listing_responses_select_own_or_author"
  on public.team_listing_responses for select
  using (
    auth.uid() = responder_id
    or exists (
      select 1 from public.team_listings
      where team_listings.id = team_listing_responses.listing_id
        and team_listings.created_by = auth.uid()
    )
  );

create policy "team_listing_responses_insert_own"
  on public.team_listing_responses for insert
  with check (auth.uid() = responder_id);

-- UPDATE nécessaire même si on n'expose pas de bouton "modifier" séparé :
-- l'appli fait un upsert (insert ... on conflict do update) pour qu'une
-- seconde candidature sur la même annonce mette à jour le message/pseudo
-- Discord au lieu d'échouer sur la contrainte unique.
create policy "team_listing_responses_update_own"
  on public.team_listing_responses for update
  using (auth.uid() = responder_id);

grant select, insert, update on public.team_listing_responses to authenticated;
