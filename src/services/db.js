import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { app } from 'electron';
import { ABILITY_WEAPON_NAMES } from './matchNormalizer.js';

const db = new DatabaseSync(path.join(app.getPath('userData'), 'matches.db'));

// PRIMARY KEY composite (match_id, puuid) — pas juste match_id : deux joueurs
// suivis qui jouent ENSEMBLE partagent le même match_id (Riot en assigne un
// seul par partie), donc une clé sur match_id seul ne permettait d'enregistrer
// ce match que pour le premier des deux consulté, le second se le voyait
// silencieusement ignoré (INSERT OR IGNORE) et donc invisible dans son historique.
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT NOT NULL,
    puuid TEXT NOT NULL,
    game_start INTEGER,
    data TEXT NOT NULL,
    PRIMARY KEY (match_id, puuid)
  )
`);

// Migration pour les bases créées avant ce correctif — même schéma visé,
// juste appliqué a posteriori sans perdre les matchs déjà en cache.
(function migrateMatchesPrimaryKey() {
  const existingSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'matches'`).get()?.sql;
  if (!existingSql || existingSql.includes('PRIMARY KEY (match_id, puuid)')) return;
  db.exec('ALTER TABLE matches RENAME TO matches_legacy');
  db.exec(`
    CREATE TABLE matches (
      match_id TEXT NOT NULL,
      puuid TEXT NOT NULL,
      game_start INTEGER,
      data TEXT NOT NULL,
      PRIMARY KEY (match_id, puuid)
    )
  `);
  db.exec(
    'INSERT OR IGNORE INTO matches (match_id, puuid, game_start, data) SELECT match_id, puuid, game_start, data FROM matches_legacy',
  );
  db.exec('DROP TABLE matches_legacy');
})();

// Correctif rétroactif (une seule fois, via PRAGMA user_version comme
// marqueur) : avant l'ajout d'ABILITY_WEAPON_NAMES dans matchNormalizer.js,
// les kills au pistolet Headhunter et à l'ult Tour De Force de Chamber
// étaient stockés avec un nom d'arme vide (HenrikDev ne renvoie pas leur nom,
// seulement leur id) et donc invisibles dans les stats par arme. L'id, lui,
// était bien conservé — on répare les matchs déjà en cache directement,
// sans devoir tout re-télécharger depuis HenrikDev.
(function backfillAbilityWeaponNames() {
  const userVersion = db.prepare('PRAGMA user_version').get().user_version;
  if (userVersion >= 1) return;

  const rows = db.prepare('SELECT match_id, puuid, data FROM matches').all();
  const update = db.prepare('UPDATE matches SET data = ? WHERE match_id = ? AND puuid = ?');
  let patched = 0;
  for (const row of rows) {
    let match;
    try {
      match = JSON.parse(row.data);
    } catch {
      continue;
    }
    let changed = false;
    const fixKill = (k) => {
      if (!k.damage_weapon_name && ABILITY_WEAPON_NAMES[k.damage_weapon_id]) {
        k.damage_weapon_name = ABILITY_WEAPON_NAMES[k.damage_weapon_id];
        changed = true;
      }
    };
    (match.kills ?? []).forEach(fixKill);
    (match.rounds ?? []).forEach((r) => (r.player_stats ?? []).forEach((ps) => (ps.kill_events ?? []).forEach(fixKill)));
    if (changed) {
      update.run(JSON.stringify(match), row.match_id, row.puuid);
      patched += 1;
    }
  }
  if (patched > 0) console.log(`[db] backfillAbilityWeaponNames : ${patched} match(s) corrigé(s)`);
  db.exec('PRAGMA user_version = 1');
})();

db.exec(`
  CREATE TABLE IF NOT EXISTS ping_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puuid TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL,
    latency_ms INTEGER
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puuid TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    map TEXT NOT NULL,
    canvas_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS crosshairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puuid TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    color TEXT,
    image TEXT,
    created_at INTEGER NOT NULL
  )
`);

// Outil "Sessions" (Outils) — pas à confondre avec "Session guidée"
// (checklist d'échauffement, table weekly_narratives/etc.) : ici, une
// session = une plage horaire (démarrée/arrêtée à la main) sur laquelle on
// résume ensuite les vraies stats des matchs joués entre les deux, tirées du
// cache local déjà là (aucune donnée supplémentaire stockée par match — le
// résumé se recalcule à la demande à partir de started_at/ended_at).
// ended_at NULL = session en cours.
db.exec(`
  CREATE TABLE IF NOT EXISTS play_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puuid TEXT NOT NULL DEFAULT '',
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  )
`);

// Rang atteint sur chaque acte, récupéré via l'API locale du client Riot
// (voir valorantLocal.js/getSeasonalRanks — HenrikDev n'expose pas cet
// historique). `data` garde la réponse brute de l'acte en JSON plutôt que
// des colonnes dédiées : le champ exact utilisé à l'affichage (tier actuel)
// peut évoluer, pas besoin de migration pour ça. INSERT OR REPLACE : un acte
// déjà enregistré est écrasé par la valeur la plus récente à chaque appel
// réussi (le rang dans un acte EN COURS peut encore progresser).
db.exec(`
  CREATE TABLE IF NOT EXISTS seasonal_ranks (
    puuid TEXT NOT NULL,
    season_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (puuid, season_id)
  )
`);

// Résumé léger (pas les détails round par round) de chaque match, remonté
// directement depuis l'API locale du client Riot (voir
// valorantLocal.js/backfillActHistory) — sert UNIQUEMENT à alimenter les
// games/K/D/agent principal de "Rang par acte", jamais HenrikDev pour cette
// fonctionnalité (celui-ci ne garde que les 40 derniers matchs, insuffisant
// pour couvrir un historique complet par acte). INSERT OR IGNORE : le
// contenu d'un match déjà en cache ne change jamais.
db.exec(`
  CREATE TABLE IF NOT EXISTS act_match_stats (
    puuid TEXT NOT NULL,
    match_id TEXT NOT NULL,
    season_id TEXT,
    queue_id TEXT,
    game_start INTEGER,
    agent TEXT,
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (puuid, match_id)
  )
`);

// UNIQUE(match_id, puuid) — pas match_id seul : un match partagé entre deux
// comptes suivis (ou une simple re-tentative) faisait échouer silencieusement
// l'enregistrement dès qu'une ligne existait déjà pour ce match_id, peu importe
// le compte (même bug de fond que celui corrigé sur la table matches).
db.exec(`
  CREATE TABLE IF NOT EXISTS match_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puuid TEXT NOT NULL DEFAULT '',
    match_id TEXT NOT NULL,
    date TEXT NOT NULL,
    map TEXT,
    answers_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(match_id, puuid)
  )
`);

// Migration pour les bases créées avant ce correctif.
(function migrateAssessmentsUnique() {
  const existingSql = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'match_assessments'`)
    .get()?.sql;
  if (!existingSql || existingSql.includes('UNIQUE(match_id, puuid)')) return;
  db.exec('ALTER TABLE match_assessments RENAME TO match_assessments_legacy');
  db.exec(`
    CREATE TABLE match_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      puuid TEXT NOT NULL DEFAULT '',
      match_id TEXT NOT NULL,
      date TEXT NOT NULL,
      map TEXT,
      answers_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(match_id, puuid)
    )
  `);
  db.exec(
    `INSERT OR IGNORE INTO match_assessments (puuid, match_id, date, map, answers_json, created_at)
     SELECT puuid, match_id, date, map, answers_json, created_at FROM match_assessments_legacy`,
  );
  db.exec('DROP TABLE match_assessments_legacy');
})();

db.exec(`
  CREATE TABLE IF NOT EXISTS weekly_narratives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puuid TEXT NOT NULL DEFAULT '',
    week_start TEXT NOT NULL,
    recap_json TEXT NOT NULL,
    rank_json TEXT,
    narrative_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(puuid, week_start)
  )
`);

// Puzzle du jour retiré (2026-09) : plus de CREATE TABLE pour les nouvelles
// bases, et on nettoie la table des installations existantes — c'était une
// fonctionnalité autonome (aucune autre table n'y référence de ligne).
try {
  db.exec('DROP TABLE IF EXISTS puzzles');
} catch {
  // rien à nettoyer
}

// Migration légère pour les bases déjà créées avant l'ajout de ces colonnes.
try {
  db.exec('ALTER TABLE crosshairs ADD COLUMN color TEXT');
} catch {
  // colonne déjà présente
}
try {
  db.exec('ALTER TABLE crosshairs ADD COLUMN image TEXT');
} catch {
  // colonne déjà présente
}

// Scoping par compte (2026-08-18) : ajoute `puuid` aux tables qui n'en avaient
// pas encore, pour que consulter le tracker d'un autre joueur sur la même
// machine ne mélange plus ses données avec les tiennes. `weekly_narratives`
// avait une contrainte UNIQUE sur une seule colonne (week_start) — SQLite ne
// permet pas de la transformer en UNIQUE composite via ALTER TABLE, donc
// cette table est recréée avec le bon schéma si elle existe encore sous
// l'ancienne forme (détecté via absence de la colonne puuid), en conservant
// les lignes existantes.
function tableHasColumn(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

function addPuuidColumn(table) {
  if (!tableHasColumn(table, 'puuid')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN puuid TEXT NOT NULL DEFAULT ''`);
  }
}

addPuuidColumn('strategies');
addPuuidColumn('crosshairs');
addPuuidColumn('match_assessments');
addPuuidColumn('ping_samples');

function recreateWithCompositeUnique(table, columns, uniqueCols) {
  if (tableHasColumn(table, 'puuid')) {
    // Colonne déjà là : soit table neuve (CREATE TABLE ci-dessus l'a posée),
    // soit déjà migrée lors d'un lancement précédent — rien à faire.
    const hadUniqueAlready = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table)?.sql;
    if (hadUniqueAlready?.includes(`UNIQUE(${uniqueCols.join(', ')})`)) return;
  }
  const legacyCols = columns.filter((c) => c !== 'puuid');
  db.exec(`ALTER TABLE ${table} RENAME TO ${table}_legacy`);
  db.exec(`CREATE TABLE weekly_narratives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        puuid TEXT NOT NULL DEFAULT '',
        week_start TEXT NOT NULL,
        recap_json TEXT NOT NULL,
        rank_json TEXT,
        narrative_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(puuid, week_start)
      )`);
  const hasPuuidInLegacy = tableHasColumn(`${table}_legacy`, 'puuid');
  const selectCols = legacyCols.map((c) => (c === 'puuid' ? "''" : c));
  db.exec(
    `INSERT INTO ${table} (${legacyCols.join(', ')}) SELECT ${hasPuuidInLegacy ? legacyCols.join(', ') : selectCols.join(', ')} FROM ${table}_legacy`,
  );
  db.exec(`DROP TABLE ${table}_legacy`);
}

recreateWithCompositeUnique(
  'weekly_narratives',
  ['id', 'puuid', 'week_start', 'recap_json', 'rank_json', 'narrative_json', 'created_at'],
  ['puuid', 'week_start'],
);

// Attribue les lignes créées avant ce scoping (puuid = '') au compte
// actuellement configuré, pour ne pas perdre l'historique déjà là.
export function backfillLegacyPuuid(puuid) {
  if (!puuid) return;
  ['strategies', 'crosshairs', 'match_assessments', 'weekly_narratives', 'ping_samples'].forEach((table) => {
    db.prepare(`UPDATE ${table} SET puuid = ? WHERE puuid = ''`).run(puuid);
  });
}

export function saveMatches(puuid, matches) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO matches (match_id, puuid, game_start, data) VALUES (?, ?, ?, ?)',
  );
  // HenrikDev renvoie parfois une entrée null/incomplète dans la liste (match
  // corrompu de leur côté) — on l'ignore plutôt que de planter dessus. Logué
  // (pas juste silencieusement ignoré) pour pouvoir diagnostiquer un compte
  // dont AUCUN match n'arrive jamais en cache malgré une requête HenrikDev
  // réussie — sinon ce cas précis est indiscernable d'un simple 0 match.
  let skipped = 0;
  for (const match of matches) {
    if (!match?.metadata?.matchid) {
      skipped += 1;
      continue;
    }
    insert.run(match.metadata.matchid, puuid, match.metadata.game_start, JSON.stringify(match));
  }
  if (skipped > 0) {
    console.error(`[db] saveMatches (puuid=${puuid}) : ${skipped}/${matches.length} match(s) ignoré(s) — metadata.matchid manquant`);
  }
}

export function getCachedMatches(puuid) {
  const rows = db
    .prepare('SELECT data FROM matches WHERE puuid = ? ORDER BY game_start DESC')
    .all(puuid);
  return rows.map((row) => JSON.parse(row.data));
}

export function savePingSample(puuid, latencyMs) {
  db.prepare('INSERT INTO ping_samples (puuid, timestamp, latency_ms) VALUES (?, ?, ?)').run(
    puuid,
    Date.now(),
    latencyMs,
  );
}

export function getAllPingSamples(puuid) {
  return db
    .prepare('SELECT timestamp, latency_ms FROM ping_samples WHERE puuid = ? ORDER BY timestamp ASC')
    .all(puuid);
}

export function saveCrosshair(puuid, name, code, color, image) {
  db.prepare(
    'INSERT INTO crosshairs (puuid, name, code, color, image, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(puuid, name, code, color || null, image || null, Date.now());
}

export function getCrosshairs(puuid) {
  return db
    .prepare('SELECT id, name, code, color, image FROM crosshairs WHERE puuid = ? ORDER BY created_at DESC')
    .all(puuid);
}

export function deleteCrosshair(puuid, id) {
  db.prepare('DELETE FROM crosshairs WHERE id = ? AND puuid = ?').run(id, puuid);
}

export function saveStrategy(puuid, name, map, canvasJson) {
  db.prepare(
    'INSERT INTO strategies (puuid, name, map, canvas_json, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(puuid, name, map, canvasJson, Date.now());
}

export function getStrategiesForMap(puuid, map) {
  return db
    .prepare(
      'SELECT id, name, map, canvas_json, created_at FROM strategies WHERE map = ? AND puuid = ? ORDER BY created_at DESC',
    )
    .all(map, puuid);
}

export function deleteStrategy(puuid, id) {
  db.prepare('DELETE FROM strategies WHERE id = ? AND puuid = ?').run(id, puuid);
}

export function getActivePlaySession(puuid) {
  return (
    db.prepare('SELECT * FROM play_sessions WHERE puuid = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(puuid) ??
    null
  );
}

export function startPlaySession(puuid) {
  // Referme toute session déjà active pour ce compte avant d'en ouvrir une
  // nouvelle — ne devrait jamais arriver via l'UI normale (le bouton
  // "Démarrer" est caché tant qu'une session tourne), mais évite un doublon
  // silencieux si l'app a été fermée en plein milieu d'une session passée.
  db.prepare('UPDATE play_sessions SET ended_at = ? WHERE puuid = ? AND ended_at IS NULL').run(Date.now(), puuid);
  db.prepare('INSERT INTO play_sessions (puuid, started_at) VALUES (?, ?)').run(puuid, Date.now());
  return getActivePlaySession(puuid);
}

export function endPlaySession(puuid, id) {
  db.prepare('UPDATE play_sessions SET ended_at = ? WHERE id = ? AND puuid = ?').run(Date.now(), id, puuid);
}

export function getPlaySessionHistory(puuid, limit = 30) {
  return db
    .prepare('SELECT * FROM play_sessions WHERE puuid = ? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?')
    .all(puuid, limit);
}

export function saveSeasonalRanks(puuid, seasons) {
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO seasonal_ranks (puuid, season_id, data, updated_at) VALUES (?, ?, ?, ?)',
  );
  seasons.forEach(({ seasonId, ...info }) => {
    if (!seasonId) return;
    stmt.run(puuid, seasonId, JSON.stringify(info), now);
  });
}

export function getSeasonalRanks(puuid) {
  return db
    .prepare('SELECT season_id, data FROM seasonal_ranks WHERE puuid = ?')
    .all(puuid)
    .map((row) => ({ seasonId: row.season_id, ...JSON.parse(row.data) }));
}

export function saveActMatchStats(puuid, rows) {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO act_match_stats (puuid, match_id, season_id, queue_id, game_start, agent, kills, deaths) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  rows.forEach((r) => {
    stmt.run(puuid, r.matchId, r.seasonId, r.queueId, r.gameStart, r.agent, r.kills ?? 0, r.deaths ?? 0);
  });
}

export function getActMatchStats(puuid) {
  return db.prepare('SELECT match_id, season_id, queue_id, agent, kills, deaths FROM act_match_stats WHERE puuid = ?').all(puuid);
}

export function getAssessmentForMatch(puuid, matchId) {
  return db.prepare('SELECT * FROM match_assessments WHERE match_id = ? AND puuid = ?').get(matchId, puuid) ?? null;
}

export function saveAssessment(puuid, matchId, date, map, answersJson) {
  db.prepare(
    'INSERT OR REPLACE INTO match_assessments (puuid, match_id, date, map, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(puuid, matchId, date, map || null, answersJson, Date.now());
  return getAssessmentForMatch(puuid, matchId);
}

export function getAssessmentHistory(puuid, limit) {
  return db
    .prepare('SELECT * FROM match_assessments WHERE puuid = ? ORDER BY created_at DESC LIMIT ?')
    .all(puuid, limit);
}

export function getNarrativeForWeek(puuid, weekStart) {
  return db.prepare('SELECT * FROM weekly_narratives WHERE week_start = ? AND puuid = ?').get(weekStart, puuid) ?? null;
}

export function getPreviousNarrative(puuid, weekStart) {
  return (
    db
      .prepare('SELECT * FROM weekly_narratives WHERE week_start < ? AND puuid = ? ORDER BY week_start DESC LIMIT 1')
      .get(weekStart, puuid) ?? null
  );
}

export function saveNarrative(puuid, weekStart, recapJson, rankJson, narrativeJson) {
  db.prepare(
    'INSERT INTO weekly_narratives (puuid, week_start, recap_json, rank_json, narrative_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(puuid, weekStart, recapJson, rankJson || null, narrativeJson, Date.now());
  return getNarrativeForWeek(puuid, weekStart);
}

export function getNarrativeHistory(puuid, limit) {
  return db.prepare('SELECT * FROM weekly_narratives WHERE puuid = ? ORDER BY week_start DESC LIMIT ?').all(puuid, limit);
}

