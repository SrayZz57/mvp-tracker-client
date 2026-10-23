-- Abonnements aux notifications WEB (Web Push) des téléphones qui ont installé la
-- version web de MVP Tracker sur leur écran d'accueil. Pendant de push_tokens.sql
-- (jetons Expo de l'app native) : l'app PC lit les abonnements du joueur, puis
-- demande à la fonction `send-web-push` d'envoyer l'alerte de fin de match / de tilt.
-- Un joueur peut avoir plusieurs appareils : la clé est l'adresse d'abonnement.

create table if not exists public.web_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  -- Deux réglages indépendants sur le même abonnement : alertes de fin de partie, et rappel du
  -- Wrapped le lundi matin (voir sql/wrapped_reminder_cron.sql).
  match_alerts boolean not null default false,
  wrapped_reminder boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists web_push_subscriptions_user_id_idx on public.web_push_subscriptions (user_id);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "web_push_select_own" on public.web_push_subscriptions;
create policy "web_push_select_own" on public.web_push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "web_push_insert_own" on public.web_push_subscriptions;
create policy "web_push_insert_own" on public.web_push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "web_push_update_own" on public.web_push_subscriptions;
create policy "web_push_update_own" on public.web_push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "web_push_delete_own" on public.web_push_subscriptions;
create policy "web_push_delete_own" on public.web_push_subscriptions
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.web_push_subscriptions to authenticated;
-- La fonction match-notifier (clé « service role ») lit tous les abonnements. Supabase ne donne plus
-- ce droit automatiquement sur les tables créées à la main : il faut l'accorder explicitement.
grant select, insert, update, delete on public.web_push_subscriptions to service_role;
