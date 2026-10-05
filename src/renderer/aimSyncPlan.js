// Règles de fusion entre les données locales (arènes, presets, playlists) et
// celles du compte, sans aucun accès réseau ni stockage : on reçoit l'état des
// deux côtés et on rend la liste de ce qu'il faut faire. Testé dans
// aimSyncPlan.test.mjs ; l'envoi et la lecture sont dans aimSync.js.
//
// Détection des changements par EMPREINTE du contenu, pas par date : les
// presets et les playlists n'ont pas de date de modification, et une empreinte
// ne dépend pas de l'horloge de chaque appareil.
//
// Pour chaque élément, `meta` retient ce qu'on avait vu à la dernière
// synchronisation : l'empreinte locale (`hash`) et celle du serveur (`rhash`).
//   - local changé  = l'empreinte locale a bougé depuis `meta.hash` ;
//   - serveur changé = l'empreinte du serveur a bougé depuis `meta.rhash`.

// Empreinte 53 bits (cyrb53) d'un texte. Ce n'est pas du chiffrement : juste de
// quoi reconnaître « ce contenu n'a pas changé ».
export function hashText(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// JSON dont l'ordre des clés ne change pas le résultat.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const hashItem = (item) => hashText(canonicalJson(item));

/**
 * @param local   [{ id, item }]                    éléments présents sur cet appareil
 * @param remote  [{ id, hash, deleted }]           lignes du compte (sans leur contenu)
 * @param meta    { [id]: { hash, rhash } }          état à la dernière synchronisation
 * @param canPull faux tant qu'un écran d'édition est ouvert : on n'écrase rien sous ses pieds
 * @param accept  (id, row) => bool                  lignes du compte à ignorer entièrement (ex. cartes cachées sur le web)
 * @returns { push, tombstone, pull, removeLocal, meta }
 */
export function planSync({ local, remote, meta = {}, canPull = true, accept = () => true }) {
  const localById = new Map(local.map((entry) => [entry.id, entry]));
  const remoteById = new Map(remote.filter((row) => accept(row.id, row)).map((row) => [row.id, row]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  const plan = { push: [], tombstone: [], pull: [], removeLocal: [], meta: {} };
  const keep = (id, m) => {
    if (m) plan.meta[id] = m;
  };

  for (const id of ids) {
    const mine = localById.get(id);
    const theirs = remoteById.get(id);
    const known = meta[id];
    const myHash = mine ? hashItem(mine.item) : null;

    if (mine && !theirs) {
      // Jamais envoyé (ou ligne disparue côté serveur) : on l'envoie.
      plan.push.push({ id, hash: myHash });
      continue;
    }

    if (mine && theirs && !theirs.deleted) {
      if (theirs.hash === myHash) {
        keep(id, { hash: myHash, rhash: theirs.hash });
        continue;
      }
      const localChanged = !known || known.hash !== myHash;
      const remoteChanged = !known || known.rhash !== theirs.hash;
      if (!localChanged && remoteChanged) {
        if (canPull) plan.pull.push({ id, hash: theirs.hash });
        keep(id, known);
      } else if (localChanged && !remoteChanged) {
        plan.push.push({ id, hash: myHash });
      } else if (!known) {
        // Aucun souvenir : le serveur fait référence.
        if (canPull) plan.pull.push({ id, hash: theirs.hash });
      } else {
        // Modifié des deux côtés depuis la dernière fois : la version de cet appareil l'emporte.
        plan.push.push({ id, hash: myHash });
      }
      continue;
    }

    if (mine && theirs?.deleted) {
      const editedSince = !known || known.hash !== myHash;
      if (editedSince) plan.push.push({ id, hash: myHash });
      else if (canPull) plan.removeLocal.push(id);
      else keep(id, known);
      continue;
    }

    if (!mine && theirs && !theirs.deleted) {
      if (known) {
        // Présent à la dernière synchronisation, absent maintenant : supprimé ici.
        // Sauf si un autre appareil l'a modifié depuis : on ne perd pas son travail.
        if (known.rhash !== theirs.hash) {
          if (canPull) plan.pull.push({ id, hash: theirs.hash });
          else keep(id, known);
        } else {
          plan.tombstone.push({ id });
        }
      } else if (canPull) {
        plan.pull.push({ id, hash: theirs.hash });
      }
      continue;
    }
    // Absent des deux côtés, ou supprimé et déjà absent ici : rien à garder.
  }
  return plan;
}
