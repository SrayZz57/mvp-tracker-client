import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

// =============================================================================
// API LOCALE DE VALORANT
//
// Contrairement à HenrikDev (service tiers, quota de requêtes, données à
// quelques minutes de décalage), cette API est celle du client Valorant qui
// tourne sur la machine. Elle donne l'état EN DIRECT — notamment la sélection
// d'agent, que rien d'autre ne permet de voir.
//
// Contraintes qui en découlent :
//   - ne marche que sur le PC qui joue, client Riot lancé
//   - tout passe par le process principal : lecture de fichiers (lockfile,
//     log) et certificat auto-signé, deux choses impossibles depuis le
//     renderer (et que la CSP bloquerait de toute façon)
//   - API non officielle : les endpoints peuvent changer sans préavis, donc
//     chaque échec doit être silencieux côté interface, jamais bloquant
// =============================================================================

const LOCKFILE = path.join(
  process.env.LOCALAPPDATA ?? '',
  'Riot Games',
  'Riot Client',
  'Config',
  'lockfile',
);

const SHOOTER_LOG = path.join(
  process.env.LOCALAPPDATA ?? '',
  'VALORANT',
  'Saved',
  'Logs',
  'ShooterGame.log',
);

// En-tête d'identification du client attendu par les serveurs Riot. C'est la
// valeur canonique utilisée par le client PC (base64 d'un petit JSON décrivant
// la plateforme). Elle est figée volontairement : la ré-encoder soi-même
// change les octets (espaces, retours ligne) et Riot rejette la requête.
const CLIENT_PLATFORM =
  'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9';

// Le client local présente un certificat auto-signé : sans exception, la
// requête échoue. L'exception est limitée à CE module et à 127.0.0.1 — on ne
// touche jamais à NODE_TLS_REJECT_UNAUTHORIZED, qui désactiverait la
// vérification pour toutes les requêtes de l'app (Supabase, HenrikDev...).
//
// On passe par https.request plutôt que fetch : le fetch intégré à Node
// (undici) ignore l'option `agent`, qui vient de node-fetch. Le certificat
// auto-signé serait donc refusé malgré le réglage.
function localRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: 'GET', headers, rejectUnauthorized: false },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Lit le lockfile écrit par le client Riot au démarrage. */
export function readLockfile() {
  if (!fs.existsSync(LOCKFILE)) return null;
  const parts = fs.readFileSync(LOCKFILE, 'utf8').trim().split(':');
  if (parts.length < 5) return null;
  const [, , port, password, protocol] = parts;
  return { port, password, protocol };
}

// Le jeton local reste valide largement plus longtemps que l'intervalle de
// poll (4s, voir useAgentSelectData.js) — le redemander à chaque poll faisait
// un aller-retour HTTPS complet (avec le certificat auto-signé) pour rien à
// chaque tour. Cache court, invalidé si le lockfile change (relance du
// client Riot = nouveau mot de passe).
let authCache = null; // { password, auth, expiresAt }
const AUTH_CACHE_MS = 5 * 60 * 1000;

/**
 * Jetons d'accès, obtenus auprès du client local.
 * `subject` est le puuid du joueur connecté — pas besoin de le demander
 * ailleurs ni de le faire saisir.
 */
async function getLocalAuth(lock) {
  if (authCache && authCache.password === lock.password && authCache.expiresAt > Date.now()) {
    return authCache.auth;
  }
  const basic = Buffer.from(`riot:${lock.password}`).toString('base64');
  const res = await localRequest(
    `${lock.protocol}://127.0.0.1:${lock.port}/entitlements/v1/token`,
    { Authorization: `Basic ${basic}` },
  );
  if (res.status !== 200) throw new Error(`entitlements ${res.status}`);
  const json = JSON.parse(res.body);
  const auth = { accessToken: json.accessToken, entitlements: json.token, puuid: json.subject };
  authCache = { password: lock.password, auth, expiresAt: Date.now() + AUTH_CACHE_MS };
  return auth;
}

// Cette URL ne change jamais en cours de session (elle est écrite une fois
// par le client, tôt dans ShooterGame.log, au moment du routing régional) —
// mais ce log grossit tout au long de la session de jeu (pas par match, tout
// le log du client). Le relire en entier + regex dessus à chaque poll (4s,
// voir useAgentSelectData.js) devenait de plus en plus coûteux à mesure que
// le fichier grandissait pendant une longue session, un vrai souci de CPU
// constaté chez un testeur. Mis en cache après la première lecture réussie,
// comme versionCache juste en dessous.
let glzBaseCache = null;

/**
 * Base des serveurs de jeu (glz), lue dans le log du jeu.
 * La doc ne décrit pas comment dériver le couple région/shard, et le déduire
 * de la seule région est faux pour les comptes créés dans une autre zone. Le
 * log, lui, contient l'URL réellement utilisée par le client.
 */
export function readGlzBase() {
  if (glzBaseCache) return glzBaseCache;
  if (!fs.existsSync(SHOOTER_LOG)) return null;
  const log = fs.readFileSync(SHOOTER_LOG, 'utf8');
  const match = log.match(/https:\/\/glz-[a-z0-9-]+\.[a-z0-9]+\.a\.pvp\.net/i);
  if (match) glzBaseCache = match[0];
  return match ? match[0] : null;
}

let versionCache = null;

/** Version du client, exigée en en-tête. Mise en cache pour la session. */
async function getClientVersion() {
  if (versionCache) return versionCache;
  const res = await fetch('https://valorant-api.com/v1/version');
  if (!res.ok) throw new Error(`version ${res.status}`);
  const json = await res.json();
  versionCache = json.data.riotClientVersion;
  return versionCache;
}

function glzHeaders(auth, version) {
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    'X-Riot-Entitlements-JWT': auth.entitlements,
    'X-Riot-ClientPlatform': CLIENT_PLATFORM,
    'X-Riot-ClientVersion': version,
  };
}

// pregame/core-game vivent sur les serveurs "glz" (par région de partie),
// mais le rang classé d'un joueur, lui, vit sur "pd" (par shard du compte,
// peu importe la partie) — même hôte que glz, sans le préfixe régional.
// ex. glz-eu-1.eu.a.pvp.net -> pd.eu.a.pvp.net
function pdBaseFromGlz(glz) {
  const match = glz.match(/^https:\/\/glz-[a-z0-9-]+\.([a-z0-9-]+)\.a\.pvp\.net$/i);
  return match ? `https://pd.${match[1]}.a.pvp.net` : null;
}

// CompetitiveTier dans pregame/core-game ne reflète que le classement DE LA
// PARTIE EN COURS — vide (0) hors file Compétitive. L'endpoint MMR, lui,
// donne le rang classé du joueur indépendamment du mode actuellement joué
// (c'est ce que font les trackers tiers pour afficher un rang même en Spike
// Rush) — voir player-mmr sur valapidocs.techchrism.me. Un cache court évite
// de le refaire à chaque poll (4s) pour les mêmes joueurs pendant un même
// pregame/partie.
const mmrCache = new Map(); // puuid -> { tier, expiresAt }
const MMR_CACHE_MS = 5 * 60 * 1000;

async function fetchMmrTier(pdBase, headers, puuid) {
  const cached = mmrCache.get(puuid);
  if (cached && cached.expiresAt > Date.now()) return cached.tier;

  try {
    const res = await fetch(`${pdBase}/mmr/v1/players/${puuid}`, { headers });
    if (!res.ok) return 0;
    const json = await res.json();
    const seasonId = json.LatestCompetitiveUpdate?.SeasonID;
    const tier = seasonId
      ? json.QueueSkills?.competitive?.SeasonalInfoBySeasonID?.[seasonId]?.CompetitiveTier ?? 0
      : 0;
    mmrCache.set(puuid, { tier, expiresAt: Date.now() + MMR_CACHE_MS });
    return tier;
  } catch {
    return 0;
  }
}

// Uniquement hors Compétitif : en vrai classé, le rang embarqué (pregame/
// core-game) est déjà la bonne valeur en direct. Un rang à 0 y est un signe
// fiable de "non classé cette saison", jamais un vide à combler — l'appeler
// quand même y a déjà provoqué une régression réelle (rang d'ACTE affiché à
// la place du rang courant en Compétitif) : QueueSkills.competitive côté MMR
// s'indexe par LatestCompetitiveUpdate.SeasonID, qui pointe vers la saison du
// DERNIER match classé joué — un ancien acte si le rang courant n'était pas
// encore remonté côté embarqué au moment de l'appel.
async function fillMissingRanks(pdBase, headers, players, mode) {
  if (mode === 'competitive') return players;
  await Promise.all(
    players.map(async (p) => {
      if (p.competitiveTier > 0) return;
      p.competitiveTier = await fetchMmrTier(pdBase, headers, p.puuid);
    }),
  );
  return players;
}

// Sélection d'agent ('pregame') : seule MON équipe est exposée par Riot à ce
// stade en classé (`EnemyTeam` est null) — rien à faire côté adversaires ici.
async function fetchPregame(glz, pdBase, headers, puuid) {
  const playerRes = await fetch(`${glz}/pregame/v1/players/${puuid}`, { headers });
  if (playerRes.status === 404) return null;
  if (!playerRes.ok) throw new Error(`pregame-player ${playerRes.status}`);
  const { MatchID: matchId } = await playerRes.json();
  if (!matchId) return null;

  const matchRes = await fetch(`${glz}/pregame/v1/matches/${matchId}`, { headers });
  if (matchRes.status === 404) return null;
  if (!matchRes.ok) throw new Error(`pregame-match ${matchRes.status}`);
  const match = await matchRes.json();

  const players = (match.AllyTeam?.Players ?? []).map((p) => ({
    puuid: p.Subject,
    // Numéro de palier ; la conversion en nom et en icône se fait côté
    // interface, avec la table déjà utilisée pour le rang du joueur.
    competitiveTier: p.CompetitiveTier ?? 0,
    agentId: p.CharacterID || null,
    // '' | 'selected' | 'locked'
    selectionState: p.CharacterSelectionState ?? '',
    accountLevel: p.PlayerIdentity?.AccountLevel ?? null,
    incognito: p.PlayerIdentity?.Incognito ?? false,
    isMe: p.Subject === puuid,
    team: 'ally',
  }));

  if (pdBase) await fillMissingRanks(pdBase, headers, players, match.QueueID ?? null);

  return { state: 'ok', phase: 'select', matchId, mapId: match.MapID ?? null, mode: match.QueueID ?? null, players };
}

// Partie en cours ('core-game'), à partir du chargement juste après la
// sélection : contrairement au pregame, LES DEUX équipes sont exposées ici —
// c'est ce qui permet d'afficher enfin les adversaires.
async function fetchCoregame(glz, pdBase, headers, puuid) {
  const playerRes = await fetch(`${glz}/core-game/v1/players/${puuid}`, { headers });
  if (playerRes.status === 404) return null;
  if (!playerRes.ok) throw new Error(`coregame-player ${playerRes.status}`);
  const { MatchID: matchId } = await playerRes.json();
  if (!matchId) return null;

  const matchRes = await fetch(`${glz}/core-game/v1/matches/${matchId}`, { headers });
  if (matchRes.status === 404) return null;
  if (!matchRes.ok) throw new Error(`coregame-match ${matchRes.status}`);
  const match = await matchRes.json();

  const myTeam = (match.Players ?? []).find((p) => p.Subject === puuid)?.TeamID ?? null;

  const players = (match.Players ?? []).map((p) => ({
    puuid: p.Subject,
    // Rang vit sous un autre nom que côté pregame (`SeasonalBadgeInfo.Rank`
    // plutôt que `CompetitiveTier`), même numéro de palier en dessous.
    competitiveTier: p.SeasonalBadgeInfo?.Rank ?? 0,
    agentId: p.CharacterID || null,
    selectionState: 'locked',
    accountLevel: p.PlayerIdentity?.AccountLevel ?? null,
    incognito: p.PlayerIdentity?.Incognito ?? false,
    isMe: p.Subject === puuid,
    team: myTeam && p.TeamID === myTeam ? 'ally' : 'enemy',
  }));

  if (pdBase) await fillMissingRanks(pdBase, headers, players, match.ModeID ?? null);

  return { state: 'ok', phase: 'game', matchId, mapId: match.MapID ?? null, mode: match.ModeID ?? null, players };
}

/**
 * Rang atteint par le joueur suivi sur CHAQUE acte joué, via le même
 * endpoint MMR que fetchMmrTier ci-dessus, mais sans filtrer sur une saison
 * précise : `QueueSkills.competitive.SeasonalInfoBySeasonID` contient une
 * entrée par acte (jamais exposé par HenrikDev, qui ne donne que le rang
 * courant + le peak global). Ne marche que client Riot ouvert — main.js
 * sauvegarde le résultat en base à chaque appel réussi pour qu'il reste
 * consultable ensuite même client fermé (voir saveSeasonalRanks/db.js).
 *
 * Renvoie toujours un objet avec un `state`, jamais une exception, même
 * logique que getAgentSelect : appelée en boucle, un client fermé est le cas
 * normal, pas une erreur.
 */
// Regroupe le boilerplate commun (lockfile -> glz -> pdBase -> jetons) partagé
// par getSeasonalRanks et le backfill d'historique ci-dessous. Lève une
// exception avec `.local = true` pour les cas normaux (client fermé, pas de
// glz encore écrit) — les appelants les traitent comme "indisponible", jamais
// une vraie erreur.
async function getLocalSession() {
  const lock = readLockfile();
  if (!lock) {
    const err = new Error('client-closed');
    err.local = true;
    throw err;
  }
  const glz = readGlzBase();
  if (!glz) {
    const err = new Error('no-glz');
    err.local = true;
    throw err;
  }
  const pdBase = pdBaseFromGlz(glz);
  if (!pdBase) {
    const err = new Error('no-pd-base');
    err.local = true;
    throw err;
  }
  const auth = await getLocalAuth(lock);
  const version = await getClientVersion();
  return { pdBase, auth, headers: glzHeaders(auth, version) };
}

export async function getSeasonalRanks() {
  try {
    const { pdBase, auth, headers } = await getLocalSession();

    const res = await fetch(`${pdBase}/mmr/v1/players/${auth.puuid}`, { headers });
    if (!res.ok) return { state: 'unavailable', reason: `mmr-${res.status}` };
    const json = await res.json();

    const bySeason = json.QueueSkills?.competitive?.SeasonalInfoBySeasonID ?? {};
    const seasons = Object.entries(bySeason).map(([seasonId, info]) => ({ seasonId, ...info }));

    return { state: 'ok', puuid: auth.puuid, seasons };
  } catch (err) {
    return { state: 'unavailable', reason: err.message };
  }
}

let agentNamesCache = null;

/** UUID d'agent (characterId brut du client local) -> nom affiché. */
async function getAgentNames() {
  if (agentNamesCache) return agentNamesCache;
  const res = await fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
  if (!res.ok) return new Map();
  const json = await res.json();
  agentNamesCache = new Map((json.data ?? []).map((a) => [a.uuid.toLowerCase(), a.displayName]));
  return agentNamesCache;
}

const MATCH_HISTORY_PAGE = 20;
// Plafond de sécurité sur la pagination de l'historique — au-delà, mieux vaut
// s'arrêter que de scanner indéfiniment un compte avec des milliers de
// matchs ; le backfill reprendra simplement plus tard là où il s'est arrêté
// (les matchs déjà en cache sont filtrés à chaque appel).
const MATCH_HISTORY_MAX = 2000;

// Liste complète des match IDs, mise en cache pour tout le procesus — MAIS
// seulement si la pagination est allée jusqu'au bout (`reachedEnd`). Un
// premier essai interrompu par une requête en échec (réseau, client pas
// encore prêt...) ne doit JAMAIS être mis en cache tel quel : ça figeait le
// backfill pour le reste du lancement sur une liste tronquée, avec
// "Recharger l'historique" qui ne trouvait plus jamais rien de nouveau à
// aller chercher (constaté en vrai : plus aucune progression malgré
// plusieurs clics).
let matchIdsCache = null;

async function listAllMatchIds(pdBase, headers, puuid) {
  if (matchIdsCache) return matchIdsCache;
  const ids = [];
  let startIndex = 0;
  let reachedEnd = false;
  let lastStatus = null;
  while (ids.length < MATCH_HISTORY_MAX) {
    const res = await fetch(
      `${pdBase}/match-history/v1/history/${puuid}?startIndex=${startIndex}&endIndex=${startIndex + MATCH_HISTORY_PAGE}`,
      { headers },
    );
    lastStatus = res.status;
    if (!res.ok) break;
    const json = await res.json();
    const page = json.History ?? [];
    page.forEach((m) => ids.push(m.MatchID));
    if (page.length < MATCH_HISTORY_PAGE) {
      reachedEnd = true;
      break;
    }
    startIndex += MATCH_HISTORY_PAGE;
  }
  console.log('[act-backfill] listAllMatchIds', { total: ids.length, reachedEnd, lastStatus });
  if (reachedEnd) matchIdsCache = ids;
  return ids;
}

// Résumé ULTRA léger d'un match (pas le détail round par round comme
// matchNormalizer.js) : seulement ce qu'il faut pour "Rang par acte" — acte,
// agent joué, kills/deaths. Pas besoin de tout le reste (économie, positions
// de mort...), ça évite de dupliquer tout le normaliseur HenrikDev pour un
// usage qui n'en a pas besoin.
async function fetchActMatchSummary(matchId, pdBase, headers, puuid) {
  const res = await fetch(`${pdBase}/match-details/v1/matches/${matchId}`, { headers });
  if (!res.ok) {
    console.log('[act-backfill] match-details échec', { matchId, status: res.status });
    return null;
  }
  const match = await res.json();
  const me = (match.players ?? []).find((p) => p.subject === puuid);
  if (!me) {
    console.log('[act-backfill] joueur introuvable dans le match', { matchId, puuid });
    return null;
  }
  const agentNames = await getAgentNames();
  return {
    matchId: match.matchInfo?.matchId ?? matchId,
    seasonId: match.matchInfo?.seasonId ?? null,
    queueId: match.matchInfo?.queueID ?? null,
    gameStart: match.matchInfo?.gameStartMillis ?? null,
    agent: agentNames.get((me.characterId ?? '').toLowerCase()) ?? null,
    kills: me.stats?.kills ?? 0,
    deaths: me.stats?.deaths ?? 0,
  };
}

/**
 * Récupère un petit lot de matchs pas encore en cache (`alreadyCachedIds`),
 * directement depuis le client Riot local — contrairement à la synchro
 * HenrikDev classique (plafonnée à 40 matchs pour ménager son quota de
 * 30 req/min), cette API n'a pas de limite documentée : on peut donc
 * remonter tout l'historique, acte par acte, tant que le client tourne.
 * Volontairement petit lot (`batchSize`) à chaque appel plutôt que tout
 * d'un coup — appelée en boucle par main.js pendant que Valorant tourne
 * (voir pollActHistoryBackfill), jamais bloquant pour l'interface.
 */
export async function backfillActHistory(alreadyCachedIds, batchSize = 5) {
  try {
    const { pdBase, auth, headers } = await getLocalSession();
    const allIds = await listAllMatchIds(pdBase, headers, auth.puuid);
    const pending = allIds.filter((id) => !alreadyCachedIds.has(id));
    if (pending.length === 0) return { state: 'done', puuid: auth.puuid, rows: [] };

    const rows = [];
    for (const matchId of pending.slice(0, batchSize)) {
      // Séquentiel plutôt que Promise.all : reste discret sur une API non
      // officiellement supportée, pas de rafale de requêtes simultanées.
      // eslint-disable-next-line no-await-in-loop
      const summary = await fetchActMatchSummary(matchId, pdBase, headers, auth.puuid);
      if (summary) rows.push(summary);
    }
    return { state: 'ok', puuid: auth.puuid, rows, remaining: pending.length - rows.length };
  } catch (err) {
    return { state: 'unavailable', reason: err.message };
  }
}

/**
 * État de la sélection d'agent, puis de la partie qui suit (chargement +
 * début de match), en direct.
 *
 * Renvoie toujours un objet avec un `state`, jamais une exception : cette
 * fonction est appelée en boucle par l'interface, et « le joueur n'est ni en
 * sélection ni en partie » est le cas NORMAL, pas une erreur.
 *
 *   'idle'        — ni en sélection ni en partie (cas courant)
 *   'unavailable' — client fermé, log absent, ou API injoignable
 *   'ok'          — `players` renseigné, `phase` distingue 'select' (agents
 *                    alliés uniquement) de 'game' (alliés + adversaires,
 *                    `team` sur chaque joueur)
 */
export async function getAgentSelect() {
  try {
    const lock = readLockfile();
    if (!lock) return { state: 'unavailable', reason: 'client-closed' };

    const glz = readGlzBase();
    if (!glz) return { state: 'unavailable', reason: 'no-glz' };

    const pdBase = pdBaseFromGlz(glz);
    const auth = await getLocalAuth(lock);
    const version = await getClientVersion();
    const headers = glzHeaders(auth, version);

    const pregame = await fetchPregame(glz, pdBase, headers, auth.puuid);
    if (pregame) return pregame;

    const coregame = await fetchCoregame(glz, pdBase, headers, auth.puuid);
    if (coregame) return coregame;

    return { state: 'idle' };
  } catch (err) {
    // Réseau coupé, client fermé en cours de route, endpoint modifié par
    // Riot... Rien de tout ça ne doit remonter jusqu'à l'interface.
    return { state: 'unavailable', reason: err.message };
  }
}
