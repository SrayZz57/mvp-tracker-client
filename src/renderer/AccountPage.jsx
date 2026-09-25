import { useMemo, useState } from 'react';
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

// Noms de rôles issus de valorant-api.com (appelée en fr-FR) — hors périmètre
// de cette passe de traduction (voir CLAUDE.md / plan i18n), comparés tels
// quels à profile.main_role et aux clés de roleIconByName.
const ROLES = ['Duelliste', 'Initiateur', 'Contrôleur', 'Sentinelle'];

function formatMemberSince(isoDate, locale) {
  if (!isoDate) return null;
  return new Date(isoDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function AccountPage({ profile, mySettings, myMatches, myRank, email, onUpdate }) {
  const { t, i18n } = useTranslation();
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.display_name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactStatus, setContactStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  // Agent choisi depuis la carte au survol de la répartition par rôle
  // (RoleStackedBar) — demandé sur Discord, ouvre les mêmes stats détaillées
  // que depuis l'onglet Stats plutôt que d'en dupliquer une variante ici.
  const [selectedAgent, setSelectedAgent] = useState(null);

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
        <div className="gs-figure">
          <span className="gs-figure-label">{t('account.rankedTracked')}</span>
          <span className="gs-figure-value">{totalGames}</span>
        </div>
        <div className="gs-figure">
          <span className="gs-figure-label">{t('account.globalWinrate')}</span>
          <span className="gs-figure-value">{winrate !== null ? `${winrate.toFixed(0)}%` : '—'}</span>
        </div>
        <div className="gs-figure">
          <span className="gs-figure-label">{t('account.globalKd')}</span>
          <span className="gs-figure-value">{kd !== null ? kd.toFixed(2) : '—'}</span>
        </div>
      </div>

      <CollapsibleCard id="account.playerProfile" title={t('account.playerProfileTitle')} className="gs-card">
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

      <CollapsibleCard id="account.contact" title={t('account.contactTitle')} className="gs-card">
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
