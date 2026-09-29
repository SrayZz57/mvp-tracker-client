// Modèles de session : un plan réutilisable (échauffement compris) que le joueur
// choisit au lancement à la place du plan automatique. Logique pure, testée dans
// sessionTemplates.test.mjs ; les modes valides de l'Aim Trainer sont passés en
// paramètre pour que ce module reste indépendant de l'interface.

// Étapes d'échauffement à faire DANS Valorant. `tracked` : c'est un mode de jeu
// dont les parties se retrouvent dans l'historique (suivies automatiquement, et
// exclues du décompte des parties de la session) ; sinon (champ de tir) c'est une
// étape à cocher, sans partie à retrouver. `amount` = nombre de parties, ou
// minutes pour une étape non suivie. `modeId` = mode_id renvoyé par HenrikDev.
export const VALORANT_WARMUP_OPTIONS = [
  { id: 'deathmatch', tracked: true, modeId: 'deathmatch', amountRange: [1, 5] },
  { id: 'hurm', tracked: true, modeId: 'hurm', amountRange: [1, 5] },
  { id: 'ggteam', tracked: true, modeId: 'ggteam', amountRange: [1, 5] },
  { id: 'spikerush', tracked: true, modeId: 'spikerush', amountRange: [1, 5] },
  { id: 'range', tracked: false, modeId: null, amountRange: [1, 60] },
];

export const TEMPLATE_LIMITS = {
  name: 40,
  warmupValorant: 5,
  warmupMinutes: [0, 60],
  matchCount: [1, 10],
  hsTarget: [10, 60],
  pauseLosses: [2, 5],
  warmupModes: 8,
};

// Modèles fournis, non modifiables (le nom vient des traductions : nameKey).
export const BUILT_IN_TEMPLATES = [
  {
    id: 'builtin:ranked',
    builtin: true,
    nameKey: 'session.templates.ranked',
    descKey: 'session.templates.rankedDesc',
    warmupMinutes: 15,
    warmupModes: ['flick', 'tracking', 'micro'],
    warmupValorant: [{ mode: 'deathmatch', amount: 1 }],
    matchCount: 4,
    hsTarget: 25,
    pauseLosses: 2,
    targetMap: null,
  },
  {
    id: 'builtin:chill',
    builtin: true,
    nameKey: 'session.templates.chill',
    descKey: 'session.templates.chillDesc',
    warmupMinutes: 5,
    warmupModes: [],
    warmupValorant: [],
    matchCount: 2,
    hsTarget: 20,
    pauseLosses: 3,
    targetMap: null,
  },
  {
    id: 'builtin:aim',
    builtin: true,
    nameKey: 'session.templates.aim',
    descKey: 'session.templates.aimDesc',
    warmupMinutes: 20,
    warmupModes: ['flick', 'gridshot', 'tracking', 'micro', 'reflex'],
    warmupValorant: [],
    matchCount: 3,
    hsTarget: 30,
    pauseLosses: 3,
    targetMap: null,
  },
];

const clampInt = (value, [min, max], fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Étapes Valorant valides et bornées, une seule par mode.
function sanitizeValorantSteps(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const steps = [];
  raw.forEach((step) => {
    const option = VALORANT_WARMUP_OPTIONS.find((o) => o.id === step?.mode);
    if (!option || seen.has(option.id)) return;
    seen.add(option.id);
    steps.push({ mode: option.id, amount: clampInt(step.amount, option.amountRange, option.amountRange[0]) });
  });
  return steps.slice(0, TEMPLATE_LIMITS.warmupValorant);
}

// Nettoie un modèle saisi ou relu du disque : valeurs bornées, exercices
// d'échauffement limités aux modes valides (sans doublon consécutif inutile),
// nom obligatoire. Renvoie null si le nom est vide.
export function sanitizeTemplate(raw, validModes) {
  const name = String(raw?.name ?? '').trim().slice(0, TEMPLATE_LIMITS.name);
  if (!name) return null;
  const modes = Array.isArray(raw?.warmupModes) ? raw.warmupModes.filter((id) => validModes.has(id)) : [];
  return {
    id: String(raw.id ?? ''),
    name,
    warmupMinutes: clampInt(raw.warmupMinutes, TEMPLATE_LIMITS.warmupMinutes, 10),
    warmupModes: modes.slice(0, TEMPLATE_LIMITS.warmupModes),
    warmupValorant: sanitizeValorantSteps(raw?.warmupValorant),
    matchCount: clampInt(raw.matchCount, TEMPLATE_LIMITS.matchCount, 3),
    hsTarget: clampInt(raw.hsTarget, TEMPLATE_LIMITS.hsTarget, 25),
    pauseLosses: clampInt(raw.pauseLosses, TEMPLATE_LIMITS.pauseLosses, 3),
    targetMap: raw.targetMap ? String(raw.targetMap).slice(0, 40) : null,
  };
}

// Durée approximative des exercices d'échauffement choisis, en minutes (arrondie
// au dessus) : `durationOf(modeId)` donne la durée d'un mode en secondes.
export function estimateWarmupMinutes(modes, durationOf) {
  const seconds = modes.reduce((sum, id) => sum + (durationOf(id) ?? 60), 0);
  return Math.ceil(seconds / 60);
}

// Applique un modèle sur le plan automatique : on garde l'analyse de forme/tilt
// du plan de base (utile à la checklist) mais l'échauffement, l'objectif, la
// map et le seuil de pause viennent du modèle. `text` porte les phrases
// traduites (warmupReason, objective).
export function applyTemplate(basePlan, template, text) {
  return {
    ...basePlan,
    templateId: template.id,
    templateName: text.templateName,
    warmup: { minutes: template.warmupMinutes, reason: text.warmupReason },
    warmupModes: template.warmupModes,
    warmupValorant: template.warmupValorant ?? [],
    targetMap: template.targetMap ?? basePlan.targetMap,
    matchCount: template.matchCount,
    hsTarget: template.hsTarget,
    pauseLosses: template.pauseLosses,
    objective: text.objective,
  };
}

// --- Stockage local (un jeu de modèles par compte) ---------------------------

const storageKey = (accountKey) => `mvptracker-session-templates:${accountKey}`;

export function loadTemplates(accountKey, validModes) {
  try {
    const list = JSON.parse(localStorage.getItem(storageKey(accountKey)) ?? '[]');
    return list.map((raw) => sanitizeTemplate(raw, validModes)).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveTemplates(accountKey, templates) {
  try {
    localStorage.setItem(storageKey(accountKey), JSON.stringify(templates));
  } catch {
    // stockage indisponible : les modèles valent pour cette session seulement.
  }
}
