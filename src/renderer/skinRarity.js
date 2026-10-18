// Rareté de chaque skin d'arme, partagée par le Vestiaire (SkinViewer) et le
// battle pass (battlePass/catalog.js). Pure donnée : aucun import, donc
// utilisable aussi bien côté menu que dans les tests.
//
// Ordre croissant : base < common < rare < epic < legendary < mythic < ultimate
// < transcendent < unique.
export const RARITY_ORDER = ['base', 'common', 'rare', 'epic', 'legendary', 'mythic', 'ultimate', 'transcendent', 'unique'];

// Paliers dont les skins ont une animation d'apparition (rejouée à la sélection
// dans le Vestiaire, le Battle Pass et la boutique).
const INTRO_RARITIES = new Set(['transcendent', 'unique']);
export const hasIntro = (rarity) => INTRO_RARITIES.has(rarity);

export const SKIN_RARITY = {
  standard: 'base',
  // Skins de base du Battle Pass (voir basicSkins.js) : recoloration seule
  // (Commun) ou avec un effet simple (Rare).
  dune: 'common',
  cobalt: 'common',
  olive: 'common',
  ivory: 'common',
  urban: 'common',
  forest: 'common',
  tidal: 'rare',
  redline: 'rare',
  sunset: 'rare',
  volt: 'rare',
  amethyst: 'rare',
  cryo: 'rare',
  magma: 'epic',
  circuit: 'epic',
  celeste: 'legendary',
  jade: 'mythic',
  clockwork: 'mythic',
  glacier: 'legendary',
  void: 'legendary',
  phoenix: 'legendary',
  storm: 'legendary',
  crown: 'legendary',
  futuristic: 'epic',
  banana: 'epic',
  synthwave: 'legendary',
  kraken: 'legendary',
  oni: 'legendary',
  prism: 'legendary',
  xeno: 'legendary',
  aurora: 'legendary',
  sakura: 'legendary',
  radiation: 'legendary',
  pharaoh: 'legendary',
  hologram: 'legendary',
  titan: 'ultimate',
  arcane: 'ultimate',
  mercury: 'ultimate',
  sylvan: 'ultimate',
  spectre: 'ultimate',
  orbital: 'ultimate',
  ossuary: 'ultimate',
  stained: 'ultimate',
  abyssal: 'ultimate',
  supernova: 'ultimate',
  chronos: 'ultimate',
  monarch: 'ultimate',
  scorpion: 'ultimate',
  quantum: 'ultimate',
  harlequin: 'ultimate',
  lithosphere: 'ultimate',
  symbiote: 'ultimate',
  heliopause: 'ultimate',
  reliquary: 'ultimate',
  nullbyte: 'ultimate',
  patchbay: 'ultimate',
  downforce: 'ultimate',
  // Palier Transcendant : animation d'apparition jouée à la sélection.
  singularity: 'transcendent',
  metamorph: 'transcendent',
  rift: 'transcendent',
  origami: 'transcendent',
  hive: 'transcendent',
  voxel: 'transcendent',
  maelstrom: 'transcendent',
  sumi: 'transcendent',
  arcade: 'transcendent',
  hanabi: 'transcendent',
  mirage: 'transcendent',
  candy: 'transcendent',
  kintsugi: 'transcendent',
  locomotive: 'transcendent',
  kaleidoscope: 'transcendent',
  marble: 'transcendent',
  weaver: 'transcendent',
  corsair: 'transcendent',
  // Palier Unique : au-dessus de tout, un seul skin, la signature de l'app.
  // Jamais vendu ni gagné au pass : offert à tous (voir shop/catalog.js).
  mvptracker: 'unique',
};
