import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { acceleratorFromEvent } from './overlayHotkey.js';

// Une ligne « raccourci » des réglages, pour UN overlay (`overlayId` : 'ranks' ou
// 'buy', voir OVERLAY_HOTKEYS dans main.js). Chaque overlay a son propre raccourci
// global : une pression l'affiche, la suivante le retire. Pendant la saisie, on capte
// la prochaine combinaison au clavier ; le processus principal refuse un raccourci
// déjà pris (par une autre application, ou par l'autre overlay) et garde l'ancien.
function OverlayHotkeyRow({ overlayId, label, hint }) {
  const { t } = useTranslation();
  const [hotkey, setHotkey] = useState({ accelerator: '', defaultAccelerator: '' });
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.electronAPI.getOverlayHotkey(overlayId).then(setHotkey);
  }, [overlayId]);

  // '' désactive le raccourci.
  const save = async (accelerator) => {
    const result = await window.electronAPI.setOverlayHotkey(overlayId, accelerator);
    if (result.ok) {
      setHotkey((prev) => ({ ...prev, accelerator }));
      setError(null);
    } else {
      setError(result.error);
    }
  };

  useEffect(() => {
    if (!listening) return undefined;
    const onKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const result = acceleratorFromEvent(e);
      if (result.status === 'partial') return;
      setListening(false);
      if (result.status === 'cancel') return;
      if (result.status === 'invalid') {
        setError('invalid');
        return;
      }
      save(result.status === 'clear' ? '' : result.accelerator);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        <p className="settings-row-hint">{hint}</p>
        {error && <p className="settings-row-hint overlay-hotkey-error">{t(`account.dailyOverlayHotkeyErrors.${error}`)}</p>}
      </div>
      <div className="overlay-hotkey-controls">
        <button
          type="button"
          className={listening ? 'overlay-hotkey-btn listening' : 'overlay-hotkey-btn'}
          onClick={() => {
            setError(null);
            setListening((value) => !value);
          }}
        >
          {listening ? t('account.dailyOverlayHotkeyPress') : hotkey.accelerator || t('account.dailyOverlayHotkeyNone')}
        </button>
        {hotkey.accelerator !== hotkey.defaultAccelerator && (
          <button type="button" className="account-forgot-password" onClick={() => save(hotkey.defaultAccelerator)}>
            {t('account.dailyOverlayHotkeyReset')}
          </button>
        )}
      </div>
    </div>
  );
}

export default OverlayHotkeyRow;
