import test from 'node:test';
import assert from 'node:assert/strict';
import { clipEmbedUrl, clipThumbnailUrl, detectClipPlatform, isTikTokShortLink } from './clipEmbed.js';

const ID = '6718335390845095173';

test('detectClipPlatform : YouTube (watch, youtu.be, shorts)', () => {
  assert.equal(detectClipPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectClipPlatform('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectClipPlatform('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'youtube');
});

test('detectClipPlatform : TikTok (complet, paramètres, mobile, court, déjà embed)', () => {
  const links = [
    `https://www.tiktok.com/@scout2015/video/${ID}`,
    `https://www.tiktok.com/@scout2015/video/${ID}?is_from_webapp=1&sender_device=pc`,
    `https://tiktok.com/@a.b-c_d/video/${ID}`,
    `https://m.tiktok.com/v/${ID}.html`,
    'https://vm.tiktok.com/ZMabc123/',
    'https://vt.tiktok.com/ZSabc123/',
    'https://www.tiktok.com/t/ZTabc123/',
    `https://www.tiktok.com/embed/v2/${ID}`,
  ];
  links.forEach((link) => assert.equal(detectClipPlatform(link), 'tiktok', link));
});

test('detectClipPlatform : Medal et Streamable inchangés, le reste est refusé', () => {
  assert.equal(detectClipPlatform('https://medal.tv/games/valorant/clips/abc123/xyz'), 'medal');
  assert.equal(detectClipPlatform('https://streamable.com/abc12'), 'streamable');
  assert.equal(detectClipPlatform('https://www.tiktok.com/@scout2015'), null, 'un profil n\'est pas une vidéo');
  assert.equal(detectClipPlatform('https://example.com/video/123'), null);
  assert.equal(detectClipPlatform(''), null);
  assert.equal(detectClipPlatform(undefined), null);
});

test('clipEmbedUrl : TikTok via la page prévue pour l\'intégration, YouTube sans cookies', () => {
  assert.equal(clipEmbedUrl(`https://www.tiktok.com/@scout2015/video/${ID}`), `https://www.tiktok.com/embed/v2/${ID}`);
  assert.equal(clipEmbedUrl(`https://m.tiktok.com/v/${ID}.html`), `https://www.tiktok.com/embed/v2/${ID}`);
  assert.equal(clipEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(clipEmbedUrl('https://streamable.com/abc12'), 'https://streamable.com/e/abc12?autoplay=0&muted=1');
});

test('clipEmbedUrl : lien court TikTok ou Medal -> pas d\'iframe (ouverture externe)', () => {
  assert.equal(clipEmbedUrl('https://vm.tiktok.com/ZMabc123/'), null);
  assert.equal(clipEmbedUrl('https://medal.tv/games/valorant/clips/abc123/xyz'), null);
});

test('isTikTokShortLink : seulement les liens sans identifiant', () => {
  assert.equal(isTikTokShortLink('https://vm.tiktok.com/ZMabc123/'), true);
  assert.equal(isTikTokShortLink('https://www.tiktok.com/t/ZTabc123/'), true);
  assert.equal(isTikTokShortLink(`https://www.tiktok.com/@u/video/${ID}`), false);
  assert.equal(isTikTokShortLink('https://youtu.be/dQw4w9WgXcQ'), false);
  assert.equal(isTikTokShortLink(''), false);
});

test('clipThumbnailUrl : miniature déduite de l\'id pour YouTube seulement', () => {
  assert.equal(clipThumbnailUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(clipThumbnailUrl(`https://www.tiktok.com/@u/video/${ID}`), null);
});
