import { SKIN_RARITY } from '../skinRarity.js';

// Petites fonctions pures d'affichage du battle pass : elles ne rendent aucun
// texte (l'i18n s'en charge dans l'interface), elles fournissent les clés et
// les paramètres. Ainsi le français et l'anglais ne peuvent pas diverger, et un
// test vérifie que chaque clé existe dans les deux langues.

// Rareté d'une récompense : celle du skin, ou pour un titre, déduite du niveau
// (plus il est haut, plus il est rare).
export function rewardRarity(reward, maxLevel = 50) {
  if (reward.type === 'weaponSkin') return SKIN_RARITY[reward.skin] ?? 'base';
  const ratio = reward.level / maxLevel;
  if (ratio >= 1) return 'ultimate';
  if (ratio >= 0.8) return 'mythic';
  if (ratio >= 0.5) return 'legendary';
  if (ratio >= 0.2) return 'epic';
  return 'base';
}

// Clé i18n du nom d'un titre ou d'une carte.
export const titleKey = (reward) => `battlePass.titles.${reward.key}`;
export const cardKey = (reward) => `battlePass.cards.${reward.key}`;
export const handKey = (reward) => `battlePass.hands.${reward.key}`;

// Libellé d'un défi : clé + paramètres. `count` pilote le pluriel i18next.
export function challengeLabel(challenge) {
  return {
    key: `battlePass.challenge.${challenge.metric}`,
    params: { count: challenge.target, minHits: challenge.min_hits ?? challenge.minHits ?? null },
    mode: challenge.mode ?? null,
  };
}

// Progression 0..1 d'un défi.
export function challengeProgress(challenge) {
  const value = Number(challenge.value) || 0;
  return Math.max(0, Math.min(1, value / challenge.target));
}

// Valeur affichée : la précision est un pourcentage, on n'affiche pas de décimales.
export function challengeValueText(challenge) {
  const value = Number(challenge.value) || 0;
  return String(Math.min(Math.floor(value), challenge.target));
}

// Temps restant avant `endMs`, en jours / heures / minutes (jamais négatif).
export function remaining(endMs, nowMs = Date.now()) {
  const total = Math.max(0, endMs - nowMs);
  const minutes = Math.floor(total / 60000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60, done: total === 0 };
}

// Clé i18n + paramètres d'un compte à rebours : « 3 j 4 h », « 5 h 12 min », « 8 min ».
export function remainingLabel(endMs, nowMs = Date.now()) {
  const r = remaining(endMs, nowMs);
  if (r.done) return { key: 'battlePass.time.ended', params: {} };
  if (r.days > 0) return { key: 'battlePass.time.daysHours', params: { days: r.days, hours: r.hours } };
  if (r.hours > 0) return { key: 'battlePass.time.hoursMinutes', params: { hours: r.hours, minutes: r.minutes } };
  return { key: 'battlePass.time.minutes', params: { minutes: Math.max(1, r.minutes) } };
}
