-- Acceptation des conditions générales d'utilisation — TermsModal.jsx (App.jsx)
-- Une ligne par compte ET par version du texte : quand les CGU changent, on
-- incrémente la version côté appli (TERMS_VERSION) et chaque compte est
-- redemandé, sans jamais écraser la preuve de l'acceptation précédente.
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.

create table public.terms_acceptances (
  -- Vers profiles(id), pas auth.users(id) — même raison que sur clips/
  -- team_listings : l'onglet Admin charge `profiles(...)` par un embed
  -- PostgREST qui a besoin d'une clé étrangère DIRECTE vers profiles.
  user_id uuid not null references public.profiles(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.terms_acceptances enable row level security;

-- Chacun voit sa propre acceptation (sert à ne pas la renvoyer en double),
-- les admins voient tout le monde.
create policy "terms_acceptances_select_own_or_admin"
  on public.terms_acceptances for select
  using (auth.uid() = user_id or is_admin());

-- Un compte ne peut enregistrer QUE sa propre acceptation. Pas de policy
-- update/delete : une acceptation enregistrée n'est ni modifiable ni
-- effaçable depuis l'appli.
create policy "terms_acceptances_insert_own"
  on public.terms_acceptances for insert
  with check (auth.uid() = user_id);

grant select, insert on public.terms_acceptances to authenticated;
