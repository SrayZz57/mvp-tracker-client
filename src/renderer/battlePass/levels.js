// Niveaux du battle pass : fonctions PURES de l'XP totale. On ne stocke jamais
// un « niveau » en base, seulement des événements d'XP (bp_xp_events) : le
// niveau se recalcule, il ne peut donc pas diverger de l'XP réelle.
//
// La même formule existe en SQL (bp_level_from_xp, sql/battle_pass.sql) pour
// que le serveur valide les réclamations ; les tests comparent les deux.

// XP nécessaire pour passer du niveau `level` au suivant.
export function xpForNextLevel(curve, level) {
  return curve.base + curve.step * (level - 1);
}

// XP cumulée nécessaire pour ATTEINDRE `level` (le niveau 1 se possède à 0 XP).
export function xpToReach(curve, level) {
  const n = level - 1;
  return n * curve.base + (curve.step * n * (n - 1)) / 2;
}

// État complet à partir de l'XP totale d'un joueur.
//  - level : niveau atteint (plafonné à maxLevel)
//  - xpIntoLevel / xpForNext : progression dans le niveau courant
//  - progress : 0..1 dans le niveau courant (1 au niveau max)
//  - maxed : niveau maximum atteint
export function levelFromXp(curve, totalXp) {
  const xp = Math.max(0, Math.floor(totalXp) || 0);
  let level = 1;
  while (level < curve.maxLevel && xpToReach(curve, level + 1) <= xp) level += 1;

  if (level >= curve.maxLevel) {
    return { level: curve.maxLevel, xpIntoLevel: 0, xpForNext: 0, progress: 1, maxed: true, totalXp: xp };
  }
  const xpIntoLevel = xp - xpToReach(curve, level);
  const xpForNext = xpForNextLevel(curve, level);
  return { level, xpIntoLevel, xpForNext, progress: xpIntoLevel / xpForNext, maxed: false, totalXp: xp };
}
