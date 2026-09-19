import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { app } from 'electron';

// getCachedMatches() (db.js) lit et JSON.parse tout l'historique en cache
// d'un coup — sur un compte actif, ça peut représenter des centaines de Mo
// (vérifié en usage réel : 166 matchs / 115 Mo sur un seul compte, ~770ms de
// lecture+parse). node:sqlite est synchrone, donc appelé depuis le process
// principal ça bloquait TOUT (affichage de la fenêtre, IPC) le temps de
// l'opération — signalé comme lenteur au démarrage qu'aucun découpage du
// bundle renderer ne pouvait corriger, le blocage étant côté process
// principal. Déporté ici dans un worker thread dédié avec sa propre
// connexion en lecture seule, pour ne plus jamais geler le process principal.
const workerPath = app.isPackaged
  ? path.join(process.resourcesPath, 'matchesReaderWorker.cjs')
  : path.join(__dirname, '..', '..', 'src', 'services', 'matchesReaderWorker.cjs');

const dbPath = path.join(app.getPath('userData'), 'matches.db');

let worker = null;
let nextRequestId = 1;
const pending = new Map();

function rejectAllPending(err) {
  for (const resolver of pending.values()) resolver.reject(err);
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(workerPath, { workerData: { dbPath } });
  worker.on('message', ({ id, matches, error }) => {
    const resolver = pending.get(id);
    if (!resolver) return;
    pending.delete(id);
    if (error) resolver.reject(new Error(error));
    else resolver.resolve(matches);
  });
  // Le worker ne fait que de la lecture — un crash reste rare, mais sans ça
  // une requête en attente resterait bloquée pour toujours plutôt que
  // d'échouer proprement. Recréé au prochain appel.
  worker.on('error', (err) => {
    rejectAllPending(err);
    worker = null;
  });
  worker.on('exit', () => {
    rejectAllPending(new Error('matchesReaderWorker: arrêt inattendu'));
    worker = null;
  });
  return worker;
}

export function getCachedMatchesAsync(puuid) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, puuid });
  });
}
