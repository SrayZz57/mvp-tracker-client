import test from 'node:test';
import assert from 'node:assert/strict';

// Stockage de navigateur simulé : un par « appareil » (voir device()).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { syncAimData } = await import('./aimSync.js');

// Faux Supabase : la table partagée par tous les appareils du même compte.
function fakeClient(table, { signedIn = true } = {}) {
  const query = (filters = {}) => ({
    eq: (col, val) => query({ ...filters, [col]: val }),
    in: (col, vals) => query({ ...filters, [`${col}:in`]: vals }),
    then(resolve) {
      const rows = table.filter((r) =>
        Object.entries(filters).every(([k, v]) => (k.endsWith(':in') ? v.includes(r[k.slice(0, -3)]) : r[k] === v)),
      );
      resolve({ data: rows.map((r) => ({ ...r })), error: null });
    },
  });
  return {
    auth: { getSession: async () => ({ data: { session: signedIn ? { user: {} } : null } }) },
    from: () => ({
      select: () => query(),
      upsert: async (payload) => {
        for (const row of payload) {
          const at = table.findIndex((r) => r.user_id === row.user_id && r.kind === row.kind && r.item_id === row.item_id);
          if (at >= 0) table[at] = { ...table[at], ...row };
          else table.push({ ...row });
        }
        return { error: null };
      },
    }),
  };
}

// Un appareil = un stockage local à lui ; on le « branche » le temps d'une synchronisation.
function device() {
  const mine = new Map();
  return {
    run: async (fn) => {
      const saved = new Map(store);
      store.clear();
      mine.forEach((v, k) => store.set(k, v));
      try {
        return await fn();
      } finally {
        mine.clear();
        store.forEach((v, k) => mine.set(k, v));
        store.clear();
        saved.forEach((v, k) => store.set(k, v));
      }
    },
    read: (key) => JSON.parse(mine.get(key) ?? '[]'),
    write: (key, value) => mine.set(key, JSON.stringify(value)),
  };
}

const PRESETS = 'mvptracker-aim-trainer-custom-presets';
const PLAYLISTS = 'mvptracker-aim-trainer-playlists';
const ARENAS = 'mvptracker-aim-arenas-v1';
const USER = 'user-1';
const sync = (dev, client, opts) => dev.run(() => syncAimData(USER, { client, ...opts }));

test('PC puis web : les presets et playlists arrivent sur le nouvel appareil', async () => {
  const table = [];
  const client = fakeClient(table);
  const pc = device();
  pc.write(PRESETS, [{ id: 'preset-1', name: 'Mon flick', duration: 30 }]);
  pc.write(PLAYLISTS, [{ id: 'playlist-1', name: 'Echauffement', presetIds: ['preset-1'] }]);
  await sync(pc, client);
  assert.equal(table.filter((r) => !r.deleted).length, 2);

  const web = device();
  const { changed } = await sync(web, client);
  assert.equal(changed, 2);
  assert.deepEqual(web.read(PRESETS), [{ id: 'preset-1', name: 'Mon flick', duration: 30 }]);
  assert.equal(web.read(PLAYLISTS)[0].name, 'Echauffement');
});

test('une modification d\'un côté arrive de l\'autre, une suppression aussi', async () => {
  const table = [];
  const client = fakeClient(table);
  const pc = device();
  const web = device();
  pc.write(PRESETS, [{ id: 'preset-1', name: 'A' }, { id: 'preset-2', name: 'B' }]);
  await sync(pc, client);
  await sync(web, client);

  web.write(PRESETS, [{ id: 'preset-1', name: 'A modifié' }, { id: 'preset-2', name: 'B' }]);
  await sync(web, client);
  await sync(pc, client);
  assert.equal(pc.read(PRESETS)[0].name, 'A modifié');

  pc.write(PRESETS, pc.read(PRESETS).filter((p) => p.id !== 'preset-2'));
  await sync(pc, client);
  const { changed } = await sync(web, client);
  assert.equal(changed, 1);
  assert.deepEqual(web.read(PRESETS).map((p) => p.id), ['preset-1']);
});

test('une suppression ne ressuscite pas, même après plusieurs synchronisations', async () => {
  const table = [];
  const client = fakeClient(table);
  const pc = device();
  const web = device();
  pc.write(PRESETS, [{ id: 'preset-1', name: 'A' }]);
  await sync(pc, client);
  await sync(web, client);
  web.write(PRESETS, []);
  await sync(web, client);
  await sync(pc, client);
  await sync(web, client);
  await sync(pc, client);
  assert.deepEqual(pc.read(PRESETS), []);
  assert.deepEqual(web.read(PRESETS), []);
});

test('pendant l\'édition (canPull faux) rien n\'est écrasé, puis tout arrive après', async () => {
  const table = [];
  const client = fakeClient(table);
  const pc = device();
  const web = device();
  pc.write(PRESETS, [{ id: 'preset-1', name: 'A' }]);
  await sync(pc, client);
  await sync(web, client);
  pc.write(PRESETS, [{ id: 'preset-1', name: 'A v2' }]);
  await sync(pc, client);

  await sync(web, client, { canPull: () => false });
  assert.equal(web.read(PRESETS)[0].name, 'A');
  await sync(web, client);
  assert.equal(web.read(PRESETS)[0].name, 'A v2');
});

test('web : les arènes posées sur une carte Valorant restent sur le compte, invisibles, jamais supprimées', async () => {
  const table = [];
  const client = fakeClient(table);
  const pc = device();
  const arena = (id, base) => ({
    id,
    name: id,
    base,
    createdAt: 1,
    updatedAt: 1,
    floor: { w: 40, d: 40 },
    spawn: { x: 0, z: 0, y: 0, yaw: 0 },
    boxes: [],
    enemies: [],
    enemySettings: { style: 'mixed', speed: 1, scale: 1, count: 3 },
  });
  pc.write(ARENAS, [arena('arena-salle', 'classic'), arena('arena-ascent', 'ascentA')]);
  await sync(pc, client);
  assert.equal(table.filter((r) => r.kind === 'arena').length, 2);

  const acceptItem = (kind, item) => !(kind === 'arena' && item.base && item.base !== 'classic');
  const web = device();
  await sync(web, client, { acceptItem });
  assert.deepEqual(web.read(ARENAS).map((a) => a.id), ['arena-salle']);
  await sync(web, client, { acceptItem });
  await sync(web, client, { acceptItem });
  assert.equal(table.filter((r) => r.kind === 'arena' && !r.deleted).length, 2, 'rien n\'est supprimé côté compte');
  assert.equal(web.read(ARENAS).length, 1);
});

test('hors connexion : aucune donnée locale touchée, rien d\'envoyé', async () => {
  const table = [];
  const pc = device();
  pc.write(PRESETS, [{ id: 'preset-1', name: 'A' }]);
  const out = await sync(pc, fakeClient(table, { signedIn: false }));
  assert.equal(out.changed, 0);
  assert.equal(table.length, 0);
  assert.deepEqual(pc.read(PRESETS), [{ id: 'preset-1', name: 'A' }]);
});
