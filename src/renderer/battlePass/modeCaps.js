// Plafonds de score par mode : sert à écarter les scores IMPOSSIBLES (fabriqués)
// du calcul d'XP, des défis et des classements. Voir docs/battle-pass.md.
//
// Ce n'est pas de l'anti-triche parfait : un score truqué mais plausible passe.
// L'objectif est de borner les dégâts (un tricheur ne peut pas viser 10 000) et
// de ne jamais laisser UNE ligne fausse fausser les autres joueurs.

// Instantané des vraies parties enregistrées (Supabase, 2026-09-26) :
//   mode: [nombre de parties, score maximum, 99e centile]
// À rafraîchir à chaque saison : les joueurs progressent, les plafonds doivent
// suivre. Mettre à jour ce tableau puis relancer
// `node scripts/generate-battle-pass-sql.mjs`.
export const OBSERVED_SCORES = {
  ascentDuel: [1, 9, 9],
  custom: [373, 547, 304.16],
  flashDodge: [370, 94, 88],
  flick: [2117, 138, 110.84],
  gridshot: [1531, 161, 149.7],
  headshotDuel: [19, 34, 33.64],
  micro: [926, 126, 101],
  orbit: [355, 106, 99.46],
  patrol: [51, 98, 98],
  patrolFast: [132, 96, 96],
  patrolMulti: [61, 96, 95.4],
  patrolSlow: [93, 99, 99],
  peek: [927, 73, 64.74],
  popcorn: [167, 128, 111.34],
  precision: [296, 93, 91],
  reflex: [741, 105, 100],
  snapHold: [415, 69, 64],
  spray: [101, 195, 170],
  strafe: [533, 122, 86],
  strafeTap: [193, 210, 186.72],
  switch: [261, 111, 103],
  tracking: [522, 100, 68.79],
  trackingBeginner: [524, 119, 113],
  trackingIntermediate: [519, 109, 92.28],
  trackingMulti: [126, 80, 79],
  // Modes sniper : pas encore joués. Maximum théorique = cadence de la culasse
  // (45 tirs en 60 s) ; à remplacer par les vrais chiffres dès qu'il y en a.
  sniperQuickscope: [0, 45, 30],
  sniperNoscope: [0, 45, 30],
  sniperAngleHold: [0, 45, 30],
  sniperRepeek: [0, 45, 30],
  sniperBolt: [0, 45, 30],
  sniperScopeSpeed: [0, 45, 30],
};

// Réglages libres (nombre et taille des cibles, durée) : le score n'est pas
// comparable d'un joueur à l'autre. Plafond très large, uniquement contre
// l'absurde ; jamais utilisé pour un défi ni un classement.
export const CUSTOM_MODE = 'custom';
const CUSTOM_CAP = 1500;

// Marge sur le maximum observé. Plus large pour un mode peu joué : son
// maximum actuel (parfois une seule partie) ne dit encore rien du vrai plafond.
const MARGIN_COMMON = 1.6;
const MARGIN_RARE = 3;
const RARE_BELOW = 100; // parties observées

function capOf(mode, [count, max]) {
  if (mode === CUSTOM_MODE) return CUSTOM_CAP;
  const margin = count >= RARE_BELOW ? MARGIN_COMMON : MARGIN_RARE;
  return Math.ceil((max * margin) / 5) * 5;
}

export const MODE_SCORE_CAPS = Object.fromEntries(
  Object.entries(OBSERVED_SCORES).map(([mode, observed]) => [mode, capOf(mode, observed)]),
);

// Modes assez joués pour qu'un défi « score de X sur ce mode » ait un sens :
// on a de quoi calibrer la difficulté (99e centile fiable).
const POPULAR_MIN_GAMES = 300;
export const POPULAR_MODES = Object.entries(OBSERVED_SCORES)
  .filter(([mode, [count]]) => mode !== CUSTOM_MODE && count >= POPULAR_MIN_GAMES)
  .map(([mode]) => mode)
  .sort();

// Score visé = fraction du 99e centile du mode. Le 99e centile est le haut du
// panier : 0,5 est accessible à un joueur régulier, 0,8 est un vrai défi.
export function scoreTarget(mode, fraction) {
  return Math.max(1, Math.round(OBSERVED_SCORES[mode][2] * fraction));
}
