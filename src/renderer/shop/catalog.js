import { WEAPON_MODELS } from '../aimTrainerModes.js';
import { SKIN_RARITY } from '../skinRarity.js';
import { RESERVED_SKIN_IDS, SEASONS, listRewards } from '../battlePass/catalog.js';
import { PRICES } from './economy.js';

// Catalogue de la boutique. Même identifiants que les récompenses du Battle
// Pass (skin:<arme>:<skin>, hands:<clé>, title:<clé>) : la possession se lit au
// même endroit, qu'un objet ait été gagné ou acheté.
//
// Contenu :
//   - tous les skins d'armes que AUCUNE saison du pass ne donne, sauf ceux
//     réservés à de futures saisons (RESERVED_SKIN_IDS) ;
//   - des exclusivités (titres) qu'on ne trouve qu'ici.
// Pas de gants ici (demande du user) : ils ne se gagnent que par le pass.
// `chrome`/`tiger` (handSkins.js) restent en réserve pour une saison à venir.
// Règle d'or (comme le pass) : on ne retire jamais un objet déjà vendu.

const PASS_IDS = new Set(SEASONS.flatMap((season) => listRewards(season).map((r) => r.id)));

// Exclusivités : leurs libellés vivent avec ceux du pass (battlePass.titles.*).
const EXCLUSIVE_TITLES = ['collectionneur', 'fortune', 'tireur_elite'];

const skins = Object.entries(WEAPON_MODELS).flatMap(([weapon, model]) =>
  Object.keys(model.skins ?? {})
    .filter((skin) => skin !== 'standard')
    .map((skin) => ({ id: `skin:${weapon}:${skin}`, type: 'weaponSkin', weapon, skin, rarity: SKIN_RARITY[skin] ?? 'epic' }))
    .filter((item) => !PASS_IDS.has(item.id) && !RESERVED_SKIN_IDS.has(item.id))
    .map((item) => ({ ...item, price: PRICES[item.rarity] ?? PRICES.epic })),
);

const titles = EXCLUSIVE_TITLES.map((key) => ({ id: `title:${key}`, type: 'title', key, rarity: 'epic', price: PRICES.title }));

// Packs : un seul achat pour plusieurs objets, une fois par joueur. Toujours en
// vente (hors rotation), tant qu'on ne l'a pas.
export const SHOP_BUNDLES = [
  {
    id: 'bundle:welcome',
    type: 'bundle',
    key: 'welcome',
    rarity: 'legendary',
    price: 800,
    items: ['skin:glock:prism', 'skin:vandal:radiation', 'skin:sniper:crown'],
  },
];

export const SHOP_ITEMS = [...skins, ...titles, ...SHOP_BUNDLES];
export const SHOP_ITEM_BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));
export const isShopItem = (id) => SHOP_ITEM_BY_ID.has(id);
export const shopPrice = (id) => SHOP_ITEM_BY_ID.get(id)?.price ?? null;
