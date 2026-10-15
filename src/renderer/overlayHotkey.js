// Raccourci global qui masque / réaffiche l'overlay de session. On convertit un
// événement clavier en « accélérateur » Electron ("Ctrl+Alt+O", "F8"...), le
// format attendu par globalShortcut côté processus principal.

export const DEFAULT_OVERLAY_HOTKEY = 'Ctrl+Alt+O';

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

const NAMED_KEYS = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  Tab: 'Tab',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backslash: '\\',
};

function mainKey(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

/**
 * @param {{ code: string, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean, metaKey?: boolean }} event
 * @returns {{ status: 'partial' } | { status: 'cancel' } | { status: 'clear' } | { status: 'invalid' } | { status: 'ok', accelerator: string }}
 *   partial : seuls des modificateurs sont enfoncés, on attend la vraie touche.
 *   cancel  : Échap, on abandonne la saisie.
 *   clear   : Retour arrière / Suppr, on désactive le raccourci.
 *   invalid : touche sans modificateur (sauf touches F), trop facile à déclencher par erreur.
 */
export function acceleratorFromEvent(event) {
  if (MODIFIER_CODES.has(event.code)) return { status: 'partial' };
  if (event.code === 'Escape') return { status: 'cancel' };
  if (event.code === 'Backspace' || event.code === 'Delete') return { status: 'clear' };

  const key = mainKey(event.code);
  if (!key) return { status: 'invalid' };

  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');

  // Une lettre seule serait interceptée partout sur le PC, y compris en jeu ou en tapant.
  const isFunctionKey = /^F\d+$/.test(key);
  if (parts.length === 0 && !isFunctionKey) return { status: 'invalid' };

  return { status: 'ok', accelerator: [...parts, key].join('+') };
}

// Validation côté processus principal : un accélérateur de la forme produite ci-dessus.
export function isValidAccelerator(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return false;
  const parts = value.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!mods.every((m) => ['Ctrl', 'Alt', 'Shift', 'Super'].includes(m))) return false;
  if (new Set(mods).size !== mods.length) return false;
  const known = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Up|Down|Left|Right|Space|Tab|Insert|Home|End|PageUp|PageDown|[-=,./`\[\];'\\])$/;
  if (!known.test(key)) return false;
  return mods.length > 0 || /^F\d+$/.test(key);
}
