// Tests de la logique pure de la recherche de lineups (search.ts).
// Node exécute directement le TypeScript (retrait des types) : `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SECONDS,
  YOUTUBE_SEARCH_URL,
  YOUTUBE_VIDEOS_URL,
  buildQuery,
  cacheKey,
  parseIsoDuration,
  sanitizeInput,
  toResults,
} from './search.ts';

const video = (id, o = {}) => ({
  id,
  snippet: {
    title: o.title ?? 'Fade lineup Haven Valorant',
    description: o.description ?? '',
    channelTitle: o.channel ?? 'Chaine',
    publishedAt: '2026-09-01T00:00:00Z',
    tags: o.tags ?? [],
  },
  contentDetails: { duration: o.duration ?? 'PT28S' },
  statistics: { viewCount: String(o.views ?? 1000) },
  status: { embeddable: o.embeddable ?? true, privacyStatus: o.privacy ?? 'public' },
});
const ids = (videos, input) => toResults(videos, input).map((r) => r.id);
const onHaven = { agent: 'Fade', map: 'Haven', side: null, site: null };

test('sanitizeInput : entrées valides, map facultative', () => {
  assert.deepEqual(sanitizeInput({ agent: 'Fade', map: 'Haven', side: 'attack', site: 'A' }), { agent: 'Fade', map: 'Haven', side: 'attack', site: 'A' });
  assert.equal(sanitizeInput({ agent: 'Fade' }).map, '');
  assert.ok(sanitizeInput({ agent: 'KAY/O', map: 'Ascent' }));
  const loose = sanitizeInput({ agent: 'Fade', map: 'Haven', side: 'x', site: 'Z' });
  assert.equal(loose.side, null);
  assert.equal(loose.site, null);
});

test('sanitizeInput : refuse tout ce qui pourrait détourner la requête YouTube', () => {
  for (const bad of [{ map: 'Haven' }, { agent: 'Fade&key=x', map: 'Haven' }, { agent: 'Fade\nx', map: 'Haven' }, { agent: 'a'.repeat(31), map: 'Haven' }, { agent: 'Fade', map: 'Haven=1' }]) {
    assert.equal(sanitizeInput(bad), null, JSON.stringify(bad));
  }
  assert.equal(sanitizeInput('Fade'), null);
  assert.equal(sanitizeInput(null), null);
});

test('buildQuery et cacheKey', () => {
  assert.equal(buildQuery({ agent: 'Fade', map: '', side: null, site: null }), 'valorant Fade lineup shorts');
  assert.equal(buildQuery({ agent: 'Sova', map: 'Haven', side: 'attack', site: 'A' }), 'valorant Sova Haven lineup A site attack shorts');
  assert.equal(cacheKey({ agent: 'Fade', map: 'Haven', side: null, site: null }), cacheKey({ agent: 'FADE', map: 'haven', side: null, site: null }));
  assert.notEqual(cacheKey({ agent: 'Fade', map: 'Haven', side: 'attack', site: null }), cacheKey({ agent: 'Fade', map: 'Haven', side: 'defense', site: null }));
  assert.ok(cacheKey(onHaven).startsWith('v2|'), 'clé versionnée : les résultats de l\'ancien filtre sont ignorés');
});

test('parseIsoDuration', () => {
  assert.equal(parseIsoDuration('PT28S'), 28);
  assert.equal(parseIsoDuration('PT1M5S'), 65);
  assert.equal(parseIsoDuration('PT1H'), 3600);
  assert.equal(parseIsoDuration('n\'importe quoi'), 0);
  assert.equal(parseIsoDuration(undefined), 0);
});

test('toResults : durée 4 s à 40 s, intégrable, publique, sur l\'agent et sur Valorant', () => {
  const out = ids([
    video('ok28'), video('ok40', { duration: `PT${MAX_SECONDS}S` }), video('trop41', { duration: 'PT41S' }), video('trop1m', { duration: 'PT1M5S' }), video('trop2s', { duration: 'PT2S' }),
    video('pasEmbed', { embeddable: false }), video('prive', { privacy: 'private' }),
    video('autreAgent', { title: 'Sova lineup Haven Valorant' }), video('pasValorant', { title: 'Fade lineup Haven' }),
  ], onHaven);
  assert.deepEqual(out.sort(), ['ok28', 'ok40']);
});

test('toResults : la map demandée doit être la bonne', () => {
  const on = (videos, map = 'Haven') => ids(videos, { agent: 'Fade', map, side: null, site: null });
  assert.deepEqual(on([video('sansMap', { title: 'Fade lineup Valorant' })]), [], 'ne cite pas la map : écartée');
  assert.deepEqual(on([video('split', { title: 'Fade lineup Split Valorant' })]), [], 'autre map dans le titre : écartée');
  assert.deepEqual(on([video('d', { title: 'Fade lineup Split Valorant', description: 'works on Haven too' })]), [], 'Haven seulement en description, titre sur Split : écartée');
  assert.deepEqual(on([video('desc', { title: 'Fade lineup Valorant', description: 'Haven A site lineup' })]), ['desc']);
  assert.deepEqual(on([video('tag', { title: 'Fade lineup Valorant', tags: ['haven'] })]), ['tag']);
  assert.deepEqual(on([video('havenly', { title: 'Fade lineup Valorant', description: 'Havenly place' })]), [], 'mot entier seulement');
  assert.deepEqual(on([video('sp', { title: 'Fade lineup Split Valorant' }), video('hv')], 'Split'), ['sp']);
  // Sans map demandée : toutes les maps passent.
  assert.deepEqual(ids([video('sansMap', { title: 'Fade lineup Valorant' })], { ...onHaven, map: '' }), ['sansMap']);
});

test('toResults : classement — la précision de la map l\'emporte sur les vues', () => {
  const r = ids([
    video('both', { title: 'Fade Haven and Split lineup Valorant', views: 900000 }),
    video('clean', { title: 'Fade Haven lineup Valorant', views: 100 }),
    video('inDesc', { title: 'Fade lineup Valorant', description: 'Haven', views: 90000 }),
  ], onHaven);
  assert.equal(r[0], 'clean');
  assert.deepEqual(new Set(r), new Set(['clean', 'both', 'inDesc']));
});

test('toResults : côté et site demandés font remonter les vidéos qui les citent', () => {
  const attack = ids([video('a', { title: 'Fade Haven Valorant attack execute', views: 10 }), video('b', { title: 'Fade Haven Valorant', views: 20 })], { ...onHaven, side: 'attack' });
  assert.equal(attack[0], 'a');
  const site = ids([video('a', { title: 'Fade Haven Valorant A site', views: 10 }), video('b', { title: 'Fade Haven Valorant B site', views: 20 })], { ...onHaven, site: 'A' });
  assert.equal(site[0], 'a');
});

test('toResults : KAY/O reconnu sous toutes ses écritures, accents et casse tolérés', () => {
  const kayo = ids([video('k1', { title: 'KAYO lineup Ascent Valorant' }), video('k2', { title: 'Kay/O lineup Ascent Valorant' }), video('k3', { title: 'kay o lineup Ascent Valorant' })], { agent: 'KAY/O', map: 'Ascent', side: null, site: null });
  assert.equal(kayo.length, 3);
  assert.deepEqual(ids([video('acc', { title: 'FADE – lineup HAVEN VALORANT éàç' })], onHaven), ['acc']);
});

test('toResults : 3 vidéos par chaîne et 12 résultats au plus', () => {
  const many = Array.from({ length: 30 }, (_, i) => video(`v${i}`, { channel: i < 10 ? 'Spam' : `C${i}`, views: 100000 - i }));
  const out = toResults(many, onHaven);
  assert.equal(out.filter((r) => r.channel === 'Spam').length, 3);
  assert.equal(out.length, 12);
});

test('toResults : résultat complet et entrées vides', () => {
  const [r] = toResults([video('abc', { views: 5000 })], onHaven);
  assert.deepEqual(r, { id: 'abc', title: 'Fade lineup Haven Valorant', channel: 'Chaine', seconds: 28, views: 5000, publishedAt: '2026-09-01T00:00:00Z', thumbnail: 'https://i.ytimg.com/vi/abc/hqdefault.jpg' });
  assert.deepEqual(toResults([], onHaven), []);
  assert.deepEqual(toResults(undefined, onHaven), []);
});

test('URL de l\'API YouTube : clé, vidéos courtes intégrables, ids groupés', () => {
  const search = new URL(YOUTUBE_SEARCH_URL('valorant Fade lineup shorts', 'CLE'));
  assert.equal(search.searchParams.get('videoDuration'), 'short');
  assert.equal(search.searchParams.get('videoEmbeddable'), 'true');
  assert.equal(search.searchParams.get('maxResults'), '50');
  assert.equal(search.searchParams.get('key'), 'CLE');
  assert.equal(new URL(YOUTUBE_VIDEOS_URL(['a', 'b'], 'CLE')).searchParams.get('id'), 'a,b');
});
