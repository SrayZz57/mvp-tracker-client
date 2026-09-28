import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge, Gamepad2, MousePointer2 } from 'lucide-react';
import Icon from './Icon.jsx';
import { MODES } from './aimTrainerModes.js';
import { AIM_MODE } from './input/controllerProfiles.js';
import { useConnectedGamepads } from './input/useConnectedGamepads.js';

// Modes statiques uniquement (comme les routines PlaylistManager) — le but
// est de comparer la précision pure à différentes sensibilités, pas de tester
// le tracking, où le mouvement de la cible introduit une autre variable.
const FINDER_MODES = ['flick', 'gridshot'];
const FINDER_DURATION = 20;
// Autour de la sensibilité actuelle plutôt que des valeurs absolues — reste
// pertinent quel que soit le DPI/sens de départ de la personne. Plage assez
// large (±40%) et assez de points pour qu'une régression quadratique sur les
// résultats (voir fitSuggestedSens dans AimTrainerHub.jsx) ait de quoi
// dessiner une vraie courbe plutôt que de se caler sur 3-4 points épars.
const MULTIPLIERS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];

function buildFinderSteps(baseMode, sens) {
  const preset = MODES[baseMode].preset;
  return MULTIPLIERS.map((mult) => ({
    name: `×${mult}`,
    duration: FINDER_DURATION,
    targetSize: preset.targetSize,
    targetCount: preset.targetCount,
    spread: preset.spread,
    sens: Math.round(sens * mult * 1000) / 1000,
  }));
}

// Même principe pour la manette : on fait varier la sensibilité BASE (voir
// AIM_MODE dans controllerProfiles.js — c'est le mode utilisé par Flick et
// Gridshot, aucun des deux ne scope/vise), horizontale et verticale
// ensemble, dans les mêmes proportions. `controllerSensMult` est repris par
// AimTrainerGame.jsx pour ne modifier QUE le mode BASE de la session, sans
// toucher au reste du profil (deadzone, courbe, autres modes...).
function buildControllerFinderSteps(baseMode, controllerBaseSens) {
  const preset = MODES[baseMode].preset;
  return MULTIPLIERS.map((mult) => ({
    name: `×${mult}`,
    duration: FINDER_DURATION,
    targetSize: preset.targetSize,
    targetCount: preset.targetCount,
    spread: preset.spread,
    controllerSensMult: mult,
    // Juste pour l'aperçu affiché ci-dessous (voir le rendu plus bas) — la
    // vraie valeur appliquée est recalculée dans AimTrainerGame.jsx à partir
    // du profil réel au moment du lancement, pas figée ici.
    previewSens: Math.round(controllerBaseSens * mult * 1000) / 1000,
  }));
}

// Ordre aléatoire des essais (Fisher-Yates) : en partant toujours de la plus
// basse, l'échauffement, la fatigue et la mémoire musculaire d'un essai à
// l'autre se répercutaient toujours sur les mêmes sensibilités et faussaient
// la courbe. Mélangé, ces effets se répartissent au hasard au lieu de
// pénaliser (ou avantager) systématiquement une extrémité.
function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function SensitivityFinder({ dpi, sens, controller, onClose, onLaunch }) {
  const { t } = useTranslation();
  const [baseMode, setBaseMode] = useState('gridshot');
  const pads = useConnectedGamepads();
  const hasGamepad = pads.length > 0;
  const [inputMode, setInputMode] = useState('mouse');
  // Si la manette est débranchée entre-temps, retombe sur souris plutôt que
  // de rester bloqué sur un mode qu'on ne peut plus lancer.
  const effectiveInputMode = inputMode === 'controller' && !hasGamepad ? 'mouse' : inputMode;
  const controllerBaseSens = controller?.profile?.modes?.[AIM_MODE.BASE]?.sensX ?? 0;

  const stepsPreview =
    effectiveInputMode === 'controller'
      ? buildControllerFinderSteps(baseMode, controllerBaseSens)
      : buildFinderSteps(baseMode, sens);

  const start = () => {
    const steps =
      effectiveInputMode === 'controller' ? buildControllerFinderSteps(baseMode, controllerBaseSens) : buildFinderSteps(baseMode, sens);
    onLaunch(shuffled(steps), effectiveInputMode);
  };

  return (
    <div className="custom-config-overlay" onClick={onClose}>
      <div className="custom-config-card" onClick={(e) => e.stopPropagation()}>
        <h2>
          <Icon icon={Gauge} size={20} /> {t('aimTrainer.finderTitle')}
        </h2>
        <p className="label">{t('aimTrainer.finderIntro', { count: MULTIPLIERS.length, duration: FINDER_DURATION })}</p>

        <h4 className="account-subsection-title">{t('aimTrainer.finderInputLabel')}</h4>
        <div className="account-role-picker">
          <button
            className={effectiveInputMode === 'mouse' ? 'account-role-option active' : 'account-role-option'}
            onClick={() => setInputMode('mouse')}
          >
            <Icon icon={MousePointer2} size={16} />
            <span>{t('aimTrainer.finderInputMouse')}</span>
          </button>
          <button
            className={effectiveInputMode === 'controller' ? 'account-role-option active' : 'account-role-option'}
            disabled={!hasGamepad}
            title={hasGamepad ? undefined : t('aimTrainer.controller.noneConnected')}
            onClick={() => setInputMode('controller')}
          >
            <Icon icon={Gamepad2} size={16} />
            <span>{t('aimTrainer.finderInputController')}</span>
          </button>
        </div>

        <p className="label">
          {effectiveInputMode === 'controller'
            ? t('aimTrainer.finderCurrentSensController', { sens: controllerBaseSens })
            : t('aimTrainer.finderCurrentSens', { sens, dpi })}
        </p>

        <h4 className="account-subsection-title">{t('aimTrainer.finderModeLabel')}</h4>
        <div className="account-role-picker">
          {FINDER_MODES.map((modeId) => (
            <button
              key={modeId}
              className={baseMode === modeId ? 'account-role-option active' : 'account-role-option'}
              onClick={() => setBaseMode(modeId)}
            >
              <Icon icon={MODES[modeId].icon} size={16} style={{ color: MODES[modeId].accent }} />
              <span>{t(MODES[modeId].labelKey)}</span>
            </button>
          ))}
        </div>

        <p className="label aim-game-tip">
          {t('aimTrainer.finderStepsPreview', {
            steps: stepsPreview.map((s) => s.previewSens ?? s.sens).join(' · '),
          })}
        </p>

        <div className="account-settings-actions">
          <button className="sidebar-signout account-signout" onClick={onClose}>
            {t('detail.close')}
          </button>
          <button className="refresh aim-game-cta" onClick={start}>
            {t('aimTrainer.finderStart')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SensitivityFinder;
