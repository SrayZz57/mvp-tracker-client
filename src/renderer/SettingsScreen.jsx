import { useState } from 'react';
import { Crosshair, Gamepad2, Gauge, Monitor, MousePointer2, RotateCcw, Target } from 'lucide-react';
import Icon from './Icon.jsx';
import CrosshairPreview from './CrosshairPreview.jsx';
import { AIM_CURVE_IDS } from './input/aimCurves.js';
import { AIM_MODE_IDS, decodeControllerProfileCode, encodeControllerProfileCode } from './input/controllerProfiles.js';
import { useConnectedGamepads } from './input/useConnectedGamepads.js';
import GamepadRemap from './input/GamepadRemap.jsx';
import './aimPages.css';

// Page Réglages de l'Aim Trainer : sensibilité, viseur, cibles, affichage et son.
// Mêmes réglages qu'avant (même objet `config`, même `set`), présentés en cartes
// avec un aperçu direct de ce qu'on modifie.

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="ap-toggle">
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ap-switch" aria-hidden="true" />
    </label>
  );
}

function CardHead({ icon, title, hint }) {
  return (
    <header className="ap-card-head">
      <h3>
        <Icon icon={icon} size={17} /> {title}
      </h3>
      {hint && <span>{hint}</span>}
    </header>
  );
}

export default function SettingsScreen({ t, config, set, onReset, crosshairs, targetColors, edpi, cm360, onOpenFinder, onOpenCalibration }) {
  const selectedCrosshair = crosshairs.find((ch) => ch.code === config.crosshairCode) ?? null;
  const pads = useConnectedGamepads();
  const controller = config.controller;
  const activePad = pads.find((p) => p.id === controller.activeGamepadId) ?? pads[0] ?? null;

  const setController = (patch) => set({ controller: { ...controller, ...patch } });
  const setProfile = (patch) => setController({ profile: { ...controller.profile, ...patch } });
  const setModeSetting = (modeId, patch) =>
    setProfile({ modes: { ...controller.profile.modes, [modeId]: { ...controller.profile.modes[modeId], ...patch } } });

  // Code de partage du profil manette (voir controllerProfiles.js) — même
  // principe que les codes de presets/arènes déjà en place ailleurs dans
  // l'app (CustomModeConfig.jsx, arenaEditor/ArenaEditor.jsx).
  const [shareCode, setShareCode] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [importText, setImportText] = useState('');
  const copyControllerCode = () => {
    const code = encodeControllerProfileCode(controller);
    setShareCode(code);
    navigator.clipboard
      ?.writeText(code)
      .then(() => setShareMsg(t('aimTrainer.controller.share.copied')))
      .catch(() => {});
  };
  const importControllerCode = () => {
    const decoded = decodeControllerProfileCode(importText);
    if (!decoded) {
      setShareMsg(t('aimTrainer.controller.share.invalid'));
      return;
    }
    setController(decoded);
    setImportText('');
    setShareMsg(t('aimTrainer.controller.share.imported'));
  };

  return (
    <div className="ap-screen">
      <header className="ap-head">
        <span className="ap-eyebrow">{t('aimTrainer.title')}</span>
        <h2>{t('aimTrainer.hubSettings')}</h2>
        <p>{t('aimTrainer.accuracyNote')}</p>
      </header>

      <div className="ap-settings">
        <section className="ap-card ap-sens">
          <CardHead icon={MousePointer2} title={t('aimTrainer.sensSection')} />
          <label className="ap-field ap-sens-field">
            <span>{t('aimTrainer.sensLabel')}</span>
            <input type="number" step="0.01" min="0" value={config.sens} onChange={(e) => set({ sens: Number(e.target.value) || 0 })} />
            <small>{t('aimTrainer.sensHint')}</small>
          </label>
          <button type="button" className="ap-btn ap-sens-finder" onClick={onOpenFinder}>
            <Icon icon={Gauge} size={15} /> {t('aimTrainer.lobby.finder')}
          </button>
        </section>

        <section className="ap-card ap-crosshair-card">
          <CardHead icon={Crosshair} title={t('aimTrainer.crosshairSection')} hint={selectedCrosshair?.name ?? t('aimTrainer.crosshairDefault')} />
          <div className="ap-crosshair-preview">
            {selectedCrosshair ? <CrosshairPreview code={selectedCrosshair.code} bare size={96} /> : <div className="aim-trainer-crosshair-static-preview" />}
          </div>
          {crosshairs.length === 0 ? (
            <>
              <p className="ap-empty">{t('aimTrainer.crosshairEmpty')}</p>
              <button type="button" className="ap-btn" onClick={() => window.electronAPI.openMainTab('crosshairs')}>
                <Icon icon={Crosshair} size={15} /> {t('aimTrainer.crosshairAdd')}
              </button>
            </>
          ) : (
            <div className="ap-crosshair-list">
              <button
                type="button"
                className={config.crosshairCode ? 'ap-crosshair' : 'ap-crosshair active'}
                onClick={() => set({ crosshairCode: null })}
                title={t('aimTrainer.crosshairDefault')}
              >
                <div className="aim-trainer-crosshair-static-preview" />
              </button>
              {crosshairs.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  className={config.crosshairCode === ch.code ? 'ap-crosshair active' : 'ap-crosshair'}
                  onClick={() => set({ crosshairCode: ch.code })}
                  title={ch.name}
                >
                  <CrosshairPreview code={ch.code} bare size={40} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="ap-card ap-targets">
          <CardHead icon={Target} title={t('aimTrainer.targetsSection')} hint={t('aimTrainer.targetColorLabel')} />
          <div className="ap-target-preview" style={{ '--target': config.targetColor }}>
            <span className="ap-sphere" />
            <span className="ap-sphere ap-sphere-sm" />
            <span className="ap-sphere ap-sphere-xs" />
          </div>
          <div className="ap-swatches">
            {targetColors.map((color) => (
              <button
                key={color}
                type="button"
                className={color === config.targetColor ? 'ap-swatch active' : 'ap-swatch'}
                style={{ '--c': color }}
                onClick={() => set({ targetColor: color })}
                title={color}
              />
            ))}
          </div>
        </section>

        <section className="ap-card ap-display">
          <CardHead icon={Monitor} title={t('aimTrainer.displaySection')} />
          <label className="ap-range">
            <span>
              <b>{t('aimTrainer.statsPage.fov')}</b>
              <em>{config.fov}°</em>
            </span>
            <input type="range" min="70" max="120" value={config.fov} onChange={(e) => set({ fov: Number(e.target.value) })} style={{ '--p': `${((config.fov - 70) / 50) * 100}%` }} />
          </label>
          <Toggle checked={config.showWeapon} onChange={(v) => set({ showWeapon: v })} label={t('aimTrainer.showWeaponLabel')} />
          {config.showWeapon && (
            <Toggle checked={config.weaponSide === 'left'} onChange={(v) => set({ weaponSide: v ? 'left' : 'right' })} label={t('aimTrainer.weaponLeftLabel')} />
          )}
          <Toggle checked={config.theme === 'dark'} onChange={(v) => set({ theme: v ? 'dark' : 'day' })} label={t('aimTrainer.darkThemeLabel')} />
          <Toggle checked={config.hitSound} onChange={(v) => set({ hitSound: v })} label={t('aimTrainer.hitSoundLabel')} />
        </section>

        <section className="ap-card ap-controller">
          <CardHead icon={Gamepad2} title={t('aimTrainer.controller.title')} hint={t('aimTrainer.controller.profileName')} />

          <div className={activePad ? 'ap-controller-status connected' : 'ap-controller-status'}>
            <Icon icon={Gamepad2} size={16} />
            <span>{activePad ? activePad.id : t('aimTrainer.controller.noneConnected')}</span>
            {pads.length > 1 && (
              <select value={controller.activeGamepadId ?? activePad?.id ?? ''} onChange={(e) => setController({ activeGamepadId: e.target.value })}>
                {pads.map((p) => (
                  <option key={p.index} value={p.id}>
                    {p.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          <Toggle
            checked={controller.enabled}
            onChange={(v) => setController({ enabled: v })}
            label={t('aimTrainer.controller.enabledLabel')}
            hint={t('aimTrainer.controller.enabledHint')}
          />
          <p className="label">{t('aimTrainer.controller.navHint')}</p>

          <h4 className="account-subsection-title">{t('aimTrainer.controller.bindings.title')}</h4>
          <GamepadRemap bindings={controller.bindings} onChange={(bindings) => setController({ bindings })} activePad={activePad} />

          <div className="ap-controller-modes">
            {AIM_MODE_IDS.map((modeId) => {
              const m = controller.profile.modes[modeId];
              return (
                <div key={modeId} className="ap-controller-mode">
                  <span className="ap-controller-mode-name">{t(`aimTrainer.controller.modes.${modeId}`)}</span>
                  <label className="ap-field">
                    <span>{t('aimTrainer.controller.horizontalLabel')}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="20"
                      value={m.sensX}
                      onChange={(e) => setModeSetting(modeId, { sensX: Number(e.target.value) || m.sensX })}
                    />
                  </label>
                  <label className="ap-field">
                    <span>{t('aimTrainer.controller.verticalLabel')}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="20"
                      value={m.sensY}
                      onChange={(e) => setModeSetting(modeId, { sensY: Number(e.target.value) || m.sensY })}
                    />
                  </label>
                  <label className="ap-field">
                    <span>{t('aimTrainer.controller.curveLabel')}</span>
                    <select value={m.curve} onChange={(e) => setModeSetting(modeId, { curve: e.target.value })}>
                      {AIM_CURVE_IDS.map((id) => (
                        <option key={id} value={id}>
                          {t(`aimTrainer.controller.curves.${id}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>

          <label className="ap-range">
            <span>
              <b>{t('aimTrainer.controller.deadzoneInnerLabel')}</b>
              <em>{controller.profile.deadzone.inner.toFixed(2)}</em>
            </span>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.01"
              value={controller.profile.deadzone.inner}
              onChange={(e) => setProfile({ deadzone: { ...controller.profile.deadzone, inner: Number(e.target.value) } })}
            />
          </label>
          <label className="ap-range">
            <span>
              <b>{t('aimTrainer.controller.deadzoneOuterLabel')}</b>
              <em>{controller.profile.deadzone.outer.toFixed(2)}</em>
            </span>
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.01"
              value={controller.profile.deadzone.outer}
              onChange={(e) => setProfile({ deadzone: { ...controller.profile.deadzone, outer: Number(e.target.value) } })}
            />
          </label>

          <Toggle checked={controller.profile.invertY} onChange={(v) => setProfile({ invertY: v })} label={t('aimTrainer.controller.invertYLabel')} />

          <Toggle
            checked={controller.profile.dampenShooting.enabled}
            onChange={(v) => setProfile({ dampenShooting: { ...controller.profile.dampenShooting, enabled: v } })}
            label={t('aimTrainer.controller.dampenLabel')}
          />
          {controller.profile.dampenShooting.enabled && (
            <label className="ap-range">
              <span>
                <b>{t('aimTrainer.controller.dampenMultiplierLabel')}</b>
                <em>{controller.profile.dampenShooting.multiplier.toFixed(2)}</em>
              </span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                value={controller.profile.dampenShooting.multiplier}
                onChange={(e) => setProfile({ dampenShooting: { ...controller.profile.dampenShooting, multiplier: Number(e.target.value) } })}
              />
            </label>
          )}

          <Toggle
            checked={controller.vibration.enabled}
            onChange={(v) => setController({ vibration: { ...controller.vibration, enabled: v } })}
            label={t('aimTrainer.controller.vibrationLabel')}
          />
          {controller.vibration.enabled && (
            <label className="ap-range">
              <span>
                <b>{t('aimTrainer.controller.vibrationIntensityLabel')}</b>
                <em>{controller.vibration.intensity.toFixed(2)}</em>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={controller.vibration.intensity}
                onChange={(e) => setController({ vibration: { ...controller.vibration, intensity: Number(e.target.value) } })}
              />
            </label>
          )}

          <Toggle
            checked={controller.debugOverlay}
            onChange={(v) => setController({ debugOverlay: v })}
            label={t('aimTrainer.controller.debugLabel')}
            hint={t('aimTrainer.controller.debugHint')}
          />

          {onOpenCalibration && (
            <button type="button" className="ap-btn" onClick={onOpenCalibration}>
              <Icon icon={Gauge} size={15} /> {t('aimTrainer.controller.calibrateBtn')}
            </button>
          )}

          <h4 className="account-subsection-title">{t('aimTrainer.controller.share.title')}</h4>
          <div className="ap-fields">
            <button type="button" className="ap-btn ap-btn-ghost" onClick={copyControllerCode}>
              {t('aimTrainer.controller.share.export')}
            </button>
          </div>
          {shareCode && <textarea className="custom-config-select ap-share-code" readOnly value={shareCode} onFocus={(e) => e.target.select()} />}
          <div className="ap-fields">
            <input
              type="text"
              className="custom-config-select"
              placeholder={t('aimTrainer.controller.share.pastePlaceholder')}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button type="button" className="ap-btn ap-btn-ghost" onClick={importControllerCode} disabled={!importText.trim()}>
              {t('aimTrainer.controller.share.import')}
            </button>
          </div>
          {shareMsg && <p className="label">{shareMsg}</p>}
        </section>
      </div>

      <footer className="ap-foot">
        <button type="button" className="ap-btn ap-btn-ghost" onClick={onReset}>
          <Icon icon={RotateCcw} size={15} /> {t('aimTrainer.resetDefaults')}
        </button>
      </footer>
    </div>
  );
}
