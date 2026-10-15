import test from 'node:test';
import assert from 'node:assert/strict';
import { acceleratorFromEvent, isValidAccelerator, DEFAULT_OVERLAY_HOTKEY } from './overlayHotkey.js';

test('lettre avec modificateurs -> accélérateur Electron', () => {
  assert.deepEqual(acceleratorFromEvent({ code: 'KeyO', ctrlKey: true, altKey: true }), { status: 'ok', accelerator: 'Ctrl+Alt+O' });
  assert.deepEqual(acceleratorFromEvent({ code: 'Digit7', ctrlKey: true, shiftKey: true }), { status: 'ok', accelerator: 'Ctrl+Shift+7' });
  assert.deepEqual(acceleratorFromEvent({ code: 'ArrowUp', altKey: true }), { status: 'ok', accelerator: 'Alt+Up' });
  assert.deepEqual(acceleratorFromEvent({ code: 'KeyK', metaKey: true }), { status: 'ok', accelerator: 'Super+K' });
});

test('touche F seule acceptée, lettre seule refusée', () => {
  assert.deepEqual(acceleratorFromEvent({ code: 'F8' }), { status: 'ok', accelerator: 'F8' });
  assert.equal(acceleratorFromEvent({ code: 'KeyO' }).status, 'invalid');
  assert.equal(acceleratorFromEvent({ code: 'Space' }).status, 'invalid');
});

test('modificateur seul, Échap et effacement', () => {
  assert.equal(acceleratorFromEvent({ code: 'ControlLeft', ctrlKey: true }).status, 'partial');
  assert.equal(acceleratorFromEvent({ code: 'Escape' }).status, 'cancel');
  assert.equal(acceleratorFromEvent({ code: 'Backspace' }).status, 'clear');
  assert.equal(acceleratorFromEvent({ code: 'Delete' }).status, 'clear');
});

test('touche inconnue (pavé numérique, multimédia) refusée', () => {
  assert.equal(acceleratorFromEvent({ code: 'Numpad1', ctrlKey: true }).status, 'invalid');
  assert.equal(acceleratorFromEvent({ code: 'AudioVolumeUp', ctrlKey: true }).status, 'invalid');
});

test('isValidAccelerator', () => {
  assert.equal(isValidAccelerator(DEFAULT_OVERLAY_HOTKEY), true);
  assert.equal(isValidAccelerator('F8'), true);
  assert.equal(isValidAccelerator('Ctrl+Alt+Shift+F12'), true);
  assert.equal(isValidAccelerator('O'), false);
  assert.equal(isValidAccelerator('Ctrl+Ctrl+O'), false);
  assert.equal(isValidAccelerator('Ctrl+Hack+O'), false);
  assert.equal(isValidAccelerator('Ctrl+'), false);
  assert.equal(isValidAccelerator(''), false);
  assert.equal(isValidAccelerator(42), false);
  assert.equal(isValidAccelerator('Ctrl+' + 'A'.repeat(60)), false);
});
