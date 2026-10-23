-- État du notifier de fin de partie (fonction `match-notifier`) : dernière partie vue par
-- joueur, pour ne notifier qu'une fois chaque nouvelle partie, plus la région/plateforme
-- HenrikDev déjà résolues (économise une requête à chaque vérification).
-- Table interne : RLS activée SANS aucune règle, donc inaccessible aux joueurs ;
-- seule la fonction (clé « service role ») la lit et l'écrit.

create table if not exists public.match_push_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_match_id text,
  last_match_at timestamptz,
  last_checked_at timestamptz,
  region text,
  platform text,
  updated_at timestamptz not null default now()
);

alter table public.match_push_state enable row level security;
revoke all on public.match_push_state from anon, authenticated;
-- Seule la fonction (clé « service role ») y accède ; ce droit doit être accordé explicitement.
grant select, insert, update, delete on public.match_push_state to service_role;

-- Lecture des Riot ID et des clés HenrikDev par la fonction (ne change rien pour les joueurs).
grant select on public.profiles to service_role;
grant select on public.profile_secrets to service_role;
