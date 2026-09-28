// Tests de la persistance des réglages manette (bornes, valeurs corrompues).
// Lancer : npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIM_MODE,
  DEFAULT_CONTROLLER_BINDINGS,
  DEFAULT_CONTROLLER_CONFIG,
  DEFAULT_VALORANT_CONSOLE_PROFILE,
  ROTATION_SCALE_LIMITS,
  decodeControllerProfileCode,
  encodeControllerProfileCode,
  sanitizeControllerConfig,
  sanitizeControllerProfile,
} from './controllerProfiles.js';

test('config par défaut : relue à l\'identique par sanitize', () => {
  const clean = sanitizeControllerConfig(JSON.parse(JSON.stringify(DEFAULT_CONTROLLER_CONFIG)));
  assert.deepEqual(clean, DEFAULT_CONTROLLER_CONFIG);
});

test('données absentes/corrompues : retombe sur les défauts, jamais de plantage', () => {
  assert.deepEqual(sanitizeControllerConfig(null), DEFAULT_CONTROLLER_CONFIG);
  assert.deepEqual(sanitizeControllerConfig(undefined), DEFAULT_CONTROLLER_CONFIG);
  assert.deepEqual(sanitizeControllerConfig('nawak'), DEFAULT_CONTROLLER_CONFIG);
  assert.deepEqual(sanitizeControllerConfig({}), DEFAULT_CONTROLLER_CONFIG);
});

test('rotationScale hors bornes est clampé', () => {
  const over = sanitizeControllerConfig({ rotationScale: 9999 });
  assert.equal(over.rotationScale, ROTATION_SCALE_LIMITS.max);
  const under = sanitizeControllerConfig({ rotationScale: -5 });
  assert.equal(under.rotationScale, ROTATION_SCALE_LIMITS.min);
});

test('courbe inconnue dans un mode retombe sur la courbe par défaut', () => {
  const profile = sanitizeControllerProfile({ modes: { [AIM_MODE.BASE]: { sensX: 5, sensY: 5, curve: 'inexistante' } } });
  assert.equal(profile.modes[AIM_MODE.BASE].curve, 'standard');
});

test('sensibilité négative : bornée au minimum (jamais 0 ni négative)', () => {
  const profile = sanitizeControllerProfile({ modes: { [AIM_MODE.BASE]: { sensX: -3, sensY: 5, curve: 'standard' } } });
  assert.ok(profile.modes[AIM_MODE.BASE].sensX > 0);
});

test('sensibilité infinie ou NaN retombe sur le défaut, pas sur une valeur folle', () => {
  const profile = sanitizeControllerProfile({ modes: { [AIM_MODE.BASE]: { sensX: Infinity, sensY: NaN, curve: 'standard' } } });
  assert.equal(profile.modes[AIM_MODE.BASE].sensX, DEFAULT_VALORANT_CONSOLE_PROFILE.modes[AIM_MODE.BASE].sensX);
  assert.equal(profile.modes[AIM_MODE.BASE].sensY, DEFAULT_VALORANT_CONSOLE_PROFILE.modes[AIM_MODE.BASE].sensY);
});

test('deadzone bornée entre 0 et 1', () => {
  const profile = sanitizeControllerProfile({ deadzone: { inner: -1, outer: 5 } });
  assert.equal(profile.deadzone.inner, 0);
  assert.equal(profile.deadzone.outer, 1);
});

test('les 4 modes existent toujours, même si le profil brut n\'en fournit qu\'un', () => {
  const profile = sanitizeControllerProfile({ modes: { [AIM_MODE.BASE]: { sensX: 3, sensY: 3, curve: 'linear' } } });
  for (const mode of Object.values(AIM_MODE)) {
    assert.ok(profile.modes[mode], mode);
    assert.equal(typeof profile.modes[mode].sensX, 'number');
  }
});

test('réassignation des boutons : un bouton valide est repris, un inconnu retombe sur le défaut', () => {
  const clean = sanitizeControllerConfig({ bindings: { fire: 'A', ads: 'not-a-button', pause: 'Start' } });
  assert.equal(clean.bindings.fire, 'A');
  assert.equal(clean.bindings.ads, DEFAULT_CONTROLLER_BINDINGS.ads);
  assert.equal(clean.bindings.pause, 'Start');
});

test('bindings absents : retombe entièrement sur les défauts', () => {
  assert.deepEqual(sanitizeControllerConfig({}).bindings, DEFAULT_CONTROLLER_BINDINGS);
});

test('code de partage du profil manette : aller-retour fidèle', () => {
  const controller = sanitizeControllerConfig({
    profile: { ...DEFAULT_VALORANT_CONSOLE_PROFILE, modes: { ...DEFAULT_VALORANT_CONSOLE_PROFILE.modes, [AIM_MODE.BASE]: { sensX: 5.5, sensY: 4.2, curve: 'heavy' } } },
    rotationScale: 80,
    bindings: { fire: 'A', ads: 'B', pause: 'Select' },
    activeGamepadId: 'ne-doit-pas-partir-dans-le-code',
  });
  const code = encodeControllerProfileCode(controller);
  assert.ok(code.startsWith('MVPCTRL1:'));
  const decoded = decodeControllerProfileCode(code);
  assert.equal(decoded.profile.modes[AIM_MODE.BASE].sensX, 5.5);
  assert.equal(decoded.profile.modes[AIM_MODE.BASE].curve, 'heavy');
  assert.equal(decoded.rotationScale, 80);
  assert.deepEqual(decoded.bindings, { fire: 'A', ads: 'B', pause: 'Select' });
  assert.ok(!('activeGamepadId' in decoded), 'ne doit jamais transporter un id de manette propre à un appareil');
});

test('code de partage : texte non reconnu ou corrompu renvoie null', () => {
  assert.equal(decodeControllerProfileCode('pas un code'), null);
  assert.equal(decodeControllerProfileCode('MVPCTRL1:%%%pas du base64%%%'), null);
});
