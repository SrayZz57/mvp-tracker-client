-- Bibliothèque de techs communautaires (Wiki > Communauté) — TechLibrary.jsx
-- Même mécanique que map_compositions : table publique en lecture, écriture
-- restreinte à son propre auteur, suppression par l'auteur ou un admin.
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.

create table public.agent_techs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  map text,
  title text not null,
  video_url text not null,
  tags text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.agent_techs enable row level security;

create policy "agent_techs_select_all"
  on public.agent_techs for select
  using (true);

create policy "agent_techs_insert_own"
  on public.agent_techs for insert
  with check (auth.uid() = created_by);

create policy "agent_techs_delete_own_or_admin"
  on public.agent_techs for delete
  using (auth.uid() = created_by or is_admin());
