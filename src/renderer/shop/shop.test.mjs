// Tests de la boutique (catalogue, rotation). Lancer :  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { RESERVED_SKIN_IDS, SEASONS, listRewards } from '../battlePass/catalog.js';
import { SHOP_BUNDLES, SHOP_ITEMS, SHOP_ITEM_BY_ID } from './catalog.js';
import { dailyOffersFor, expandShopOffers } from './rotation.js';

const DAY = 24 * 3600 * 1000;

test('catalogue : identifiants uniques, prix définis', () => {
  assert.equal(SHOP_ITEM_BY_ID.size, SHOP_ITEMS.length);
  SHOP_ITEMS.forEach((item) => assert.ok(Number.isInteger(item.price) && item.price > 0, `${item.id} sans prix`));
});

test('la boutique ne vend jamais une récompense du Battle Pass', () => {
  const pass = new Set(SEASONS.flatMap((s) => listRewards(s).map((r) => r.id)));
  SHOP_ITEMS.forEach((item) => assert.ok(!pass.has(item.id), `${item.id} est aussi dans le pass`));
});

test('le skin de base n\'est jamais à vendre', () => {
  assert.ok(!SHOP_ITEMS.some((i) => i.type === 'weaponSkin' && i.skin === 'standard'));
});

test('rotation déterministe : même jour, mêmes offres', () => {
  const day = Date.parse('2026-11-10T00:00:00Z');
  assert.deepEqual(dailyOffersFor(day).map((o) => o.item.id), dailyOffersFor(day).map((o) => o.item.id));
});

test('4 offres du jour distinctes, et la rotation change d\'un jour à l\'autre', () => {
  const start = Date.parse('2026-11-02T00:00:00Z');
  let changed = 0;
  for (let d = 0; d < 28; d += 1) {
    const ids = dailyOffersFor(start + d * DAY).map((o) => o.item.id);
    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, 4);
    if (d > 0 && ids.join() !== dailyOffersFor(start + (d - 1) * DAY).map((o) => o.item.id).join()) changed += 1;
  }
  assert.ok(changed >= 25);
});

test('les skins réservés au pass (saisons à venir) ne sont jamais en vente', () => {
  RESERVED_SKIN_IDS.forEach((id) => assert.ok(!SHOP_ITEM_BY_ID.has(id), `${id} est en boutique`));
});

test('offres de saison : 4 par jour seulement (plus d\'offre de la semaine), objets connus, pas de chevauchement', () => {
  SEASONS.forEach((season) => {
    const rows = expandShopOffers(season);
    const days = (Date.parse(season.endsAt) - Date.parse(season.startsAt)) / DAY;
    assert.equal(rows.length, days * 4);
    assert.ok(rows.every((r) => r.kind === 'daily'));
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
    rows.forEach((r) => {
      assert.ok(SHOP_ITEM_BY_ID.has(r.itemId), `${r.itemId} inconnu`);
      assert.ok(r.endsAt > r.startsAt);
    });
  });
});

test('packs : contenu = skins de la boutique, prix inférieur à la valeur', () => {
  SHOP_BUNDLES.forEach((bundle) => {
    assert.ok(bundle.items.length > 0);
    const items = bundle.items.map((id) => SHOP_ITEM_BY_ID.get(id));
    items.forEach((item, i) => assert.ok(item && item.type !== 'bundle', `${bundle.items[i]} absent du catalogue`));
    assert.ok(bundle.price < items.reduce((sum, item) => sum + item.price, 0));
  });
});

test('la rotation ne propose jamais un pack', () => {
  SEASONS.forEach((season) => {
    expandShopOffers(season).forEach((r) => assert.notEqual(SHOP_ITEM_BY_ID.get(r.itemId).type, 'bundle'));
  });
});
