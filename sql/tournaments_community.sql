-- Ouverture de la création de tournois à tout compte connecté (pas
-- seulement les admins) — TournamentsTab.jsx / TournamentCreateForm.jsx.
-- Les tournois créés par un admin restent épinglés en premier ("officiels"),
-- les autres apparaissent dans une section "Communauté" avec recherche +
-- filtre de rang.
-- À exécuter une seule fois dans le SQL Editor du projet Supabase, APRÈS la
-- création initiale de `public.tournaments` (déjà en place, pas dans ce
-- repo). Réutilise `public.is_admin()`, déjà défini pour team_listings.sql.

-- Rang requis pour s'inscrire, même échelle numérique que
-- team_listings.rank_min/rank_max (tier valorant-api), null = pas de critère.
alter table public.tournaments add column if not exists rank_min integer;
alter table public.tournaments add column if not exists rank_max integer;

-- Posé une seule fois à la création, pas recalculé à l'affichage : si le
-- rôle du créateur change plus tard, ses tournois déjà créés ne changent pas
-- de catégorie rétroactivement.
alter table public.tournaments add column if not exists is_official boolean not null default false;

create or replace function public.set_tournament_official()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_official := public.is_admin();
  return new;
end;
$$;

drop trigger if exists tournaments_set_official on public.tournaments;
create trigger tournaments_set_official
  before insert on public.tournaments
  for each row execute function public.set_tournament_official();

-- Policies remplacées : la création n'est plus réservée aux admins, mais
-- update/delete restent limités au créateur (gère son propre tournoi) et aux
-- admins (modération). Volontairement PAS de "ou tournoi expiré" sur delete :
-- une version précédente laissait n'importe quel compte supprimer un tournoi
-- dont la date limite était passée, équipes comprises (voir
-- tournaments_remove_expired_delete.sql). Les tournois expirés sans équipe
-- sont simplement masqués côté client (TournamentsTab.jsx).
drop policy if exists "tournaments_insert_admin" on public.tournaments;
drop policy if exists "tournaments_insert_own" on public.tournaments;
create policy "tournaments_insert_own"
  on public.tournaments for insert
  with check (auth.uid() = created_by);

drop policy if exists "tournaments_update_admin" on public.tournaments;
drop policy if exists "tournaments_update_own_or_admin" on public.tournaments;
create policy "tournaments_update_own_or_admin"
  on public.tournaments for update
  using (auth.uid() = created_by or is_admin());

drop policy if exists "tournaments_delete_admin" on public.tournaments;
drop policy if exists "tournaments_delete_own_or_admin_or_expired" on public.tournaments;
create policy "tournaments_delete_own_or_admin_or_expired"
  on public.tournaments for delete
  using (auth.uid() = created_by or is_admin());
