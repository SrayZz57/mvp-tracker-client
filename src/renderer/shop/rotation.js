import { SHOP_BUNDLES, SHOP_ITEMS } from './catalog.js';

// Rotation de la boutique : 4 offres du jour (renouvelées à 00:00 UTC), tirées
// de façon déterministe à partir de la date (plus d'offre de la semaine, retirée
// à la demande du user). Même principe que les défis du pass :
// les offres de toute une saison sont tirées ici puis semées dans la table
// shop_offers ; le serveur n'accepte un achat que si l'offre est en cours.
//
// ATTENTION : ne pas changer ce tirage pour une saison déjà commencée — rejouer
// le semis changerait les offres du jour sous les pieds des joueurs.

const DAY_MS = 24 * 3600 * 1000;

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
// Un skin déjà dans un pack (voir SHOP_BUNDLES) ne tourne pas en offre du jour
// à part — sinon on peut l'acheter seul avant/à la place du pack qui le
// contient, ce qui n'a pas de sens.
const BUNDLED_IDS = new Set(SHOP_BUNDLES.flatMap((b) => b.items));
const skinsOf = (...rarities) =>
  SHOP_ITEMS.filter((i) => i.type === 'weaponSkin' && rarities.includes(i.rarity) && !BUNDLED_IDS.has(i.id));

// Emplacements du jour, du moins cher au plus cher — uniquement des skins
// d'arme (pas de titre/carte/gant, demande du user).
const DAILY_SLOTS = [
  () => skinsOf('epic', 'legendary'),
  () => skinsOf('legendary', 'mythic'),
  () => skinsOf('ultimate'),
  () => skinsOf('ultimate', 'transcendent'),
];

function drawDistinct(slots, random) {
  const chosen = [];
  slots.forEach((slot) => {
    const pool = slot(random).filter((item) => !chosen.includes(item));
    chosen.push(pool[Math.floor(random() * pool.length)]);
  });
  return chosen;
}

// Offres d'un jour : [{ item, kind: 'daily', slot }].
export function dailyOffersFor(dayStartMs) {
  const random = rng(hash(`shop:${isoDate(dayStartMs)}`));
  return drawDistinct(DAILY_SLOTS, random).map((item, slot) => ({ item, kind: 'daily', slot }));
}

// Toutes les offres d'une saison, prêtes à semer (voir shop/seedSql.js).
export function expandShopOffers(season) {
  const start = Date.parse(season.startsAt);
  const end = Date.parse(season.endsAt);
  const rows = [];
  for (let day = start; day < end; day += DAY_MS) {
    dailyOffersFor(day).forEach(({ item, kind, slot }) => {
      rows.push({ id: `${season.id}:d:${isoDate(day)}:${slot}`, itemId: item.id, kind, price: item.price, startsAt: day, endsAt: day + DAY_MS });
    });
  }
  return rows;
}
