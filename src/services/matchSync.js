import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabaseConfig.js';
import { findMe, resultLabel, matchScore } from '../renderer/valorantStats.js';

// Version asynchrone (déléguée au thread pool libuv) plutôt que
// brotliCompressSync : le process principal d'Electron est mono-thread pour
// le JS, donc une compression Brotli qualité 11 synchrone (la plus lente) le
// bloquait entièrement pendant son calcul — chaque clic dans l'app devait
// alors attendre la fin de la compression en cours pour être traité, jusqu'à
// ~2 minutes de délai perçu au premier lancement (jusqu'à 50 matchs à
// compresser). Le résultat est identique, seul le thread qui fait le travail
// change.
const brotliCompress = promisify(zlib.brotliCompress);

// =============================================================================
// SYNCHRO DES MATCHS VERS SUPABASE
//
// Pense pour un futur client mobile : celui-ci ne pourra ni faire tourner le
// client Valorant ni embarquer une clé HenrikDev
// personnelle (risque d'extraction). Le desktop, qui a déjà tout ça, pousse
// donc ce qu'il a récupéré vers un stockage central que le mobile n'aura
// qu'à lire plus tard.
//
// Deux niveaux, pour rester dans le plan gratuit Supabase :
//   - jusqu'à 100 matchs : un résumé léger (table match_summaries)
//   - parmi eux, les 50 plus récents SEULEMENT : le JSON complet round par
//     round, compressé en Brotli (~22 Ko/match mesuré en réel, ~35x plus
//     petit que le brut), dans le bucket Storage "match-details"
//
// Toujours dans le dossier `{userId}/...` de l'utilisateur — c'est ce que
// vérifient les policies RLS posées côté Supabase, aucun autre chemin ne
// passerait de toute façon.
//
// ÉTAT CONNU (2026-08-31) : l'upload vers Storage échoue systématiquement en
// ce moment ("row-level security policy", même avec une policy triviale ne
// vérifiant que le rôle) alors que Postgrest, avec le MÊME jeton au même
// instant, fonctionne normalement — vérifié en écartant toutes les causes
// côté appli (policies correctes en SQL brut, identité JWT/userId identique,
// jeton rafraîchi juste avant l'appel, reproductible en curl pur en dehors
// de l'appli). Tout pointe vers un désalignement de config JWT côté projet
// Supabase (Storage vs Postgrest), pas vers ce code — probablement réglé par
// un redémarrage du projet, pas encore fait pour ne pas couper les testeurs
// en pleine session. Le détail complet reste donc pour l'instant
// indisponible ; l'échec est isolé (catch dans la boucle) pour ne PAS
// empêcher la synchro des résumés, qui elle fonctionne bien.
//
// (2026-09-02) Ce que cet isolement coûtait vraiment : un match dont l'upload
// échoue garde has_full_detail=false, donc il repartait à l'upload à CHAQUE
// synchro, soit jusqu'à 50 requêtes vouées à échouer par rafraîchissement et
// par utilisateur. Plus une lecture de match_summaries refusée (42501, GRANT
// manquant sur la table) qui, elle, faisait échouer la synchro entière et
// repartait tout aussi souvent. Relevé sur le tableau de bord Supabase :
// ~1500 avertissements Storage et ~1600 erreurs Postgres en une heure, aucune
// visible dans l'appli et aucune utile. D'où les coupe-circuits ci-dessous :
// un refus côté serveur ne se règle pas en réessayant, on arrête d'insister
// pendant un temps au lieu de marteler.
// =============================================================================

const SUMMARY_COUNT = 100;
const FULL_DETAIL_COUNT = 50;
const STORAGE_BUCKET = 'match-details';

const RESULT_CODES = {
  Victoire: 'win',
  Défaite: 'loss',
  'Match nul': 'draw',
  'Sans équipe': 'noteam',
};

// Assez long pour que le quota respire, assez court pour que la synchro
// reparte d'elle-même une fois le problème réglé côté Supabase, sans que
// l'utilisateur ait à relancer l'appli.
const BREAKER_COOLDOWN_MS = 30 * 60 * 1000;
// Un échec isolé peut être réseau. Trois d'affilée dans la même série, non.
const DETAIL_FAILURE_STREAK = 3;

// Refus qui ne bougeront pas tant que rien ne change côté serveur : droits
// manquants sur la table (42501), table absente (42P01), jeton rejeté
// (PGRST301). Le message est testé en plus du code parce que Storage répond en
// HTTP brut, sans code Postgres.
const DENIED_CODES = new Set(['42501', '42P01', 'PGRST301']);
const DENIED_PATTERN = /permission denied|row-level security|JWT/i;

function isDenial(err) {
  return DENIED_CODES.has(err?.code) || DENIED_PATTERN.test(err?.message ?? '');
}

const openUntil = { summaries: 0, details: 0 };

function isTripped(name) {
  return Date.now() < openUntil[name];
}

function trip(name, reason) {
  if (!isTripped(name)) {
    console.error(
      `[matchSync] ${name} : refusé côté serveur (${reason}), suspendu ${BREAKER_COOLDOWN_MS / 60000} min`,
    );
  }
  openUntil[name] = Date.now() + BREAKER_COOLDOWN_MS;
}

// Dernière synchro aboutie. Le renderer en relance une à chaque chargement de
// myMatches (cache local au démarrage, puis vrai rafraîchissement), et un
// rafraîchissement qui ne ramène aucun match referait exactement le travail
// d'il y a une minute. `pendingDetails` évite de figer un état incomplet :
// tant qu'il reste des détails à envoyer, on repasse quand même.
let lastRun = null;

// Deux appels concurrents sur le même compte (montage de l'app pendant qu'un
// rafraîchissement tourne) partagent la même synchro, même logique que
// matchSyncInFlight côté main.js.
const inFlight = new Map();

function authedClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY } },
    auth: { persistSession: false },
  });
}

function storageHeaders(accessToken, extra = {}) {
  return { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY, ...extra };
}

async function uploadToStorage(accessToken, path, buffer) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: storageHeaders(accessToken, { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }),
    body: buffer,
  });
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${await res.text()}`);
}

async function removeFromStorage(accessToken, paths) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}`, {
    method: 'DELETE',
    headers: storageHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`storage remove ${res.status}: ${await res.text()}`);
}

/**
 * Synchronise jusqu'à 100 matchs (résumé) dont 50 avec le détail complet.
 * `matches` : déjà triés ou non, on trie nous-mêmes par date décroissante.
 * Ne lève jamais d'exception vers l'appelant — un souci réseau ponctuel ne
 * doit pas faire échouer le rafraîchissement des matchs qui a déclenché ça.
 */
export function syncMatches(payload) {
  const key = payload?.userId ?? 'anon';
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = runSync(payload).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function runSync({ matches, name, tag, userId, accessToken }) {
  if (isTripped('summaries')) return { skipped: 'summaries-suspendu' };

  try {
    const sorted = [...matches]
      .filter((m) => m.metadata?.matchid && m.metadata?.game_start)
      .sort((a, b) => b.metadata.game_start - a.metadata.game_start);

    const toSummarize = sorted.slice(0, SUMMARY_COUNT);
    const detailWanted = new Set(sorted.slice(0, FULL_DETAIL_COUNT).map((m) => m.metadata.matchid));

    // Comparé AVANT la première requête : sur une synchro identique à la
    // précédente, on ne consomme rien du tout.
    const signature = `${userId}|${toSummarize.map((m) => m.metadata.matchid).join(',')}`;
    if (lastRun?.signature === signature && (lastRun.pendingDetails === 0 || isTripped('details'))) {
      return { skipped: 'inchangé' };
    }

    const client = authedClient(accessToken);

    const { data: existing, error: readError } = await client
      .from('match_summaries')
      .select('match_id, has_full_detail')
      .eq('user_id', userId);
    if (readError) {
      if (isDenial(readError)) trip('summaries', readError.message);
      throw readError;
    }

    const existingIds = new Set((existing ?? []).map((r) => r.match_id));
    const existingWithDetail = new Set((existing ?? []).filter((r) => r.has_full_detail).map((r) => r.match_id));

    const rows = [];
    let detailFailures = 0;
    let failureStreak = 0;
    for (const match of toSummarize) {
      const matchId = match.metadata.matchid;
      const me = findMe(match, name, tag);
      const wantsDetail = detailWanted.has(matchId);
      const alreadyHasDetail = existingWithDetail.has(matchId);
      let uploadedDetail = alreadyHasDetail;

      // On ne recompresse/ré-uploade jamais un match déjà présent : un match
      // terminé ne change plus, inutile de repayer le travail à chaque sync.
      // Un échec d'upload (voir note en tête de fichier) ne doit PAS priver
      // le résumé léger, qui lui fonctionne, juste noter que le détail
      // complet n'est pas dispo pour ce match. En revanche on ne s'acharne
      // plus : trois échecs de suite et on laisse tomber les 47 restants.
      if (wantsDetail && !alreadyHasDetail && !isTripped('details')) {
        try {
          const compressed = await brotliCompress(Buffer.from(JSON.stringify(match)), {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
          });
          await uploadToStorage(accessToken, `${userId}/${matchId}.json.br`, compressed);
          uploadedDetail = true;
          failureStreak = 0;
        } catch (err) {
          detailFailures += 1;
          failureStreak += 1;
          if (failureStreak >= DETAIL_FAILURE_STREAK) trip('details', err.message);
        }
      }

      rows.push({
        match_id: matchId,
        user_id: userId,
        game_start: new Date(match.metadata.game_start * 1000).toISOString(),
        map: match.metadata.map ?? null,
        agent: me?.character ?? null,
        mode: match.metadata.mode ?? null,
        result: RESULT_CODES[resultLabel(match, me)] ?? null,
        kills: me?.stats?.kills ?? null,
        deaths: me?.stats?.deaths ?? null,
        assists: me?.stats?.assists ?? null,
        score: matchScore(match, me),
        has_full_detail: uploadedDetail,
      });
    }

    // N'écrit que ce qui manque ou ce qui a changé, au lieu de réécrire les
    // 100 lignes à chaque passage : le contenu d'un match terminé est figé,
    // seul has_full_detail peut encore basculer (quand le détail finit par
    // partir). Corollaire à connaître : une modification de la façon dont ces
    // colonnes sont calculées ne se propagera pas toute seule aux lignes déjà
    // en base, il faudra les supprimer pour forcer la réécriture.
    const changed = rows.filter(
      (r) => !existingIds.has(r.match_id) || existingWithDetail.has(r.match_id) !== r.has_full_detail,
    );

    if (changed.length > 0) {
      const { error: upsertError } = await client
        .from('match_summaries')
        .upsert(changed, { onConflict: 'match_id,user_id' });
      if (upsertError) {
        if (isDenial(upsertError)) trip('summaries', upsertError.message);
        throw upsertError;
      }
    }

    // Purge : ne garder que les 100 résumés (et donc, parmi eux, au plus 50
    // détails complets) les plus récents — un nouveau match en fait sortir
    // un ancien, des deux côtés (table + Storage).
    const keptIds = new Set(rows.map((r) => r.match_id));
    const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

    if (toDelete.length > 0) {
      const toDeletePaths = toDelete.filter((id) => existingWithDetail.has(id)).map((id) => `${userId}/${id}.json.br`);
      if (toDeletePaths.length > 0) {
        try {
          await removeFromStorage(accessToken, toDeletePaths);
        } catch {
          // Même logique : un souci Storage ne doit pas bloquer la purge des résumés.
        }
      }
      await client.from('match_summaries').delete().eq('user_id', userId).in('match_id', toDelete);
    }

    const pendingDetails = rows.filter((r) => detailWanted.has(r.match_id) && !r.has_full_detail).length;
    lastRun = { signature, pendingDetails };

    return { synced: changed.length, deleted: toDelete.length, detailFailures, pendingDetails };
  } catch (err) {
    return { error: err.message };
  }
}
