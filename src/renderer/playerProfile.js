import {
  excludeDeathmatch, groupStats, clutchStats, firstBloodStats, findMe, resultLabel,
  overallHsPercent, deathTimingStats,
} from './valorantStats.js';

const MIN_MATCHES = 5;

// Agressivité : part des rounds où le joueur est dans le tout premier duel
// (premier sang OU première mort). Sur 10 joueurs, un joueur "moyen" y est dans
// ~20 % des rounds ; 40 % (un round d'ouverture sur 2,5) vaut le score maximal.
const INITIATIVE_FULL_SCORE = 0.4;
// En dessous de ce taux de premiers duels gagnés, l'agressivité est jugée
// "impulsive" plutôt que payante (voir describeProfile).
const OPENING_WIN_FLOOR = 45;

// Résilience : performance (K/D) dans les parties jouées dans la foulée d'une
// défaite, comparée à la moyenne. Une partie compte comme "dans la foulée" si
// elle démarre moins de 100 min après le début de la précédente (même session).
const SESSION_GAP_SECONDS = 6000;
const MIN_AFTER_LOSS_GAMES = 8;

// Polyvalence : agents réellement maîtrisés (assez de parties ET des résultats
// corrects), pas juste essayés. Le score monte de moins en moins vite et
// n'atteint jamais 100 : on peut toujours élargir son pool (4 agents ≈ 70,
// 6 ≈ 82, 10 ≈ 92).
const MASTERED_MIN_GAMES = 5;
const MASTERED_MIN_WINRATE = 45;
const MASTERED_MIN_KD_RATIO = 0.9;
const MASTERED_SCORE_CEILING = 95;
const MASTERED_SCORE_SPREAD = 3;

function bucket(score) {
  if (score === null) return null;
  if (score >= 66) return 'high';
  if (score >= 34) return 'mid';
  return 'low';
}

// Exercice existant conseillé pour progresser sur chaque dimension de l'ADN.
// aggression/stability/clutch → modes de l'Aim Trainer qui travaillent le
// réflexe visé ; versatility n'est pas une question de visée (c'est le
// nombre d'agents joués), donc elle renvoie vers l'outil de Composition
// plutôt qu'un mode.
export const WEAKNESS_RECOMMENDATIONS = {
  aggression: { tab: 'aim-trainer', mode: 'peek', key: 'aggression' },
  stability: { tab: 'aim-trainer', mode: 'precision', key: 'stability' },
  versatility: { tab: 'composition', key: 'versatility' },
  clutch: { tab: 'aim-trainer', mode: 'snapHold', key: 'clutch' },
  aim: { tab: 'aim-trainer', mode: 'micro', key: 'aim' },
  positioning: { tab: 'aim-trainer', mode: 'reflex', key: 'positioning' },
};

const MAX_WEAKNESSES = 4;
// Amplitude du mélange journalier, en points de score — assez pour
// permuter l'ordre entre dimensions proches ou faire remonter un 5e/6e axe
// pas loin derrière, jamais assez pour faire passer un point fort (score
// élevé) pour un point faible.
const JITTER_RANGE = 20;

// PRNG déterministe (mulberry32) — pas besoin de vraie aléatoire, juste
// d'une valeur stable pour une graine donnée (même jour + même dimension
// → même résultat, mais qui change le lendemain).
function seededRandom(seed) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Graine du jour (change chaque jour à minuit local, stable le reste de la
// journée) combinée au nom de la dimension, pour que chaque axe reçoive un
// décalage différent plutôt que tous le même.
function dailyJitter(dimension) {
  const now = new Date();
  const dayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  let hash = dayKey;
  for (let i = 0; i < dimension.length; i += 1) hash = (hash * 31 + dimension.charCodeAt(i)) | 0;
  return (seededRandom(hash >>> 0) - 0.5) * JITTER_RANGE;
}

// Dimensions à travailler en priorité : classées par tendance relative (les
// scores les plus bas d'abord, légèrement mélangés chaque jour via
// dailyJitter — demandé pour que l'onglet ne fige pas indéfiniment sur
// exactement les mêmes axes si les scores ne bougent pas d'un jour à
// l'autre), pas juste celles tombées sous le seuil 'low' — sinon un joueur
// avec un seul vrai point faible et le reste en milieu de tableau ne
// voyait jamais ses axes suivants les plus fragiles.
export function getWeaknesses(scores) {
  return Object.entries(scores)
    .filter(([, value]) => value !== null)
    .map(([dimension, value]) => [dimension, value, value + dailyJitter(dimension)])
    .sort((a, b) => a[2] - b[2])
    .slice(0, MAX_WEAKNESSES)
    .map(([dimension, value]) => ({ dimension, value, ...WEAKNESS_RECOMMENDATIONS[dimension] }));
}

// Combinaisons de buckets (agressivité/stabilité/polyvalence/clutch) → un
// simple archétype (clé i18n) — le vrai titre/texte est résolu à l'affichage
// dans PlayerProfileCard.jsx via t('profile.archetypes.<key>.*'), pour rester
// traduisible. Règles simples et lisibles, pas un modèle prédictif — juste
// une façon de résumer 4 scores dérivés de vraies stats en une phrase.
function describeProfile({ aggression, stability, versatility, clutch }, openingWinrate) {
  const a = bucket(aggression);
  const s = bucket(stability);
  const v = bucket(versatility);
  const c = bucket(clutch);

  // Beaucoup de premiers duels qui ne payent pas : soit ils sont perdus plus
  // souvent que gagnés, soit les perfs s'effondrent ensuite.
  if (a === 'high' && (s === 'low' || (openingWinrate !== null && openingWinrate < OPENING_WIN_FLOOR))) {
    return 'duelistImpulsive';
  }
  if (a === 'high' && c === 'high') return 'clutchFragger';
  if (a === 'high' && v === 'high') return 'aggressivePolyvalent';
  if (a === 'high') return 'entryFragger';

  // "v=high && s=high" à lui seul regroupait une trop grande part des joueurs
  // (beaucoup de comptes actifs cumulent naturellement pas mal d'agents
  // différents et peu de séries de défaites) — sous-découpé via clutch et
  // agressivité pour répartir ce cluster sur plusieurs profils au lieu d'un.
  if (v === 'high' && s === 'high' && c === 'high') return 'clutchAllrounder';
  if (v === 'high' && s === 'high' && a === 'low') return 'quietFlexible';
  if (v === 'high' && s === 'high') return 'versatileTactician';

  if (s === 'low' && c === 'high') return 'unstableCloser';
  if (s === 'low') return 'inconsistentPlayer';

  if (c === 'high' && v === 'low') return 'clutchSpecialist';
  if (c === 'high') return 'closer';

  if (v === 'low' && a === 'low') return 'quietSpecialist';
  if (v === 'low') return 'specialist';

  if (a === 'low' && s === 'high') return 'steadyPillar';

  return 'balancedPlayer';
}

// Performance après défaite : K/D des parties enchaînées derrière une défaite
// (même session) rapporté au K/D global. 70 = aucune baisse ; 100 = tu joues
// mieux après une défaite ; 0 = chute nette. Null sous MIN_AFTER_LOSS_GAMES.
function resilienceStats(ranked, name, tag) {
  const chronological = [...ranked].reverse();
  let totalKills = 0;
  let totalDeaths = 0;
  let afterKills = 0;
  let afterDeaths = 0;
  let afterGames = 0;
  let previous = null;

  chronological.forEach((match) => {
    const me = findMe(match, name, tag);
    if (!me) return;
    const kills = me.stats?.kills ?? 0;
    const deaths = me.stats?.deaths ?? 0;
    totalKills += kills;
    totalDeaths += deaths;

    const start = match.metadata?.game_start ?? null;
    if (previous?.lost && start !== null && previous.start !== null && start - previous.start <= SESSION_GAP_SECONDS) {
      afterKills += kills;
      afterDeaths += deaths;
      afterGames += 1;
    }
    previous = { lost: resultLabel(match, me) === 'Défaite', start };
  });

  if (afterGames < MIN_AFTER_LOSS_GAMES || totalDeaths === 0 || afterDeaths === 0) {
    return { score: null, afterGames };
  }
  const ratio = afterKills / afterDeaths / (totalKills / totalDeaths);
  return { score: Math.max(0, Math.min(100, 70 + (ratio - 1) * 150)), afterGames };
}

// Agents maîtrisés : assez de parties et soit un winrate correct, soit un K/D
// proche de la moyenne du joueur (pour ne pas pénaliser un agent difficile).
function masteredAgents(agentRows) {
  const kills = agentRows.reduce((sum, row) => sum + row.avgKills * row.games, 0);
  const deaths = agentRows.reduce((sum, row) => sum + row.avgDeaths * row.games, 0);
  const overallKd = deaths > 0 ? kills / deaths : null;
  return agentRows.filter((row) => {
    if (row.games < MASTERED_MIN_GAMES) return false;
    const kd = row.avgDeaths > 0 ? row.avgKills / row.avgDeaths : null;
    const okWinrate = row.winrate !== null && row.winrate >= MASTERED_MIN_WINRATE;
    const okKd = kd !== null && overallKd !== null && kd >= overallKd * MASTERED_MIN_KD_RATIO;
    return okWinrate || okKd;
  }).length;
}

// Calcule les scores /100 à partir des données déjà collectées par les
// autres modules (aucun nouvel appel API). Les 4 premiers pilotent aussi
// l'archétype affiché (voir describeProfile) :
// - Agressivité (`aggression`) : fréquence des premiers duels de round (voir INITIATIVE_FULL_SCORE)
//   — la réussite de ces duels (openingWinrate) n'entre pas dans le score mais nuance l'archétype
// - Résilience (`stability`) : K/D après une défaite vs K/D global (voir resilienceStats)
// - Polyvalence (`versatility`) : agents maîtrisés, pas seulement essayés (voir masteredAgents)
// - Clutch factor : winrate en situation de clutch (clutchStats), si ≥3 tentatives
// Les 2 suivants ne servent qu'à repérer plus de points à travailler
// (getWeaknesses) — pas assez fiables/significatifs pour peser sur
// l'archétype principal :
// - Précision : % de headshots, ramené sur 100 (40% HS = score plafonné à 100)
// - Positionnement : inverse du % de morts "entrée de round" (0-20s), si ≥10 morts
export function computePlayerProfile(matches, name, tag) {
  const ranked = excludeDeathmatch(matches);
  if (ranked.length < MIN_MATCHES) {
    return { ready: false, matchesAnalyzed: ranked.length, minMatches: MIN_MATCHES };
  }

  const fb = firstBloodStats(matches, name, tag);
  const resilience = resilienceStats(ranked, name, tag);
  const clutch = clutchStats(matches, name, tag);
  const agentRows = groupStats(ranked, name, tag, (match, me) => me.character);
  const masteredCount = masteredAgents(agentRows);
  const initiativeRounds = fb.firstBloods + fb.firstDeaths;
  const initiativeRate = fb.roundsWithKills > 0 ? initiativeRounds / fb.roundsWithKills : null;
  const hsPercent = overallHsPercent(matches, name, tag);
  const deathTiming = deathTimingStats(matches, name, tag);
  const earlyDeathPercent = deathTiming.buckets.find((b) => b.id === 'early')?.percent ?? null;

  const scores = {
    aggression: initiativeRate === null ? null : Math.min(100, (initiativeRate / INITIATIVE_FULL_SCORE) * 100),
    stability: resilience.score,
    versatility: agentRows.length > 0 ? MASTERED_SCORE_CEILING * (1 - Math.exp(-masteredCount / MASTERED_SCORE_SPREAD)) : null,
    clutch: clutch.attempts >= 3 ? clutch.winrate : null,
    aim: hsPercent === null ? null : Math.min(100, (hsPercent / 40) * 100),
    positioning: deathTiming.total >= 10 ? Math.max(0, 100 - earlyDeathPercent * 2) : null,
  };

  const archetype = describeProfile(scores, fb.ratio);

  return {
    ready: true,
    matchesAnalyzed: ranked.length,
    scores,
    distinctAgents: agentRows.length,
    firstBloods: fb.firstBloods,
    firstDeaths: fb.firstDeaths,
    clutchAttempts: clutch.attempts,
    initiativeRounds,
    roundsAnalyzed: fb.roundsWithKills,
    openingWinrate: fb.ratio,
    afterLossGames: resilience.afterGames,
    masteredAgents: masteredCount,
    archetype,
  };
}
