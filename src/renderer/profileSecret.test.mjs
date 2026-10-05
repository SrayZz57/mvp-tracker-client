import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOwnApiKey, saveOwnApiKey } from './profileSecret.js';

// Faux client Supabase : `tables` = { nom: { rows, missing } }. Gère select/eq/maybeSingle, upsert, update, delete.
function fakeClient(tables) {
  const missing = { code: 'PGRST205', message: 'table absente' };
  return {
    from: (name) => {
      const t = tables[name];
      const chain = (rows, filter = {}) => ({
        eq: (col, val) => chain(rows, { ...filter, [col]: val }),
        maybeSingle: async () => {
          if (t.missing) return { data: null, error: missing };
          const row = t.rows.find((r) => Object.entries(filter).every(([k, v]) => r[k] === v));
          return { data: row ? { ...row } : null, error: null };
        },
        then(resolve) {
          if (t.missing) return resolve({ data: null, error: missing });
          t.rows = t.rows.filter((r) => !Object.entries(filter).every(([k, v]) => r[k] === v));
          return resolve({ data: null, error: null });
        },
      });
      return {
        select: () => chain(t.rows),
        delete: () => ({ eq: (col, val) => chain(t.rows, { [col]: val }) }),
        upsert: async (row) => {
          if (t.missing) return { error: missing };
          const at = t.rows.findIndex((r) => r.user_id === row.user_id);
          if (at >= 0) t.rows[at] = { ...t.rows[at], ...row };
          else t.rows.push({ ...row });
          return { error: null };
        },
        update: (patch) => ({
          eq: async (col, val) => {
            t.rows.filter((r) => r[col] === val).forEach((r) => Object.assign(r, patch));
            return { error: null };
          },
        }),
      };
    },
  };
}

test('lecture : la clé vient de la table privée', async () => {
  const client = fakeClient({ profile_secrets: { rows: [{ user_id: 'u1', henrikdev_api_key: 'HDEV-secret' }] }, profiles: { rows: [{ id: 'u1', henrikdev_api_key: null }] } });
  assert.equal(await loadOwnApiKey(client, 'u1'), 'HDEV-secret');
  assert.equal(await loadOwnApiKey(client, 'u2'), null);
});

test('lecture : table absente (base pas migrée) -> repli sur l\'ancienne colonne', async () => {
  const client = fakeClient({ profile_secrets: { rows: [], missing: true }, profiles: { rows: [{ id: 'u1', henrikdev_api_key: 'HDEV-ancienne' }] } });
  assert.equal(await loadOwnApiKey(client, 'u1'), 'HDEV-ancienne');
});

test('écriture : enregistre dans la table privée, jamais dans profiles, et efface si vide', async () => {
  const tables = { profile_secrets: { rows: [] }, profiles: { rows: [{ id: 'u1', henrikdev_api_key: null }] } };
  const client = fakeClient(tables);
  assert.equal(await saveOwnApiKey(client, 'u1', '  HDEV-nouvelle '), true);
  assert.equal(tables.profile_secrets.rows[0].henrikdev_api_key, 'HDEV-nouvelle');
  assert.equal(tables.profiles.rows[0].henrikdev_api_key, null, 'la colonne publique reste vide');
  assert.equal(await saveOwnApiKey(client, 'u1', ''), true);
  assert.equal(tables.profile_secrets.rows.length, 0);
});

test('écriture : table absente -> repli sur l\'ancienne colonne', async () => {
  const tables = { profile_secrets: { rows: [], missing: true }, profiles: { rows: [{ id: 'u1', henrikdev_api_key: null }] } };
  assert.equal(await saveOwnApiKey(fakeClient(tables), 'u1', 'HDEV-x'), true);
  assert.equal(tables.profiles.rows[0].henrikdev_api_key, 'HDEV-x');
});
