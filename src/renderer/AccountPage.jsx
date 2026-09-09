import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Check, X, Mail } from 'lucide-react';
import Icon from './Icon.jsx';
import { usePlayerCardArt, useAllPlayerCards } from './rankData.js';
import { useAgentIcons, useAgentRoles } from './agentIcons.js';
import { computeRoleDistribution } from './performanceCharts.js';
import { excludeDeathmatch, groupStats, overallWinrate } from './valorantStats.js';
import RoleStackedBar from './charts/RoleStackedBar.jsx';
import AgentDetailModal from './AgentDetailModal.jsx';
import IconPickerModal from './IconPickerModal.jsx';
import { supabase } from './supabaseClient.js';
import CollapsibleCard from './CollapsibleCard.jsx';
import { useE2EE } from './E2EEContext.jsx';

// Noms de rôles issus de valorant-api.com (appelée en fr-FR) — hors périmètre
// de cette passe de traduction (voir CLAUDE.md / plan i18n), comparés tels
// quels à profile.main_role et aux clés de roleIconByName.
const ROLES = ['Duelliste', 'Initiateur', 'Contrôleur', 'Sentinelle'];

function formatMemberSince(isoDate, locale) {
  if (!isoDate) return null;
  return new Date(isoDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function AccountPage({ profile, mySettings, myMatches, myRank, email, apiKey, onUpdate, onUpdateApiKey, onUpdateRiotId, onSignOut, onReplayOnboarding }) {
  const { t, i18n } = useTranslation();
  const { unlockForUser } = useE2EE();
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.display_name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetStatus, setResetStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactStatus, setContactStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(apiKey ?? '');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [buyOverlayEnabled, setBuyOverlayEnabled] = useState(true);
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(true);
  // Agent choisi depuis la carte au survol de la répartition par rôle
  // (RoleStackedBar) — demandé sur Discord, ouvre les mêmes stats détaillées
  // que depuis l'onglet Stats plutôt que d'en dupliquer une variante ici.
  const [selectedAgent, setSelectedAgent] = useState(null);
  // Resynchro du Riot ID lié — pour les joueurs qui ont changé de pseudo EN
  // JEU après avoir lié leur compte (le tracker reste bloqué sur l'ancien nom
  // tant qu'on ne le met pas à jour ici, voir onUpdateRiotId dans App.jsx).
  const [editingRiotId, setEditingRiotId] = useState(false);
  const [riotNameDraft, setRiotNameDraft] = useState(mySettings.name ?? '');
  const [riotTagDraft, setRiotTagDraft] = useState(mySettings.tag ?? '');
  const [savingRiotId, setSavingRiotId] = useState(false);
  const [riotIdError, setRiotIdError] = useState(null);

  useEffect(() => {
    window.electronAPI.getAgentSelectOverlayEnabled().then(setOverlayEnabled);
    window.electronAPI.getBuyOverlayEnabled().then(setBuyOverlayEnabled);
    window.electronAPI.getAutoLaunch().then(setAutoLaunchEnabled);
  }, []);

  const handleToggleOverlay = () => {
    const next = !overlayEnabled;
    setOverlayEnabled(next);
    window.electronAPI.setAgentSelectOverlayEnabled(next);
  };

  const handleToggleBuyOverlay = () => {
    const next = !buyOverlayEnabled;
    setBuyOverlayEnabled(next);
    window.electronAPI.setBuyOverlayEnabled(next);
  };

  const handleToggleAutoLaunch = () => {
    const next = !autoLaunchEnabled;
    setAutoLaunchEnabled(next);
    window.electronAPI.setAutoLaunch(next);
  };

  const avatarCardUuid = profile.avatar_card_uuid ?? myRank?.cardUuid;
  const avatarArt = usePlayerCardArt(avatarCardUuid);
  const displayedName = profile.display_name || `${mySettings.name}#${mySettings.tag}`;

  const agentIcons = useAgentIcons();
  const agentRoles = useAgentRoles();
  const roleIconByName = useMemo(() => {
    const map = new Map();
    agentRoles.forEach(({ roleName, roleIcon }) => {
      if (roleName && roleIcon && !map.has(roleName)) map.set(roleName, roleIcon);
    });
    return map;
  }, [agentRoles]);

  const agentItems = useMemo(
    () => [...agentIcons.entries()].map(([name, icon]) => ({ id: name, label: name, icon })),
    [agentIcons],
  );

  const allCards = useAllPlayerCards();
  const cardItems = useMemo(
    () => allCards.map((card) => ({ id: card.uuid, label: card.displayName, icon: card.icon })),
    [allCards],
  );

  // Suggestion indicative basée sur les vraies parties trackées — n'est
  // jamais enregistrée automatiquement, c'est le joueur qui choisit son rôle
  // et son agent, pas un calcul qui décide à sa place.
  const rankedMatches = useMemo(() => excludeDeathmatch(myMatches ?? []), [myMatches]);
  const agentRows = useMemo(
    () => groupStats(rankedMatches, mySettings.name, mySettings.tag, (match, me) => me.character),
    [rankedMatches, mySettings.name, mySettings.tag],
  );
  const suggestedAgent = agentRows[0] ?? null;
  const roleDistribution = useMemo(
    () => computeRoleDistribution(rankedMatches, mySettings.name, mySettings.tag, agentRoles),
    [rankedMatches, mySettings.name, mySettings.tag, agentRoles],
  );
  const suggestedRole = roleDistribution.reduce(
    (best, row) => (!best || row.percent > best.percent ? row : best),
    null,
  );

  const totalGames = rankedMatches.length;
  const winrate = useMemo(
    () => overallWinrate(rankedMatches, mySettings.name, mySettings.tag),
    [rankedMatches, mySettings.name, mySettings.tag],
  );
  const kd = useMemo(() => {
    const all = groupStats(rankedMatches, mySettings.name, mySettings.tag, () => 'all')[0];
    return all && all.avgDeaths > 0 ? all.avgKills / all.avgDeaths : null;
  }, [rankedMatches, mySettings.name, mySettings.tag]);

  const memberSince = formatMemberSince(profile.created_at, i18n.language === 'en' ? 'en-US' : 'fr-FR');

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

  const handleSendContact = async (event) => {
    event.preventDefault();
    const trimmed = contactMessage.trim();
    if (!trimmed) return;
    setContactStatus('sending');
    // Même table que le formulaire du site (services/contact.ts côté
    // mvp-tracker-site) — le Database Webhook + la fonction Edge
    // contact-notify déjà en place s'en chargent, rien de spécifique à
    // ajouter côté app.
    const { error } = await supabase.from('contact_messages').insert({
      name: profile.display_name || `${mySettings.name}#${mySettings.tag}`,
      email,
      message: trimmed,
    });
    setContactStatus(error ? 'error' : 'sent');
    if (!error) setContactMessage('');
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    setSaving(true);
    await onUpdate({ display_name: trimmed || null });
    setSaving(false);
    setEditingName(false);
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
    <div>
      <div
        className="card profile-header-card account-header-card"
        style={{ backgroundImage: avatarArt.banner ? `url(${avatarArt.banner})` : undefined }}
      >
        <div className="profile-header-overlay">
          <button className="account-avatar-button" onClick={() => setAvatarPickerOpen(true)} title={t('account.changePhoto')}>
            {avatarArt.icon ? (
              <img src={avatarArt.icon} alt="" className="profile-card-icon" />
            ) : (
              <span className="profile-card-icon account-avatar-fallback">{displayedName.charAt(0)}</span>
            )}
            <span className="account-avatar-edit"><Icon icon={Pencil} size={14} /></span>
          </button>

          <div className="profile-header-info">
            {editingName ? (
              <div className="account-name-edit-row">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={`${mySettings.name}#${mySettings.tag}`}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                />
                <button onClick={handleSaveName} disabled={saving}>
                  {saving ? "..." : <Icon icon={Check} size={16} />}
                </button>
                <button
                  className="account-name-cancel"
                  onClick={() => {
                    setNameDraft(profile.display_name ?? '');
                    setEditingName(false);
                  }}
                >
                  <Icon icon={X} size={16} />
                </button>
              </div>
            ) : (
              <h2 className="account-name-display" onClick={() => setEditingName(true)} title={t('account.clickToEdit')}>
                {displayedName}
                <span className="account-name-pencil"><Icon icon={Pencil} size={14} /></span>
              </h2>
            )}
            <p className="label">
              {t('account.riotIdLinked', { name: mySettings.name, tag: mySettings.tag })}
              {memberSince && t('account.memberSince', { date: memberSince })}
            </p>
          </div>
        </div>
      </div>

      <div className="account-summary-tiles">
        <div className="card account-tile">
          <span className="account-tile-label">{t('account.rankedTracked')}</span>
          <span className="account-tile-value">{totalGames}</span>
        </div>
        <div className="card account-tile">
          <span className="account-tile-label">{t('account.globalWinrate')}</span>
          <span className="account-tile-value">{winrate !== null ? `${winrate.toFixed(0)}%` : '—'}</span>
        </div>
        <div className="card account-tile">
          <span className="account-tile-label">{t('account.globalKd')}</span>
          <span className="account-tile-value">{kd !== null ? kd.toFixed(2) : '—'}</span>
        </div>
      </div>

      <CollapsibleCard id="account.playerProfile" title={t('account.playerProfileTitle')}>
        <p className="label">{t('account.playerProfileHint')}</p>

        <h4 className="account-subsection-title">{t('account.yourRole')}</h4>
        <div className="account-role-picker">
          {ROLES.map((role) => (
            <button
              key={role}
              className={profile.main_role === role ? 'account-role-option active' : 'account-role-option'}
              onClick={() => onUpdate({ main_role: profile.main_role === role ? null : role })}
            >
              {roleIconByName.get(role) && <img src={roleIconByName.get(role)} alt="" />}
              <span>{role}</span>
            </button>
          ))}
        </div>

        <h4 className="account-subsection-title">{t('account.yourFavoriteAgent')}</h4>
        <button className="account-agent-picker" onClick={() => setAgentPickerOpen(true)}>
          {profile.main_agent && agentIcons.get(profile.main_agent) ? (
            <>
              <img src={agentIcons.get(profile.main_agent)} alt="" />
              <span>{profile.main_agent}</span>
            </>
          ) : (
            <span className="label">{t('account.chooseAgent')}</span>
          )}
          <span className="account-agent-picker-edit">{t('account.changeAgent')}</span>
        </button>

        {(suggestedRole || suggestedAgent) && (
          <p className="label account-suggestion">
            {t('account.suggestionPrefix', { count: totalGames })}{' '}
            {suggestedRole && (
              <>
                <strong>{suggestedRole.role}</strong> ({suggestedRole.percent.toFixed(0)}%)
              </>
            )}
            {suggestedRole && suggestedAgent && t('account.suggestionJoin')}
            {suggestedAgent && (
              <>
                <strong>{suggestedAgent.key}</strong> {t('account.suggestionGamesCount', { count: suggestedAgent.games })}
              </>
            )}
            .
          </p>
        )}

        {roleDistribution.length > 0 && (
          <>
            <h4 className="account-subsection-title">{t('account.realRoleDistribution')}</h4>
            <RoleStackedBar rows={roleDistribution} onSelectAgent={setSelectedAgent} />
          </>
        )}
      </CollapsibleCard>

      <CollapsibleCard id="account.settings" title={t('account.settingsTitle')}>
        <p className="label">{t('account.settingsHint')}</p>
        {email && (
          <p className="account-email-row">
            <span className="account-tile-label">{t('account.emailLabel')}</span>
            <span>{email}</span>
          </p>
        )}
        <div className="account-email-row">
          <span className="account-tile-label">{t('account.riotIdLabel')}</span>
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
        <p className="label account-toggle-hint">{t('account.riotIdHint')}</p>
        <div className="account-email-row">
          <span className="account-tile-label">{t('account.apiKeyLabel')}</span>
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
        <label className="account-email-row account-toggle-row">
          <span className="account-tile-label">{t('account.agentSelectOverlayLabel')}</span>
          <span className={`switch ${overlayEnabled ? 'on' : ''}`}>
            <input type="checkbox" checked={overlayEnabled} onChange={handleToggleOverlay} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </span>
        </label>
        <p className="label account-toggle-hint">{t('account.agentSelectOverlayHint')}</p>
        <label className="account-email-row account-toggle-row">
          <span className="account-tile-label">{t('account.buyOverlayLabel')}</span>
          <span className={`switch ${buyOverlayEnabled ? 'on' : ''}`}>
            <input type="checkbox" checked={buyOverlayEnabled} onChange={handleToggleBuyOverlay} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </span>
        </label>
        <p className="label account-toggle-hint">{t('account.buyOverlayHint')}</p>
        <label className="account-email-row account-toggle-row">
          <span className="account-tile-label">{t('account.autoLaunchLabel')}</span>
          <span className={`switch ${autoLaunchEnabled ? 'on' : ''}`}>
            <input type="checkbox" checked={autoLaunchEnabled} onChange={handleToggleAutoLaunch} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </span>
        </label>
        <p className="label account-toggle-hint">{t('account.autoLaunchHint')}</p>
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

      <CollapsibleCard id="account.contact" title={t('account.contactTitle')}>
        <p className="label">{t('account.contactHint')}</p>
        <form className="account-auth-form account-contact-form" onSubmit={handleSendContact}>
          <textarea
            className="account-contact-textarea"
            placeholder={t('account.contactMessagePlaceholder')}
            value={contactMessage}
            onChange={(e) => setContactMessage(e.target.value)}
            rows={4}
            required
          />
          <button className="account-contact-button" type="submit" disabled={contactStatus === 'sending'}>
            <Icon icon={Mail} size={16} />
            {contactStatus === 'sending' ? t('account.contactSending') : t('account.contactSend')}
          </button>
        </form>
        {contactStatus === 'sent' && <p className="label account-reset-status">{t('account.contactSent')}</p>}
        {contactStatus === 'error' && <p className="warning account-reset-status">{t('account.contactError')}</p>}
      </CollapsibleCard>

      {avatarPickerOpen && (
        <IconPickerModal
          title={t('account.choosePhoto')}
          items={cardItems}
          onSelect={(uuid) => {
            onUpdate({ avatar_card_uuid: uuid });
            setAvatarPickerOpen(false);
          }}
          onClose={() => setAvatarPickerOpen(false)}
        />
      )}

      {agentPickerOpen && (
        <IconPickerModal
          title={t('account.chooseFavoriteAgent')}
          items={agentItems}
          onSelect={(name) => {
            onUpdate({ main_agent: name });
            setAgentPickerOpen(false);
          }}
          onClose={() => setAgentPickerOpen(false)}
        />
      )}

      {selectedAgent && (
        <AgentDetailModal
          character={selectedAgent}
          matches={myMatches}
          settings={mySettings}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}

export default AccountPage;
