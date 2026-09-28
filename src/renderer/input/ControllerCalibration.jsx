import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import Icon from '../Icon.jsx';
import { InputManager, AIM_MODE } from './InputManager.js';
import { ROTATION_SCALE_LIMITS } from './controllerProfiles.js';
import '../aimPages.css';
import './inputDebug.css';

// "VALORANT Controller Calibration" : mesure la vitesse de rotation réelle
// obtenue avec le profil ACTUEL (mêmes sensibilité/courbe/deadzone que la
// partie, voir `profile`), pour caler `rotationScale` au ressenti souhaité —
// PAS pour reproduire une formule Riot (non documentée publiquement), juste
// pour ajuster notre propre facteur de calibration interne (voir
// controllerProfiles.js). Le calcul (stick → deadzone → courbe → sensibilité
// → rotationScale) est le même AimEngine que celui utilisé en jeu : ce qui
// est mesuré ici est exactement ce qui sera ressenti en partie.
export default function ControllerCalibration({ t, config, set, onClose }) {
  const controller = config.controller;
  const liveRef = useRef({ magnitude: null, speed: null, full360: null, stickDot: null });
  const [captures, setCaptures] = useState({ 100: null, 50: null, 25: null });
  const [connected, setConnected] = useState(false);
  const [rotationScale, setRotationScale] = useState(controller.rotationScale);

  useEffect(() => {
    const manager = new InputManager(controller.profile, rotationScale);
    manager.setMode(AIM_MODE.BASE);
    let frame;
    let last = performance.now();
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.max(1, now - last) / 1000;
      last = now;
      manager.setRotationScale(rotationScale);
      const { connected: isConnected, gamepadState, result } = manager.pollGamepadFrame(dt);
      setConnected(isConnected);
      if (!isConnected || !result) return;
      const magnitudePct = Math.hypot(gamepadState.rightStick.x, gamepadState.rightStick.y) * 100;
      const speedPerSec = Math.hypot(result.yaw, result.pitch) / dt;
      if (liveRef.current.magnitude) liveRef.current.magnitude.textContent = `${magnitudePct.toFixed(0)}%`;
      if (liveRef.current.speed) liveRef.current.speed.textContent = `${speedPerSec.toFixed(1)}°/s`;
      if (liveRef.current.full360) liveRef.current.full360.textContent = speedPerSec > 1 ? `${(360 / speedPerSec).toFixed(2)}s` : '—';
      if (liveRef.current.stickDot) {
        liveRef.current.stickDot.style.transform = `translate(${gamepadState.rightStick.x * 23}px, ${gamepadState.rightStick.y * 23}px)`;
      }
      liveRef.current.lastMagnitudePct = magnitudePct;
      liveRef.current.lastSpeed = speedPerSec;
    };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      manager.destroy();
    };
    // rotationScale lu dans la boucle via la closure — se remet à jour au
    // prochain changement du curseur, pas besoin de relancer l'effet entier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller.profile]);

  const capture = (tier) => {
    setCaptures((prev) => ({ ...prev, [tier]: liveRef.current.lastSpeed ?? null }));
  };

  const saveRotationScale = () => {
    set({ controller: { ...controller, rotationScale } });
    onClose();
  };

  return (
    <div className="ap-screen">
      <header className="ap-head">
        <button type="button" className="ap-btn ap-btn-ghost" onClick={onClose} style={{ marginBottom: '0.8rem' }}>
          <Icon icon={ArrowLeft} size={15} /> {t('aimTrainer.controller.calibration.back')}
        </button>
        <span className="ap-eyebrow">{t('aimTrainer.controller.title')}</span>
        <h2>{t('aimTrainer.controller.calibration.title')}</h2>
        <p>{t('aimTrainer.controller.calibration.intro')}</p>
        <p>{t('aimTrainer.controller.calibration.compareHint')}</p>
      </header>

      <div className="ap-settings">
        <section className="ap-card">
          <div className={connected ? 'ap-controller-status connected' : 'ap-controller-status'}>
            <Icon icon={Gamepad2} size={16} />
            <span>{connected ? t('aimTrainer.controller.calibration.connected') : t('aimTrainer.controller.noneConnected')}</span>
          </div>

          <div className="idbg-stick-box" style={{ margin: '1rem auto' }}>
            <div className="idbg-stick-outer">
              <div
                className="idbg-stick-dot"
                ref={(el) => {
                  liveRef.current.stickDot = el;
                }}
              />
            </div>
            <small>{t('aimTrainer.controller.calibration.stickHint')}</small>
          </div>

          <div className="ap-readouts">
            <span>
              <b ref={(el) => { liveRef.current.magnitude = el; }}>—</b>
              <small>{t('aimTrainer.controller.calibration.stickInput')}</small>
            </span>
            <span>
              <b ref={(el) => { liveRef.current.speed = el; }}>—</b>
              <small>{t('aimTrainer.controller.calibration.rotationSpeed')}</small>
            </span>
            <span>
              <b ref={(el) => { liveRef.current.full360 = el; }}>—</b>
              <small>{t('aimTrainer.controller.calibration.full360')}</small>
            </span>
          </div>
          <p className="label">{t('aimTrainer.controller.calibration.full360Hint')}</p>

          <label className="ap-range">
            <span>
              <b>{t('aimTrainer.controller.calibration.rotationScaleLabel')}</b>
              <em>{rotationScale.toFixed(0)}</em>
            </span>
            <input
              type="range"
              min={ROTATION_SCALE_LIMITS.min}
              max={ROTATION_SCALE_LIMITS.max}
              step="1"
              value={rotationScale}
              onChange={(e) => setRotationScale(Number(e.target.value))}
            />
          </label>
          <p className="label">{t('aimTrainer.controller.calibration.rotationScaleHint')}</p>

          <button type="button" className="ap-btn" onClick={saveRotationScale}>
            {t('aimTrainer.controller.calibration.save')}
          </button>
        </section>

        <section className="ap-card">
          <h3>{t('aimTrainer.controller.calibration.captureTitle')}</h3>
          <p className="label">{t('aimTrainer.controller.calibration.captureHint')}</p>
          <div className="ap-readouts">
            {[100, 50, 25].map((tier) => (
              <span key={tier}>
                <b>
                  {captures[tier] === null
                    ? '—'
                    : `${captures[tier].toFixed(1)}°/s${captures[tier] > 1 ? ` · ${(360 / captures[tier]).toFixed(2)}s/360°` : ''}`}
                </b>
                <small>{t('aimTrainer.controller.calibration.stickAt', { pct: tier })}</small>
              </span>
            ))}
          </div>
          <div className="custom-config-actions">
            {[100, 50, 25].map((tier) => (
              <button key={tier} type="button" className="ap-btn ap-btn-ghost" onClick={() => capture(tier)} disabled={!connected}>
                {t('aimTrainer.controller.calibration.captureBtn', { pct: tier })}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
