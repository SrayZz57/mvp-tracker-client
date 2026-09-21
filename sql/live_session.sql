-- Session du jour en direct : le PC y pousse les stats de l'overlay de session
-- (victoires/défaites, K/D, HS%...), le téléphone les lit en temps réel.
-- Une seule ligne par utilisateur, réécrite à chaque mise à jour.

create table if not exists public.live_session (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stats jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.live_session enable row level security;

drop policy if exists "live_session_select_own" on public.live_session;
create policy "live_session_select_own" on public.live_session
  for select using (auth.uid() = user_id);

drop policy if exists "live_session_insert_own" on public.live_session;
create policy "live_session_insert_own" on public.live_session
  for insert with check (auth.uid() = user_id);

drop policy if exists "live_session_update_own" on public.live_session;
create policy "live_session_update_own" on public.live_session
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.live_session to authenticated;

-- Temps réel : sans ça le téléphone ne serait prévenu d'aucun changement.
do $$
begin
  alter publication supabase_realtime add table public.live_session;
exception
  when duplicate_object then null;
end $$;
