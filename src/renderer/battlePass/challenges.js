import { CHALLENGE_XP, ACCURACY_MIN_HITS, SESSION_RULES } from './xpRules.js';
import { POPULAR_MODES, scoreTarget } from './modeCaps.js';
import { xpToReach } from './levels.js';

// Défis quotidiens, hebdomadaires et de saison.
//
// Les défis sont TIRÉS ICI, de façon déterministe (même saison + même date =
// mêmes défis), puis écrits dans la base par le script de génération SQL. Le
// serveur ne refait donc jamais le tirage : il reçoit une liste de défis
// datés et se contente d'évaluer si un joueur les a remplis. Une seule
// implémentation du tirage, pas deux qui pourraient diverger.
//
// Un défi est décrit par des PARAMÈTRES (métrique, mode, cible), jamais par du
// texte : l'interface compose le libellé avec l'i18n, FR et EN, sans qu'on
// stocke de phrase.
//
// Métriques (évaluées côté serveur, sur les scores plausibles de la période) :
//   sessions        nombre de sessions
//   distinctModes   nombre de modes différents (hors « custom »)
//   distinctDays    nombre de jours (UTC) avec au moins une session
//   dailyChallenge  a joué le défi du jour de l'Aim Trainer
//   bestScore       meilleur score sur `mode`
//   accuracy        meilleure précision (%) sur une session d'au moins minHits touches
export const METRICS = ['sessions', 'distinctModes', 'distinctDays', 'dailyChallenge', 'bestScore', 'accuracy'];

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;

// --- Modèles ------------------------------------------------------------------
// `frac` = fraction du 99e centile du mode (voir modeCaps.scoreTarget).

const DAILY_POOL = {
  easy: [
    { metric: 'sessions', target: 3 },
    { metric: 'distinctModes', target: 2 },
    { metric: 'dailyChallenge', target: 1 },
  ],
  medium: [
    { metric: 'sessions', target: 6 },
    { metric: 'distinctModes', target: 3 },
    { metric: 'bestScore', frac: 0.5 },
    { metric: 'accuracy', target: 65 },
  ],
  hard: [
    { metric: 'bestScore', frac: 0.7 },
    { metric: 'accuracy', target: 80 },
    { metric: 'sessions', target: 10 },
  ],
};

const WEEKLY_POOL = {
  easy: [
    { metric: 'sessions', target: 25 },
    { metric: 'distinctDays', target: 4 },
    { metric: 'distinctModes', target: 6 },
  ],
  medium: [
    { metric: 'sessions', target: 50 },
    { metric: 'distinctModes', target: 10 },
    { metric: 'bestScore', frac: 0.65 },
    { metric: 'distinctDays', target: 5 },
  ],
  hard: [
    { metric: 'bestScore', frac: 0.8 },
    { metric: 'accuracy', target: 85 },
    { metric: 'sessions', target: 80 },
  ],
};

// Défis de saison : fixes, à faire une fois. Le mode des `bestScore` est
// nommé (pas tiré) pour que le joueur puisse s'y préparer toute la saison.
const SEASON_CHALLENGES = [
  { slug: 'sessions-100', metric: 'sessions', target: 100, xp: 1000 },
  { slug: 'sessions-300', metric: 'sessions', target: 300, xp: 2000 },
  { slug: 'modes-15', metric: 'distinctModes', target: 15, xp: 1500 },
  { slug: 'days-20', metric: 'distinctDays', target: 20, xp: 1500 },
  { slug: 'days-40', metric: 'distinctDays', target: 40, xp: 2500 },
  { slug: 'best-gridshot', metric: 'bestScore', mode: 'gridshot', frac: 0.9, xp: 1500 },
  { slug: 'best-flick', metric: 'bestScore', mode: 'flick', frac: 0.9, xp: 1500 },
  { slug: 'best-micro', metric: 'bestScore', mode: 'micro', frac: 0.9, xp: 1500 },
];

// --- Tirage déterministe ------------------------------------------------------

// FNV-1a 32 bits : une chaîne -> un entier stable, identique partout.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 : générateur pseudo-aléatoire à graine.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (list, random) => list[Math.floor(random() * list.length)];

function resolve(template, random, minHitsKey) {
  const out = { metric: template.metric, mode: null, target: template.target ?? null, minHits: null };
  if (template.metric === 'bestScore') {
    out.mode = template.mode ?? pick(POPULAR_MODES, random);
    out.target = scoreTarget(out.mode, template.frac);
  }
  if (template.metric === 'accuracy') out.minHits = ACCURACY_MIN_HITS[minHitsKey];
  return out;
}

// Trois défis (facile / moyen / difficile) de métriques toutes différentes :
// « 3 sessions » puis « 10 sessions » le même jour serait un doublon.
function drawThree(pool, xpByTier, seedText, minHitsKey) {
  const random = rng(hash(seedText));
  const used = new Set();
  return ['easy', 'medium', 'hard'].map((tier) => {
    const options = pool[tier].filter((t) => !used.has(t.metric));
    const template = pick(options, random);
    used.add(template.metric);
    return { tier, xp: xpByTier[tier], ...resolve(template, random, minHitsKey) };
  });
}

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

export function dailyChallengesFor(seasonId, dayStartMs) {
  const key = isoDate(dayStartMs);
  return drawThree(DAILY_POOL, CHALLENGE_XP.daily, `${seasonId}|d|${key}`, 'daily').map((c) => ({
    ...c,
    id: `d:${key}:${c.tier}`,
    period: 'daily',
    startsAt: new Date(dayStartMs).toISOString(),
    endsAt: new Date(dayStartMs + DAY_MS).toISOString(),
  }));
}

export function weeklyChallengesFor(seasonId, weekStartMs) {
  const key = isoDate(weekStartMs);
  return drawThree(WEEKLY_POOL, CHALLENGE_XP.weekly, `${seasonId}|w|${key}`, 'weekly').map((c) => ({
    ...c,
    id: `w:${key}:${c.tier}`,
    period: 'weekly',
    startsAt: new Date(weekStartMs).toISOString(),
    endsAt: new Date(weekStartMs + WEEK_MS).toISOString(),
  }));
}

// Tous les défis d'une saison : un jeu par jour, un par semaine, et ceux de
// saison. La saison commence un lundi (vérifié par un test) : les semaines
// sont donc des semaines ISO entières.
export function expandSeasonChallenges(season) {
  const start = Date.parse(season.startsAt);
  const end = Date.parse(season.endsAt);
  const rows = [];

  for (let t = start; t < end; t += DAY_MS) rows.push(...dailyChallengesFor(season.id, t));
  for (let t = start; t < end; t += WEEK_MS) rows.push(...weeklyChallengesFor(season.id, t));
  for (const c of SEASON_CHALLENGES) {
    rows.push({
      id: `s:${c.slug}`,
      period: 'season',
      tier: 'season',
      metric: c.metric,
      mode: c.mode ?? null,
      target: c.metric === 'bestScore' ? scoreTarget(c.mode, c.frac) : c.target,
      minHits: null,
      xp: c.xp,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
    });
  }
  return rows;
}

// XP maximal gagnable sur la saison, par source.
export function xpBudget(season) {
  const days = (Date.parse(season.endsAt) - Date.parse(season.startsAt)) / DAY_MS;
  const rows = expandSeasonChallenges(season);
  const sum = (period) => rows.filter((r) => r.period === period).reduce((s, r) => s + r.xp, 0);
  const sessions = SESSION_RULES.dailyCap * days;
  const daily = sum('daily');
  const weekly = sum('weekly');
  const seasonal = sum('season');
  const total = sessions + daily + weekly + seasonal;
  const needed = xpToReach(season, season.maxLevel);
  return { sessions, daily, weekly, season: seasonal, total, needed, ratio: total / needed };
}
