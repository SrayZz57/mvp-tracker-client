-- Table des scores de l'Aim Trainer (aimScores.js).
--
-- Cette table existait déjà dans Supabase sans être dans ce dépôt. Ce fichier
-- la DOCUMENTE, reconstruite à partir de information_schema.columns (export du
-- 2026-09-26). Rejouable sans risque : `if not exists`, rien n'est modifié sur
-- une base où elle est déjà en place.
--
-- CE QUI MANQUE ENCORE (n'était pas dans l'export) — à récupérer avant de
-- toucher au schéma, sinon on documente une base qu'on ne connaît pas :
--   select * from pg_policies where tablename = 'aim_trainer_scores';   -- RLS
--   select indexname, indexdef from pg_indexes where tablename = 'aim_trainer_scores';
--   select pg_get_viewdef('public.aim_trainer_global_bests', true);      -- vue des records
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.aim_trainer_scores'::regclass;            -- clés étrangères
-- Comportement attendu (voir aimScores.js) : lecture par tous les comptes
-- connectés, écriture de ses propres lignes uniquement.

create table if not exists public.aim_trainer_scores (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  mode           text not null,
  score          integer not null,
  accuracy       numeric,
  hits           integer,
  misses         integer,
  duration       integer,
  avg_reaction   integer,
  created_at     timestamptz not null default now(),
  -- Date du défi du jour joué (date LOCALE du joueur, voir todayKey()), null
  -- pour une session hors défi.
  challenge_date date,
  dpi            integer,
  sens           numeric
);
