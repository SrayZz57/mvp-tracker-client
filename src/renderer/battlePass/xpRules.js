// Règles d'XP : toutes les valeurs à régler au même endroit. Copiées dans la
// ligne de la saison (bp_seasons) par le script de génération SQL, pour que le
// serveur applique exactement ces chiffres. Voir docs/battle-pass.md.
//
// Valeurs de départ : on les ajuste avec les vraies données (PostHog).

// XP d'une session d'entraînement.
export const SESSION_RULES = {
  xp: 20,
  // Plafond par jour (UTC) : borne ce qu'un joueur — ou un tricheur — tire des
  // seules sessions. ~15 sessions de 60 s, soit environ 15 minutes de jeu.
  dailyCap: 300,
  // Une session compte seulement si elle est plausible : durée configurée et
  // nombre de touches minimaux (écarte les sessions vides et le farming
  // d'écrans de résultats).
  minDuration: 30,
  minHits: 10,
};

// XP par difficulté de défi.
export const CHALLENGE_XP = {
  daily: { easy: 100, medium: 150, hard: 200 },
  weekly: { easy: 400, medium: 600, hard: 800 },
};

// Précision minimale d'échantillon : sans ce plancher, « 100 % de précision »
// s'obtient avec une seule cible touchée.
export const ACCURACY_MIN_HITS = { daily: 30, weekly: 40, season: 50 };

// La marge d'un pass tenable : le total d'XP gagnable sur la saison doit
// dépasser d'au moins 20 % ce qu'il faut pour le niveau max (sinon il faudrait
// une saison parfaite) mais pas le doubler (sinon le pass se finit en deux
// semaines). Vérifié par un test.
export const BUDGET_RATIO = { min: 1.2, max: 2 };
