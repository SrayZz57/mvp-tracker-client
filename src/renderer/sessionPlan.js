import { excludeDeathmatch, groupStats, timeSlot, SLOT_HOURS, tiltStatus, formStats, overallHsPercent } from './valorantStats.js';

function currentTimeSlotLabel() {
  const hour = new Date().getHours();
  const start = Math.floor(hour / SLOT_HOURS) * SLOT_HOURS;
  return `${start}h-${start + SLOT_HOURS}h`;
}

// Durée d'échauffement suggérée à partir du module "Perf & Forme" : plus
// courte si l'historique montre que tu performes déjà bien sur ce créneau
// horaire précis, plus longue s'il montre l'inverse (ou s'il n'y a pas encore
// assez de données pour ce créneau).
function suggestWarmup(t, slotStats) {
  const currentSlot = currentTimeSlotLabel();
  const stats = slotStats.find((s) => s.key === currentSlot) ?? null;

  if (!stats || stats.games < 2 || stats.winrate === null) {
    return {
      minutes: 15,
      reason: t('session.warmupNoData', { slot: currentSlot }),
    };
  }
  if (stats.winrate >= 50) {
    return {
      minutes: 10,
      reason: t('session.warmupGood', { slot: currentSlot, percent: stats.winrate.toFixed(0) }),
    };
  }
  return {
    minutes: 20,
    reason: t('session.warmupBad', { slot: currentSlot, percent: stats.winrate.toFixed(0) }),
  };
}

// Génère le plan de session : échauffement, map/stratégie à revoir, état de
// tilt, et un objectif du jour concret — le tout dérivé des modules déjà
// existants (Perf & Forme, Tilt, historique de matchs), sans nouvel appel API.
// `t` reçu en paramètre : le texte généré est figé dans la langue active au
// moment du lancement de la session (même pattern que weeklyNarrative.js).
export function buildSessionPlan(t, matches, name, tag) {
  const ranked = excludeDeathmatch(matches);
  const form = formStats(ranked, name, tag);
  const tilt = tiltStatus(ranked, name, tag, form);
  const slotStats = groupStats(ranked, name, tag, (match) => timeSlot(match));
  const warmup = suggestWarmup(t, slotStats);

  // Skirmish n'est pas une vraie map (terrain d'entraînement Riot, pas une
  // des maps compétitives) — l'outil Stratégie ne propose jamais d'y créer
  // un plan, donc suggérer "aucune stratégie sauvegardée sur Skirmish E"
  // n'a aucun sens (signalé sur Discord). On cherche le match le plus
  // récent dont la map est une vraie map plutôt que le tout dernier match
  // sans distinction.
  const strategyMatch = matches.find((m) => !m.metadata?.map?.toLowerCase().startsWith('skirmish'));
  const targetMap = strategyMatch?.metadata?.map ?? null;

  const hsPercent = overallHsPercent(ranked, name, tag);
  const hsTarget = hsPercent === null ? 25 : Math.ceil((hsPercent + 3) / 5) * 5;

  const matchCount = tilt.isTilted ? 2 : 3;

  // Volontairement sans map : on ne choisit pas la map en file d'attente, un
  // objectif "3 matchs sur Split" n'était donc pas atteignable de façon fiable
  // (signalé sur Discord). targetMap ne sert plus qu'à la checklist Stratégie.
  const objective = t('session.objectiveNoMap', { count: matchCount, hsTarget });

  return { warmup, targetMap, tilt, matchCount, hsTarget, objective };
}
