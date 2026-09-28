// Lecture native de l'API Gamepad (navigator.getGamepads()) — aucune
// dépendance ajoutée au projet. `poll()` doit être appelé depuis une boucle
// déjà existante (requestAnimationFrame de AimTrainerGame.jsx) : jamais de
// setInterval dédié, jamais de re-render React à chaque frame (voir
// InputManager.js qui expose ça proprement).
//
// Mapping "standard" (index de bouton/axe) : Chromium normalise DualSense et
// manettes Xbox sur le même layout quand `gamepad.mapping === 'standard'`
// (le cas courant), donc aucun code spécifique à une marque n'est
// nécessaire. Axes 0/1 = stick gauche, 2/3 = stick droit ; boutons 6/7 =
// L2/R2 (valeur analogique 0..1 sur la plupart des manettes récentes).
export const STANDARD_BUTTON_NAMES = [
  'A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'DpadUp', 'DpadDown', 'DpadLeft', 'DpadRight', 'Home',
];

export class GamepadInput {
  constructor() {
    this.pads = new Map(); // id -> { id, index }
    this.activeId = null;
    this._onChange = null;
    this._connectHandler = (e) => this._handleConnect(e.gamepad);
    this._disconnectHandler = (e) => this._handleDisconnect(e.gamepad);
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('gamepadconnected', this._connectHandler);
      window.addEventListener('gamepaddisconnected', this._disconnectHandler);
    }
  }

  destroy() {
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('gamepadconnected', this._connectHandler);
      window.removeEventListener('gamepaddisconnected', this._disconnectHandler);
    }
  }

  onConnectionChange(cb) {
    this._onChange = cb;
  }

  _handleConnect(gp) {
    if (!gp) return;
    this.pads.set(gp.id, { id: gp.id, index: gp.index });
    if (this.activeId === null) this.activeId = gp.id;
    this._onChange?.(this.list());
  }

  _handleDisconnect(gp) {
    if (!gp) return;
    this.pads.delete(gp.id);
    if (this.activeId === gp.id) {
      const next = this.pads.values().next();
      this.activeId = next.done ? null : next.value.id;
    }
    this._onChange?.(this.list());
  }

  list() {
    return [...this.pads.values()];
  }

  setActiveId(id) {
    if (id === null || this.pads.has(id)) this.activeId = id;
  }

  // À appeler une fois par frame. Certaines manettes/navigateurs n'émettent
  // pas 'gamepadconnected' de façon fiable au démarrage (ex. reprise après
  // veille) : on complète donc aussi via le repli ci-dessous.
  poll() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const list = navigator.getGamepads();
    for (const gp of list) {
      if (gp && !this.pads.has(gp.id)) this._handleConnect(gp);
    }
    if (this.activeId === null) return null;
    const active = this.pads.get(this.activeId);
    const gp = active ? list[active.index] : null;
    if (!gp || !gp.connected) return null;
    const axes = gp.axes;
    const buttons = gp.buttons;
    return {
      id: gp.id,
      index: gp.index,
      leftStick: { x: axes[0] ?? 0, y: axes[1] ?? 0 },
      rightStick: { x: axes[2] ?? 0, y: axes[3] ?? 0 },
      l2: buttons[6]?.value ?? (buttons[6]?.pressed ? 1 : 0),
      r2: buttons[7]?.value ?? (buttons[7]?.pressed ? 1 : 0),
      buttons: buttons.map((b, i) => ({ name: STANDARD_BUTTON_NAMES[i] ?? `Button${i}`, pressed: b.pressed, value: b.value })),
    };
  }

  // Abstraction "GamepadRumbleManager" — ne jette jamais si la vibration
  // n'est pas exposée par le navigateur/la manette (ex. DualSense en
  // Bluetooth selon la version de Chromium) : renvoie simplement false.
  rumble({ duration = 150, weakMagnitude = 0.5, strongMagnitude = 0.5 } = {}) {
    if (this.activeId === null || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
    const active = this.pads.get(this.activeId);
    const gp = active ? navigator.getGamepads()[active.index] : null;
    const actuator = gp?.vibrationActuator ?? gp?.hapticActuators?.[0];
    if (!actuator) return false;
    try {
      if (typeof actuator.playEffect === 'function') {
        actuator.playEffect('dual-rumble', { duration, weakMagnitude, strongMagnitude, startDelay: 0 });
      } else if (typeof actuator.pulse === 'function') {
        actuator.pulse(strongMagnitude, duration);
      } else {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
