// Mode économique : coupe les animations décoratives en boucle et les flous
// d'arrière-plan (voir body.perf-lite dans index.css), et allège le rendu de
// l'Aim Trainer. Pensé pour les PC modestes.
//
// Réglage explicite ('on' / 'off') s'il existe ; sinon activé automatiquement
// sur un PC peu puissant (4 cœurs ou moins, ou 4 Go de RAM ou moins).
const STORAGE_KEY = 'mvptracker-perf-mode';

export function isModestHardware() {
  const cores = navigator.hardwareConcurrency ?? 8;
  // deviceMemory est plafonné à 8 par Chromium et peut être absent.
  const memoryGb = navigator.deviceMemory ?? 8;
  return cores <= 4 || memoryGb <= 4;
}

export function isPerfLiteEnabled() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
  } catch {
    // stockage indisponible : retombe sur la détection automatique
  }
  return isModestHardware();
}

export function applyPerfLite() {
  document.body.classList.toggle('perf-lite', isPerfLiteEnabled());
}

export function setPerfLite(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // pas grave : l'effet est appliqué pour cette session
  }
  applyPerfLite();
}
