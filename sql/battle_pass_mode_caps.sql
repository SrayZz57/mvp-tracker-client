-- GÉNÉRÉ par scripts/generate-battle-pass-sql.mjs — ne pas modifier à la main.
-- À exécuter dans le SQL Editor de Supabase. Ordre : sql/battle_pass.sql, puis
-- sql/battle_pass_xp.sql, puis sql/battle_pass_mode_caps.sql, puis la saison.
-- Rejouable : met à jour, ne supprime rien.

-- Plafond de score plausible par mode (voir src/renderer/battlePass/modeCaps.js).
-- Un mode absent de cette table ne rapporte aucune XP : un nouveau mode doit y
-- être ajouté (un test le rappelle).
insert into public.bp_mode_caps (mode, max_score)
values
  ('ascentDuel', 30),
  ('custom', 1500),
  ('flashDodge', 155),
  ('flick', 225),
  ('gridshot', 260),
  ('headshotDuel', 105),
  ('micro', 205),
  ('orbit', 170),
  ('patrol', 295),
  ('patrolFast', 155),
  ('patrolMulti', 290),
  ('patrolSlow', 300),
  ('peek', 120),
  ('popcorn', 205),
  ('precision', 150),
  ('reflex', 170),
  ('snapHold', 115),
  ('sniperAngleHold', 135),
  ('sniperBolt', 135),
  ('sniperNoscope', 135),
  ('sniperQuickscope', 135),
  ('sniperRepeek', 135),
  ('sniperScopeSpeed', 135),
  ('spray', 315),
  ('strafe', 200),
  ('strafeTap', 340),
  ('switch', 180),
  ('tracking', 160),
  ('trackingBeginner', 195),
  ('trackingIntermediate', 175),
  ('trackingMulti', 130)
on conflict (mode) do update set max_score = excluded.max_score;
