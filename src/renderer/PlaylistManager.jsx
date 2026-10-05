import { useState } from 'react';
import { notifyAimDataChanged } from './aimSyncEvents.js';
import { useTranslation } from 'react-i18next';
import { Trash2, X, ArrowUp, ArrowDown } from 'lucide-react';
import Icon from './Icon.jsx';
import { isAgentPreset, loadPresets } from './CustomModeConfig.jsx';

// Playlists = suites de presets personnalisés enchaînés dans la même
// session (demande de plusieurs testeurs sur Discord, en plus des presets
// nommés eux-mêmes) — une liste ordonnée d'identifiants de presets, résolue
// en configs complètes seulement au moment de lancer (voir onLaunch), pour
// rester robuste si un preset référencé a été supprimé entre-temps.
const PLAYLISTS_STORAGE_KEY = 'mvptracker-aim-trainer-playlists';

export function loadPlaylists() {
  try {
    const raw = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePlaylists(playlists) {
  localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
  notifyAimDataChanged();
}

function PlaylistManager({ onClose, onLaunch }) {
  const { t } = useTranslation();
  // Favoris d'abord — même tri que dans CustomModeConfig.jsx, pour que les
  // presets qu'on utilise le plus reviennent en premier ici aussi. Les presets
  // à personnages en sont exclus : l'arène d'une session est construite une
  // seule fois, à la première étape, et ne peut pas changer en cours de route.
  const presets = [...loadPresets()]
    .filter((p) => !isAgentPreset(p))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  const [playlists, setPlaylists] = useState(loadPlaylists);
  const [view, setView] = useState('list');
  const [name, setName] = useState('');
  const [steps, setSteps] = useState([]); // ids de presets, dans l'ordre
  const [nameError, setNameError] = useState(false);

  const presetById = new Map(presets.map((p) => [p.id, p]));

  const startNewPlaylist = () => {
    setName('');
    setSteps([]);
    setNameError(false);
    setView('edit');
  };

  const addStep = (presetId) => setSteps((prev) => [...prev, presetId]);
  const removeStep = (index) => setSteps((prev) => prev.filter((_, i) => i !== index));
  const moveStep = (index, dir) => {
    setSteps((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const savePlaylist = () => {
    const trimmed = name.trim();
    if (!trimmed || steps.length === 0) {
      setNameError(true);
      return;
    }
    const playlist = { id: `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: trimmed, presetIds: steps };
    const next = [...playlists, playlist];
    setPlaylists(next);
    savePlaylists(next);
    setView('list');
  };

  const deletePlaylist = (id) => {
    const next = playlists.filter((p) => p.id !== id);
    setPlaylists(next);
    savePlaylists(next);
  };

  // Résout chaque identifiant en config complète au moment du lancement —
  // ignore silencieusement un preset entre-temps supprimé plutôt que de
  // planter, comme le reste de l'app avec l'API locale/HenrikDev.
  const launchPlaylist = (playlist) => {
    const resolved = playlist.presetIds.map((id) => presetById.get(id)).filter(Boolean);
    if (resolved.length === 0) return;
    onLaunch(resolved);
  };

  return (
    <div className="custom-config-overlay" onClick={onClose}>
      <div className="custom-config-card" onClick={(e) => e.stopPropagation()}>
        <h2>{t('aimTrainer.playlistsTitle')}</h2>

        {view === 'list' ? (
          <>
            <p className="label">{t('aimTrainer.playlistsIntro')}</p>

            {playlists.length === 0 ? (
              <p className="label">{t('aimTrainer.playlistsEmpty')}</p>
            ) : (
              <ul className="custom-preset-list">
                {playlists.map((playlist) => (
                  <li key={playlist.id} className="custom-preset-item">
                    <div className="custom-preset-info">
                      <strong>{playlist.name}</strong>
                      <span className="label">
                        {t('aimTrainer.playlistStepsCount', { count: playlist.presetIds.length })}
                      </span>
                    </div>
                    <div className="custom-preset-actions">
                      <button className="refresh" onClick={() => launchPlaylist(playlist)}>
                        {t('aimTrainer.playlistLaunch')}
                      </button>
                      <button
                        type="button"
                        className="strategy-tool icon-only danger"
                        title={t('aimTrainer.playlistDelete')}
                        onClick={() => deletePlaylist(playlist.id)}
                      >
                        <Icon icon={Trash2} size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {presets.length === 0 ? (
              <p className="label">{t('aimTrainer.playlistsNeedPresets')}</p>
            ) : (
              <div className="custom-config-actions">
                <button className="account-forgot-password" onClick={onClose}>
                  {t('aimTrainer.customCancel')}
                </button>
                <button className="refresh" onClick={startNewPlaylist}>
                  {t('aimTrainer.playlistNew')}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="label">{t('aimTrainer.playlistEditIntro')}</p>

            <label className="aim-config-block">
              <span className="label">{t('aimTrainer.playlistNameLabel')}</span>
              <input
                type="text"
                className="custom-config-select"
                value={name}
                maxLength={40}
                placeholder={t('aimTrainer.playlistNamePlaceholder')}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(false);
                }}
              />
            </label>

            <div className="aim-config-block">
              <span className="label">{t('aimTrainer.playlistAddStep')}</span>
              <div className="playlist-preset-picker">
                {presets.map((preset) => (
                  <button key={preset.id} type="button" className="playlist-preset-chip" onClick={() => addStep(preset.id)}>
                    + {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {steps.length > 0 && (
              <ul className="custom-preset-list">
                {steps.map((presetId, index) => {
                  const preset = presetById.get(presetId);
                  return (
                    <li key={`${presetId}-${index}`} className="custom-preset-item">
                      <div className="custom-preset-info">
                        <strong>
                          {index + 1}. {preset?.name ?? t('aimTrainer.playlistUnknownPreset')}
                        </strong>
                      </div>
                      <div className="custom-preset-actions">
                        <button
                          type="button"
                          className="strategy-tool icon-only"
                          disabled={index === 0}
                          onClick={() => moveStep(index, -1)}
                        >
                          <Icon icon={ArrowUp} size={14} />
                        </button>
                        <button
                          type="button"
                          className="strategy-tool icon-only"
                          disabled={index === steps.length - 1}
                          onClick={() => moveStep(index, 1)}
                        >
                          <Icon icon={ArrowDown} size={14} />
                        </button>
                        <button type="button" className="strategy-tool icon-only danger" onClick={() => removeStep(index)}>
                          <Icon icon={X} size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {nameError && <p className="warning">{t('aimTrainer.playlistSaveError')}</p>}

            <div className="custom-config-actions">
              <button className="account-forgot-password" onClick={() => setView('list')}>
                {t('aimTrainer.customCancel')}
              </button>
              <button className="refresh" onClick={savePlaylist}>
                {t('aimTrainer.customSave')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PlaylistManager;
