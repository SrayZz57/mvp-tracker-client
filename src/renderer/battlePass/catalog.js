// Catalogue du battle pass : SOURCE DE VÉRITÉ des saisons, de la courbe de
// niveaux et des récompenses. Voir docs/battle-pass.md.
//
// Ce fichier est de la donnée pure (aucun import) pour trois raisons :
//  - il est relu en revue comme du code, versionné dans git ;
//  - les tests peuvent le charger sans React ni réseau ;
//  - le script `scripts/generate-battle-pass-sql.mjs` en tire le SQL que le
//    serveur utilise pour valider les réclamations : le serveur n'a donc jamais
//    une version différente de celle du client.
//
// Règle d'or : on n'enlève JAMAIS un id de récompense d'une saison déjà
// publiée. Un joueur qui l'a obtenu doit la garder.

// --- Types de récompenses -----------------------------------------------------
//
// `public: true` = visible des autres joueurs (classement, amis) : ces
// récompenses s'équipent côté serveur (RPC bp_equip, qui vérifie qu'on la
// possède). Les autres sont équipées en local, comme `weaponSkin` aujourd'hui.
export const REWARD_TYPES = {
  weaponSkin: { public: false },
  title: { public: true },
  card: { public: true },
  handSkin: { public: false },
  // MVP Points (monnaie de la boutique) : crédités côté serveur à la réclamation.
  currency: { public: false },
  // À venir (phase 7 du plan). Déclarés ici pour que le SQL et les contrôles
  // les connaissent, mais aucune saison n'en contient encore.
  icon: { public: true },
  enemySkin: { public: false },
  arenaVariant: { public: false },
};

// Constructeurs : l'id d'une récompense se déduit de son contenu, on ne
// l'écrit jamais à la main (impossible de désaligner id et contenu).
const weaponSkin = (weapon, skin) => ({ id: `skin:${weapon}:${skin}`, type: 'weaponSkin', weapon, skin });
const title = (key) => ({ id: `title:${key}`, type: 'title', key });
const card = (key) => ({ id: `card:${key}`, type: 'card', key });
const handSkin = (key) => ({ id: `hands:${key}`, type: 'handSkin', key });
// Un seul montant pour tous (voir shop/economy.js) : l'id porte juste le niveau.
const points = (level) => ({ id: `points:${level}`, type: 'currency' });

// --- Courbe de niveaux ----------------------------------------------------------
//
// Passer du niveau L au niveau L+1 coûte  base + step * (L - 1)  XP.
// Avec 400 / 20 sur 50 niveaux : 43 120 XP au total. Valeurs de départ, à
// régler avec les vraies données (PostHog) — voir « XP : premiers chiffres ».
const LEVEL_CURVE = { maxLevel: 50, base: 400, step: 20 };

// --- Saison 1 --------------------------------------------------------------------
//
// Dates PROVISOIRES : à fixer avant la publication de la phase 3. Une saison
// dure 8 semaines, de lundi 00:00 UTC à lundi 00:00 UTC.
export const SEASONS = [
  {
    id: 's1',
    number: 1,
    startsAt: '2026-11-02T00:00:00Z',
    endsAt: '2026-12-28T00:00:00Z',
    ...LEVEL_CURVE,
    // niveau -> récompenses (piste gratuite). Plusieurs récompenses possibles
    // par niveau : les phases suivantes en ajoutent (icônes, mains,
    // ennemis, arènes) sans déplacer celles-ci.
    // Skins : un par niveau au plus, rareté croissante (Commun → Rare → Épique
    // → … → Transcendant). Les skins de base (basicSkins.js) remplissent le
    // début du pass, parfois en plus d'un titre ou d'une carte.
    levels: {
      1: [title('recrue'), weaponSkin('vandal', 'dune')],
      2: [card('recon')],
      3: [weaponSkin('glock', 'olive')],
      4: [points(4)],
      5: [title('tireur_regulier'), weaponSkin('sniper', 'urban')],
      6: [points(6)],
      7: [card('flick')],
      8: [weaponSkin('vandal', 'cobalt')],
      9: [points(9)],
      10: [title('precis'), weaponSkin('glock', 'ivory')],
      11: [handSkin('desert')],
      12: [card('tracer'), weaponSkin('sniper', 'forest')],
      13: [weaponSkin('vandal', 'tidal')],
      14: [points(14)],
      15: [title('reflexes_vifs'), weaponSkin('glock', 'sunset')],
      16: [points(16)],
      17: [card('overdrive'), weaponSkin('sniper', 'amethyst')],
      18: [weaponSkin('vandal', 'redline')],
      19: [points(19)],
      20: [title('regularite'), weaponSkin('glock', 'volt')],
      21: [points(21)],
      22: [card('glacier'), weaponSkin('sniper', 'cryo')],
      23: [points(23)],
      24: [handSkin('arctic')],
      25: [title('chasseur_de_tetes'), weaponSkin('glock', 'futuristic')],
      26: [points(26)],
      27: [weaponSkin('vandal', 'circuit')],
      28: [points(28)],
      29: [card('ember')],
      30: [title('oeil_de_lynx')],
      31: [weaponSkin('sniper', 'glacier')],
      32: [points(32)],
      33: [handSkin('neon')],
      34: [title('veteran_s1'), weaponSkin('glock', 'synthwave')],
      35: [weaponSkin('vandal', 'aurora')],
      36: [points(36)],
      37: [card('vortex')],
      38: [points(38)],
      39: [points(39)],
      40: [title('as_de_la_visee')],
      41: [handSkin('crimson')],
      42: [weaponSkin('sniper', 'orbital')],
      43: [points(43)],
      44: [title('maitre_du_flick')],
      45: [card('eclipse')],
      46: [points(46)],
      47: [points(47)],
      48: [title('legende_du_tracking')],
      49: [handSkin('prestige')],
      // Récompense phare de la saison.
      50: [title('champion_s1'), weaponSkin('vandal', 'singularity'), card('singularity')],
    },
  },
];

// --- Skins réservés au pass ---------------------------------------------------------
//
// Skins sortis de la saison 1 à la demande du user, gardés pour des saisons à
// venir : ils restent VERROUILLÉS (pas offerts à tout le monde) sans jamais
// passer en boutique, contrairement aux autres skins absents du pass (voir
// shop/catalog.js). À retirer d'ici quand on les remet dans une saison.
export const RESERVED_SKIN_IDS = new Set(
  [
    weaponSkin('vandal', 'magma'),
    weaponSkin('vandal', 'mercury'),
    weaponSkin('vandal', 'jade'),
    weaponSkin('glock', 'chronos'),
    weaponSkin('sniper', 'phoenix'),
  ].map((r) => r.id),
);

// --- Accès ------------------------------------------------------------------------

export function getSeason(id) {
  return SEASONS.find((s) => s.id === id) ?? null;
}

// Saison en cours à l'instant `now` (Date), ou null entre deux saisons. Le
// SERVEUR reste l'autorité sur le calendrier (table bp_seasons) : ceci ne sert
// qu'à l'affichage hors ligne et aux tests.
export function seasonAt(now = new Date()) {
  const t = now.getTime();
  return SEASONS.find((s) => t >= Date.parse(s.startsAt) && t < Date.parse(s.endsAt)) ?? null;
}

// Prochaine saison à venir (pour annoncer « commence le … » entre deux saisons).
export function upcomingSeason(now = Date.now()) {
  return [...SEASONS].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).find((s) => Date.parse(s.startsAt) > now) ?? null;
}

// Liste à plat [{ level, ...récompense }], triée par niveau.
export function listRewards(season) {
  return Object.entries(season.levels)
    .flatMap(([level, rewards]) => rewards.map((r) => ({ level: Number(level), ...r })))
    .sort((a, b) => a.level - b.level);
}
