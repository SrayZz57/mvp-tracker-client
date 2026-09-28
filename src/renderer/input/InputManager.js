// Couche d'abstraction d'entrée :
//
//   InputManager
//   ├── MouseKeyboardInput   (lecture passive, pour le debugger uniquement)
//   └── GamepadInput
//
// IMPORTANT : le déplacement réel de la caméra à la souris reste 100 % géré
// par AimTrainerGame.jsx (handleMouseMove), inchangé — cette classe ne le
// duplique ni ne le remplace. MouseKeyboardInput existe pour que l'input
// debugger (voir InputDebugOverlay.jsx) puisse afficher un "Raw X/Y" souris
// à côté du stick, sans risquer de toucher au chemin critique existant.
import { GamepadInput } from './GamepadInput.js';
import { AimEngine, AIM_MODE } from './AimEngine.js';

export { AIM_MODE };

export class MouseKeyboardInput {
  constructor() {
    this.lastDelta = { x: 0, y: 0 };
    this._handler = (e) => {
      this.lastDelta = { x: e.movementX, y: e.movementY };
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('mousemove', this._handler);
    }
  }

  destroy() {
    if (typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('mousemove', this._handler);
    }
  }

  // Consomme le dernier delta connu (remis à zéro) — usage debugger only.
  consumeDelta() {
    const d = this.lastDelta;
    this.lastDelta = { x: 0, y: 0 };
    return d;
  }
}

export class InputManager {
  constructor(profile, rotationScale) {
    this.gamepad = new GamepadInput();
    this.mouse = new MouseKeyboardInput();
    this.engine = new AimEngine(profile, rotationScale);
  }

  setProfile(profile) {
    this.engine.setProfile(profile);
  }

  setMode(mode) {
    this.engine.setMode(mode);
  }

  setShooting(shooting) {
    this.engine.setShooting(shooting);
  }

  setRotationScale(scale) {
    this.engine.setRotationScale(scale);
  }

  listGamepads() {
    return this.gamepad.list();
  }

  setActiveGamepad(id) {
    this.gamepad.setActiveId(id);
  }

  onGamepadsChanged(cb) {
    this.gamepad.onConnectionChange(cb);
  }

  rumble(opts) {
    return this.gamepad.rumble(opts);
  }

  // Un appel par frame. dtSeconds : delta temps depuis la frame précédente.
  // Renvoie { connected, gamepadState, result } — result est null si aucune
  // manette active (aucune rotation à appliquer ce cas-là).
  pollGamepadFrame(dtSeconds) {
    const gamepadState = this.gamepad.poll();
    if (!gamepadState) return { connected: false, gamepadState: null, result: null };
    this.setShooting(gamepadState.r2 > 0.5);
    const result = this.engine.process(gamepadState.rightStick.x, gamepadState.rightStick.y, dtSeconds);
    return { connected: true, gamepadState, result };
  }

  destroy() {
    this.gamepad.destroy();
    this.mouse.destroy();
  }
}
