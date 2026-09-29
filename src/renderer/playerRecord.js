import { excludeDeathmatch, findMe, formStats, overallHsPercent, resultLabel } from './valorantStats.js';

// Fiche d'un joueur régulièrement croisé : parties ensemble (même équipe) et face
// à face (équipes adverses), tes performances dans chaque cas comparées à ta
// moyenne, duels directs et historique commun. Présentation factuelle : on
// décrit les parties, on ne juge pas la personne. Logique pure, testée dans
// playerRecord.test.mjs.

export const MIN_GAMES_REGULAR = 2;
export const SOLID_SAMPLE = 5; // en dessous, les pourcentages sont à prendre avec recul

const startMs = (match) => (match.metadata?.game_start ?? 0) * 1000;

function standardMatches(matches, name, tag) {
  return excludeDeathmatch(matches ?? [])
    .filter((match) => findMe(match, name, tag))
    .sort((a, b) => startMs(b) - startMs(a));
}

// Dégâts par round du joueur suivi sur un lot de parties (null sans détail de round).
function damagePerRound(matches, name, tag) {
  let damage = 0;
  let rounds = 0;
  matches.forEach((match) => {
    const me = findMe(match, name, tag);
    (match.rounds ?? []).forEach((round) => {
      const mine = (round.player_stats ?? []).find((ps) => ps.player_puuid === me?.puuid);
      if (!mine) return;
      rounds += 1;
      damage += mine.damage ?? 0;
    });
  });
  return rounds > 0 ? damage / rounds : null;
}

function topAgents(matches, pick) {
  const counts = new Map();
  matches.forEach((match) => {
    const agent = pick(match);
    if (agent) counts.set(agent, (counts.get(agent) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([agent, games]) => ({ agent, games }));
}

// Bilan de mes performances sur un lot de parties (ensemble ou face à face).
function bucketStats(entries, name, tag) {
  const matches = entries.map((e) => e.match);
  let wins = 0;
  let losses = 0;
  entries.forEach((e) => {
    if (e.result === 'Victoire') wins += 1;
    else if (e.result === 'Défaite') losses += 1;
  });
  return {
    games: entries.length,
    wins,
    losses,
    winrate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    kd: matches.length > 0 ? formStats(matches, name, tag).overallKd : null,
    hsPercent: overallHsPercent(matches, name, tag),
    adr: damagePerRound(matches, name, tag),
    myAgents: topAgents(entries, (e) => e.myAgent),
    theirAgents: topAgents(entries, (e) => e.theirAgent),
  };
}

// Tous les joueurs croisés au moins `minGames` fois (dans un camp ou l'autre),
// les plus fréquents d'abord. Le pseudo affiché est le plus récent connu.
export function listRegulars(matches, name, tag, minGames = MIN_GAMES_REGULAR) {
  const players = new Map();
  standardMatches(matches, name, tag).forEach((match) => {
    const me = findMe(match, name, tag);
    (match.players?.all_players ?? []).forEach((p) => {
      if (!p.puuid || p.puuid === me.puuid) return;
      const entry = players.get(p.puuid) ?? { puuid: p.puuid, name: p.name, tag: p.tag, together: 0, against: 0, lastPlayed: startMs(match) };
      if (p.team === me.team) entry.together += 1;
      else entry.against += 1;
      players.set(p.puuid, entry);
    });
  });
  return [...players.values()]
    .map((p) => ({ ...p, total: p.together + p.against }))
    .filter((p) => p.total >= minGames)
    .sort((a, b) => b.total - a.total || b.lastPlayed - a.lastPlayed);
}

export function computePlayerRecord(matches, name, tag, puuid) {
  const mine = standardMatches(matches, name, tag);
  const entries = [];
  const duels = { mine: 0, theirs: 0 };
  let displayName = null;

  mine.forEach((match) => {
    const me = findMe(match, name, tag);
    const other = (match.players?.all_players ?? []).find((p) => p.puuid === puuid);
    if (!other || other.puuid === me.puuid) return;
    if (!displayName) displayName = { name: other.name, tag: other.tag };
    const side = other.team === me.team ? 'together' : 'against';

    (match.rounds ?? []).forEach((round) => {
      (round.player_stats ?? []).forEach((ps) => {
        (ps.kill_events ?? []).forEach((k) => {
          if (k.killer_puuid === me.puuid && k.victim_puuid === puuid) duels.mine += 1;
          if (k.killer_puuid === puuid && k.victim_puuid === me.puuid) duels.theirs += 1;
        });
      });
    });

    entries.push({
      match,
      side,
      result: resultLabel(match, me),
      myAgent: me.character ?? null,
      theirAgent: other.character ?? null,
      myKills: me.stats?.kills ?? 0,
      myDeaths: me.stats?.deaths ?? 0,
      myAssists: me.stats?.assists ?? 0,
    });
  });

  if (entries.length === 0) return null;

  const played = entries.map((e) => startMs(e.match)).sort((a, b) => a - b);
  const baselineMatches = mine;
  return {
    puuid,
    name: displayName.name,
    tag: displayName.tag,
    total: entries.length,
    firstPlayed: played[0],
    lastPlayed: played[played.length - 1],
    together: bucketStats(entries.filter((e) => e.side === 'together'), name, tag),
    against: bucketStats(entries.filter((e) => e.side === 'against'), name, tag),
    duels,
    baseline: {
      games: baselineMatches.length,
      kd: formStats(baselineMatches, name, tag).overallKd,
      hsPercent: overallHsPercent(baselineMatches, name, tag),
      adr: damagePerRound(baselineMatches, name, tag),
    },
    games: entries, // plus récentes d'abord
    solid: entries.length >= SOLID_SAMPLE,
  };
}
