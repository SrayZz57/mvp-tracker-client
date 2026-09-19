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

parentPort.on('message', ({ id, puuid }) => {
  try {
    const rows = stmt.all(puuid);
    const matches = rows.map((row) => JSON.parse(row.data));
    parentPort.postMessage({ id, matches });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
