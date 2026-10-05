// Signal « des données personnalisées de l'Aim Trainer viennent de changer ».
// Émis par les fonctions qui enregistrent arènes, presets et playlists ; écouté
// par aimSync.js, qui envoie les changements au compte un peu plus tard.
// Fichier volontairement sans import : arenaStore.js (testé hors navigateur) l'utilise.
export const AIM_DATA_CHANGED = 'mvp-aim-data-changed';

export function notifyAimDataChanged() {
  try {
    globalThis.dispatchEvent?.(new Event(AIM_DATA_CHANGED));
  } catch {
    // Pas de fenêtre (tests) : rien à signaler.
  }
}
