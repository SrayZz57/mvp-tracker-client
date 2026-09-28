import { SEASONS, listRewards } from './catalog.js';
import { expandSeasonChallenges } from './challenges.js';
import { SESSION_RULES } from './xpRules.js';
import { MODE_SCORE_CAPS } from './modeCaps.js';
import { allShopSql } from '../shop/seedSql.js';

// Produit le SQL de « semis » à partir du catalogue et des règles :
//   - battle_pass_mode_caps.sql : plafonds de score par mode (global)
//   - battle_pass_season_N.sql  : la saison, ses récompenses, ses défis
// Volontairement idempotent (upsert) : on peut le rejouer après avoir corrigé
// une date, une courbe ou une cible. Il ne SUPPRIME jamais rien — voir la
// règle d'or du catalogue.
//
// ATTENTION : ne pas changer l'algorithme de tirage (challenges.js) ni les
// modèles d'une saison DÉJÀ COMMENCÉE : rejouer le semis réécrirait les défis
// du jour et de la semaine en cours sous les pieds des joueurs.
//
// Lancé par scripts/generate-battle-pass-sql.mjs ; un test vérifie que les
// fichiers de sql/ sont bien à jour.

const q = (value) => (value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`);
const n = (value) => (value === null || value === undefined ? 'null' : String(value));

const HEADER = `-- GÉNÉRÉ par scripts/generate-battle-pass-sql.mjs — ne pas modifier à la main.
-- À exécuter dans le SQL Editor de Supabase. Ordre : sql/battle_pass.sql, puis
-- sql/battle_pass_xp.sql, puis sql/battle_pass_mode_caps.sql, puis la saison.
-- Rejouable : met à jour, ne supprime rien.
`;

export function renderModeCapsSql() {
  const rows = Object.entries(MODE_SCORE_CAPS)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mode, cap]) => `  (${q(mode)}, ${cap})`)
    .join(',\n');
  return `${HEADER}
-- Plafond de score plausible par mode (voir src/renderer/battlePass/modeCaps.js).
-- Un mode absent de cette table ne rapporte aucune XP : un nouveau mode doit y
-- être ajouté (un test le rappelle).
insert into public.bp_mode_caps (mode, max_score)
values
${rows}
on conflict (mode) do update set max_score = excluded.max_score;
`;
}

export function renderSeasonSql(season) {
  const rewards = listRewards(season);
  const rewardRows = rewards.map((r) => `  (${q(season.id)}, 'free', ${q(r.id)}, ${r.level}, ${q(r.type)})`).join(',\n');

  const challenges = expandSeasonChallenges(season);
  const challengeRows = challenges
    .map(
      (c) =>
        `  (${q(season.id)}, ${q(c.id)}, ${q(c.period)}, ${q(c.tier)}, ${q(c.metric)}, ${q(c.mode)}, ${n(c.target)}, ${n(c.minHits)}, ${c.xp}, ${q(c.startsAt)}, ${q(c.endsAt)})`,
    )
    .join(',\n');

  return `${HEADER}
insert into public.bp_seasons (id, number, starts_at, ends_at, max_level, level_base, level_step,
                               session_xp, session_daily_cap, min_duration, min_hits)
values (${q(season.id)}, ${season.number}, ${q(season.startsAt)}, ${q(season.endsAt)}, ${season.maxLevel}, ${season.base}, ${season.step},
        ${SESSION_RULES.xp}, ${SESSION_RULES.dailyCap}, ${SESSION_RULES.minDuration}, ${SESSION_RULES.minHits})
on conflict (id) do update set
  number = excluded.number,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  max_level = excluded.max_level,
  level_base = excluded.level_base,
  level_step = excluded.level_step,
  session_xp = excluded.session_xp,
  session_daily_cap = excluded.session_daily_cap,
  min_duration = excluded.min_duration,
  min_hits = excluded.min_hits;

insert into public.bp_rewards (season_id, track, reward_id, level, type)
values
${rewardRows}
on conflict (season_id, track, reward_id) do update set
  level = excluded.level,
  type = excluded.type;

-- ${challenges.length} défis : un jeu par jour, un par semaine, et ceux de la saison.
insert into public.bp_challenges (season_id, id, period, tier, metric, mode, target, min_hits, xp, starts_at, ends_at)
values
${challengeRows}
on conflict (season_id, id) do update set
  period = excluded.period,
  tier = excluded.tier,
  metric = excluded.metric,
  mode = excluded.mode,
  target = excluded.target,
  min_hits = excluded.min_hits,
  xp = excluded.xp,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at;
`;
}

export function seasonSqlFileName(season) {
  return `battle_pass_season_${season.number}.sql`;
}

// [{ file, sql }] : tous les fichiers générés.
export function allGeneratedSql() {
  return [
    { file: 'battle_pass_mode_caps.sql', sql: renderModeCapsSql() },
    ...SEASONS.map((season) => ({ file: seasonSqlFileName(season), sql: renderSeasonSql(season) })),
    // Boutique : catalogue et offres, générés au même endroit.
    ...allShopSql(),
  ];
}

// Ancien nom, conservé pour les tests de la phase 1.
export const allSeasonSql = () => allGeneratedSql().filter((e) => e.file.includes('season_'));
