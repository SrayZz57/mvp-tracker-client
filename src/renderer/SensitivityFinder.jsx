import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react';
import Icon from './Icon.jsx';
import { MODES } from './aimTrainerModes.js';

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

function SensitivityFinder({ dpi, sens, onClose, onLaunch }) {
  const { t } = useTranslation();
  const [baseMode, setBaseMode] = useState('gridshot');

  return (
    <div className="custom-config-overlay" onClick={onClose}>
      <div className="custom-config-card" onClick={(e) => e.stopPropagation()}>
        <h2>
          <Icon icon={Gauge} size={20} /> {t('aimTrainer.finderTitle')}
        </h2>
        <p className="label">{t('aimTrainer.finderIntro', { count: MULTIPLIERS.length, duration: FINDER_DURATION })}</p>
        <p className="label">{t('aimTrainer.finderCurrentSens', { sens, dpi })}</p>

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
            steps: MULTIPLIERS.map((m) => Math.round(sens * m * 1000) / 1000).join(' · '),
          })}
        </p>

        <div className="account-settings-actions">
          <button className="sidebar-signout account-signout" onClick={onClose}>
            {t('detail.close')}
          </button>
          <button className="refresh aim-game-cta" onClick={() => onLaunch(shuffled(buildFinderSteps(baseMode, sens)))}>
            {t('aimTrainer.finderStart')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SensitivityFinder;
