import { RESERVED_SKIN_IDS, SEASONS, listRewards } from './catalog.js';
import { isShopItem, shopPrice } from '../shop/catalog.js';

// Qui possède quoi. Fonctions pures : le hook (useBattlePass) leur donne la
// liste des récompenses réclamées, elles répondent.
//
// Limite assumée : un skin est dans l'application (le code est chez le joueur),
// donc ce verrou est cosmétique côté client, pas une protection. Ce qui est
// protégé côté serveur, c'est ce que les AUTRES voient : titre, carte, icône.

export const BASE_SKIN = 'standard';

export const skinRewardId = (weapon, skin) => `skin:${weapon}:${skin}`;

// Le skin de base est à tout le monde ; les autres exigent d'avoir réclamé la
// récompense correspondante, dans n'importe quelle saison.
export function isSkinOwned(ownedRewardIds, weapon, skin) {
  return skin === BASE_SKIN || ownedRewardIds.has(skinRewardId(weapon, skin));
}

// Où se débloque un skin : { seasonNumber, level } dans la première saison du
// catalogue qui l'offre, ou null si aucune ne l'offre encore.
const UNLOCK_INDEX = new Map();
for (const season of SEASONS) {
  for (const reward of listRewards(season)) {
    if (reward.type === 'weaponSkin' && !UNLOCK_INDEX.has(reward.id)) {
      UNLOCK_INDEX.set(reward.id, { seasonNumber: season.number, level: reward.level });
    }
  }
}

export function skinUnlockSource(weapon, skin) {
  return UNLOCK_INDEX.get(skinRewardId(weapon, skin)) ?? null;
}

// Un skin est verrouillé s'il se gagne (pass) ou s'achète (boutique) et qu'on
// ne le possède pas. `pass` / `shop` : ce système est-il actif ? S'il ne l'est
// pas (migration serveur absente, pas de compte), ses objets restent libres,
// comme avant son arrivée.
export function isSkinLocked(ownedRewardIds, weapon, skin, { pass = true, shop = true } = {}) {
  if (isSkinOwned(ownedRewardIds, weapon, skin)) return false;
  const id = skinRewardId(weapon, skin);
  // Réservé à une saison à venir : verrouillé comme un skin du pass.
  return (pass && (skinUnlockSource(weapon, skin) !== null || RESERVED_SKIN_IDS.has(id))) || (shop && isShopItem(id));
}

// Comment l'obtenir : { kind: 'pass', seasonNumber, level } | { kind: 'shop', price } | null.
export function skinLockInfo(weapon, skin) {
  const pass = skinUnlockSource(weapon, skin);
  if (pass) return { kind: 'pass', ...pass };
  const price = shopPrice(skinRewardId(weapon, skin));
  return price ? { kind: 'shop', price } : null;
}

// Gants : 'standard' est à tout le monde ; les autres exigent la récompense
// correspondante. Seuls ceux qu'une saison offre peuvent être verrouillés.
export const handRewardId = (key) => `hands:${key}`;

const HAND_INDEX = new Map();
for (const season of SEASONS) {
  for (const reward of listRewards(season)) {
    if (reward.type === 'handSkin' && !HAND_INDEX.has(reward.id)) {
      HAND_INDEX.set(reward.id, { seasonNumber: season.number, level: reward.level });
    }
  }
}

export const handUnlockSource = (key) => HAND_INDEX.get(handRewardId(key)) ?? null;

export function isHandLocked(ownedRewardIds, key, { pass = true, shop = true } = {}) {
  if (key === BASE_SKIN || ownedRewardIds.has(handRewardId(key))) return false;
  return (pass && handUnlockSource(key) !== null) || (shop && isShopItem(handRewardId(key)));
}

export const handShopPrice = (key) => shopPrice(handRewardId(key));
