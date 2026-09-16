import { excludeDeathmatch, findMe, resultLabel } from './valorantStats.js';

// Fenêtre de grâce après minuit pendant laquelle on ne bascule pas encore
// sur la nouvelle journée si la dernière partie connue a commencé juste
// avant minuit — le temps qu'elle apparaisse dans les matchs récupérés
// (HenrikDev ne renvoie que des parties terminées, jamais une en cours).
// Sans ça, une partie commencée à 23h58 risquerait de disparaître des
// stats du jour pile au moment où elle vient de se terminer, juste parce
// que le calendrier a changé entre-temps. Plus long qu'une partie normale
// (30-45 min) pour laisser une marge de récupération.
const STRADDLE_GRACE_MINUTES = 60;

function pad(n) {
  return String(n).padStart(2, '0');
}

// Journée locale (fuseau de la machine du joueur, pas UTC) — cohérent avec
// ce que "minuit" veut dire pour lui.
export function dayKeyFor(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Détermine quelle journée est actuellement "en cours" pour l'overlay.
// `previousDayKey` = résultat du dernier appel (null au tout premier appel
// depuis le lancement de l'app). Voir STRADDLE_GRACE_MINUTES pour la règle
// de bascule à minuit.
export function resolveSessionDay(matches, previousDayKey) {
  const today = dayKeyFor(Date.now() / 1000);
  if (!previousDayKey || previousDayKey === today) return previousDayKey ? previousDayKey : today;

  const latestGameStart = matches.reduce((max, m) => Math.max(max, m.metadata?.game_start ?? 0), 0);
  if (latestGameStart === 0) return today;

  const minutesSinceLatest = (Date.now() / 1000 - latestGameStart) / 60;
  const latestIsFromPreviousDay = dayKeyFor(latestGameStart) === previousDayKey;

  if (latestIsFromPreviousDay && minutesSinceLatest < STRADDLE_GRACE_MINUTES) {
    return previousDayKey;
  }
  return today;
}

// K/D en somme totale (kills cumulés ÷ deaths cumulés), pas une moyenne de
// ratios par match — un match à 20/2 et un à 2/20 donneraient une moyenne
// de ratios trompeuse (≈5) alors que le vrai K/D combiné est 1. Même
// logique pour le % de headshots (somme des trois compteurs, pas moyenne
// des pourcentages par match, pour ne pas sur-pondérer les matchs avec peu
// de kills).
//
// `excludedModeIds` : modes choisis par l'utilisateur (voir
// DailyOverlaySettings.jsx) à exclure EN PLUS du filtre automatique déjà
// appliqué par excludeDeathmatch (deathmatch, parties perso, Escalade,
// Combat à mort par équipe — jamais de vraie victoire/défaite dans ces
// modes, exclus systématiquement, pas configurable).
export function computeDailyStats(matches, name, tag, dayKey, excludedModeIds = []) {
  const excluded = new Set(excludedModeIds);
  const todaysMatches = excludeDeathmatch(matches)
    .filter((m) => !excluded.has(m.metadata?.mode_id))
    .filter((m) => dayKeyFor(m.metadata?.game_start ?? 0) === dayKey);

  let wins = 0;
  let losses = 0;
  let kills = 0;
  let deaths = 0;
  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;

  for (const match of todaysMatches) {
    const me = findMe(match, name, tag);
    if (!me) continue;

    const label = resultLabel(match, me);
    if (label === 'Victoire') wins += 1;
    else if (label === 'Défaite') losses += 1;

    kills += me.stats?.kills ?? 0;
    deaths += me.stats?.deaths ?? 0;
    headshots += me.stats?.headshots ?? 0;
    bodyshots += me.stats?.bodyshots ?? 0;
    legshots += me.stats?.legshots ?? 0;
  }

  const totalShots = headshots + bodyshots + legshots;

  return {
    dayKey,
    matchesPlayed: todaysMatches.length,
    wins,
    losses,
    kd: deaths > 0 ? kills / deaths : kills > 0 ? kills : 0,
    hsPercent: totalShots > 0 ? (headshots / totalShots) * 100 : null,
  };
}
