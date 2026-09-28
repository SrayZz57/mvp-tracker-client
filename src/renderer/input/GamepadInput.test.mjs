// Tests de GamepadInput avec un navigator.getGamepads() simulé (pas de vraie
// manette nécessaire pour ces cas). Lancer : npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { GamepadInput } from './GamepadInput.js';

function fakeGamepad({ id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)', index = 0, axes = [0, 0, 0, 0], buttons = [] } = {}) {
  const filledButtons = Array.from({ length: 17 }, (_, i) => buttons[i] ?? { pressed: false, value: 0 });
  return { id, index, connected: true, axes, buttons: filledButtons, mapping: 'standard', vibrationActuator: null, hapticActuators: [] };
}

function withNavigator(gamepads, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => gamepads },
    configurable: true,
  });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
}

test('aucune manette : poll() renvoie null sans planter', () => {
  withNavigator([], () => {
    const input = new GamepadInput();
    assert.equal(input.poll(), null);
    input.destroy();
  });
});

test('une manette connectée (repli sans événement gamepadconnected) : sélectionnée automatiquement', () => {
  const pad = fakeGamepad({ axes: [0, 0, 0.5, -0.25] });
  withNavigator([pad], () => {
    const input = new GamepadInput();
    const state = input.poll();
    assert.equal(state.id, pad.id);
    assert.equal(state.rightStick.x, 0.5);
    assert.equal(state.rightStick.y, -0.25);
    input.destroy();
  });
});

test('plusieurs manettes : sélection de la manette active par id', () => {
  const padA = fakeGamepad({ id: 'DualSense Wireless Controller', index: 0 });
  const padB = fakeGamepad({ id: 'Xbox Wireless Controller', index: 1, axes: [0, 0, 0.9, 0] });
  withNavigator([padA, padB], () => {
    const input = new GamepadInput();
    input.poll();
    assert.equal(input.list().length, 2);
    input.setActiveId('Xbox Wireless Controller');
    const state = input.poll();
    assert.equal(state.id, 'Xbox Wireless Controller');
    assert.equal(state.rightStick.x, 0.9);
    input.destroy();
  });
});

test('L2/R2 lus depuis la valeur analogique des boutons 6/7', () => {
  const buttons = [];
  buttons[6] = { pressed: true, value: 0.8 };
  buttons[7] = { pressed: true, value: 1 };
  const pad = fakeGamepad({ buttons });
  withNavigator([pad], () => {
    const input = new GamepadInput();
    const state = input.poll();
    assert.equal(state.l2, 0.8);
    assert.equal(state.r2, 1);
    input.destroy();
  });
});

test('déconnexion (via événement) : bascule sur la manette suivante ou null', () => {
  const input = new GamepadInput();
  input._handleConnect({ id: 'pad-1', index: 0 });
  input._handleConnect({ id: 'pad-2', index: 1 });
  assert.equal(input.activeId, 'pad-1');
  input._handleDisconnect({ id: 'pad-1', index: 0 });
  assert.equal(input.activeId, 'pad-2');
  input._handleDisconnect({ id: 'pad-2', index: 1 });
  assert.equal(input.activeId, null);
  input.destroy();
});

test('vibration non supportée : rumble() renvoie false sans jeter', () => {
  const pad = fakeGamepad();
  withNavigator([pad], () => {
    const input = new GamepadInput();
    input.poll();
    assert.equal(input.rumble(), false);
    input.destroy();
  });
});

test('vibration supportée (playEffect) : rumble() renvoie true et transmet les paramètres', () => {
  let called = null;
  const pad = fakeGamepad();
  pad.vibrationActuator = { playEffect: (type, params) => { called = { type, params }; return Promise.resolve(); } };
  withNavigator([pad], () => {
    const input = new GamepadInput();
    input.poll();
    const ok = input.rumble({ duration: 200, weakMagnitude: 0.3, strongMagnitude: 0.9 });
    assert.equal(ok, true);
    assert.equal(called.type, 'dual-rumble');
    assert.equal(called.params.duration, 200);
    input.destroy();
  });
});
