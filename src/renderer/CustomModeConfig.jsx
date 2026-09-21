import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Star, Play, Copy, Check, ClipboardPaste } from 'lucide-react';
import Icon from './Icon.jsx';
import { DEFAULT_CONFIG, MODES } from './AimTrainerGame.jsx';

// Code d'export/import d'un preset perso — juste les réglages qui comptent
// (pas l'id ni le favori, propres à l'appareil), encodés en base64 avec un
// préfixe reconnaissable pour rejeter d'emblée un texte collé qui n'en est
// pas un. Pas de backend : le code se partage à la main (Discord, etc.).
const PRESET_CODE_PREFIX = 'MVPAT1:';

function encodePresetCode(preset) {
  const payload = {
    name: preset.name,
    duration: preset.duration,
    targetSize: preset.targetSize,
    targetCount: preset.targetCount,
    spread: preset.spread,
    baseMode: preset.baseMode ?? 'flick',
  };
  return PRESET_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function decodePresetCode(code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PRESET_CODE_PREFIX)) return null;
  try {
    const json = decodeURIComponent(escape(atob(trimmed.slice(PRESET_CODE_PREFIX.length))));
    const data = JSON.parse(json);
    if (
      typeof data.duration !== 'number' ||
      typeof data.targetSize !== 'number' ||
      typeof data.targetCount !== 'number' ||
      typeof data.spread !== 'number'
    ) {
      return null;
    }
    return {
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 40) : 'Import',
      duration: data.duration,
      targetSize: data.targetSize,
      targetCount: data.targetCount,
      spread: data.spread,
      baseMode: typeof data.baseMode === 'string' && MODES[data.baseMode] ? data.baseMode : 'flick',
    };
  } catch {
    return null;
  }
}

const SETTINGS_STORAGE_KEY = 'mvptracker-aim-trainer-settings';
// Liste séparée des presets nommés — le réglage "actif" (SETTINGS_STORAGE_KEY,
// un seul objet) continue d'exister tel quel pour ne rien casser côté
// AimTrainer.jsx ; cette liste est juste une bibliothèque dans laquelle
// piocher, plutôt que de re-régler chaque paramètre à chaque fois (demande
// de plusieurs testeurs sur Discord).
const PRESETS_STORAGE_KEY = 'mvptracker-aim-trainer-custom-presets';

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// Exporté : PlaylistManager.jsx pioche dans la même bibliothèque de presets
// pour construire ses playlists — une seule source de vérité, pas de
// duplication de la logique de lecture.
export function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(presets) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

// Fenêtre modale (dans la même fenêtre que l'onglet, pas une fenêtre OS
// séparée) dédiée au mode Personnalisé : les 6 modes standards sont figés
// (mêmes réglages pour tout le monde, sinon le record général n'a aucun
// sens) — ce mode est le seul endroit où la difficulté reste libre.
//
// Deux vues : 'list' (les presets déjà sauvegardés, avec Charger/Supprimer)
// et 'edit' (les curseurs, pour en créer un nouveau). On ouvre direct sur
// 'edit' tant qu'aucun preset n'existe encore — pas la peine d'afficher une
// liste vide en premier.
function CustomModeConfig({ onClose, onSaved, onLaunch }) {
  const { t } = useTranslation();
  const stored = loadStoredConfig();
  const [presets, setPresets] = useState(loadPresets);
  const [view, setView] = useState(presets.length > 0 ? 'list' : 'edit');

  // Point de départ du formulaire : les valeurs du réglage perso déjà actif
  // si c'est celui-là (permet de sauvegarder sous un nom ce qu'on avait déjà
  // réglé avant l'ajout de cette fonctionnalité), sinon celles du mode Flick.
  const initial = stored.mode === 'custom' ? stored : { ...stored, ...MODES.flick.preset };
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(initial.duration);
  const [targetSize, setTargetSize] = useState(initial.targetSize);
  const [targetCount, setTargetCount] = useState(initial.targetCount);
  const [spread, setSpread] = useState(initial.spread);
  const [baseMode, setBaseMode] = useState(MODES[initial.baseMode] ? initial.baseMode : 'flick');
  const [nameError, setNameError] = useState(false);

  const applyBase = (id) => {
    const preset = MODES[id].preset;
    setBaseMode(id);
    setDuration(preset.duration);
    setTargetSize(preset.targetSize);
    setTargetCount(preset.targetCount);
    setSpread(preset.spread);
  };

  // Écrit dans le réglage ACTIF (celui que l'Aim Trainer lance réellement) et
  // ferme la fenêtre — que ce soit après avoir créé un nouveau preset ou juste
  // chargé un preset déjà existant.
  const activateAndClose = (values) => {
    const next = { ...stored, mode: 'custom', ...values };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    onSaved();
  };

  const loadPreset = (preset) => {
    activateAndClose({
      duration: preset.duration,
      targetSize: preset.targetSize,
      targetCount: preset.targetCount,
      spread: preset.spread,
      baseMode: preset.baseMode ?? 'flick',
    });
  };

  // Lance directement une SESSION avec ce preset — jusqu'ici, il fallait
  // construire une playlist d'une seule étape pour lancer un preset sans
  // repasser par le bouton "Jouer" général (demandé, trop de détours).
  const launchPreset = (preset) => {
    const values = {
      duration: preset.duration,
      targetSize: preset.targetSize,
      targetCount: preset.targetCount,
      spread: preset.spread,
      baseMode: preset.baseMode ?? 'flick',
    };
    const next = { ...stored, mode: 'custom', ...values };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    onLaunch({ mode: 'custom', ...values });
  };

  const deletePreset = (id) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    savePresets(next);
  };

  // Export : copie le code dans le presse-papiers, avec une confirmation
  // visuelle brève (icône coche) plutôt qu'un message qui s'incruste.
  const [copiedId, setCopiedId] = useState(null);
  const exportPreset = (preset) => {
    navigator.clipboard.writeText(encodePresetCode(preset)).then(() => {
      setCopiedId(preset.id);
      setTimeout(() => setCopiedId((id) => (id === preset.id ? null : id)), 1500);
    });
  };

  // Import : zone repliée par défaut (juste un bouton), dépliée avec un champ
  // texte au clic — le code se colle à la main, pas de sélecteur de fichier.
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState(false);
  const importPreset = () => {
    const decoded = decodePresetCode(importValue);
    if (!decoded) {
      setImportError(true);
      return;
    }
    const preset = { id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...decoded };
    const next = [...presets, preset];
    setPresets(next);
    savePresets(next);
    setImportValue('');
    setImportError(false);
    setImportOpen(false);
  };

  // Demandé sur Discord, aux côtés des presets nommés : pouvoir en épingler
  // certains en haut de la liste plutôt que de scroller parmi tous à chaque
  // fois. Tri stable (favoris d'abord, ordre de création préservé dans
  // chaque groupe) recalculé à l'affichage plutôt que réordonné en stockage,
  // pour ne jamais perdre l'ordre de création d'origine.
  const toggleFavorite = (id) => {
    const next = presets.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p));
    setPresets(next);
    savePresets(next);
  };

  const sortedPresets = [...presets].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));

  const startNewPreset = () => {
    setName('');
    applyBase('flick');
    setNameError(false);
    setView('edit');
  };

  // `launchAfter` : true quand on vient du bouton "Enregistrer et lancer"
  // plutôt que du simple "Enregistrer" — même preset créé dans les deux cas,
  // seule la suite change (fermer la fenêtre vs. démarrer la session).
  const savePreset = (launchAfter) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    const preset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      duration,
      targetSize,
      targetCount,
      spread,
      baseMode,
    };
    const next = [...presets, preset];
    setPresets(next);
    savePresets(next);
    const values = { duration, targetSize, targetCount, spread, baseMode };
    if (launchAfter) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...stored, mode: 'custom', ...values }));
      onLaunch({ mode: 'custom', ...values });
    } else {
      activateAndClose(values);
    }
  };

  return (
    <div className="custom-config-overlay" onClick={onClose}>
      <div className="custom-config-card" onClick={(e) => e.stopPropagation()}>
        <h2>{t('aimTrainer.customTitle')}</h2>

        {view === 'list' ? (
          <>
            <div className="custom-preset-header">
              <p className="label">{t('aimTrainer.presetsIntro')}</p>
              {!importOpen && (
                <button type="button" className="strategy-tool" onClick={() => setImportOpen(true)}>
                  <Icon icon={ClipboardPaste} size={14} /> {t('aimTrainer.presetImport')}
                </button>
              )}
            </div>

            {importOpen && (
              <div className="custom-preset-import">
                <input
                  type="text"
                  className="custom-config-select"
                  autoFocus
                  value={importValue}
                  placeholder={t('aimTrainer.presetImportPlaceholder')}
                  onChange={(e) => {
                    setImportValue(e.target.value);
                    if (importError) setImportError(false);
                  }}
                />
                {importError && <span className="warning">{t('aimTrainer.presetImportError')}</span>}
                <div className="custom-config-actions">
                  <button
                    className="account-forgot-password"
                    onClick={() => {
                      setImportOpen(false);
                      setImportValue('');
                      setImportError(false);
                    }}
                  >
                    {t('aimTrainer.customCancel')}
                  </button>
                  <button className="refresh" onClick={importPreset}>
                    {t('aimTrainer.presetImportConfirm')}
                  </button>
                </div>
              </div>
            )}

            <ul className="custom-preset-list">
              {sortedPresets.map((preset) => (
                <li key={preset.id} className="custom-preset-item">
                  <button
                    type="button"
                    className={preset.favorite ? 'preset-favorite-btn active' : 'preset-favorite-btn'}
                    title={t(preset.favorite ? 'aimTrainer.presetUnfavorite' : 'aimTrainer.presetFavorite')}
                    onClick={() => toggleFavorite(preset.id)}
                  >
                    <Icon icon={Star} size={16} fill={preset.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <div className="custom-preset-info">
                    <strong>{preset.name}</strong>
                    <span className="label">
                      {t(MODES[preset.baseMode ?? 'flick']?.labelKey ?? MODES.flick.labelKey)} · {t('aimTrainer.presetSummary', {
                        seconds: preset.duration,
                        count: preset.targetCount,
                        size: preset.targetSize.toFixed(2),
                        deg: preset.spread,
                      })}
                    </span>
                  </div>
                  <div className="custom-preset-actions">
                    <button className="refresh aim-preset-launch-btn" onClick={() => launchPreset(preset)}>
                      <Icon icon={Play} size={14} /> {t('aimTrainer.playlistLaunch')}
                    </button>
                    <button className="account-forgot-password" onClick={() => loadPreset(preset)}>
                      {t('aimTrainer.presetLoad')}
                    </button>
                    <button
                      type="button"
                      className="strategy-tool icon-only"
                      title={t('aimTrainer.presetExport')}
                      onClick={() => exportPreset(preset)}
                    >
                      <Icon icon={copiedId === preset.id ? Check : Copy} size={16} />
                    </button>
                    <button
                      type="button"
                      className="strategy-tool icon-only danger"
                      title={t('aimTrainer.presetDelete')}
                      onClick={() => deletePreset(preset.id)}
                    >
                      <Icon icon={Trash2} size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="custom-config-actions">
              <button className="account-forgot-password" onClick={onClose}>
                {t('aimTrainer.customCancel')}
              </button>
              <button className="refresh" onClick={startNewPreset}>
                {t('aimTrainer.presetNew')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="label">{t('aimTrainer.customIntro')}</p>

            <label className="aim-config-block">
              <span className="label">{t('aimTrainer.presetNameLabel')}</span>
              <input
                type="text"
                className="custom-config-select"
                value={name}
                maxLength={40}
                placeholder={t('aimTrainer.presetNamePlaceholder')}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(false);
                }}
              />
              {nameError && <span className="warning">{t('aimTrainer.presetNameRequired')}</span>}
            </label>

            <label className="aim-config-block">
              <span className="label">{t('aimTrainer.customBase')}</span>
              <select className="custom-config-select" value={baseMode} onChange={(e) => applyBase(e.target.value)}>
                {Object.entries(MODES).map(([id, mode]) => (
                  <option key={id} value={id}>
                    {t(mode.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            <label className="aim-config-range">
              <span className="label">{t('aimTrainer.durationLabel', { seconds: duration })}</span>
              <input type="range" min="10" max="120" step="5" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </label>

            <label className="aim-config-range">
              <span className="label">{t('aimTrainer.targetSizeLabel', { size: targetSize.toFixed(2) })}</span>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.01"
                value={targetSize}
                onChange={(e) => setTargetSize(Number(e.target.value))}
              />
            </label>

            <label className="aim-config-range">
              <span className="label">{t('aimTrainer.targetCountLabel', { count: targetCount })}</span>
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
              />
            </label>

            <label className="aim-config-range">
              <span className="label">{t('aimTrainer.spreadLabel', { deg: spread })}</span>
              <input type="range" min="8" max="45" step="1" value={spread} onChange={(e) => setSpread(Number(e.target.value))} />
            </label>

            <div className="custom-config-actions">
              <button className="account-forgot-password" onClick={() => (presets.length > 0 ? setView('list') : onClose())}>
                {t('aimTrainer.customCancel')}
              </button>
              <button className="refresh" onClick={() => savePreset(false)}>
                {t('aimTrainer.customSave')}
              </button>
              <button className="refresh aim-preset-launch-btn" onClick={() => savePreset(true)}>
                <Icon icon={Play} size={14} /> {t('aimTrainer.customSaveLaunch')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CustomModeConfig;
