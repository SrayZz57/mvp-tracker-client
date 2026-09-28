// Profils manette : réglages persistés dans le même objet `config` que le
// reste de l'Aim Trainer (voir DEFAULT_CONFIG dans aimTrainerModes.js et
// loadConfig()/set() dans AimTrainerHub.jsx) — pas de deuxième système de
// stockage. Donnée pure, aucune dépendance three.js/React/Gamepad API : le
// module s'importe partout (moteur, UI, tests) sans rien tirer avec lui.
import { AIM_CURVE_IDS, DEFAULT_AIM_CURVE } from './aimCurves.js';

// Modes de visée génériques — BASE et SNIPER sont réellement utilisés
// aujourd'hui (voir AimTrainerGame.jsx : SNIPER quand la lunette est
// armée) ; FOCUS et ADS n'ont pas encore de mécanique correspondante dans
// l'Aim Trainer, l'infrastructure existe sans forcer leur usage.
export const AIM_MODE = Object.freeze({
  BASE: 'BASE',
  FOCUS: 'FOCUS',
  ADS: 'ADS',
  SNIPER: 'SNIPER',
});
export const AIM_MODE_IDS = Object.values(AIM_MODE);

// Facteur de calibration interne : convertit une magnitude de stick courbée
// (dans [0, 1]) en degrés par seconde à sensibilité 1. AUCUN rapport avec une
// valeur interne connue de Riot — un point de départ réglable (voir
// ControllerCalibration.jsx) pour rapprocher le ressenti du jeu, jamais
// présenté comme une reproduction certifiée. Modifiable sans toucher au
// profil utilisateur (voir sanitizeControllerConfig : `rotationScale` est
// stocké séparément du profil VALORANT Console).
export const ROTATION_SCALE_DEFAULT = 45;
export const ROTATION_SCALE_LIMITS = { min: 5, max: 300 };

const SENS_LIMITS = { min: 0.1, max: 20 };
const DEADZONE_LIMITS = { min: 0, max: 1 };
const DAMPEN_MULTIPLIER_LIMITS = { min: 0.1, max: 1 };
const VIBRATION_INTENSITY_LIMITS = { min: 0, max: 1 };

const clamp = (v, { min, max }, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

function modeSettings(sensX, sensY, curve) {
  return { sensX, sensY, curve };
}

// Valeurs de départ à 8.0/0.10/1.00 — de simples points de départ demandés,
// entièrement modifiables dans les réglages (voir le cahier des charges :
// "doivent rester entièrement configurables").
export const DEFAULT_VALORANT_CONSOLE_PROFILE = {
  id: 'valorant-console',
  name: 'VALORANT Console',
  modes: {
    [AIM_MODE.BASE]: modeSettings(8, 8, 'standard'),
    [AIM_MODE.FOCUS]: modeSettings(8, 8, 'standard'),
    [AIM_MODE.ADS]: modeSettings(8, 8, 'standard'),
    [AIM_MODE.SNIPER]: modeSettings(8, 8, 'standard'),
  },
  deadzone: { inner: 0.1, outer: 1 },
  invertY: false,
  dampenShooting: { enabled: false, multiplier: 0.8 },
};

// Boutons "remappables" — R2/L2 servent de tir/visée par défaut (comme sur
// VALORANT Console), mais rien n'empêche d'en choisir d'autres (voir
// GamepadRemap.jsx). Mêmes noms que STANDARD_BUTTON_NAMES dans
// GamepadInput.js (pas ré-importés ici pour ne pas coupler cette donnée pure
// à ce module, ils ne changent jamais l'un sans l'autre en pratique).
export const BINDABLE_BUTTONS = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3'];

export const DEFAULT_CONTROLLER_BINDINGS = {
  fire: 'R2',
  ads: 'L2',
  pause: 'Start',
};

export const DEFAULT_CONTROLLER_CONFIG = {
  // N'affecte jamais la souris/clavier : coupe uniquement la lecture
  // manette (utile pour un joueur qui branche une manette sans vouloir
  // qu'elle interfère).
  enabled: true,
  // null = sélection automatique (première manette connectée) — voir
  // GamepadInput.js.
  activeGamepadId: null,
  profile: DEFAULT_VALORANT_CONSOLE_PROFILE,
  rotationScale: ROTATION_SCALE_DEFAULT,
  vibration: { enabled: true, intensity: 1 },
  bindings: DEFAULT_CONTROLLER_BINDINGS,
  // Debugger d'input (voir InputDebugOverlay.jsx) — coupé par défaut, pas un
  // HUD permanent.
  debugOverlay: false,
};

function sanitizeModeSettings(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback;
  return {
    sensX: clamp(raw.sensX, SENS_LIMITS, fallback.sensX),
    sensY: clamp(raw.sensY, SENS_LIMITS, fallback.sensY),
    curve: AIM_CURVE_IDS.includes(raw.curve) ? raw.curve : DEFAULT_AIM_CURVE,
  };
}

// Relit un profil (venant du localStorage) en corrigeant toute valeur hors
// bornes ou de type invalide plutôt que de planter — même logique que
// arenaEditor/arenaStore.js pour les arènes perso.
export function sanitizeControllerProfile(raw) {
  const fallback = DEFAULT_VALORANT_CONSOLE_PROFILE;
  if (!raw || typeof raw !== 'object') return fallback;
  const modes = {};
  for (const id of AIM_MODE_IDS) modes[id] = sanitizeModeSettings(raw.modes?.[id], fallback.modes[id]);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallback.name,
    modes,
    deadzone: {
      inner: clamp(raw.deadzone?.inner, DEADZONE_LIMITS, fallback.deadzone.inner),
      outer: clamp(raw.deadzone?.outer, DEADZONE_LIMITS, fallback.deadzone.outer),
    },
    invertY: raw.invertY === true,
    dampenShooting: {
      enabled: raw.dampenShooting?.enabled === true,
      multiplier: clamp(raw.dampenShooting?.multiplier, DAMPEN_MULTIPLIER_LIMITS, fallback.dampenShooting.multiplier),
    },
  };
}

function sanitizeBindings(raw) {
  const out = { ...DEFAULT_CONTROLLER_BINDINGS };
  if (!raw || typeof raw !== 'object') return out;
  for (const action of Object.keys(DEFAULT_CONTROLLER_BINDINGS)) {
    if (BINDABLE_BUTTONS.includes(raw[action])) out[action] = raw[action];
  }
  return out;
}

// Code d'export/import d'un profil manette — même principe que les presets
// du mode Personnalisé (CustomModeConfig.jsx) et les arènes perso
// (arenaEditor/arenaStore.js) : juste ce qui compte (profil + facteur de
// calibration + réassignation des boutons), pas l'id de manette active ni la
// vibration (propres à l'appareil), encodés en base64 avec un préfixe
// reconnaissable. Pas de backend : le code se partage à la main (Discord...).
const CONTROLLER_CODE_PREFIX = 'MVPCTRL1:';

export function encodeControllerProfileCode(controllerConfig) {
  const payload = {
    profile: controllerConfig.profile,
    rotationScale: controllerConfig.rotationScale,
    bindings: controllerConfig.bindings,
  };
  return CONTROLLER_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

// Renvoie un objet PARTIEL (profile/rotationScale/bindings) à fusionner dans
// la config manette existante — jamais l'objet controller complet, pour ne
// jamais écraser activeGamepadId/vibration/enabled de la personne qui importe.
export function decodeControllerProfileCode(code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CONTROLLER_CODE_PREFIX)) return null;
  try {
    const json = decodeURIComponent(escape(atob(trimmed.slice(CONTROLLER_CODE_PREFIX.length))));
    const data = JSON.parse(json);
    return {
      profile: sanitizeControllerProfile(data.profile),
      rotationScale: clamp(data.rotationScale, ROTATION_SCALE_LIMITS, DEFAULT_CONTROLLER_CONFIG.rotationScale),
      bindings: sanitizeBindings(data.bindings),
    };
  } catch {
    return null;
  }
}

export function sanitizeControllerConfig(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONTROLLER_CONFIG };
  return {
    enabled: raw.enabled !== false,
    activeGamepadId: typeof raw.activeGamepadId === 'string' ? raw.activeGamepadId : null,
    profile: sanitizeControllerProfile(raw.profile),
    rotationScale: clamp(raw.rotationScale, ROTATION_SCALE_LIMITS, DEFAULT_CONTROLLER_CONFIG.rotationScale),
    vibration: {
      enabled: raw.vibration?.enabled !== false,
      intensity: clamp(raw.vibration?.intensity, VIBRATION_INTENSITY_LIMITS, DEFAULT_CONTROLLER_CONFIG.vibration.intensity),
    },
    bindings: sanitizeBindings(raw.bindings),
    debugOverlay: raw.debugOverlay === true,
  };
}
