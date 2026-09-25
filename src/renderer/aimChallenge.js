import { GENERIC_MODE_IDS, MODES } from './aimTrainerModes.js';

// Défi du jour : mêmes réglages pour tout le monde, dérivés uniquement de la
// date. Aucun aléa réel, donc aucun besoin de synchroniser quoi que ce soit
// entre les joueurs — deux personnes qui ouvrent l'app le même jour obtiennent
// exactement le même défi, et le classement est comparable.
function hashDate(dateKey) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const DURATIONS = [30, 45, 60];
const SIZE_TWEAKS = [-0.08, 0, 0.06];

export function buildDailyChallenge(dateKey) {
  const hash = hashDate(dateKey);
  // Les modes liés à une arène précise ne sont pas proposés en défi du jour.
  const modeIds = GENERIC_MODE_IDS;
  const modeId = modeIds[hash % modeIds.length];
  const mode = MODES[modeId];

  return {
    dateKey,
    mode: modeId,
    ...mode.preset,
    // Le défi impose sa durée et un léger ajustement de taille de cible, pour
    // que deux jours de suite sur le même mode ne se ressemblent pas.
    duration: DURATIONS[(hash >> 3) % DURATIONS.length],
    targetSize: Math.max(0.15, +(mode.preset.targetSize + SIZE_TWEAKS[(hash >> 6) % SIZE_TWEAKS.length]).toFixed(2)),
  };
}
