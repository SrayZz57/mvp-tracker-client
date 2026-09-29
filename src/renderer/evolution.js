import { excludeDeathmatch, findMe, formStats, overallHsPercent, overallWinrate, resultLabel } from './valorantStats.js';

// Page « Mon évolution » : tout l'historique de parties depuis le début, mis en
// perspective pour répondre à « est-ce que je progresse vraiment ? ». Ne dépend
// que des stats de fin de partie (K/D/A, tirs, agent, map, résultat, date), qui
// restent même sur les vieilles parties dont le détail round par round a été
// allégé. Logique pure, testée dans evolution.test.mjs.

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_GAP_MS = 45 * 60 * 1000;

export const COMPARE_WINDOW = 30;
export const MIN_COMPARE_GAMES = 20;
export const ROLLING_WINDOW = 20;
export const MIN_ROLLING_GAMES = 10;
export const GAME_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000];
export const MIN_STREAK_EVENT = 5;
const MIN_AGENT_GAMES_EVENT = 5;
const MIN_SHOTS_FOR_HS_RECORD = 20;
const MIN_KILLS_FOR_KD_RECORD = 10;
const WARMUP_GAMES_BEFORE_RECORDS = 5;

const startMs = (match) => (match.metadata?.game_start ?? 0) * 1000;
const endMs = (match) => startMs(match) + (match.metadata?.game_length ?? 0) * 1000;

const kdOf = (matches, name, tag) => formStats(matches, name, tag).overallKd;

function verdictOf(delta, small) {
  if (delta === null) return 'na';
  if (delta >= small) return 'up';
  if (delta <= -small) return 'down';
  return 'flat';
}

const diff = (a, b) => (a === null || b === null || a === undefined || b === undefined ? null : a - b);

// Début contre maintenant : les N premières parties contre les N dernières.
function compareStartToNow(asc, name, tag) {
  if (asc.length < MIN_COMPARE_GAMES) return null;
  const window = Math.min(COMPARE_WINDOW, Math.floor(asc.length / 2));
  const first = asc.slice(0, window);
  const last = asc.slice(-window);
  const metrics = {
    winrate: { start: overallWinrate(first, name, tag), now: overallWinrate(last, name, tag), small: 5 },
    kd: { start: kdOf(first, name, tag), now: kdOf(last, name, tag), small: 0.08 },
    hs: { start: overallHsPercent(first, name, tag), now: overallHsPercent(last, name, tag), small: 2 },
  };
  Object.values(metrics).forEach((m) => {
    m.delta = diff(m.now, m.start);
    m.verdict = verdictOf(m.delta, m.small);
  });
  const verdicts = Object.values(metrics).map((m) => m.verdict);
  const score = verdicts.filter((v) => v === 'up').length - verdicts.filter((v) => v === 'down').length;
  return {
    window,
    startsAt: startMs(first[0]),
    metrics,
    overall: score >= 1 ? 'progress' : score <= -1 ? 'decline' : 'stable',
  };
}

// Courbe glissante : à chaque partie, la moyenne des N dernières.
function rollingSeries(asc, name, tag) {
  if (asc.length < MIN_ROLLING_GAMES) return [];
  const window = Math.min(ROLLING_WINDOW, asc.length);
  const points = [];
  for (let i = window - 1; i < asc.length; i += 1) {
    const slice = asc.slice(i - window + 1, i + 1);
    points.push({
      at: startMs(asc[i]),
      index: i + 1,
      winrate: overallWinrate(slice, name, tag),
      kd: kdOf(slice, name, tag),
      hs: overallHsPercent(slice, name, tag),
    });
  }
  return points;
}

function groupTable(asc, name, tag, keyOf) {
  const rows = new Map();
  asc.forEach((match) => {
    const me = findMe(match, name, tag);
    const key = keyOf(match, me);
    if (!key) return;
    const row = rows.get(key) ?? { key, matches: [], firstAt: startMs(match), lastAt: startMs(match) };
    row.matches.push(match);
    row.lastAt = startMs(match);
    rows.set(key, row);
  });
  return [...rows.values()]
    .map((row) => ({
      key: row.key,
      games: row.matches.length,
      winrate: overallWinrate(row.matches, name, tag),
      kd: kdOf(row.matches, name, tag),
      firstAt: row.firstAt,
      lastAt: row.lastAt,
    }))
    .sort((a, b) => b.games - a.games);
}

// Sessions : parties enchaînées à moins de 45 min d'écart.
function buildSessions(asc) {
  const sessions = [];
  asc.forEach((match) => {
    const last = sessions[sessions.length - 1];
    if (last && startMs(match) - last.endedAt <= SESSION_GAP_MS) {
      last.games += 1;
      last.endedAt = Math.max(last.endedAt, endMs(match));
    } else {
      sessions.push({ startedAt: startMs(match), endedAt: endMs(match), games: 1 });
    }
  });
  return sessions;
}

function sessionSummary(sessions, asc) {
  if (sessions.length === 0) return null;
  const durations = sessions.map((s) => s.endedAt - s.startedAt);
  const longest = sessions.reduce((a, b) => (b.endedAt - b.startedAt > a.endedAt - a.startedAt ? b : a));
  const playtimeMs = asc.reduce((sum, m) => sum + (m.metadata?.game_length ?? 0) * 1000, 0);
  return {
    count: sessions.length,
    avgGames: asc.length / sessions.length,
    avgDurationMs: durations.reduce((a, b) => a + b, 0) / sessions.length,
    longest,
    playtimeMs,
  };
}

// Nombre de sessions par mois (ou par semaine si l'historique est court).
function sessionsPerPeriod(sessions, granularity) {
  const bucket = (ms) => {
    const d = new Date(ms);
    if (granularity === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
  };
  const counts = new Map();
  sessions.forEach((s) => counts.set(bucket(s.startedAt), (counts.get(bucket(s.startedAt)) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([start, count]) => ({ start, count }));
}

function longestWinStreaks(asc, name, tag) {
  const runs = [];
  let run = 0;
  let runEnd = null;
  asc.forEach((match, i) => {
    const me = findMe(match, name, tag);
    const label = me ? resultLabel(match, me) : null;
    if (label === 'Victoire') {
      run += 1;
      runEnd = startMs(match);
    } else if (label === 'Défaite') {
      if (run >= MIN_STREAK_EVENT) runs.push({ length: run, at: runEnd });
      run = 0;
    }
    if (i === asc.length - 1 && run >= MIN_STREAK_EVENT) runs.push({ length: run, at: runEnd });
  });
  return runs;
}

// Records personnels battus au fil du temps (une entrée chaque fois qu'un record
// est dépassé) : kills en une partie, meilleur K/D, meilleure précision tête.
function recordsOverTime(asc, name, tag) {
  const best = { kills: -1, kd: -1, hs: -1 };
  const events = [];
  asc.forEach((match, i) => {
    const me = findMe(match, name, tag);
    if (!me) return;
    const kills = me.stats?.kills ?? 0;
    const deaths = me.stats?.deaths ?? 0;
    const shots = (me.stats?.headshots ?? 0) + (me.stats?.bodyshots ?? 0) + (me.stats?.legshots ?? 0);
    const info = { at: startMs(match), map: match.metadata?.map ?? null, agent: me.character ?? null };
    const counts = i >= WARMUP_GAMES_BEFORE_RECORDS;

    if (kills > best.kills) {
      if (counts) events.push({ type: 'record', metric: 'kills', value: kills, ...info });
      best.kills = kills;
    }
    if (kills >= MIN_KILLS_FOR_KD_RECORD) {
      const kd = deaths > 0 ? kills / deaths : kills;
      if (kd > best.kd) {
        if (counts) events.push({ type: 'record', metric: 'kd', value: kd, ...info });
        best.kd = kd;
      }
    }
    if (shots >= MIN_SHOTS_FOR_HS_RECORD) {
      const hs = ((me.stats?.headshots ?? 0) / shots) * 100;
      if (hs > best.hs) {
        if (counts) events.push({ type: 'record', metric: 'hs', value: hs, ...info });
        best.hs = hs;
      }
    }
  });
  return events;
}

// Historique de rang : points (du plus ancien au plus récent), changements de
// rang et pic. `snapshots` vient du stockage durable (voir rank_snapshots).
function rankHistory(snapshots) {
  if (!snapshots || snapshots.length === 0) return null;
  const points = [...snapshots].sort((a, b) => a.at - b.at).map((s) => ({
    at: s.at,
    tierId: s.tierId,
    tierName: s.tierName,
    rr: s.rr,
    elo: s.elo ?? (s.tierId - 3) * 100 + s.rr,
  }));
  const changes = [];
  let highest = points[0].tierId;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].tierId !== points[i - 1].tierId) {
      const up = points[i].tierId > points[i - 1].tierId;
      changes.push({ type: up ? 'promotion' : 'demotion', at: points[i].at, tierName: points[i].tierName, fromName: points[i - 1].tierName, firstTime: up && points[i].tierId > highest });
    }
    highest = Math.max(highest, points[i].tierId);
  }
  const peak = points.reduce((a, b) => (b.elo > a.elo ? b : a));
  return { points, changes, trackedSince: points[0].at, current: points[points.length - 1], peak };
}

export function computeEvolution(matches, snapshots, name, tag) {
  const asc = excludeDeathmatch(matches ?? [])
    .filter((match) => findMe(match, name, tag))
    .sort((a, b) => startMs(a) - startMs(b));
  if (asc.length === 0) return null;

  const firstAt = startMs(asc[0]);
  const lastAt = startMs(asc[asc.length - 1]);
  const spanDays = Math.max(1, Math.round((lastAt - firstAt) / DAY_MS));
  const granularity = spanDays >= 120 ? 'month' : 'week';

  const agents = groupTable(asc, name, tag, (m, me) => me?.character);
  const maps = groupTable(asc, name, tag, (m) => m.metadata?.map);
  const sessions = buildSessions(asc);
  const rank = rankHistory(snapshots);
  const records = recordsOverTime(asc, name, tag);
  const streaks = longestWinStreaks(asc, name, tag);

  // Jalons, du plus récent au plus ancien.
  const milestones = [{ type: 'first', at: firstAt }];
  GAME_MILESTONES.forEach((count) => {
    if (asc.length >= count) milestones.push({ type: 'games', count, at: startMs(asc[count - 1]) });
  });
  streaks.forEach((s) => milestones.push({ type: 'streak', length: s.length, at: s.at }));
  agents.filter((a) => a.games >= MIN_AGENT_GAMES_EVENT).forEach((a) => milestones.push({ type: 'agent', agent: a.key, games: a.games, at: a.firstAt }));
  ['kills', 'kd', 'hs'].forEach((metric) => {
    // Seul le dernier record de chaque sorte est un jalon (les autres restent dans la liste des records).
    const last = [...records].reverse().find((r) => r.metric === metric);
    if (last) milestones.push(last);
  });
  if (rank) {
    rank.changes.filter((c) => c.firstTime).forEach((c) => milestones.push({ type: 'rankUp', tierName: c.tierName, at: c.at }));
  }
  milestones.sort((a, b) => b.at - a.at);

  return {
    totalGames: asc.length,
    firstAt,
    lastAt,
    spanDays,
    granularity,
    comparison: compareStartToNow(asc, name, tag),
    rolling: rollingSeries(asc, name, tag),
    agents,
    maps,
    sessions: sessionSummary(sessions, asc),
    sessionsPerPeriod: sessionsPerPeriod(sessions, granularity),
    records: [...records].reverse(),
    streaks,
    milestones,
    rank,
  };
}
