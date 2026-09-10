import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Trash2, RotateCcw, XCircle, Users } from 'lucide-react';
import Icon from './Icon.jsx';
import { supabase } from './supabaseClient.js';
import { useRankLadder, useRankTiers, usePlayerCardArt } from './rankData.js';
import CollapsibleCard from './CollapsibleCard.jsx';

// =============================================================================
// RECHERCHE DE TEAM (LFG) — un fil de petites annonces pour trouver une team
// ou des joueurs, qui s'appuie sur le système d'amis déjà en place plutôt
// que d'en réinventer un : "répondre" à une annonce envoie une VRAIE demande
// d'ami (table `friendships`, inchangée — voir FriendsPage.jsx), qui suit
// exactement le même circuit demande → acceptation → messagerie qu'ailleurs
// dans l'app. Rien n'est ajouté ni débloqué sans consentement des deux
// côtés.
//
// Le canal de discussion de groupe pour l'équipe qui se forme (au-delà du
// 1-to-1) est volontairement absent ici — demandé en deuxième temps, une
// fois cette base validée (chiffrement de groupe = un vrai chantier à part,
// différent du 1-to-1 existant).
// =============================================================================

const ROLES = ['Duelliste', 'Initiateur', 'Contrôleur', 'Sentinelle'];

const ROLE_COLORS = {
  Duelliste: '#3987e5',
  Initiateur: '#d95926',
  Contrôleur: '#199e70',
  Sentinelle: '#c98500',
};

const DEFAULT_MESSAGE_KEY = {
  looking_for_team: 'teamListings.defaultMessageLookingForTeam',
  looking_for_players: 'teamListings.defaultMessageLookingForPlayers',
};

// Même schéma que FriendAvatar (friendsShared.jsx) — avatar + nom réel.
function ListingAuthor({ author }) {
  const avatarArt = usePlayerCardArt(author?.avatar_card_uuid);
  const name = author?.display_name || (author?.riot_name ? `${author.riot_name}#${author.riot_tag}` : '?');
  return (
    <span className="comp-published-author">
      {avatarArt.icon ? (
        <img src={avatarArt.icon} alt="" className="comp-published-author-avatar" />
      ) : (
        <span className="comp-published-author-avatar comp-published-author-fallback">{name.charAt(0)}</span>
      )}
      {name}
    </span>
  );
}

// Rang RÉEL de l'auteur, pas un champ qu'il aurait pu saisir à la main —
// même mécanisme que TeammateQuickViewModal (TeammatesRivals.jsx) : un appel
// HenrikDev en direct avec la clé API du VIEWER (previewRiotAccount ne
// persiste rien, contrairement à getMatches). Mis en cache en mémoire par
// pseudo#tag pour ne pas répéter l'appel si plusieurs annonces viennent du
// même auteur dans le fil.
const rankPreviewCache = new Map();

function AuthorRankBadge({ riotName, riotTag, apiKey, t }) {
  const rankTiers = useRankTiers();
  const cacheKey = `${riotName}#${riotTag}`;
  const [rank, setRank] = useState(() => rankPreviewCache.get(cacheKey));

  useEffect(() => {
    if (!riotName || !riotTag || !apiKey || rankPreviewCache.has(cacheKey)) return;
    let cancelled = false;
    window.electronAPI
      .previewRiotAccount({ name: riotName, tag: riotTag, apiKey })
      .then((account) => {
        const value = account?.rank ?? null;
        rankPreviewCache.set(cacheKey, value);
        if (!cancelled) setRank(value);
      })
      .catch(() => {
        rankPreviewCache.set(cacheKey, null);
        if (!cancelled) setRank(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, apiKey]);

  if (rank === undefined) return <span className="label">…</span>;
  const tier = rank ? rankTiers.get(rank.tierId) : null;
  return (
    <span className="tech-item-agent">
      {tier?.icon && <img src={tier.icon} alt="" />}
      {tier?.name ?? t('teamListings.unranked')}
    </span>
  );
}

function rankRangeLabel(ladderByTier, rankMin, rankMax, t) {
  if (!rankMin && !rankMax) return t('teamListings.anyRank');
  const minName = rankMin ? ladderByTier.get(rankMin)?.tierName ?? rankMin : t('teamListings.noMin');
  if (rankMin === rankMax) return minName;
  const maxName = rankMax ? ladderByTier.get(rankMax)?.tierName ?? rankMax : t('teamListings.noMax');
  return `${minName} — ${maxName}`;
}

// Retenu d'une candidature à l'autre — évite de retaper son pseudo Discord
// à chaque annonce. Confort local uniquement (pas de vraie donnée à
// synchroniser), une simple valeur par défaut réécrite à chaque envoi.
const DISCORD_STORAGE_KEY = 'teamListings.lastDiscordTag';

function ListingCard({ listing, myId, isAdmin, apiKey, ladderByTier, onRespond, onClose, onRenew, onDelete, t }) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState('');
  const [discordDraft, setDiscordDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(null);

  const isExpired = new Date(listing.expires_at).getTime() < Date.now();
  const isOwn = listing.created_by === myId;

  function startReply() {
    setDraft(t(DEFAULT_MESSAGE_KEY[listing.listing_type]));
    try {
      setDiscordDraft(localStorage.getItem(DISCORD_STORAGE_KEY) ?? '');
    } catch {
      // localStorage indisponible (fenêtre privée, etc.) : champ vide, rien de grave.
    }
    setReplying(true);
  }

  async function handleSend() {
    if (!discordDraft.trim()) return;
    setSending(true);
    setSendError(null);
    const result = await onRespond(listing, draft.trim(), discordDraft.trim());
    setSending(false);
    if (result.error) {
      setSendError(result.error);
      return;
    }
    try {
      localStorage.setItem(DISCORD_STORAGE_KEY, discordDraft.trim());
    } catch {
      // pas grave, juste un confort perdu pour la prochaine fois.
    }
    setSent(true);
    setReplying(false);
  }

  return (
    <li className="tech-item lfg-item">
      <div className="lfg-item-header">
        <span className={listing.listing_type === 'looking_for_team' ? 'lfg-type-badge seeking' : 'lfg-type-badge recruiting'}>
          {t(listing.listing_type === 'looking_for_team' ? 'teamListings.typeLookingForTeam' : 'teamListings.typeLookingForPlayers')}
        </span>
        {isExpired && <span className="lfg-expired-badge">{t('teamListings.expired')}</span>}
      </div>

      {listing.team_name && <p className="tech-item-title">{listing.team_name}</p>}
      {listing.description && <p className="clip-description">{listing.description}</p>}

      <div className="lfg-meta">
        {listing.roles?.length > 0 ? (
          <div className="tech-item-tags">
            {listing.roles.map((role) => (
              <span key={role} className="tech-tag" style={{ '--role-color': ROLE_COLORS[role] }}>{role}</span>
            ))}
          </div>
        ) : (
          <span className="label">{t('teamListings.anyRole')}</span>
        )}
        <span className="label">{rankRangeLabel(ladderByTier, listing.rank_min, listing.rank_max, t)}</span>
        {listing.availability && <span className="label">{listing.availability}</span>}
        {listing.slots_available != null && (
          <span className="label">{t('teamListings.slotsAvailable', { count: listing.slots_available })}</span>
        )}
      </div>

      <div className="comp-published-footer">
        <ListingAuthor author={listing.author} />
        <AuthorRankBadge riotName={listing.author?.riot_name} riotTag={listing.author?.riot_tag} apiKey={apiKey} t={t} />
      </div>

      {!isOwn && myId && !isExpired && listing.status === 'active' && (
        <div className="lfg-reply">
          {sent ? (
            <p className="label">{t('teamListings.responseSent')}</p>
          ) : replying ? (
            <div className="lfg-reply-form">
              <textarea
                className="comp-publish-note"
                placeholder={t('teamListings.messagePlaceholder')}
                value={draft}
                maxLength={280}
                onChange={(e) => setDraft(e.target.value)}
              />
              <input
                type="text"
                placeholder={t('teamListings.discordPlaceholder')}
                value={discordDraft}
                maxLength={40}
                onChange={(e) => setDiscordDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <button type="button" className="refresh" disabled={!discordDraft.trim() || sending} onClick={handleSend}>
                <Icon icon={Send} size={14} /> {sending ? t('teamListings.sending') : t('teamListings.sendResponse')}
              </button>
              {!discordDraft.trim() && <p className="label">{t('teamListings.discordRequired')}</p>}
            </div>
          ) : (
            <button type="button" className="refresh" onClick={startReply}>
              <Icon icon={Users} size={14} /> {t('teamListings.respond')}
            </button>
          )}
          {sendError && <p className="warning">{sendError}</p>}
        </div>
      )}

      {isOwn && (
        <div className="lfg-owner-actions">
          {listing.status === 'active' && !isExpired && (
            <button type="button" className="strategy-tool icon-only" title={t('teamListings.close')} onClick={() => onClose(listing.id)}>
              <Icon icon={XCircle} size={14} />
            </button>
          )}
          {(isExpired || listing.status === 'closed') && (
            <button type="button" className="strategy-tool icon-only" title={t('teamListings.renew')} onClick={() => onRenew(listing.id)}>
              <Icon icon={RotateCcw} size={14} />
            </button>
          )}
        </div>
      )}

      {(isOwn || isAdmin) && (
        <button
          type="button"
          className="strategy-tool icon-only danger"
          title={t(isOwn ? 'teamListings.deleteOwn' : 'teamListings.deleteAdmin')}
          onClick={() => onDelete(listing.id)}
        >
          <Icon icon={Trash2} size={14} />
        </button>
      )}
    </li>
  );
}

function TeamListings({ myId, isAdmin, myRank, profile, apiKey }) {
  const { t } = useTranslation();
  const ladder = useRankLadder();
  const ladderByTier = useMemo(() => new Map(ladder.map((tier) => [tier.tier, tier])), [ladder]);

  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [responsesByListing, setResponsesByListing] = useState(new Map());
  const [loading, setLoading] = useState(false);

  const [typeFilter, setTypeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [formType, setFormType] = useState('looking_for_team');
  const [formRoles, setFormRoles] = useState([]);
  const [formRankMin, setFormRankMin] = useState('');
  const [formRankMax, setFormRankMax] = useState('');
  const [formAvailability, setFormAvailability] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTeamName, setFormTeamName] = useState('');
  const [formSlots, setFormSlots] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  // N'auto-remplit rôle/rang qu'une fois — un utilisateur qui les efface
  // volontairement ("peu importe") ne doit pas se les voir reposés dessus.
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    if (autoFilled) return;
    if (profile?.main_role && formRoles.length === 0) setFormRoles([profile.main_role]);
    if (myRank?.tierId && !formRankMin && !formRankMax) {
      setFormRankMin(String(myRank.tierId));
      setFormRankMax(String(myRank.tierId));
    }
    if (profile?.main_role || myRank?.tierId) setAutoFilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.main_role, myRank?.tierId, autoFilled]);

  async function loadListings() {
    setLoading(true);
    let query = supabase
      .from('team_listings')
      .select('id, listing_type, created_by, roles, rank_min, rank_max, availability, description, team_name, slots_available, status, created_at, expires_at, author:profiles(display_name, riot_name, riot_tag, avatar_card_uuid)')
      .order('created_at', { ascending: false })
      .limit(60);
    if (typeFilter) query = query.eq('listing_type', typeFilter);
    if (roleFilter) query = query.contains('roles', [roleFilter]);
    const { data, error } = await query;
    if (!error) setListings(data ?? []);
    setLoading(false);
  }

  async function loadMyListings() {
    if (!myId) return;
    const { data, error } = await supabase
      .from('team_listings')
      .select('id, listing_type, created_by, roles, rank_min, rank_max, availability, description, team_name, slots_available, status, created_at, expires_at, author:profiles(display_name, riot_name, riot_tag, avatar_card_uuid)')
      .eq('created_by', myId)
      .order('created_at', { ascending: false });
    if (!error) setMyListings(data ?? []);

    const { data: responses } = await supabase
      .from('team_listing_responses')
      .select('id, listing_id, message, discord_tag, created_at, responder:profiles(display_name, riot_name, riot_tag, avatar_card_uuid)')
      .order('created_at', { ascending: false });
    const grouped = new Map();
    (responses ?? []).forEach((r) => {
      if (!grouped.has(r.listing_id)) grouped.set(r.listing_id, []);
      grouped.get(r.listing_id).push(r);
    });
    setResponsesByListing(grouped);
  }

  useEffect(() => {
    loadListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, roleFilter]);

  useEffect(() => {
    loadMyListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const toggleFormRole = (role) => {
    setFormRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const canPublish = Boolean(myId && formDescription.trim());

  async function handlePublish() {
    if (!canPublish) return;
    setPublishing(true);
    setPublishError(null);
    const { error } = await supabase.from('team_listings').insert({
      listing_type: formType,
      created_by: myId,
      roles: formRoles,
      rank_min: formRankMin ? Number(formRankMin) : null,
      rank_max: formRankMax ? Number(formRankMax) : null,
      availability: formAvailability.trim() || null,
      description: formDescription.trim(),
      team_name: formType === 'looking_for_players' ? formTeamName.trim() || null : null,
      slots_available: formType === 'looking_for_players' && formSlots ? Number(formSlots) : null,
    });
    setPublishing(false);
    if (error) {
      setPublishError(error.message);
      return;
    }
    setFormAvailability('');
    setFormDescription('');
    setFormTeamName('');
    setFormSlots('');
    loadListings();
    loadMyListings();
  }

  // Répondre = une VRAIE demande d'ami (table friendships, système déjà en
  // place) + une trace du message envoyé (team_listing_responses), pour que
  // l'auteur voie le contexte sans que ça contourne l'étape d'acceptation.
  async function handleRespond(listing, message, discordTag) {
    const { error: friendError } = await supabase
      .from('friendships')
      .insert({ requester_id: myId, addressee_id: listing.created_by, status: 'pending' });
    // Code 23505 = contrainte unique déjà violée : demande déjà envoyée, ou
    // déjà amis dans l'autre sens — pas une vraie erreur ici, on continue
    // quand même vers l'enregistrement de la réponse.
    if (friendError && friendError.code !== '23505') {
      return { error: friendError.message };
    }
    // upsert plutôt qu'insert : si on avait déjà répondu à cette annonce
    // (contrainte unique listing_id+responder_id), une nouvelle candidature
    // met à jour le message/pseudo Discord au lieu d'être ignorée en
    // silence.
    const { error: responseError } = await supabase
      .from('team_listing_responses')
      .upsert(
        { listing_id: listing.id, responder_id: myId, message: message || null, discord_tag: discordTag },
        { onConflict: 'listing_id,responder_id' },
      );
    if (responseError) {
      return { error: responseError.message };
    }
    return { error: null };
  }

  async function handleClose(id) {
    await supabase.from('team_listings').update({ status: 'closed' }).eq('id', id);
    loadListings();
    loadMyListings();
  }

  async function handleRenew(id) {
    await supabase
      .from('team_listings')
      .update({ status: 'active', expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', id);
    loadListings();
    loadMyListings();
  }

  async function handleDelete(id) {
    await supabase.from('team_listings').delete().eq('id', id);
    loadListings();
    loadMyListings();
  }

  const visibleListings = listings.filter((l) => l.status === 'active' && new Date(l.expires_at).getTime() >= Date.now());

  return (
    <div>
      <div className="card">
        <h3>{t('teamListings.title')}</h3>
        <p className="label">{t('teamListings.description')}</p>
      </div>

      <CollapsibleCard id="teamListings.publish" title={t('teamListings.publishTitle')}>
        <div className="filter-bar">
          <button
            type="button"
            className={formType === 'looking_for_team' ? 'strategy-tool active' : 'strategy-tool'}
            onClick={() => setFormType('looking_for_team')}
          >
            {t('teamListings.typeLookingForTeam')}
          </button>
          <button
            type="button"
            className={formType === 'looking_for_players' ? 'strategy-tool active' : 'strategy-tool'}
            onClick={() => setFormType('looking_for_players')}
          >
            {t('teamListings.typeLookingForPlayers')}
          </button>
        </div>

        <div className="filter-bar">
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className={formRoles.includes(role) ? 'strategy-tool active' : 'strategy-tool'}
              onClick={() => toggleFormRole(role)}
            >
              {role}
            </button>
          ))}
        </div>

        <div className="tech-publish-form">
          <select value={formRankMin} onChange={(e) => setFormRankMin(e.target.value)}>
            <option value="">{t('teamListings.noMin')}</option>
            {ladder.map((tier) => (
              <option key={tier.tier} value={tier.tier}>{tier.tierName}</option>
            ))}
          </select>
          <select value={formRankMax} onChange={(e) => setFormRankMax(e.target.value)}>
            <option value="">{t('teamListings.noMax')}</option>
            {ladder.map((tier) => (
              <option key={tier.tier} value={tier.tier}>{tier.tierName}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t('teamListings.availabilityPlaceholder')}
            value={formAvailability}
            maxLength={80}
            onChange={(e) => setFormAvailability(e.target.value)}
          />
          {formType === 'looking_for_players' && (
            <>
              <input
                type="text"
                placeholder={t('teamListings.teamNamePlaceholder')}
                value={formTeamName}
                maxLength={60}
                onChange={(e) => setFormTeamName(e.target.value)}
              />
              <input
                type="number"
                min="1"
                max="10"
                placeholder={t('teamListings.slotsPlaceholder')}
                value={formSlots}
                onChange={(e) => setFormSlots(e.target.value)}
              />
            </>
          )}
        </div>

        <textarea
          className="comp-publish-note"
          style={{ width: '100%', marginTop: '0.6rem' }}
          placeholder={t('teamListings.descriptionPlaceholder')}
          value={formDescription}
          maxLength={400}
          onChange={(e) => setFormDescription(e.target.value)}
        />

        <button className="refresh" style={{ marginTop: '0.6rem' }} onClick={handlePublish} disabled={!canPublish || publishing}>
          {publishing ? t('teamListings.publishing') : t('teamListings.publish')}
        </button>

        {!myId && <p className="label">{t('teamListings.needAccount')}</p>}
        {publishError && <p className="warning">{publishError}</p>}
      </CollapsibleCard>

      {myListings.length > 0 && (
        <CollapsibleCard id="teamListings.mine" title={t('teamListings.myListingsTitle')}>
          <ul className="tech-list clip-list">
            {myListings.map((listing) => (
              <li key={listing.id} className="tech-item lfg-item">
                <div className="lfg-item-header">
                  <span className={listing.listing_type === 'looking_for_team' ? 'lfg-type-badge seeking' : 'lfg-type-badge recruiting'}>
                    {t(listing.listing_type === 'looking_for_team' ? 'teamListings.typeLookingForTeam' : 'teamListings.typeLookingForPlayers')}
                  </span>
                  <span className="label">{t(`teamListings.status.${listing.status}`)}</span>
                </div>
                {listing.team_name && <p className="tech-item-title">{listing.team_name}</p>}
                <p className="clip-description">{listing.description}</p>
                <div className="lfg-owner-actions">
                  {listing.status === 'active' && (
                    <button type="button" className="strategy-tool icon-only" title={t('teamListings.close')} onClick={() => handleClose(listing.id)}>
                      <Icon icon={XCircle} size={14} />
                    </button>
                  )}
                  <button type="button" className="strategy-tool icon-only" title={t('teamListings.renew')} onClick={() => handleRenew(listing.id)}>
                    <Icon icon={RotateCcw} size={14} />
                  </button>
                  <button type="button" className="strategy-tool icon-only danger" title={t('teamListings.deleteOwn')} onClick={() => handleDelete(listing.id)}>
                    <Icon icon={Trash2} size={14} />
                  </button>
                </div>

                {responsesByListing.get(listing.id)?.length > 0 && (
                  <div className="clip-comments">
                    <p className="label">{t('teamListings.responsesReceived', { count: responsesByListing.get(listing.id).length })}</p>
                    <ul className="clip-comment-list">
                      {responsesByListing.get(listing.id).map((r) => (
                        <li key={r.id} className="clip-comment">
                          <ListingAuthor author={r.responder} />
                          {r.message && <p className="clip-comment-text">{r.message}</p>}
                          {r.discord_tag && (
                            <p className="clip-comment-text lfg-response-discord">
                              {t('teamListings.discordLabel')} {r.discord_tag}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      <div className="card">
        <div className="filter-bar">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{t('teamListings.allTypes')}</option>
            <option value="looking_for_team">{t('teamListings.typeLookingForTeam')}</option>
            <option value="looking_for_players">{t('teamListings.typeLookingForPlayers')}</option>
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">{t('teamListings.anyRole')}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="label">{t('teamListings.loading')}</p>
        ) : visibleListings.length === 0 ? (
          <p className="label">{t('teamListings.empty')}</p>
        ) : (
          <ul className="tech-list clip-list">
            {visibleListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                myId={myId}
                isAdmin={isAdmin}
                apiKey={apiKey}
                ladderByTier={ladderByTier}
                onRespond={handleRespond}
                onClose={handleClose}
                onRenew={handleRenew}
                onDelete={handleDelete}
                t={t}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default TeamListings;
