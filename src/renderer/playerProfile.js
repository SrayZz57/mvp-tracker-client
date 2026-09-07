import {
  excludeDeathmatch, groupStats, clutchStats, firstBloodStats, tiltFrequency,
  overallHsPercent, deathTimingStats,
} from './valorantStats.js';

const MIN_MATCHES = 5;

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
function describeProfile({ aggression, stability, versatility, clutch }) {
  const a = bucket(aggression);
  const s = bucket(stability);
  const v = bucket(versatility);
  const c = bucket(clutch);

  if (a === 'high' && s === 'low') return 'duelistImpulsive';
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

// Calcule les scores /100 à partir des données déjà collectées par les
// autres modules (aucun nouvel appel API). Les 4 premiers pilotent aussi
// l'archétype affiché (voir describeProfile) :
// - Agressivité : ratio premier sang / (premier sang + première mort) par round
// - Stabilité mentale : inverse de la fréquence de tilt (séries de 3 défaites+)
// - Polyvalence : nombre d'agents distincts joués, plafonné à 8
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
  const tilt = tiltFrequency(matches, name, tag);
  const clutch = clutchStats(matches, name, tag);
  const agentRows = groupStats(ranked, name, tag, (match, me) => me.character);
  const hsPercent = overallHsPercent(matches, name, tag);
  const deathTiming = deathTimingStats(matches, name, tag);
  const earlyDeathPercent = deathTiming.buckets.find((b) => b.id === 'early')?.percent ?? null;

  const scores = {
    aggression: fb.ratio,
    stability: tilt.percent === null ? null : 100 - tilt.percent,
    versatility: agentRows.length > 0 ? Math.min(100, (agentRows.length / 8) * 100) : null,
    clutch: clutch.attempts >= 3 ? clutch.winrate : null,
    aim: hsPercent === null ? null : Math.min(100, (hsPercent / 40) * 100),
    positioning: deathTiming.total >= 10 ? Math.max(0, 100 - earlyDeathPercent * 2) : null,
  };

  const archetype = describeProfile(scores);

  return {
    ready: true,
    matchesAnalyzed: ranked.length,
    scores,
    distinctAgents: agentRows.length,
    firstBloods: fb.firstBloods,
    firstDeaths: fb.firstDeaths,
    clutchAttempts: clutch.attempts,
    archetype,
  };
}
