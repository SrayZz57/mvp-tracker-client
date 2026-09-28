// Pipeline générique de visée au stick, indépendant de React/three.js/de la
// Gamepad API — reçoit des axes bruts déjà lus ailleurs (GamepadInput.js) et
// renvoie une rotation en DEGRÉS (même convention que le reste du moteur,
// voir DEG_TO_RAD dans AimTrainerGame.jsx), indépendante du framerate via
// `dtSeconds`.
//
//   raw stick → deadzone → normalisation → response curve → sensibilité
//   → dampen (si tir) → rotationScale → × dtSeconds
//
// Les scénarios d'aim (modes du jeu) n'ont jamais besoin de savoir que ce
// module existe : seul le point d'intégration dans AimTrainerGame.jsx
// l'appelle, exactement comme il applique déjà le mouvement souris à
// `euler`/`camera`.
import { applyAimCurve } from './aimCurves.js';
import { applyRadialDeadzone } from './deadzone.js';
import { AIM_MODE, ROTATION_SCALE_DEFAULT, DEFAULT_VALORANT_CONSOLE_PROFILE } from './controllerProfiles.js';

export { AIM_MODE };

export class AimEngine {
  constructor(profile = DEFAULT_VALORANT_CONSOLE_PROFILE, rotationScale = ROTATION_SCALE_DEFAULT) {
    this.profile = profile;
    this.mode = AIM_MODE.BASE;
    this.shooting = false;
    this.rotationScale = rotationScale;
  }

  setProfile(profile) {
    this.profile = profile;
  }

  setMode(mode) {
    this.mode = AIM_MODE[mode] ? mode : AIM_MODE.BASE;
  }

  setShooting(shooting) {
    this.shooting = !!shooting;
  }

  setRotationScale(scale) {
    if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) this.rotationScale = scale;
  }

  /**
   * @param rawX, rawY axes bruts du stick droit, chacun dans [-1, 1].
   * @param dtSeconds delta temps depuis la frame précédente, en secondes.
   * @returns { yaw, pitch, debug } — yaw/pitch en degrés, à appliquer comme
   *   `euler.y -= yaw; euler.x -= pitch;` (même convention de signe que
   *   handleMouseMove dans AimTrainerGame.jsx : X positif = vers la droite,
   *   Y positif = vers le bas).
   */
  process(rawX, rawY, dtSeconds) {
    const { deadzone, invertY, dampenShooting } = this.profile;
    const modeSettings = this.profile.modes[this.mode] ?? this.profile.modes[AIM_MODE.BASE];

    const dz = applyRadialDeadzone(rawX, rawY, deadzone.inner, deadzone.outer);
    const curvedMagnitude = applyAimCurve(dz.magnitude, modeSettings.curve);

    // La courbe s'applique à la MAGNITUDE (pas à chaque axe séparément) puis
    // est redistribuée dans la direction du stick — sinon une poussée en
    // diagonale serait plus molle que sur un axe pur (deux courbures
    // indépendantes se multiplient).
    const dirLength = Math.hypot(dz.x, dz.y) || 1;
    const curvedX = (dz.x / dirLength) * curvedMagnitude;
    const curvedY = (dz.y / dirLength) * curvedMagnitude;

    const dampenFactor = this.shooting && dampenShooting.enabled ? dampenShooting.multiplier : 1;
    const invert = invertY ? -1 : 1;

    const yaw = curvedX * modeSettings.sensX * this.rotationScale * dampenFactor * dtSeconds;
    const pitch = curvedY * modeSettings.sensY * this.rotationScale * dampenFactor * dtSeconds * invert;

    return {
      yaw,
      pitch,
      debug: {
        rawX,
        rawY,
        deadzoneX: dz.x,
        deadzoneY: dz.y,
        curvedX,
        curvedY,
        mode: this.mode,
        sensX: modeSettings.sensX,
        sensY: modeSettings.sensY,
        curve: modeSettings.curve,
        dampenFactor,
        rotationScale: this.rotationScale,
      },
    };
  }
}
