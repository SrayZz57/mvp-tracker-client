-- Cache de la recherche de lineups courtes (Edge Function « lineup-search »).
-- Une recherche YouTube coûte 100 unités sur les 10 000 du quota quotidien de
-- Google : la même recherche (agent + map + côté + site) est donc mémorisée ici
-- et servie à tous les joueurs pendant 7 jours. La clé `__usage:AAAA-MM-JJ`
-- compte les recherches réellement envoyées à YouTube ce jour-là (garde-fou).
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.

create table public.lineup_search_cache (
  key text primary key,
  results jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

-- RLS activée SANS aucune policy, et aucun droit pour les rôles de l'app : seule
-- l'Edge Function (clé service_role, qui contourne la RLS) lit et écrit ici.
-- Les joueurs passent forcément par la fonction, jamais par la table.
alter table public.lineup_search_cache enable row level security;
revoke all on public.lineup_search_cache from anon, authenticated;
