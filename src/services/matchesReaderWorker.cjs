'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');

// Fichier volontairement en CommonJS brut (.cjs), pas traité par le build
// Vite du process principal — chargé tel quel via new Worker(), copié en
// extraResource comme icon.ico (voir forge.config.js et trayIconPath dans
// main.js) puisque src/ n'existe plus une fois l'app empaquetée.
//
// Connexion séparée de celle de db.js (process principal), en lecture seule
// — WAL activé côté process principal (voir db.js) pour que cette lecture ne
// bloque jamais une écriture (nouveaux matchs synchronisés) en cours, ni
// l'inverse.
const db = new DatabaseSync(workerData.dbPath, { readOnly: true });
const stmt = db.prepare('SELECT data FROM matches WHERE puuid = ? ORDER BY game_start DESC');
const limitedStmt = db.prepare('SELECT data FROM matches WHERE puuid = ? ORDER BY game_start DESC LIMIT ?');

// Chaque kill embarque la position de TOUS les joueurs à cet instant
// (player_locations_on_kill, ~10 entrées) — ~54 % du poids du détail des
// matchs, dupliqué dans kills[] ET dans rounds[].player_stats[].kill_events[].
// Le seul lecteur (killDistance, valorantStats.js) ne regarde que l'entrée du
// TUEUR : on ne garde que celle-là. Fait à la lecture, la base n'est pas
// modifiée (réversible) ; mesuré sur un compte réel : ~40 % de mémoire en
// moins pour les matchs dans l'interface (et autant de volume transféré par
// IPC), avec des stats de distance strictement identiques.
function keepKillerLocationOnly(kill) {
  const locations = kill.player_locations_on_kill;
  if (!Array.isArray(locations) || locations.length <= 1) return;
  const killerEntry = locations.find((entry) => entry.player_puuid === kill.killer_puuid);
  kill.player_locations_on_kill = killerEntry ? [killerEntry] : [];
}

function slimMatch(match) {
  (match.kills ?? []).forEach(keepKillerLocationOnly);
  (match.rounds ?? []).forEach((round) => {
    (round.player_stats ?? []).forEach((stats) => (stats.kill_events ?? []).forEach(keepKillerLocationOnly));
  });
  return match;
}

parentPort.on('message', ({ id, puuid, limit }) => {
  try {
    const rows = limit ? limitedStmt.all(puuid, limit) : stmt.all(puuid);
    const matches = rows.map((row) => slimMatch(JSON.parse(row.data)));
    parentPort.postMessage({ id, matches });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
