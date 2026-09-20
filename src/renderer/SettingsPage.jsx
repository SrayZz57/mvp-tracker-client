import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Check, X } from 'lucide-react';
import Icon from './Icon.jsx';
import { supabase } from './supabaseClient.js';
import CollapsibleCard from './CollapsibleCard.jsx';
import { useE2EE } from './E2EEContext.jsx';
import { isPerfLiteEnabled, setPerfLite } from './perfMode.js';

// Une ligne de réglage à bascule : étiquette + description à gauche (sur une
// largeur raisonnable, pas étirées sur toute la carte), switch aligné à
// droite sur la même ligne — remplace le pattern précédent (étiquette seule
// dans une ligne flex space-between, description dans un <p> séparé juste en
// dessous) qui s'étirait mal sur une carte pleine largeur.
function SettingsToggleRow({ label, hint, checked, onChange, extra }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {hint && <p className="settings-row-hint">{hint}</p>}
        {extra}
      </div>
      <label className={`switch ${checked ? 'on' : ''}`}>
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="switch-track">
          <span className="switch-thumb" />
        </span>
      </label>
    </div>
  );
}

// Anciennement une section de AccountPage.jsx ("Compte", regroupée avec le
// profil joueur) — sortie en page à part sur demande utilisateur : les
// réglages (overlay, auto-lancement, clé API...) étaient noyés dans "Mon
// compte" et peu visibles.
function SettingsPage({ mySettings, email, apiKey, onUpdateApiKey, onUpdateRiotId, onSignOut, onReplayOnboarding, onOpenDailyOverlaySettings }) {
  const { t } = useTranslation();
  const { unlockForUser } = useE2EE();
  const [resetStatus, setResetStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(apiKey ?? '');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(true);
  const [tiltNotificationsEnabled, setTiltNotificationsEnabled] = useState(true);
  const [perfLiteEnabled, setPerfLiteEnabled] = useState(isPerfLiteEnabled);
  const [dailyOverlayEnabled, setDailyOverlayEnabled] = useState(true);
  const [dailyOverlaySize, setDailyOverlaySize] = useState(100);
  const [dailyOverlayMoving, setDailyOverlayMoving] = useState(false);
  // Resynchro du Riot ID lié — pour les joueurs qui ont changé de pseudo EN
  // JEU après avoir lié leur compte (le tracker reste bloqué sur l'ancien nom
  // tant qu'on ne le met pas à jour ici, voir onUpdateRiotId dans App.jsx).
  const [editingRiotId, setEditingRiotId] = useState(false);
  const [riotNameDraft, setRiotNameDraft] = useState(mySettings.name ?? '');
  const [riotTagDraft, setRiotTagDraft] = useState(mySettings.tag ?? '');
  const [savingRiotId, setSavingRiotId] = useState(false);
  const [riotIdError, setRiotIdError] = useState(null);

  useEffect(() => {
    window.electronAPI.getAutoLaunch().then(setAutoLaunchEnabled);
    window.electronAPI.getTiltNotificationsEnabled().then(setTiltNotificationsEnabled);
    window.electronAPI.getDailyOverlayEnabled().then(setDailyOverlayEnabled);
    window.electronAPI.getDailyOverlaySize().then(setDailyOverlaySize);
    window.electronAPI.getDailyOverlayDragMode().then(setDailyOverlayMoving);
  }, []);

  // Quitter Réglages (donc démonter ce composant) pendant que le mode
  // déplacement est actif ne doit pas le laisser allumé indéfiniment côté
  // main.js — pas de bouton "valider" séparé, on verrouille simplement à la
  // sortie de l'écran si l'utilisateur ne l'a pas fait lui-même.
  useEffect(() => () => {
    if (dailyOverlayMoving) window.electronAPI.setDailyOverlayDragMode(false);
  }, [dailyOverlayMoving]);

  const handleToggleAutoLaunch = () => {
    const next = !autoLaunchEnabled;
    setAutoLaunchEnabled(next);
    window.electronAPI.setAutoLaunch(next);
  };

  const handleTogglePerfLite = () => {
    const next = !perfLiteEnabled;
    setPerfLiteEnabled(next);
    setPerfLite(next);
  };

  const handleToggleTiltNotifications = () => {
    const next = !tiltNotificationsEnabled;
    setTiltNotificationsEnabled(next);
    window.electronAPI.setTiltNotificationsEnabled(next);
  };

  const handleToggleDailyOverlay = () => {
    const next = !dailyOverlayEnabled;
    setDailyOverlayEnabled(next);
    window.electronAPI.setDailyOverlayEnabled(next);
  };

  const handleDailyOverlaySizeChange = (e) => {
    const next = Number(e.target.value);
    setDailyOverlaySize(next);
    window.electronAPI.setDailyOverlaySize(next);
  };

  const handleToggleDailyOverlayMoving = () => {
    const next = !dailyOverlayMoving;
    setDailyOverlayMoving(next);
    window.electronAPI.setDailyOverlayDragMode(next);
  };

  const handleForgotPassword = async () => {
    if (!email) return;
    setResetStatus('sending');
    setResetError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'mvptracker://reset-password',
    });
    setResetStatus(error ? 'error' : 'sent');
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setResetError(null);
    if (newPassword !== confirmPassword) {
      setResetError(t('auth.passwordMismatch'));
      return;
    }
    setResettingPassword(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: resetCode.trim(),
      type: 'recovery',
    });
    if (verifyError) {
      setResettingPassword(false);
      setResetError(verifyError.message);
      return;
    }
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setResettingPassword(false);
    if (updateError) {
      setResetError(updateError.message);
      return;
    }
    // Le nouveau mot de passe vient d'être posé côté Supabase à l'instant —
    // sûr de régénérer la clé de messagerie (l'ancienne, enveloppée avec
    // l'ancien mot de passe, est désormais irrécupérable).
    if (updateData.user) unlockForUser(updateData.user.id, newPassword);
    setResetStatus(null);
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSaveApiKey = async () => {
    setSavingApiKey(true);
    await onUpdateApiKey(apiKeyDraft);
    setSavingApiKey(false);
    setEditingApiKey(false);
  };

  const handleSaveRiotId = async () => {
    setSavingRiotId(true);
    setRiotIdError(null);
    try {
      await onUpdateRiotId(riotNameDraft, riotTagDraft);
      setEditingRiotId(false);
    } catch (err) {
      setRiotIdError(err.message);
    } finally {
      setSavingRiotId(false);
    }
  };

  return (
    <div className="settings-page">
      <CollapsibleCard id="settings.account" title={t('account.settingsAccountTitle')}>
        <p className="label">{t('account.settingsHint')}</p>
        {email && (
          <div className="settings-row settings-row-static">
            <span className="settings-row-label">{t('account.emailLabel')}</span>
            <span className="settings-row-value">{email}</span>
          </div>
        )}
        <div className="settings-row settings-row-static">
          <span className="settings-row-label">{t('account.riotIdLabel')}</span>
          {editingRiotId ? (
            <div className="account-name-edit-row">
              <input
                type="text"
                value={riotNameDraft}
                onChange={(e) => setRiotNameDraft(e.target.value)}
                placeholder={t('linkRiot.usernamePlaceholder')}
                autoFocus
              />
              <span className="search-bar-hash">#</span>
              <input
                type="text"
                value={riotTagDraft}
                onChange={(e) => setRiotTagDraft(e.target.value)}
                placeholder={t('linkRiot.tagPlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveRiotId()}
              />
              <button onClick={handleSaveRiotId} disabled={savingRiotId}>
                {savingRiotId ? "..." : <Icon icon={Check} size={16} />}
              </button>
              <button
                className="account-name-cancel"
                onClick={() => {
                  setRiotNameDraft(mySettings.name ?? '');
                  setRiotTagDraft(mySettings.tag ?? '');
                  setRiotIdError(null);
                  setEditingRiotId(false);
                }}
              >
                <Icon icon={X} size={16} />
              </button>
            </div>
          ) : (
            <span className="account-name-display" onClick={() => setEditingRiotId(true)} title={t('account.clickToEdit')}>
              {mySettings.name}#{mySettings.tag}
              <span className="account-name-pencil"><Icon icon={Pencil} size={14} /></span>
            </span>
          )}
        </div>
        {riotIdError && <p className="warning">{riotIdError}</p>}
        <p className="label settings-standalone-hint">{t('account.riotIdHint')}</p>

        <div className="settings-row settings-row-static">
          <span className="settings-row-label">{t('account.apiKeyLabel')}</span>
          {editingApiKey ? (
            <div className="account-name-edit-row">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                placeholder={t('linkRiot.apiKeyPlaceholder')}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
              />
              <button onClick={handleSaveApiKey} disabled={savingApiKey}>
                {savingApiKey ? "..." : <Icon icon={Check} size={16} />}
              </button>
              <button
                className="account-name-cancel"
                onClick={() => {
                  setApiKeyDraft(apiKey ?? '');
                  setEditingApiKey(false);
                }}
              >
                <Icon icon={X} size={16} />
              </button>
            </div>
          ) : (
            <span className="account-name-display" onClick={() => setEditingApiKey(true)} title={t('account.clickToEdit')}>
              {apiKey ? '••••••••••••' : t('account.apiKeyMissing')}
              <span className="account-name-pencil"><Icon icon={Pencil} size={14} /></span>
            </span>
          )}
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="settings.overlay" title={t('account.settingsOverlayTitle')}>
        <SettingsToggleRow
          label={t('account.dailyOverlayLabel')}
          hint={t('account.dailyOverlayHint')}
          checked={dailyOverlayEnabled}
          onChange={handleToggleDailyOverlay}
        />
        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">{t('account.dailyOverlaySizeLabel')}</span>
          </div>
          <div className="account-overlay-size-row">
            <input
              type="range"
              min="70"
              max="150"
              step="10"
              value={dailyOverlaySize}
              onChange={handleDailyOverlaySizeChange}
            />
            <span className="label">{dailyOverlaySize}%</span>
          </div>
        </div>
        <SettingsToggleRow
          label={t('account.dailyOverlayMovingLabel')}
          hint={t('account.dailyOverlayMovingHint')}
          checked={dailyOverlayMoving}
          onChange={handleToggleDailyOverlayMoving}
        />
        <button type="button" className="account-forgot-password" onClick={onOpenDailyOverlaySettings}>
          {t('account.dailyOverlaySettingsButton')}
        </button>
      </CollapsibleCard>

      <CollapsibleCard id="settings.app" title={t('account.settingsAppTitle')}>
        <SettingsToggleRow
          label={t('account.autoLaunchLabel')}
          hint={t('account.autoLaunchHint')}
          checked={autoLaunchEnabled}
          onChange={handleToggleAutoLaunch}
        />
        <SettingsToggleRow
          label={t('account.tiltNotificationsLabel')}
          hint={t('account.tiltNotificationsHint')}
          checked={tiltNotificationsEnabled}
          onChange={handleToggleTiltNotifications}
        />
        <SettingsToggleRow
          label={t('account.perfLiteLabel')}
          hint={t('account.perfLiteHint')}
          checked={perfLiteEnabled}
          onChange={handleTogglePerfLite}
        />
      </CollapsibleCard>

      <CollapsibleCard id="settings.account-actions" title={t('account.settingsSecurityTitle')}>
        <div className="account-settings-actions">
          <button className="sidebar-signout account-signout" onClick={onSignOut}>
            {t('account.signOut')}
          </button>
          <button className="account-forgot-password" onClick={handleForgotPassword} disabled={resetStatus === 'sending'}>
            {resetStatus === 'sending' ? t('account.forgotPasswordSending') : t('account.forgotPassword')}
          </button>
          <button className="account-forgot-password" onClick={onReplayOnboarding}>
            {t('account.replayOnboarding')}
          </button>
        </div>
        {resetStatus === 'sent' && (
          <form className="account-auth-form account-reset-form" onSubmit={handleResetPassword}>
            <p className="label account-reset-status">{t('account.forgotPasswordSent')}</p>
            <input
              type="text"
              inputMode="numeric"
              placeholder={t('auth.codePlaceholder')}
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder={t('auth.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            <input
              type="password"
              placeholder={t('auth.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="submit" disabled={resettingPassword}>
              {resettingPassword ? t('auth.validating') : t('auth.resetPassword')}
            </button>
            {resetError && <p className="warning">{resetError}</p>}
          </form>
        )}
        {resetStatus === 'error' && <p className="warning account-reset-status">{t('account.forgotPasswordError')}</p>}
      </CollapsibleCard>
    </div>
  );
}

export default SettingsPage;
