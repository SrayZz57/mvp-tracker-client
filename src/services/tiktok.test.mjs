import test from 'node:test';
import assert from 'node:assert/strict';
import { isTikTokUrl, resolveTikTokMetadata } from './tiktok.js';

const ID = '6718335390845095173';
// Aucun test ne touche le réseau : on injecte un faux fetch.
const noNetwork = async () => {
  throw new Error('réseau interdit dans ce test');
};

test('isTikTokUrl', () => {
  assert.equal(isTikTokUrl('https://vm.tiktok.com/ZMabc/'), true);
  assert.equal(isTikTokUrl(`https://www.tiktok.com/@u/video/${ID}`), true);
  assert.equal(isTikTokUrl('https://youtu.be/dQw4w9WgXcQ'), false);
  assert.equal(isTikTokUrl('https://evil.com/?u=tiktok.com/'), false);
  assert.equal(isTikTokUrl(undefined), false);
});

test('lien complet : adresse nettoyée des paramètres, sans appel réseau, sans miniature périssable', async () => {
  const res = await resolveTikTokMetadata(`https://www.tiktok.com/@scout2015/video/${ID}?is_from_webapp=1`, noNetwork);
  assert.equal(res.canonicalUrl, `https://www.tiktok.com/@scout2015/video/${ID}`);
  assert.equal(res.thumbnail, null);
  assert.equal(res.video, null);
});

test('lien court : adresse complète reconstruite depuis l\'oEmbed', async () => {
  const fake = async (url) => {
    assert.ok(String(url).includes('/oembed?url='));
    return { ok: true, json: async () => ({ embed_product_id: '123456789012345', author_url: 'https://www.tiktok.com/@moi', html: '' }) };
  };
  const res = await resolveTikTokMetadata('https://vm.tiktok.com/ZMabc/', fake);
  assert.equal(res.canonicalUrl, 'https://www.tiktok.com/@moi/video/123456789012345');
});

test('lien court : l\'identifiant peut aussi venir du HTML de l\'oEmbed', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ author_url: 'https://www.tiktok.com/@moi', html: '<blockquote data-video-id="999888777666555">' }) });
  const res = await resolveTikTokMetadata('https://vm.tiktok.com/ZMabc/', fake);
  assert.equal(res.canonicalUrl, 'https://www.tiktok.com/@moi/video/999888777666555');
});

test('lien court : repli par suivi de redirection quand l\'oEmbed échoue', async () => {
  const fake = async (url) =>
    String(url).includes('/oembed') ? { ok: false } : { ok: true, url: 'https://www.tiktok.com/@moi/video/999999999999999?_r=1' };
  const res = await resolveTikTokMetadata('https://vm.tiktok.com/ZMabc/', fake);
  assert.equal(res.canonicalUrl, 'https://www.tiktok.com/@moi/video/999999999999999');
});

test('échecs : réseau coupé, lien invalide -> canonicalUrl null, jamais d\'exception', async () => {
  assert.equal((await resolveTikTokMetadata('https://vm.tiktok.com/ZMabc/', noNetwork)).canonicalUrl, null);
  const landedOnHome = async (url) => (String(url).includes('/oembed') ? { ok: false } : { ok: true, url: 'https://www.tiktok.com/?_r=1' });
  assert.equal((await resolveTikTokMetadata('https://vm.tiktok.com/ZMinvalide/', landedOnHome)).canonicalUrl, null);
});
