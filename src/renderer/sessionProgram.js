import { excludeDeathmatch, findMe, resultLabel } from './valorantStats.js';
import { VALORANT_WARMUP_OPTIONS } from './sessionTemplates.js';
import { buildPeriodRecap, compareRecaps } from './wrappedStats.js';

// Programme de la session guidée : plan au départ (buildSessionPlan), suivi des
// parties jouées PENDANT la session, conseils, puis bilan comparé à la session
// précédente. Logique pure, testée dans sessionProgram.test.mjs.

const LOSS_STREAK_PAUSE = 3;
const LOSS_STREAK_PAUSE_TILTED = 2;

// Le plan est sauvegardé sous forme plate (sans fonctions ni objets d'analyse) :
// on le relit tel quel plus tard, même après un redémarrage de l'app.
export function serializePlan(plan) {
  return {
    warmupMinutes: plan.warmup.minutes,
    warmupReason: plan.warmup.reason,
    targetMap: plan.targetMap ?? null,
    tilted: Boolean(plan.tilt?.isTilted),
    matchCount: plan.matchCount,
    hsTarget: plan.hsTarget,
    objective: plan.objective,
    // Modèle de session utilisé (null = plan automatique) et ce qu'il impose.
    templateId: plan.templateId ?? null,
    templateName: plan.templateName ?? null,
    warmupModes: plan.warmupModes ?? [],
    warmupValorant: plan.warmupValorant ?? [],
    pauseLosses: plan.pauseLosses ?? null,
    // Moment où le plan a été préparé : l'échauffement peut se faire avant le
    // clic sur « Démarrer », ses parties sont donc cherchées depuis là.
    preparedAt: plan.preparedAt ?? null,
  };
}

// Reconstitue la forme attendue par la checklist (voir SessionGuide.jsx).
export function hydratePlan(saved) {
  return {
    warmup: { minutes: saved.warmupMinutes, reason: saved.warmupReason },
    targetMap: saved.targetMap ?? null,
    tilt: { isTilted: Boolean(saved.tilted) },
    matchCount: saved.matchCount,
    hsTarget: saved.hsTarget,
    objective: saved.objective,
    templateId: saved.templateId ?? null,
    templateName: saved.templateName ?? null,
    warmupModes: saved.warmupModes ?? [],
    warmupValorant: saved.warmupValorant ?? [],
    pauseLosses: saved.pauseLosses ?? null,
    preparedAt: saved.preparedAt ?? null,
  };
}

// Parties standard jouées depuis le début de la session (et avant sa fin, si elle
// est terminée). Une partie compte dès qu'elle a COMMENCÉ après le lancement.
// `warmupModeIds` : modes Valorant prévus en échauffement (voir warmupModeIds) —
// leurs parties ne comptent pas comme parties de la session.
export function matchesSince(matches, startedAtMs, endedAtMs = Infinity, warmupModeIds = []) {
  const skip = new Set(warmupModeIds);
  return excludeDeathmatch(matches ?? []).filter((match) => {
    const startMs = (match.metadata?.game_start ?? 0) * 1000;
    return startMs >= startedAtMs && startMs <= endedAtMs && !skip.has(match.metadata?.mode_id);
  });
}

// mode_id des étapes d'échauffement suivies automatiquement dans ce plan.
export function warmupModeIds(plan) {
  return (plan?.warmupValorant ?? [])
    .map((step) => VALORANT_WARMUP_OPTIONS.find((o) => o.id === step.mode))
    .filter((option) => option?.tracked)
    .map((option) => option.modeId);
}

// Avancement de l'échauffement dans Valorant : pour chaque étape suivie, les
// parties de ce mode jouées depuis `sinceMs` (les Deathmatch ne sont PAS dans les
// parties de la session, ils comptent ici). Les étapes non suivies (champ de tir)
// sont listées sans compteur.
export function warmupProgress(plan, matches, name, tag, sinceMs, untilMs = Infinity) {
  return (plan?.warmupValorant ?? []).map((step) => {
    const option = VALORANT_WARMUP_OPTIONS.find((o) => o.id === step.mode);
    if (!option) return null;
    if (!option.tracked) return { mode: step.mode, tracked: false, target: step.amount, played: 0, done: false };
    const played = (matches ?? []).filter((match) => {
      const startMs = (match.metadata?.game_start ?? 0) * 1000;
      return match.metadata?.mode_id === option.modeId && startMs >= sinceMs && startMs <= untilMs && Boolean(findMe(match, name, tag));
    }).length;
    return { mode: step.mode, tracked: true, target: step.amount, played, done: played >= step.amount };
  }).filter(Boolean);
}

// Défaites d'affilée la plus récente, en partant de la dernière partie jouée.
function trailingLosses(sessionMatches, name, tag) {
  const newestFirst = [...sessionMatches].sort((a, b) => (b.metadata?.game_start ?? 0) - (a.metadata?.game_start ?? 0));
  let streak = 0;
  for (const match of newestFirst) {
    const me = findMe(match, name, tag);
    if (!me || resultLabel(match, me) !== 'Défaite') break;
    streak += 1;
  }
  return streak;
}

// Conseil affiché pendant la session, par ordre de priorité :
// pause (série de défaites) > objectif atteint > dernière partie > en cours.
export function sessionAdvice({ played, target, losingStreak }, plan) {
  // Un modèle impose son propre seuil ; sinon 3 défaites (2 si tilt au départ).
  const limit = plan.pauseLosses ?? (plan.tilted ? LOSS_STREAK_PAUSE_TILTED : LOSS_STREAK_PAUSE);
  if (losingStreak >= limit) return 'pause';
  if (played >= target) return 'done';
  if (played === 0) return 'start';
  if (target > 1 && played === target - 1) return 'last';
  return 'go';
}

export function liveProgress(savedPlan, sessionMatches, name, tag) {
  const recap = buildPeriodRecap(sessionMatches, name, tag);
  const played = recap?.games ?? 0;
  const losingStreak = trailingLosses(sessionMatches, name, tag);
  const progress = {
    played,
    target: savedPlan.matchCount,
    wins: recap?.wins ?? 0,
    losses: recap?.losses ?? 0,
    winrate: recap?.winrate ?? null,
    kd: recap?.kd ?? null,
    hsPercent: recap?.hsPercent ?? null,
    hsTarget: savedPlan.hsTarget,
    losingStreak,
  };
  return { ...progress, advice: sessionAdvice(progress, savedPlan) };
}

// Bilan enregistré à l'arrêt de la session.
export function buildReport(savedPlan, sessionMatches, name, tag, startedAtMs, endedAtMs, warmup = []) {
  const recap = buildPeriodRecap(sessionMatches, name, tag);
  const games = recap?.games ?? 0;
  const hsPercent = recap?.hsPercent ?? null;
  return {
    games,
    wins: recap?.wins ?? 0,
    losses: recap?.losses ?? 0,
    winrate: recap?.winrate ?? null,
    kd: recap?.kd ?? null,
    hsPercent,
    bestKd: recap?.bestKdMatch?.kd ?? null,
    durationMs: Math.max(0, endedAtMs - startedAtMs),
    templateName: savedPlan.templateName ?? null,
    // Échauffement Valorant tel qu'il s'est passé (étapes suivies uniquement).
    warmup: warmup.filter((step) => step.tracked).map(({ mode, target, played }) => ({ mode, target, played })),
    objective: {
      matchCount: savedPlan.matchCount,
      hsTarget: savedPlan.hsTarget,
      gamesDone: games >= savedPlan.matchCount,
      // null : aucune donnée de tir pour trancher.
      hsReached: hsPercent === null ? null : hsPercent >= savedPlan.hsTarget,
    },
  };
}

// Session à laquelle comparer un bilan : la dernière du MÊME modèle si elle existe
// (on compare des séances comparables), sinon la dernière tout court.
// `history` : lignes { plan, result } de la plus récente à la plus ancienne.
export function pickPreviousReport(history, templateId) {
  if (!history || history.length === 0) return null;
  const same = templateId ? history.find((row) => row.plan?.templateId === templateId) : null;
  if (same) return { ...same, sameTemplate: true };
  return { ...history[0], sameTemplate: false };
}

// Écarts avec le bilan de la session précédente (null s'il n'y en a pas).
export function compareReports(current, previous) {
  return compareRecaps(current, previous);
}
