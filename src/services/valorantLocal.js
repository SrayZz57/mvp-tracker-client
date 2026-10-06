import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

// =============================================================================
// ÉTAT EN DIRECT DE LA PARTIE (API LOCALE DU CLIENT RIOT)
//
// Réintroduit en 1.14 pour l'overlay des rangs de la partie, UNIQUEMENT quand
// le joueur l'a activé lui-même (options désactivées par défaut dans les
// réglages — voir SettingsPage et CLAUDE.md). Le reste de l'app ne passe
// toujours pas par cette API : l'historique, le rang par acte et les prix de
// skins retirés en 1.10.6 ne reviennent pas.
//
// API NON OFFICIELLE : les endpoints peuvent changer sans préavis, donc chaque
// échec est silencieux côté interface, jamais bloquant. La politique Riot pour
// Valorant restreint l'affichage de données de joueurs en direct (opt-in des
// joueurs concernés, pas de « scouting ») : c'est un risque assumé par le
// joueur qui active l'option, pas un fonctionnement garanti.
//
// RÈGLE NON NÉGOCIABLE : un joueur en mode streamer (`incognito`) n'est ni
// nommé, ni analysé. On ne demande ni son pseudo ni son rang, et ils n'existent
// jamais dans ce qui sort de ce module (voir buildPlayers).
//
// Tout passe par le process principal : lecture du lockfile/log et certificat
// auto-signé, impossibles depuis le renderer (et que la CSP bloquerait).
// =============================================================================

const LOCKFILE = path.join(process.env.LOCALAPPDATA ?? '', 'Riot Games', 'Riot Client', 'Config', 'lockfile');
const SHOOTER_LOG = path.join(process.env.LOCALAPPDATA ?? '', 'VALORANT', 'Saved', 'Logs', 'ShooterGame.log');

// En-tête d'identification du client attendu par les serveurs Riot : valeur
// canonique du client PC (base64 d'un petit JSON). Figée volontairement : la
// ré-encoder change les octets (espaces, retours ligne) et Riot rejette.
const CLIENT_PLATFORM =
  'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9';

// Aucune requête ne doit pouvoir rester pendante : l'appelant enchaîne les
// polls, un client Riot qui répond mal ne doit pas les empiler.
const REQUEST_TIMEOUT_MS = 5000;

// Le client local présente un certificat auto-signé. Exception limitée à CE
// module et à 127.0.0.1 — jamais NODE_TLS_REJECT_UNAUTHORIZED, qui
// désactiverait la vérification pour toute l'app (Supabase, HenrikDev...).
// https.request plutôt que fetch : le fetch de Node (undici) ignore l'option
// d'agent, le certificat serait refusé malgré le réglage.
function localRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers, rejectUnauthorized: false, timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('local-timeout')));
    req.on('error', reject);
    req.end();
  });
}

function readLockfile() {
  if (!fs.existsSync(LOCKFILE)) return null;
  const parts = fs.readFileSync(LOCKFILE, 'utf8').trim().split(':');
  if (parts.length < 5) return null;
  const [, , port, password, protocol] = parts;
  return { port, password, protocol };
}

// Caches de la session du client Riot. Relancer le client change le mot de
// passe du lockfile : tout est alors invalidé (jetons, URL de région, parties
// mémorisées). resetLocalSession() les vide aussi quand l'option est coupée,
// pour ne garder aucun jeton en mémoire sans raison.
let sessionKey = null;
let authCache = null; // { auth, expiresAt }
let glzBaseCache = null;
let versionCache = null;
const knownMatch = { select: null, game: null };
const mmrCache = new Map(); // puuid -> { tier, expiresAt }
const nameCache = new Map(); // puuid -> { name, tag }
const AUTH_CACHE_MS = 5 * 60 * 1000;
const MMR_CACHE_MS = 5 * 60 * 1000;
const NAME_CACHE_MAX = 300;
let lastPhase = null;

export function resetLocalSession() {
  sessionKey = null;
  authCache = null;
  glzBaseCache = null;
  knownMatch.select = null;
  knownMatch.game = null;
  mmrCache.clear();
  nameCache.clear();
  lastPhase = null;
  logCursor = null;
  loadEvents.length = 0;
}

function syncSession(lock) {
  if (sessionKey !== null && sessionKey !== lock.password) resetLocalSession();
  sessionKey = lock.password;
}

// `subject` du jeton local = puuid du joueur connecté : pas besoin de le
// demander ailleurs. Le jeton reste valide bien plus longtemps que l'intervalle
// de poll, inutile de le redemander (aller-retour HTTPS auto-signé) à chaque tour.
async function getLocalAuth(lock) {
  if (authCache && authCache.expiresAt > Date.now()) return authCache.auth;
  const basic = Buffer.from(`riot:${lock.password}`).toString('base64');
  const res = await localRequest(`${lock.protocol}://127.0.0.1:${lock.port}/entitlements/v1/token`, {
    Authorization: `Basic ${basic}`,
  });
  if (res.status !== 200) throw new Error(`entitlements ${res.status}`);
  const json = JSON.parse(res.body);
  const auth = { accessToken: json.accessToken, entitlements: json.token, puuid: json.subject };
  authCache = { auth, expiresAt: Date.now() + AUTH_CACHE_MS };
  return auth;
}

// URL des serveurs de jeu (glz), écrite une fois par le client tôt dans
// ShooterGame.log. Ce log grossit pendant toute la session : on n'en lit que le
// début (la ligne y est déjà) et on mémorise le résultat, sinon chaque poll
// relirait un fichier de plus en plus gros (vrai souci de CPU constaté avant 1.10.6).
const LOG_HEAD_BYTES = 2 * 1024 * 1024;
function readGlzBase() {
  if (glzBaseCache) return glzBaseCache;
  if (!fs.existsSync(SHOOTER_LOG)) return null;
  const fd = fs.openSync(SHOOTER_LOG, 'r');
  try {
    const buffer = Buffer.alloc(LOG_HEAD_BYTES);
    const bytes = fs.readSync(fd, buffer, 0, LOG_HEAD_BYTES, 0);
    const match = buffer.toString('utf8', 0, bytes).match(/https:\/\/glz-[a-z0-9-]+\.[a-z0-9]+\.a\.pvp\.net/i);
    if (match) glzBaseCache = match[0];
    return glzBaseCache;
  } finally {
    fs.closeSync(fd);
  }
}

// glz-eu-1.eu.a.pvp.net -> pd.eu.a.pvp.net (rang et noms vivent sur « pd »)
function pdBaseFromGlz(glz) {
  const match = glz.match(/^https:\/\/glz-[a-z0-9-]+\.([a-z0-9-]+)\.a\.pvp\.net$/i);
  return match ? `https://pd.${match[1]}.a.pvp.net` : null;
}

async function getClientVersion() {
  if (versionCache) return versionCache;
  const res = await fetch('https://valorant-api.com/v1/version', { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`version ${res.status}`);
  versionCache = (await res.json()).data.riotClientVersion;
  return versionCache;
}

function riotHeaders(auth, version) {
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    'X-Riot-Entitlements-JWT': auth.entitlements,
    'X-Riot-ClientPlatform': CLIENT_PLATFORM,
    'X-Riot-ClientVersion': version,
  };
}

async function riotFetch(url, headers, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  // 400 : version du client périmée (patch sorti pendant la session) — on la
  // redemandera au prochain tour plutôt que de rester bloqué dessus.
  if (res.status === 400) versionCache = null;
  return res;
}

// --- Rang -------------------------------------------------------------------
// Le rang embarqué dans pregame/core-game ne reflète que la file Compétitive
// (0 ailleurs). Hors Compétitif on interroge donc MMR, avec un cache court pour
// ne pas le refaire à chaque poll pour les mêmes joueurs.
// Rang d'un joueur = `LatestCompetitiveUpdate.TierAfterUpdate`, le rang qu'il
// avait APRÈS son dernier match classé : c'est ce que le jeu affiche. Le rang ne
// repart pas de zéro à chaque acte mais à chaque ÉPISODE (V26 = toute l'année
// 2026) : un joueur qui n'a pas joué en classé depuis trois actes garde son rang.
// Seul un dernier match classé d'un épisode PRÉCÉDENT veut dire « non classé ».
//
// Avant 1.14, on lisait SeasonalInfoBySeasonID[saison].CompetitiveTier et on
// mettait à 0 tout joueur dont le dernier match n'était pas dans l'acte en
// cours — d'où des adversaires « sans rang » en pagaille (l'acte en cours avait
// 48 jours : presque tous les joueurs occasionnels étaient neutralisés).
let seasonsCache = null; // { currentEpisodeId, episodeBySeason, expiresAt }
const SEASONS_CACHE_MS = 6 * 60 * 60 * 1000;

// Les rangs sont demandés 4 à la fois : sans mémoriser la requête EN COURS, chacun
// relançait le téléchargement des saisons avant que le cache soit rempli (4
// requêtes identiques mesurées pour un seul match).
let seasonsInFlight = null;
function getSeasonsInfo() {
  if (seasonsCache && seasonsCache.expiresAt > Date.now()) return Promise.resolve(seasonsCache);
  if (!seasonsInFlight) {
    seasonsInFlight = loadSeasonsInfo().finally(() => {
      seasonsInFlight = null;
    });
  }
  return seasonsInFlight;
}

async function loadSeasonsInfo() {
  try {
    const res = await fetch('https://valorant-api.com/v1/seasons', { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    const seasons = (await res.json()).data ?? [];
    const now = Date.now();
    const currentAct = seasons.find(
      (season) =>
        season.type === 'EAresSeasonType::Act' &&
        new Date(season.startTime).getTime() <= now &&
        (!season.endTime || new Date(season.endTime).getTime() > now),
    );
    seasonsCache = {
      currentEpisodeId: currentAct?.parentUuid ?? null,
      episodeBySeason: new Map(seasons.map((season) => [season.uuid, season.parentUuid ?? season.uuid])),
      expiresAt: now + SEASONS_CACHE_MS,
    };
    return seasonsCache;
  } catch {
    return null;
  }
}

async function fetchMmrTier(pdBase, headers, puuid) {
  const cached = mmrCache.get(puuid);
  if (cached && cached.expiresAt > Date.now()) return cached.tier;
  try {
    const [res, seasons] = await Promise.all([riotFetch(`${pdBase}/mmr/v1/players/${puuid}`, headers), getSeasonsInfo()]);
    // Échec d'appel (429, réseau...) : 0 pour CETTE fois, sans le mettre en cache,
    // le prochain poll réessaie au lieu de figer « sans rang » pour 5 minutes.
    if (!res.ok) return 0;
    const latest = (await res.json()).LatestCompetitiveUpdate;
    let tier = 0;
    if (latest?.SeasonID) {
      // Saison inconnue ou liste des saisons injoignable : on fait confiance à Riot
      // plutôt que de tout masquer — seul un épisode précédent est neutralisé.
      const episode = seasons?.episodeBySeason.get(latest.SeasonID);
      const inCurrentEpisode = !seasons?.currentEpisodeId || !episode || episode === seasons.currentEpisodeId;
      if (inCurrentEpisode) tier = latest.TierAfterUpdate ?? 0;
    }
    mmrCache.set(puuid, { tier, expiresAt: Date.now() + MMR_CACHE_MS });
    return tier;
  } catch {
    return 0;
  }
}

// 5 à la fois au maximum (une équipe entière en un seul aller-retour) : la
// première résolution d'un match demande jusqu'à 9 rangs, pas une rafale de
// requêtes sur une API non supportée.
const MMR_CONCURRENCY = 5;
async function resolveMissingTiers(pdBase, headers, players) {
  const queue = players.filter((p) => !p.hidden && !(p.tier > 0));
  const workers = Array.from({ length: Math.min(MMR_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const player = queue.shift();
      // eslint-disable-next-line no-await-in-loop
      player.tier = await fetchMmrTier(pdBase, headers, player.puuid);
    }
  });
  await Promise.all(workers);
}

// --- Pseudos ----------------------------------------------------------------
// Une seule requête pour tous les joueurs pas encore connus. Jamais pour un
// joueur masqué : le service renverrait son pseudo, le client Riot lui-même
// le cache.
async function resolveNames(pdBase, headers, players) {
  const missing = players.filter((p) => !p.hidden && !nameCache.has(p.puuid)).map((p) => p.puuid);
  if (missing.length > 0) {
    try {
      const res = await riotFetch(`${pdBase}/name-service/v2/players`, headers, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(missing),
      });
      if (res.ok) {
        if (nameCache.size > NAME_CACHE_MAX) nameCache.clear();
        (await res.json()).forEach((entry) => {
          nameCache.set(entry.Subject, { name: entry.GameName ?? null, tag: entry.TagLine ?? null });
        });
      }
    } catch {
      // Pas de pseudo : l'overlay affichera le rang seul.
    }
  }
  players.forEach((p) => {
    const known = p.hidden ? null : nameCache.get(p.puuid);
    p.name = known?.name ?? null;
    p.tag = known?.tag ?? null;
  });
}

// Point unique où le mode streamer est appliqué : tout ce qui est `hidden` perd
// son rang, et aucun pseudo ne lui sera jamais associé (resolveNames l'ignore).
function buildPlayers(rawPlayers) {
  return rawPlayers.map((p) => ({ ...p, hidden: p.incognito, tier: p.incognito ? null : p.tier }));
}

// --- Phases -----------------------------------------------------------------
// Une requête par poll tant que le match est connu : on mémorise son id et on
// saute l'appel « players/{puuid} ». Les deux appels ne sont nécessaires que
// pour découvrir un nouveau match.
async function fetchPhase(phase, glz, pdBase, headers, puuid) {
  const base = phase === 'select' ? 'pregame' : 'core-game';

  if (!knownMatch[phase]) {
    const playerRes = await riotFetch(`${glz}/${base}/v1/players/${puuid}`, headers);
    if (playerRes.status === 404) return null;
    if (!playerRes.ok) throw new Error(`${base}-player ${playerRes.status}`);
    knownMatch[phase] = (await playerRes.json()).MatchID ?? null;
    if (!knownMatch[phase]) return null;
  }

  const matchId = knownMatch[phase];
  const matchRes = await riotFetch(`${glz}/${base}/v1/matches/${matchId}`, headers);
  if (matchRes.status === 404) {
    knownMatch[phase] = null;
    return null;
  }
  if (!matchRes.ok) throw new Error(`${base}-match ${matchRes.status}`);
  const match = await matchRes.json();

  let rawPlayers;
  let mode;
  let allLocked = false;
  if (phase === 'select') {
    // Sélection d'agent : seule MON équipe est exposée tant que la sélection est
    // active. Une fois « character_select_finished », Riot expose AUSSI l'équipe
    // adverse dans pregame, environ 5 s avant que la partie (core-game) existe
    // (mesuré : 11:52:30.985 pour pregame, 11:52:36.632 pour core-game). On la lit
    // dès là pour ne pas attendre ce délai pour rien. Jamais pendant la sélection
    // active, même si un jour Riot y exposait EnemyTeam : on ne s'appuie que sur
    // l'état « terminée ».
    mode = match.QueueID ?? null;
    const toPlayer = (p, team) => ({
      puuid: p.Subject,
      tier: p.CompetitiveTier ?? 0,
      agentId: p.CharacterID || null,
      incognito: p.PlayerIdentity?.Incognito ?? false,
      isMe: p.Subject === puuid,
      // '' | 'selected' (survolé) | 'locked' : sert à arrêter les suggestions d'agent
      // une fois le choix verrouillé.
      selectionState: p.CharacterSelectionState ?? '',
      team,
    });
    rawPlayers = (match.AllyTeam?.Players ?? []).map((p) => toPlayer(p, 'ally'));
    const selectionOver = !!match.PregameState && match.PregameState !== 'character_select_active';
    // Tout le monde a verrouillé : la fin de la sélection est proche, l'appelant
    // peut vérifier plus souvent (mesuré : ~25 s entre le dernier verrouillage et la fin).
    allLocked = (match.AllyTeam?.Players ?? []).length > 0 && (match.AllyTeam.Players).every((p) => p.CharacterSelectionState === 'locked');
    if (selectionOver) {
      rawPlayers.push(...(match.EnemyTeam?.Players ?? []).map((p) => toPlayer(p, 'enemy')));
    }
  } else {
    // Partie en cours : les deux équipes sont exposées. ModeID est un chemin de
    // ressource (/Game/GameModes/...), c'est la file qui dit si c'est du classé.
    mode = match.MatchmakingData?.QueueID ?? null;
    const myTeam = (match.Players ?? []).find((p) => p.Subject === puuid)?.TeamID ?? null;
    rawPlayers = (match.Players ?? []).map((p) => ({
      puuid: p.Subject,
      tier: p.SeasonalBadgeInfo?.Rank ?? 0,
      agentId: p.CharacterID || null,
      incognito: p.PlayerIdentity?.Incognito ?? false,
      isMe: p.Subject === puuid,
      team: myTeam && p.TeamID === myTeam ? 'ally' : 'enemy',
    }));
  }

  const players = buildPlayers(rawPlayers);
  // En vraie Compétitive le rang embarqué est déjà la bonne valeur ; un 0 y
  // signifie « non classé cette saison », pas un vide à combler (l'appeler
  // quand même y a déjà affiché un rang d'ACTE à la place du rang courant).
  // En parallèle : les deux sont indépendants, l'affichage n'attend que le plus lent.
  await Promise.all([mode !== 'competitive' ? resolveMissingTiers(pdBase, headers, players) : null, resolveNames(pdBase, headers, players)]);

  return { state: 'ok', phase, matchId, mode, mapId: match.MapID ?? null, players, allLocked };
}

// --- Catalogues valorant-api (suggestions d'agent) ---------------------------
// Noms des agents (par uuid), rôles et noms de maps, mis en cache 6 h. Les noms
// d'agent et de rôle sont en français parce que agentSuggestion.js compare des
// rôles écrits en français (Duelliste, Initiateur...) ; les noms de map sont en
// anglais (langue par défaut) comme metadata.map des matchs HenrikDev.
const CATALOG_CACHE_MS = 6 * 60 * 60 * 1000;
let agentCatalogCache = null;
let agentCatalogInFlight = null;
let mapCatalogCache = null;
let mapCatalogInFlight = null;

async function fetchJsonData(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`catalogue ${res.status}`);
  return (await res.json()).data ?? [];
}

/** { nameById: Map(uuid → nom), roles: Map(nom → { roleName }) } ou null si injoignable. */
export function getAgentCatalog() {
  if (agentCatalogCache && agentCatalogCache.expiresAt > Date.now()) return Promise.resolve(agentCatalogCache.value);
  if (!agentCatalogInFlight) {
    agentCatalogInFlight = fetchJsonData('https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=fr-FR')
      .then((agents) => {
        const value = {
          nameById: new Map(agents.map((agent) => [agent.uuid.toLowerCase(), agent.displayName])),
          roles: new Map(agents.map((agent) => [agent.displayName, { roleName: agent.role?.displayName ?? null }])),
        };
        agentCatalogCache = { value, expiresAt: Date.now() + CATALOG_CACHE_MS };
        return value;
      })
      .catch(() => null)
      .finally(() => {
        agentCatalogInFlight = null;
      });
  }
  return agentCatalogInFlight;
}

/** '/Game/Maps/Ascent/Ascent' → 'Ascent' (nom affiché par valorant-api), ou null. */
export async function getMapName(mapId) {
  if (!mapId) return null;
  if (!mapCatalogCache || mapCatalogCache.expiresAt <= Date.now()) {
    if (!mapCatalogInFlight) {
      mapCatalogInFlight = fetchJsonData('https://valorant-api.com/v1/maps')
        .then((maps) => {
          mapCatalogCache = { byUrl: new Map(maps.map((map) => [map.mapUrl, map.displayName])), expiresAt: Date.now() + CATALOG_CACHE_MS };
        })
        .catch(() => {})
        .finally(() => {
          mapCatalogInFlight = null;
        });
    }
    await mapCatalogInFlight;
  }
  return mapCatalogCache?.byUrl.get(mapId) ?? null;
}

// --- Fin du chargement d'un match (journal du jeu) ------------------------------
// À la fin de l'écran de chargement, Valorant écrit dans ShooterGame.log une ligne
//   [2026.10.06-12.22.18:662][195]LogLoadTimeMetrics: Display: [Match Load Times]
//   MatchId: <uuid>, LoadingScreenTime: 15.55, ...
// avec l'heure exacte (UTC) : c'est le moment où le round 1 commence (phase
// d'achat). Plus précis que la présence (« INGAME » démarre dès le chargement,
// mesuré : ~13 s plus tôt). Simple lecture du fichier, comme pour l'URL glz.
//
// On ne lit que ce qui est ÉCRIT APRÈS le début du suivi (curseur en fin de
// fichier) : le journal fait plusieurs Mo et grossit, jamais relu en entier.
const LOAD_EVENT_RE =
  /\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]\[\s*\d+\]LogLoadTimeMetrics: Display: \[Match Load Times\] MatchId: ([0-9a-f-]{36})/gi;
const LOG_READ_MAX_BYTES = 1024 * 1024;
let logCursor = null; // octets déjà lus
const loadEvents = []; // { matchId, loadedAt (ms, epoch) }

/** Place le curseur en fin de journal : seuls les chargements à venir comptent. */
export function startLoadWatch() {
  loadEvents.length = 0;
  try {
    logCursor = fs.statSync(SHOOTER_LOG).size;
  } catch {
    logCursor = null;
  }
}

function pollLoadEvents() {
  if (logCursor === null) return;
  try {
    const size = fs.statSync(SHOOTER_LOG).size;
    if (size < logCursor) logCursor = 0; // journal recréé (jeu relancé)
    if (size === logCursor) return;

    // Rattrapage borné : si le journal a énormément grossi, on saute à la fin.
    const length = Math.min(size - logCursor, LOG_READ_MAX_BYTES);
    const start = size - logCursor > LOG_READ_MAX_BYTES ? size - LOG_READ_MAX_BYTES : logCursor;
    const fd = fs.openSync(SHOOTER_LOG, 'r');
    let chunk;
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      chunk = buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }

    // On n'avance que jusqu'à la dernière ligne COMPLÈTE : une ligne en cours
    // d'écriture serait coupée en deux et l'événement manqué.
    const lastNewline = chunk.lastIndexOf('\n');
    const complete = lastNewline >= 0 ? chunk.slice(0, lastNewline + 1) : '';
    logCursor = start + Buffer.byteLength(complete, 'utf8');

    for (const m of complete.matchAll(LOAD_EVENT_RE)) {
      const [, y, mo, d, h, mi, s, ms, matchId] = m;
      loadEvents.push({ matchId: matchId.toLowerCase(), loadedAt: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms) });
    }
  } catch {
    // Journal illisible un instant : on réessaie au prochain tour.
  }
}

/**
 * Chargement terminé pour ce match ? Renvoie `{ matchId, loadedAt }` ou `null`.
 * Si l'identifiant du match n'est pas retrouvé tel quel dans le journal, on prend
 * le dernier chargement vu depuis le début du suivi (un seul match à la fois).
 */
export function findMatchLoaded(matchId) {
  pollLoadEvents();
  const wanted = matchId?.toLowerCase();
  return loadEvents.find((event) => event.matchId === wanted) ?? loadEvents[loadEvents.length - 1] ?? null;
}

/**
 * État de la SESSION du joueur via la présence du client Riot (appel purement
 * LOCAL, aucun serveur Riot) : `sessionLoopState` (MENUS / PREGAME / INGAME) et
 * le score des rounds. Sert à repérer le début du premier round (INGAME, 0-0).
 * Seule la présence du joueur connecté est lue, jamais celle des autres.
 *
 * Renvoie `null` quand l'info n'est pas disponible (client fermé, échec).
 */
export async function getSessionState() {
  try {
    const lock = readLockfile();
    if (!lock) return null;
    syncSession(lock);
    const auth = await getLocalAuth(lock);
    const basic = Buffer.from(`riot:${lock.password}`).toString('base64');
    const res = await localRequest(`${lock.protocol}://127.0.0.1:${lock.port}/chat/v4/presences`, {
      Authorization: `Basic ${basic}`,
    });
    if (res.status !== 200) return null;
    const mine = (JSON.parse(res.body).presences ?? []).find((presence) => presence.puuid === auth.puuid);
    if (!mine?.private) return null;
    const priv = JSON.parse(Buffer.from(mine.private, 'base64').toString('utf8'));
    return {
      sessionLoopState: priv.matchPresenceData?.sessionLoopState ?? null,
      allyScore: priv.partyOwnerMatchScoreAllyTeam ?? null,
      enemyScore: priv.partyOwnerMatchScoreEnemyTeam ?? null,
      queueId: priv.matchPresenceData?.queueId ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Sélection d'agent, puis partie qui suit.
 *
 * Renvoie toujours un objet avec un `state`, jamais une exception : appelée en
 * boucle, « ni en sélection ni en partie » est le cas normal.
 *   'idle'        — ni en sélection ni en partie
 *   'unavailable' — client fermé, log absent, ou API injoignable
 *   'ok'          — `players` renseigné ; `phase` 'select' (alliés seulement)
 *                    ou 'game' (alliés + adversaires, `team` sur chaque joueur)
 */
export async function getLiveMatch() {
  try {
    const lock = readLockfile();
    if (!lock) return { state: 'unavailable', reason: 'client-closed' };
    syncSession(lock);

    const glz = readGlzBase();
    if (!glz) return { state: 'unavailable', reason: 'no-glz' };
    const pdBase = pdBaseFromGlz(glz);
    if (!pdBase) return { state: 'unavailable', reason: 'no-pd-base' };

    const auth = await getLocalAuth(lock);
    const headers = riotHeaders(auth, await getClientVersion());

    // On teste d'abord la phase où l'on était : en pleine partie, ça évite un
    // appel pregame inutile à chaque poll.
    const order = lastPhase === 'game' ? ['game', 'select'] : ['select', 'game'];
    for (const phase of order) {
      // eslint-disable-next-line no-await-in-loop
      const result = await fetchPhase(phase, glz, pdBase, headers, auth.puuid);
      if (result) {
        lastPhase = phase;
        return result;
      }
    }
    lastPhase = null;
    return { state: 'idle' };
  } catch (err) {
    return { state: 'unavailable', reason: err.message };
  }
}
