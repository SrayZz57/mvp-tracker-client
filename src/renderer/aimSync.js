import { supabase } from './supabaseClient.js';
import { sanitizeArena } from './arenaEditor/arenaStore.js';
import { AIM_DATA_CHANGED } from './aimSyncEvents.js';
import { hashItem, planSync } from './aimSyncPlan.js';

// Synchronise arènes, presets du mode Personnalisé et playlists avec le compte
// (table aim_user_data, voir sql/aim_user_data.sql), pour les retrouver sur le
// PC et sur la version web. Les règles de fusion sont dans aimSyncPlan.js ;
// ce fichier lit/écrit le stockage local et parle à Supabase.
//
// Le stockage local reste la source de travail : l'app et le web continuent de
// lire et d'écrire exactement comme avant, la synchronisation se fait à côté.

const KINDS = {
  arena: { key: 'mvptracker-aim-arenas-v1', clean: sanitizeArena },
  preset: { key: 'mvptracker-aim-trainer-custom-presets', clean: cleanLoose },
  playlist: { key: 'mvptracker-aim-trainer-playlists', clean: cleanLoose },
};
const KIND_LIST = Object.keys(KINDS);
const META_PREFIX = 'mvptracker-aim-sync-v1:';
const DEBOUNCE_MS = 4000;
const BATCH = 40;

// Presets et playlists n'ont pas de nettoyeur dédié : on exige un objet avec un
// identifiant texte, rien de plus (les données viennent du compte de l'utilisateur lui-même).
function cleanLoose(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  return raw;
}

function readList(kind) {
  try {
    const list = JSON.parse(localStorage.getItem(KINDS[kind].key) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object' && typeof item.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(kind, list) {
  localStorage.setItem(KINDS[kind].key, JSON.stringify(list));
}

const metaKey = (userId) => `${META_PREFIX}${userId}`;

function readMeta(userId) {
  try {
    const meta = JSON.parse(localStorage.getItem(metaKey(userId)) ?? '{}');
    return meta && typeof meta === 'object' ? meta : {};
  } catch {
    return {};
  }
}

const writeMeta = (userId, meta) => {
  try {
    localStorage.setItem(metaKey(userId), JSON.stringify(meta));
  } catch {
    // Stockage plein : on refera le calcul à la prochaine synchronisation.
  }
};

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// Une synchronisation complète. Renvoie le nombre d'éléments changés ICI (rapatriés ou supprimés).
export async function syncAimData(userId, { canPull = () => true, acceptItem = () => true, client = supabase } = {}) {
  if (!userId) return { changed: 0 };
  const { data: session } = await client.auth.getSession();
  if (!session?.session) return { changed: 0 };

  const { data: rows, error } = await client.from('aim_user_data').select('kind, item_id, hash, deleted');
  if (error) {
    // 42P01 / PGRST205 : la table n'existe pas encore (SQL pas exécuté) -> silencieux.
    if (error.code !== '42P01' && error.code !== 'PGRST205') console.error('[aim-sync] lecture impossible :', error.message);
    return { changed: 0 };
  }

  const meta = readMeta(userId);
  const nextMeta = { ignored: { ...(meta.ignored ?? {}) } };
  let changed = 0;

  for (const kind of KIND_LIST) {
    const kindMeta = meta[kind] ?? {};
    const ignored = (nextMeta.ignored[kind] = { ...(nextMeta.ignored[kind] ?? {}) });
    const remote = rows.filter((row) => row.kind === kind).map((row) => ({ id: row.item_id, hash: row.hash, deleted: row.deleted }));
    const local = readList(kind).map((item) => ({ id: item.id, item }));

    const plan = planSync({
      local,
      remote,
      meta: kindMeta,
      canPull: canPull(),
      accept: (id, row) => ignored[id] !== row.hash,
    });
    const resultMeta = { ...plan.meta };

    // 1. Rapatrier ce qui est plus récent sur le compte.
    if (plan.pull.length) {
      const fetched = [];
      for (const part of chunks(plan.pull.map((p) => p.id), BATCH)) {
        const { data, error: pullError } = await client.from('aim_user_data').select('item_id, data, hash').eq('kind', kind).in('item_id', part);
        if (pullError) console.error('[aim-sync] rapatriement impossible :', pullError.message);
        else fetched.push(...data);
      }
      // Relecture juste avant d'écrire : l'utilisateur a pu modifier entre-temps.
      if (canPull()) {
        const fresh = readList(kind);
        for (const row of fetched) {
          const cleaned = KINDS[kind].clean({ ...row.data, id: row.item_id });
          if (!cleaned) continue;
          if (!acceptItem(kind, cleaned)) {
            ignored[row.item_id] = row.hash;
            continue;
          }
          const at = fresh.findIndex((item) => item.id === cleaned.id);
          if (at >= 0) fresh[at] = cleaned;
          else fresh.push(cleaned);
          resultMeta[cleaned.id] = { hash: hashItem(cleaned), rhash: row.hash };
          changed += 1;
        }
        writeList(kind, fresh);
      }
    }

    // 2. Supprimer ici ce qui a été supprimé ailleurs.
    if (plan.removeLocal.length && canPull()) {
      const gone = new Set(plan.removeLocal);
      writeList(kind, readList(kind).filter((item) => !gone.has(item.id)));
      changed += gone.size;
    }

    // 3. Envoyer ce qui est nouveau ou modifié ici.
    const byId = new Map(local.map((entry) => [entry.id, entry.item]));
    for (const part of chunks(plan.push, BATCH)) {
      const payload = part.map(({ id, hash }) => ({ user_id: userId, kind, item_id: id, data: byId.get(id), hash, deleted: false }));
      const { error: pushError } = await client.from('aim_user_data').upsert(payload, { onConflict: 'user_id,kind,item_id' });
      if (pushError) console.error(`[aim-sync] envoi impossible (${kind}) :`, pushError.message);
      else part.forEach(({ id, hash }) => (resultMeta[id] = { hash, rhash: hash }));
    }

    // 4. Marquer comme supprimé sur le compte ce qui l'a été ici.
    for (const part of chunks(plan.tombstone, BATCH)) {
      const payload = part.map(({ id }) => ({ user_id: userId, kind, item_id: id, data: {}, hash: '', deleted: true }));
      const { error: delError } = await client.from('aim_user_data').upsert(payload, { onConflict: 'user_id,kind,item_id' });
      if (delError) {
        console.error(`[aim-sync] suppression impossible (${kind}) :`, delError.message);
        // On garde la trace pour réessayer : sans elle l'élément serait rapatrié comme « nouveau ».
        part.forEach(({ id }) => (resultMeta[id] = kindMeta[id]));
      }
    }

    nextMeta[kind] = Object.fromEntries(Object.entries(resultMeta).filter(([, v]) => v));
  }

  writeMeta(userId, nextMeta);
  return { changed };
}

/**
 * Lance la synchronisation pour un utilisateur : tout de suite, puis après chaque
 * modification (avec un délai pour regrouper les enregistrements en rafale) et au
 * retour sur l'onglet. `canPull` dit si l'on peut écraser des données locales
 * (faux pendant l'édition d'une arène ou d'un preset). `onChange` est appelé quand
 * des données locales ont changé, pour que l'écran les relise.
 */
export function startAimSync(userId, { canPull, acceptItem, onChange } = {}) {
  let timer = null;
  let running = false;
  let again = false;
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const { changed } = await syncAimData(userId, { canPull, acceptItem });
      if (changed > 0 && !stopped) onChange?.(changed);
    } catch (err) {
      console.error('[aim-sync] échec :', err?.message ?? err);
    } finally {
      running = false;
      if (again && !stopped) {
        again = false;
        schedule(DEBOUNCE_MS);
      }
    }
  };

  function schedule(delay = DEBOUNCE_MS) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  const onDataChanged = () => schedule();
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule(1000);
  };
  window.addEventListener(AIM_DATA_CHANGED, onDataChanged);
  document.addEventListener('visibilitychange', onVisible);
  schedule(600);

  return {
    requestSync: (delay) => schedule(delay ?? 1000),
    stop() {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(AIM_DATA_CHANGED, onDataChanged);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
