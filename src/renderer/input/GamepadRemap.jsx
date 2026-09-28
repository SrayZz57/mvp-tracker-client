import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { X } from 'lucide-react';
import { GamepadInput, STANDARD_BUTTON_NAMES } from './GamepadInput.js';
import { BINDABLE_BUTTONS } from './controllerProfiles.js';
import { buttonLabel, detectControllerBrand } from './controllerBrand.js';
import GamepadDiagram from './GamepadDiagram.jsx';
import './gamepadDiagram.css';

const ACTIONS = ['fire', 'ads', 'pause'];
const ACTION_COLORS = { fire: '#ff4655', ads: '#4ec9f5', pause: '#ffe066' };

// Réassignation des boutons manette (tir/visée/pause) — "appuie sur un
// bouton" plutôt qu'un menu déroulant : plus direct sur une manette, et ça
// vérifie du même coup que le bouton choisi répond bien. Pas de dépendance
// à la boucle de jeu (AimTrainerGame.jsx) : une petite GamepadInput à elle
// pour écouter le prochain appui, détruite dès qu'on quitte l'écoute.
export default function GamepadRemap({ bindings, onChange, activePad }) {
  const { t } = useTranslation();
  const [listeningFor, setListeningFor] = useState(null);
  const brand = detectControllerBrand(activePad?.id ?? '');

  useEffect(() => {
    if (!listeningFor) return undefined;
    const gamepad = new GamepadInput();
    let frame;
    let prevPressed = new Set();
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const state = gamepad.poll();
      if (!state) return;
      for (const name of BINDABLE_BUTTONS) {
        const idx = STANDARD_BUTTON_NAMES.indexOf(name);
        const value = name === 'L2' ? state.l2 : name === 'R2' ? state.r2 : (state.buttons[idx]?.value ?? 0);
        const pressed = value > 0.5;
        if (pressed && !prevPressed.has(name)) {
          onChange({ ...bindings, [listeningFor]: name });
          setListeningFor(null);
        }
        if (pressed) prevPressed.add(name);
        else prevPressed.delete(name);
      }
    };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      gamepad.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeningFor]);

  const highlight = {};
  for (const action of ACTIONS) {
    if (bindings[action]) highlight[bindings[action]] = ACTION_COLORS[action];
  }

  return (
    <div className="gp-remap">
      <GamepadDiagram brand={brand} highlight={highlight} />
      {ACTIONS.map((action) => (
        <div key={action} className="gp-remap-row">
          <span>{t(`aimTrainer.controller.bindings.${action}`)}</span>
          {listeningFor === action ? (
            <span className="gp-remap-current gp-remap-listening">
              {t('aimTrainer.controller.bindings.listening')}
              <button type="button" className="strategy-tool icon-only" onClick={() => setListeningFor(null)} title={t('aimTrainer.customCancel')}>
                <Icon icon={X} size={12} />
              </button>
            </span>
          ) : (
            <button type="button" className="gp-remap-current" onClick={() => setListeningFor(action)} style={{ borderColor: ACTION_COLORS[action] }}>
              {buttonLabel(brand, bindings[action])}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
