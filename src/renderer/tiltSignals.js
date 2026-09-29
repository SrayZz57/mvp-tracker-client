import { excludeDeathmatch, findMe, overallHsPercent, overallWinrate, resultLabel } from './valorantStats.js';

// Signaux de baisse de performance (onglet Tilt). Chaque signal est une MESURE
// observable comparée à une référence — le terme « tilt » est subjectif, l'app
// présente donc des signaux statistiques et une suggestion, jamais un diagnostic.
// Logique pure, testée dans tiltSignals.test.mjs.

export const RECENT_MATCHES = 3;
const WINRATE_WINDOW = 5;
// En dessous, la référence « d'habitude » repose sur trop peu de parties.
const MIN_REFERENCE_MATCHES = 5;
const LOW_DATA_MATCHES = 10;
// Deux parties séparées de moins que ça appartiennent à la même session.
const SESSION_GAP_MS = 45 * 60 * 1000;
// Au-delà de ce délai sans partie, le joueur est déjà en pause : plus de session
// en cours, et surtout plus rien à lui suggérer (les signaux datent d'avant).
const ONGOING_WITHIN_MS = 90 * 60 * 1000;

const startMs = (match) => (match.metadata?.game_start ?? 0) * 1000;
const endMs = (match) => startMs(match) + (match.metadata?.game_length ?? 0) * 1000;

function kdOf(matches, name, tag) {
  let kills = 0;
  let deaths = 0;
  matches.forEach((match) => {
    const me = findMe(match, name, tag);
    kills += me?.stats?.kills ?? 0;
    deaths += me?.stats?.deaths ?? 0;
  });
  return deaths > 0 ? kills / deaths : null;
}

// Part des rounds où le joueur est le PREMIER à mourir (avant tout autre kill du
// round). null s'il n'y a aucun détail de round exploitable.
function firstDeathRate(matches, name, tag) {
  let firstDeaths = 0;
  let rounds = 0;
  matches.forEach((match) => {
    const me = findMe(match, name, tag);
    if (!me || !(match.rounds?.length > 0)) return;
    match.rounds.forEach((round) => {
      const kills = (round.player_stats ?? []).flatMap((ps) => ps.kill_events ?? []);
      rounds += 1;
      if (kills.length === 0) return;
      const first = kills.reduce((a, b) => ((b.kill_time_in_round ?? Infinity) < (a.kill_time_in_round ?? Infinity) ? b : a));
      if (first.victim_puuid === me.puuid) firstDeaths += 1;
    });
  });
  return rounds > 0 ? firstDeaths / rounds : null;
}

function trailingLosses(matches, name, tag) {
  let streak = 0;
  for (const match of matches) {
    const me = findMe(match, name, tag);
    if (!me || resultLabel(match, me) !== 'Défaite') break;
    streak += 1;
  }
  return streak;
}

// Session en cours ou la plus récente : parties enchaînées à moins de 45 min
// d'écart, de la plus récente vers l'arrière.
function currentSession(matches, nowMs) {
  if (matches.length === 0) return null;
  const cluster = [matches[0]];
  for (let i = 1; i < matches.length; i += 1) {
    if (startMs(cluster[cluster.length - 1]) - endMs(matches[i]) > SESSION_GAP_MS) break;
    cluster.push(matches[i]);
  }
  const sessionStart = startMs(cluster[cluster.length - 1]);
  const sessionEnd = endMs(cluster[0]);
  return { games: cluster.length, durationMs: Math.max(0, sessionEnd - sessionStart), endedAt: sessionEnd, ongoing: nowMs - sessionEnd <= ONGOING_WITHIN_MS };
}

const NA = (id) => ({ id, status: 'na', value: null, reference: null });

// Compare `value` à sa référence : plus c'est bas (ou haut, selon `lowerIsWorse`)
// plus l'état monte. `watch`/`alert` sont les rapports ou écarts de déclenchement.
function ratioStatus(ratio, watch, alert) {
  if (ratio <= alert) return 'alert';
  if (ratio <= watch) return 'watch';
  return 'ok';
}

export function computeTiltSignals(matches, name, tag, nowMs = Date.now()) {
  const list = excludeDeathmatch(matches ?? [])
    .filter((match) => findMe(match, name, tag))
    .sort((a, b) => startMs(b) - startMs(a));

  const recent = list.slice(0, RECENT_MATCHES);
  const older = list.slice(RECENT_MATCHES);
  const useOlder = older.length >= MIN_REFERENCE_MATCHES;
  const baseline = useOlder ? older : list;
  const lowReference = !useOlder;
  const enoughRecent = recent.length >= RECENT_MATCHES;

  const signals = [];

  // 1. Série de défaites en cours.
  const losses = trailingLosses(list, name, tag);
  signals.push({ id: 'lossStreak', status: losses >= 3 ? 'alert' : losses === 2 ? 'watch' : 'ok', value: losses, reference: 3 });

  // 2. K/D récent contre K/D habituel.
  const recentKd = enoughRecent ? kdOf(recent, name, tag) : null;
  const baseKd = kdOf(baseline, name, tag);
  signals.push(
    recentKd === null || baseKd === null
      ? NA('kd')
      : { id: 'kd', status: ratioStatus(recentKd / baseKd, 0.85, 0.7), value: recentKd, reference: baseKd, lowReference },
  );

  // 3. Premières morts (mourir avant tout le monde dans le round).
  const recentFirst = enoughRecent ? firstDeathRate(recent, name, tag) : null;
  const baseFirst = firstDeathRate(baseline, name, tag);
  // Une référence à zéro ne doit pas empêcher de repérer une hausse : on compare à
  // un plancher, et on exige aussi un écart absolu pour ne pas réagir au bruit.
  const firstStatus = (recentRate, baseRate) => {
    const ratio = recentRate / Math.max(baseRate, 0.05);
    const gap = recentRate - baseRate;
    if (ratio >= 1.3 && gap >= 0.08) return 'alert';
    if (ratio >= 1.15 && gap >= 0.04) return 'watch';
    return 'ok';
  };
  signals.push(
    recentFirst === null || baseFirst === null
      ? NA('firstDeaths')
      : { id: 'firstDeaths', status: firstStatus(recentFirst, baseFirst), value: recentFirst, reference: baseFirst, lowReference },
  );

  // 4. Précision tête.
  const recentHs = enoughRecent ? overallHsPercent(recent, name, tag) : null;
  const baseHs = overallHsPercent(baseline, name, tag);
  signals.push(
    recentHs === null || baseHs === null
      ? NA('hs')
      : { id: 'hs', status: recentHs - baseHs <= -6 ? 'alert' : recentHs - baseHs <= -3 ? 'watch' : 'ok', value: recentHs, reference: baseHs, lowReference },
  );

  // 5. Winrate des 5 dernières parties contre l'habituel.
  const wrRecent = list.length >= WINRATE_WINDOW ? overallWinrate(list.slice(0, WINRATE_WINDOW), name, tag) : null;
  const wrOlderList = list.slice(WINRATE_WINDOW);
  const wrUseOlder = wrOlderList.length >= MIN_REFERENCE_MATCHES;
  const wrBase = overallWinrate(wrUseOlder ? wrOlderList : list, name, tag);
  signals.push(
    wrRecent === null || wrBase === null
      ? NA('winrate')
      : { id: 'winrate', status: wrRecent - wrBase <= -25 ? 'alert' : wrRecent - wrBase <= -12 ? 'watch' : 'ok', value: wrRecent, reference: wrBase, lowReference: !wrUseOlder },
  );

  // 6. Durée de la session en cours (seulement si elle est en cours).
  const session = currentSession(list, nowMs);
  const hours = session ? session.durationMs / 3600000 : 0;
  signals.push(
    !session || !session.ongoing
      ? { ...NA('session'), session }
      : { id: 'session', status: hours >= 4 ? 'alert' : hours >= 2.5 ? 'watch' : 'ok', value: session.durationMs, reference: 2.5 * 3600000, session },
  );

  const alerts = signals.filter((s) => s.status === 'alert').length;
  const watches = signals.filter((s) => s.status === 'watch').length;
  let signalLevel = 'calm';
  if (alerts >= 2 || (alerts >= 1 && watches >= 2)) signalLevel = 'strong';
  else if (alerts >= 1 || watches >= 2) signalLevel = 'watch';

  // Aucune partie récente : pas de suggestion de pause à faire (le joueur ne joue
  // pas). Les signaux restent visibles, mais comme photo de sa dernière session.
  const lastEndedAt = list.length > 0 ? endMs(list[0]) : null;
  const idleMs = lastEndedAt === null ? null : Math.max(0, nowMs - lastEndedAt);
  const idle = idleMs !== null && idleMs > ONGOING_WITHIN_MS;

  return {
    level: idle ? 'idle' : signalLevel,
    signalLevel,
    idle,
    idleMs,
    signals,
    alerts,
    watches,
    matchCount: list.length,
    lowData: list.length < LOW_DATA_MATCHES,
  };
}
