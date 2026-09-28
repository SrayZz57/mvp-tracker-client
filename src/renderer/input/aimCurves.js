// Courbes de réponse du stick, séparées du système de sensibilité (voir
// AimEngine.js qui les compose). Chaque courbe prend une magnitude déjà
// passée par la deadzone, normalisée dans [0, 1], et renvoie une magnitude
// dans [0, 1] : f(0) = 0, f(1) = 1, strictement croissante. Le signe/la
// direction du stick sont réappliqués par l'appelant, pas ici.
//
// IMPORTANT : ce ne sont PAS les courbes internes de VALORANT — Riot ne les
// documente pas publiquement. Ce sont des formes plausibles et réglables,
// pensées pour se rapprocher du ressenti (linéaire à concave), à affiner via
// l'écran de calibration (voir ControllerCalibration.jsx) plutôt que
// présentées comme une reproduction exacte.
export const AIM_CURVES = {
  linear: (t) => t,
  standard: (t) => t ** 1.3,
  smooth: (t) => t ** 1.6,
  light: (t) => t ** 1.15,
  medium: (t) => t ** 1.5,
  heavy: (t) => t ** 2,
  extreme: (t) => t ** 2.6,
};

export const AIM_CURVE_IDS = Object.keys(AIM_CURVES);
export const DEFAULT_AIM_CURVE = 'standard';

// value : composante signée dans [-1, 1] (déjà réduite par la deadzone).
export function applyAimCurve(value, curveId) {
  const fn = AIM_CURVES[curveId] ?? AIM_CURVES[DEFAULT_AIM_CURVE];
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.min(1, Math.abs(value));
  return sign * fn(magnitude);
}
