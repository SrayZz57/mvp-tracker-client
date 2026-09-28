// Tests du pipeline de visée manette (deadzone → courbe → sensibilité →
// dampen → rotationScale × dt). Lancer : npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { AimEngine } from './AimEngine.js';
import { AIM_MODE, DEFAULT_VALORANT_CONSOLE_PROFILE } from './controllerProfiles.js';

function makeEngine(overrides = {}) {
  const profile = JSON.parse(JSON.stringify(DEFAULT_VALORANT_CONSOLE_PROFILE));
  Object.assign(profile, overrides);
  return new AimEngine(profile, 60);
}

test('stick neutre = aucune rotation', () => {
  const engine = makeEngine();
  const { yaw, pitch } = engine.process(0, 0, 1 / 60);
  assert.equal(yaw, 0);
  assert.equal(pitch, 0);
});

test('stick à 100% = rotation maximale (courbe linéaire, pour isoler la sensibilité)', () => {
  const engine = makeEngine();
  engine.profile.modes[AIM_MODE.BASE].curve = 'linear';
  const dt = 1 / 60;
  const { yaw } = engine.process(1, 0, dt);
  const expected = 1 * engine.profile.modes[AIM_MODE.BASE].sensX * engine.rotationScale * dt;
  assert.ok(Math.abs(yaw - expected) < 1e-9);
});

test('changement de framerate : même vitesse angulaire (°/s) quel que soit dt', () => {
  const engine = makeEngine();
  const yawAt60fps = engine.process(0.5, 0, 1 / 60).yaw;
  const yawAt30fps = engine.process(0.5, 0, 1 / 30).yaw;
  const yawAt144fps = engine.process(0.5, 0, 1 / 144).yaw;
  // Ramené à une vitesse par seconde, les trois doivent converger.
  const speed60 = yawAt60fps / (1 / 60);
  const speed30 = yawAt30fps / (1 / 30);
  const speed144 = yawAt144fps / (1 / 144);
  assert.ok(Math.abs(speed60 - speed30) < 1e-9);
  assert.ok(Math.abs(speed60 - speed144) < 1e-9);
});

test('deadzone : sous le seuil interne, aucune dérive même stick légèrement décentré', () => {
  const engine = makeEngine();
  const { yaw, pitch } = engine.process(0.05, 0.02, 1 / 60);
  assert.equal(yaw, 0);
  assert.equal(pitch, 0);
});

test('sensibilité X/Y indépendante', () => {
  const engine = makeEngine();
  engine.profile.modes[AIM_MODE.BASE].sensX = 4;
  engine.profile.modes[AIM_MODE.BASE].sensY = 12;
  engine.profile.modes[AIM_MODE.BASE].curve = 'linear';
  const dt = 1 / 60;
  const { yaw } = engine.process(1, 0, dt);
  const { pitch } = engine.process(0, 1, dt);
  assert.ok(Math.abs(pitch / yaw - 12 / 4) < 1e-9);
});

test('changement de mode : BASE et SNIPER appliquent des sensibilités différentes', () => {
  const engine = makeEngine();
  engine.profile.modes[AIM_MODE.BASE].sensX = 8;
  engine.profile.modes[AIM_MODE.SNIPER].sensX = 2;
  engine.profile.modes[AIM_MODE.BASE].curve = 'linear';
  engine.profile.modes[AIM_MODE.SNIPER].curve = 'linear';
  const dt = 1 / 60;
  engine.setMode('BASE');
  const baseYaw = engine.process(1, 0, dt).yaw;
  engine.setMode('SNIPER');
  const sniperYaw = engine.process(1, 0, dt).yaw;
  assert.ok(sniperYaw < baseYaw);
});

test('un mode inconnu retombe sur BASE sans planter', () => {
  const engine = makeEngine();
  engine.setMode('NOT_A_MODE');
  assert.equal(engine.mode, AIM_MODE.BASE);
});

test('inversion Y : inverse le signe du pitch, jamais celui du yaw', () => {
  const engine = makeEngine();
  engine.profile.modes[AIM_MODE.BASE].curve = 'linear';
  const dt = 1 / 60;
  const normal = engine.process(0.5, 0.5, dt);
  engine.profile.invertY = true;
  const inverted = engine.process(0.5, 0.5, dt);
  assert.equal(inverted.pitch, -normal.pitch);
  assert.equal(inverted.yaw, normal.yaw);
});

test('dampen shooting : réduit la rotation d\'exactement le multiplicateur quand actif', () => {
  const engine = makeEngine();
  engine.profile.modes[AIM_MODE.BASE].curve = 'linear';
  engine.profile.dampenShooting = { enabled: true, multiplier: 0.7 };
  const dt = 1 / 60;
  engine.setShooting(false);
  const normalYaw = engine.process(1, 0, dt).yaw;
  engine.setShooting(true);
  const dampenedYaw = engine.process(1, 0, dt).yaw;
  assert.ok(Math.abs(dampenedYaw - normalYaw * 0.7) < 1e-9);
});

test('dampen shooting désactivé : le tir ne change rien', () => {
  const engine = makeEngine();
  engine.profile.dampenShooting = { enabled: false, multiplier: 0.5 };
  const dt = 1 / 60;
  engine.setShooting(false);
  const a = engine.process(0.6, 0.2, dt);
  engine.setShooting(true);
  const b = engine.process(0.6, 0.2, dt);
  assert.equal(a.yaw, b.yaw);
  assert.equal(a.pitch, b.pitch);
});

test('rotationScale : agrandit la rotation proportionnellement, sans toucher au profil utilisateur', () => {
  const engine = makeEngine();
  engine.profile.modes[AIM_MODE.BASE].curve = 'linear';
  const dt = 1 / 60;
  const before = engine.process(0.5, 0, dt).yaw;
  engine.setRotationScale(engine.rotationScale * 2);
  const after = engine.process(0.5, 0, dt).yaw;
  assert.ok(Math.abs(after - before * 2) < 1e-9);
});
