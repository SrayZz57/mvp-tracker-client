// Rapproche chaque partie classée de sa variation de RR (historique de rang
// renvoyé par HenrikDev, voir get-mmr-history dans main.js).
//
// Clé fiable : l'identifiant de partie (`matchId`), présent sur les entrées
// récentes. Les entrées déjà en cache avant son ajout n'en ont pas : on
// retombe alors sur l'heure et la carte, chaque entrée ne servant qu'une seule
// fois. La date d'une entrée est l'heure de DÉBUT de la partie (vérifié sur de
// vraies parties : écart nul avec game_start, et non avec la fin).

const FALLBACK_WINDOW_MS = 3 * 60 * 1000;
const startMs = (match) => (match.metadata?.game_start ?? 0) * 1000;

export function rrByMatch(matches, history) {
  const result = new Map();
  const entries = (history ?? []).filter((entry) => typeof entry.change === 'number' && entry.date);
  if (!entries.length) return result;

  const ranked = (matches ?? []).filter((match) => match.metadata?.mode_id === 'competitive' && match.metadata?.matchid);
  const used = new Set();

  // 1. Identifiant de partie : correspondance exacte.
  const byId = new Map(entries.filter((entry) => entry.matchId).map((entry) => [entry.matchId, entry]));
  for (const match of ranked) {
    const entry = byId.get(match.metadata.matchid);
    if (entry) {
      result.set(match.metadata.matchid, entry.change);
      used.add(entry);
    }
  }

  // 2. Repli sur l'heure de début et la carte, pour les entrées sans identifiant.
  const pending = ranked.filter((match) => !result.has(match.metadata.matchid));
  const loose = entries.filter((entry) => !used.has(entry) && !entry.matchId);
  const pairs = [];
  for (const match of pending) {
    for (const entry of loose) {
      if (entry.map && match.metadata.map && entry.map !== match.metadata.map) continue;
      const diff = Math.abs(new Date(entry.date).getTime() - startMs(match));
      if (diff <= FALLBACK_WINDOW_MS) pairs.push({ match, entry, diff });
    }
  }
  pairs.sort((a, b) => a.diff - b.diff);
  const takenEntries = new Set();
  for (const { match, entry } of pairs) {
    if (result.has(match.metadata.matchid) || takenEntries.has(entry)) continue;
    result.set(match.metadata.matchid, entry.change);
    takenEntries.add(entry);
  }
  return result;
}
