import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Icon from './Icon.jsx';
import { excludeDeathmatch } from './valorantStats.js';
import previewImg from '../assets/daily-overlay-preview.png';

// Modale DANS l'app principale (pas une fenêtre séparée — demandé
// explicitement après une première version en fenêtre à part) : même
// pattern que SkinDetailModal.jsx (.modal-overlay/.modal-card). Affichée une
// fois automatiquement au premier lancement après l'ajout de l'overlay (voir
// App.jsx), et à la demande depuis Mon compte ensuite.
//
// Les modes sans vraie victoire/défaite (Deathmatch, Escalade, parties
// perso...) sont TOUJOURS exclus, pas configurable ici — cette liste ne
// montre que les modes restants, pour en exclure d'autres en plus si
// l'utilisateur le souhaite (ex. Spike Rush).
function DailyOverlaySettings({ matches, onClose }) {
  const { t } = useTranslation();
  const [excluded, setExcluded] = useState(new Set());

  useEffect(() => {
    window.electronAPI.getDailyOverlayExcludedModes().then((ids) => setExcluded(new Set(ids)));
  }, []);

  const availableModes = useMemo(() => {
    const modes = new Map();
    excludeDeathmatch(matches ?? []).forEach((m) => {
      if (m.metadata?.mode_id) modes.set(m.metadata.mode_id, m.metadata.mode ?? m.metadata.mode_id);
    });
    return [...modes.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [matches]);

  function toggleMode(modeId) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(modeId)) next.delete(modeId);
      else next.add(modeId);
      return next;
    });
  }

  function handleSave() {
    window.electronAPI.setDailyOverlayExcludedModes([...excluded]);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card daily-settings-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title={t('dailyOverlaySettings.close')}>
          <Icon icon={X} size={16} />
        </button>

        <img src={previewImg} alt="" className="daily-settings-preview" />

        <h2 className="daily-settings-title">{t('dailyOverlaySettings.title')}</h2>
        <p className="daily-settings-text">{t('dailyOverlaySettings.intro')}</p>
        <p className="daily-settings-text label">{t('dailyOverlaySettings.autoExcludeNote')}</p>

        <div className="daily-settings-modes">
          {availableModes.length === 0 ? (
            <p className="label">{t('dailyOverlaySettings.noModesYet')}</p>
          ) : (
            availableModes.map(([id, label]) => (
              <label key={id} className="daily-settings-mode-row">
                <input type="checkbox" checked={excluded.has(id)} onChange={() => toggleMode(id)} />
                <span>{label}</span>
              </label>
            ))
          )}
        </div>

        <button type="button" className="daily-settings-save" onClick={handleSave}>
          {t('dailyOverlaySettings.save')}
        </button>
      </div>
    </div>
  );
}

export default DailyOverlaySettings;
