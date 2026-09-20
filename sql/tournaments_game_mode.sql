-- Mode de jeu du tournoi (1v1 / 2v2 / classique 5v5) — TournamentCreateForm.jsx.
-- À exécuter une seule fois dans le SQL Editor du projet Supabase, après
-- tournaments_community.sql.

alter table public.tournaments add column if not exists game_mode text not null default 'classic';

alter table public.tournaments drop constraint if exists tournaments_game_mode_check;
alter table public.tournaments add constraint tournaments_game_mode_check
  check (game_mode in ('1v1', '2v2', 'classic'));
