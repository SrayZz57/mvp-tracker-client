import { clutchStats, excludeDeathmatch, findMe, formStats, groupStats, overallHsPercent, overallWinrate, resultLabel } from './valorantStats.js';

// Wrapped : récapitulatif d'une période (semaine, mois ou acte) et comparaison
// avec la période précédente. Logique pure, testée dans wrappedStats.test.mjs.

const DAY_MS = 24 * 60 * 60 * 1000;

// Lundi 00h00 (heure locale) de la semaine contenant `ms`.
export function weekStartMs(ms) {
  const d = new Date(ms);
  const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}

// Le 1er du mois 00h00 (heure locale) contenant `ms`, et celui du mois suivant.
export const monthStartMs = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
export const nextMonthStartMs = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
};

export const PERIOD_KINDS = ['week', 'month', 'act'];

// Toutes les périodes d'un type où il y a eu au moins une partie standard, de la
// plus récente à la plus ancienne. `complete` : la période est terminée (une
// semaine ou un mois en cours n'est pas complet ; un acte n'est jamais donné
// pour terminé, on ne sait pas quand il s'arrête).
export function listPeriods(kind, matches, nowMs = Date.now()) {
  const groups = new Map();
  excludeDeathmatch(matches ?? []).forEach((match) => {
    const startSec = match.metadata?.game_start;
    if (!startSec) return;
    const ms = startSec * 1000;
    let key;
    if (kind === 'week') key = weekStartMs(ms);
    else if (kind === 'month') key = monthStartMs(ms);
    else key = match.metadata?.season_id;
    if (!key) return;
    const g = groups.get(key) ?? { games: [], first: ms, last: ms };
    g.games.push(match);
    g.first = Math.min(g.first, ms);
    g.last = Math.max(g.last, ms);
    groups.set(key, g);
  });

  const periods = [...groups.entries()].map(([key, g]) => {
    if (kind === 'week') {
      const end = key + 7 * DAY_MS;
      return { kind, id: String(key), start: key, end, complete: end <= nowMs, matches: g.games, last: g.last };
    }
    if (kind === 'month') {
      const end = nextMonthStartMs(key);
      return { kind, id: String(key), start: key, end, complete: end <= nowMs, matches: g.games, last: g.last };
    }
    return { kind, id: key, start: g.first, end: g.last + 1, complete: false, matches: g.games, last: g.last };
  });
  return periods.sort((a, b) => b.last - a.last);
}

// Période affichée par défaut : la dernière période TERMINÉE (comme le Wrapped
// hebdomadaire d'origine, qui récapitule la semaine écoulée), sinon la plus
// récente. Pour un acte : le plus récent.
export function defaultPeriod(periods) {
  return periods.find((p) => p.complete) ?? periods[0] ?? null;
}

// Période qui précède immédiatement `period` (pour la comparaison), ou null.
export function previousPeriod(periods, period) {
  if (!period) return null;
  if (period.kind === 'act') {
    const i = periods.findIndex((p) => p.id === period.id);
    return i >= 0 ? periods[i + 1] ?? null : null;
  }
  const wanted = period.kind === 'week' ? period.start - 7 * DAY_MS : monthStartMs(period.start - DAY_MS);
  return periods.find((p) => p.start === wanted) ?? null;
}

function longestWinStreak(sortedMatches, name, tag) {
  let best = 0;
  let run = 0;
  sortedMatches.forEach((match) => {
    const me = findMe(match, name, tag);
    const label = me ? resultLabel(match, me) : null;
    if (label === 'Victoire') {
      run += 1;
      best = Math.max(best, run);
    } else if (label === 'Défaite') {
      run = 0;
    }
  });
  return best;
}

// Récapitulatif d'un lot de parties (celles de la période). null si aucune.
export function buildPeriodRecap(periodMatches, name, tag) {
  const list = excludeDeathmatch(periodMatches ?? []);
  if (list.length === 0) return null;

  let wins = 0;
  let losses = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let playtime = 0;
  let bestKdMatch = null;
  let mostKillsMatch = null;

  list.forEach((match) => {
    const me = findMe(match, name, tag);
    if (!me) return;
    const label = resultLabel(match, me);
    if (label === 'Victoire') wins += 1;
    else if (label === 'Défaite') losses += 1;
    const k = me.stats?.kills ?? 0;
    const d = me.stats?.deaths ?? 0;
    kills += k;
    deaths += d;
    assists += me.stats?.assists ?? 0;
    playtime += match.metadata?.game_length ?? 0;
    const info = { map: match.metadata?.map ?? null, agent: me.character ?? null };
    const kd = d > 0 ? k / d : k;
    if (!bestKdMatch || kd > bestKdMatch.kd) bestKdMatch = { kd, kills: k, deaths: d, ...info };
    if (!mostKillsMatch || k > mostKillsMatch.kills) mostKillsMatch = { kills: k, ...info };
  });

  const agentRows = groupStats(list, name, tag, (match, me) => me.character);
  const mapRows = groupStats(list, name, tag, (match) => match.metadata?.map);
  const ratedMaps = mapRows.filter((row) => row.games >= 2 && row.winrate !== null);
  const bestMap = ratedMaps.length > 0 ? ratedMaps.reduce((a, b) => (b.winrate > a.winrate ? b : a)) : null;
  const chronological = [...list].sort((a, b) => (a.metadata?.game_start ?? 0) - (b.metadata?.game_start ?? 0));
  const clutch = clutchStats(list, name, tag);

  return {
    games: list.length,
    wins,
    losses,
    winrate: overallWinrate(list, name, tag),
    kd: formStats(list, name, tag).overallKd,
    hsPercent: overallHsPercent(list, name, tag),
    kills,
    deaths,
    assists,
    playtimeSeconds: playtime,
    topAgents: agentRows.slice(0, 3),
    bestAgent: agentRows[0] ?? null,
    mostPlayedMap: mapRows[0] ?? null,
    bestMap,
    bestKdMatch,
    mostKillsMatch,
    longestWinStreak: longestWinStreak(chronological, name, tag),
    clutch: clutch.attempts > 0 ? { attempts: clutch.attempts, wins: clutch.wins } : null,
  };
}

const diff = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : a - b);

// Écarts entre deux récapitulatifs (période - période précédente). Les points
// de pourcentage pour le winrate et la précision, l'écart brut pour le reste.
export function compareRecaps(current, previous) {
  if (!current || !previous) return null;
  return {
    games: current.games - previous.games,
    winrate: diff(current.winrate, previous.winrate),
    kd: diff(current.kd, previous.kd),
    hsPercent: diff(current.hsPercent, previous.hsPercent),
  };
}

// Évolution du RR sur la période, d'après l'historique de RR en cache (une entrée
// par partie classée, avec `change` = RR gagné ou perdu). `partial` : l'historique
// peut ne pas couvrir toute la période, le total est alors un minimum — quand la
// période commence avant les 30 jours conservés, ou quand l'historique est plein
// (l'API ne donne que les 20 dernières parties) sans remonter jusqu'au début.
// null si aucune partie classée suivie sur la période.
const MMR_KEEP_MS = 30 * DAY_MS;
const MMR_API_CAP = 20;

export function rrForPeriod(history, startMs, endMs, nowMs = Date.now()) {
  const entries = (history ?? []).filter((entry) => {
    const ts = new Date(entry.date).getTime();
    return ts >= startMs && ts < endMs;
  });
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const oldestKnown = Math.min(...history.map((entry) => new Date(entry.date).getTime()));
  const last = sorted[sorted.length - 1];
  return {
    net: sorted.reduce((sum, entry) => sum + (entry.change ?? 0), 0),
    games: sorted.length,
    endTierName: last.tierName ?? null,
    endRr: last.rr ?? null,
    partial: startMs < nowMs - MMR_KEEP_MS || (history.length >= MMR_API_CAP && oldestKnown > startMs),
  };
}
