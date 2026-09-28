// Détection de marque à partir de gamepad.id (chaîne fournie par le
// navigateur, ex. "DualSense Wireless Controller (STANDARD GAMEPAD Vendor:
// 054c Product: 0ce6)" ou "Xbox Wireless Controller (STANDARD GAMEPAD
// Vendor: 045e Product: 0b13)") — juste pour choisir les bons glyphes de
// bouton à l'affichage. Le mapping de boutons lui-même (indices 0-16) reste
// le même "standard gamepad" pour tout le monde, voir GamepadInput.js :
// aucun comportement ne dépend de la marque, seulement l'étiquette affichée.
export function detectControllerBrand(id = '') {
  const s = id.toLowerCase();
  if (s.includes('054c') || s.includes('dualsense') || s.includes('dualshock') || s.includes('playstation') || s.includes('sony')) return 'playstation';
  if (s.includes('045e') || s.includes('xbox') || s.includes('microsoft')) return 'xbox';
  return 'generic';
}

// Étiquettes par bouton "standard" (mêmes noms que STANDARD_BUTTON_NAMES
// dans GamepadInput.js), une entrée par marque affichable.
export const BUTTON_LABELS = {
  playstation: {
    A: '✕', B: '○', X: '□', Y: '△',
    L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2',
    Select: 'Créer', Start: 'Options', L3: 'L3', R3: 'R3',
    DpadUp: '↑', DpadDown: '↓', DpadLeft: '←', DpadRight: '→', Home: 'PS',
  },
  xbox: {
    A: 'A', B: 'B', X: 'X', Y: 'Y',
    L1: 'LB', R1: 'RB', L2: 'LT', R2: 'RT',
    Select: 'Affichage', Start: 'Menu', L3: 'L3', R3: 'R3',
    DpadUp: '↑', DpadDown: '↓', DpadLeft: '←', DpadRight: '→', Home: 'Xbox',
  },
  generic: {
    A: 'A', B: 'B', X: 'X', Y: 'Y',
    L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2',
    Select: 'Select', Start: 'Start', L3: 'L3', R3: 'R3',
    DpadUp: '↑', DpadDown: '↓', DpadLeft: '←', DpadRight: '→', Home: 'Home',
  },
};

export function buttonLabel(brand, name) {
  return (BUTTON_LABELS[brand] ?? BUTTON_LABELS.generic)[name] ?? name;
}
