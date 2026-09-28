import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabaseClient.js';
import { FriendAvatar, friendLabel, PROFILE_FIELDS } from './friendsShared.jsx';
import { PlayerTitle } from './battlePass/playerCosmetics.jsx';
import FriendSummaryCard from './FriendSummaryCard.jsx';
import { useE2EE } from './E2EEContext.jsx';

// Écran affiché tant que la clé de messagerie n'est pas en mémoire — arrive
// après chaque redémarrage de l'app (session Supabase restaurée sans jamais
// redemander le mot de passe, donc sans repasser par l'endroit qui débloque
// normalement la clé — voir AccountAuth.jsx). Ce mot de passe ne sert qu'à
// déchiffrer localement la clé déjà stockée (chiffrée) côté serveur — il
// n'est jamais renvoyé ni conservé au-delà de cet instant.
function UnlockMessagingForm({ myId }) {
  const { t } = useTranslation();
  const { unlockForUser } = useE2EE();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await unlockForUser(myId, password, { allowRegenerate: false });
    } catch {
      setError(t('messages.unlockWrongPassword'));
    }
    setLoading(false);
  };

  return (
    <div className="messages-page">
      <div className="messages-thread card messages-unlock">
        <h3>{t('messages.unlockTitle')}</h3>
        <p className="label">{t('messages.unlockHint')}</p>
        <form onSubmit={handleSubmit} className="account-auth-form">
          <input
            type="password"
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? t('auth.loading') : t('messages.unlockButton')}
          </button>
        </form>
        {error && <p className="warning">{error}</p>}
      </div>
    </div>
  );
}

function MessagesPage({ myId, onlineFriendIds = new Set(), initialFriendId = null, onConsumedInitialFriendId, apiKey }) {
  const { t } = useTranslation();
  const { ready: keysReady, encryptFor, decryptFrom } = useE2EE();
  const [friendships, setFriendships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [unreadFrom, setUnreadFrom] = useState(new Set());
  // Même principe que dans l'onglet Amis : aperçu (rang, niveau) chargé en
  // direct via HenrikDev, mis en cache par profil pour ne pas le refaire à
  // chaque fois qu'on rouvre la même conversation.
  const [friendPreviews, setFriendPreviews] = useState({});

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef(null);
  const selectedFriendIdRef = useRef(null);
  selectedFriendIdRef.current = selectedFriendId;

  const loadFriendships = async () => {
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `id, status, requester_id, addressee_id,
         requester:profiles!friendships_requester_id_fkey(${PROFILE_FIELDS}),
         addressee:profiles!friendships_addressee_id_fkey(${PROFILE_FIELDS})`,
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[friendships] échec du chargement :', error.message);
      setLoading(false);
      return;
    }
    setFriendships(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadFriendships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // Écoute en temps réel les messages qui m'arrivent — ajoute au fil ouvert
  // s'il vient de la conversation affichée, sinon marque juste un point non lu.
  useEffect(() => {
    const channel = supabase
      .channel(`messages-to-${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${myId}` },
        (payload) => {
          const msg = payload.new;
          if (msg.sender_id === selectedFriendIdRef.current) {
            setMessages((prev) => [...prev, msg]);
          } else {
            setUnreadFrom((prev) => new Set(prev).add(msg.sender_id));
          }
        },
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [myId]);

  const otherProfile = (f) => (f.requester_id === myId ? f.addressee : f.requester);
  const selectedFriendship = friendships.find((f) => otherProfile(f).id === selectedFriendId);
  const selectedProfile = selectedFriendship ? otherProfile(selectedFriendship) : null;

  useEffect(() => {
    if (!apiKey || !selectedProfile || friendPreviews[selectedProfile.id] !== undefined) return;
    window.electronAPI
      .previewRiotAccount({ name: selectedProfile.riot_name, tag: selectedProfile.riot_tag, apiKey })
      .then((preview) => setFriendPreviews((prev) => ({ ...prev, [selectedProfile.id]: preview })))
      .catch(() => setFriendPreviews((prev) => ({ ...prev, [selectedProfile.id]: null })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile?.id, apiKey]);

  const openConversation = async (friendId) => {
    setSelectedFriendId(friendId);
    setUnreadFrom((prev) => {
      const next = new Set(prev);
      next.delete(friendId);
      return next;
    });
    setMessagesLoading(true);
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, content, nonce, created_at')
      .or(
        `and(sender_id.eq.${myId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${myId})`,
      )
      .order('created_at', { ascending: true })
      .limit(300);
    if (error) console.error('[messages] échec du chargement :', error.message);
    setMessages(data ?? []);
    setMessagesLoading(false);
  };

  // N'ouvre la conversation demandée depuis la page Amis qu'une seule fois,
  // au premier montage — sans quoi revenir sur une conversation déjà changée
  // manuellement se ferait réécraser à chaque re-render.
  const initialFriendIdHandled = useRef(false);
  useEffect(() => {
    if (initialFriendIdHandled.current || !initialFriendId) return;
    initialFriendIdHandled.current = true;
    openConversation(initialFriendId);
    onConsumedInitialFriendId?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFriendId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const removeFriend = async (friendshipId) => {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    setSelectedFriendId(null);
    loadFriendships();
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedFriendId || !selectedProfile?.public_key) return;
    const encrypted = encryptFor(selectedProfile.public_key, text);
    if (!encrypted) return;
    setDraft('');
    const optimistic = {
      id: `optimistic-${Date.now()}`,
      sender_id: myId,
      recipient_id: selectedFriendId,
      content: encrypted.ciphertext,
      nonce: encrypted.nonce,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const { error } = await supabase
      .from('messages')
      .insert({ sender_id: myId, recipient_id: selectedFriendId, content: encrypted.ciphertext, nonce: encrypted.nonce });
    if (error) console.error('[messages] échec de l\'envoi :', error.message);
  };

  // Les messages "legacy" (envoyés avant le chiffrement de bout en bout,
  // reconnaissables à l'absence de `nonce`) restent affichés tels quels —
  // ils étaient déjà en clair dans la base avant ce changement, les masquer
  // n'y changerait rien. Les nouveaux sont déchiffrés à la volée ici plutôt
  // qu'au chargement, pour que les messages arrivant en temps réel (voir
  // l'abonnement plus haut) passent par le même chemin sans code dupliqué.
  const decryptedMessages = useMemo(() => {
    if (!selectedProfile?.public_key) return [];
    return messages.map((msg) => ({
      ...msg,
      text: !msg.nonce
        ? msg.content
        : keysReady
          ? (decryptFrom(selectedProfile.public_key, msg.content, msg.nonce) ?? t('messages.decryptFailed'))
          : '…',
    }));
  }, [messages, selectedProfile, keysReady, decryptFrom, t]);

  if (loading) return <p className="label">{t('messages.loading')}</p>;
  if (!keysReady) return <UnlockMessagingForm myId={myId} />;

  return (
    <div className="messages-page">
      <div className="messages-sidebar card">
        <h3>{t('messages.conversationsTitle')}</h3>
        {friendships.length === 0 ? (
          <p className="label">{t('messages.addFriendsHint')}</p>
        ) : (
          <div className="friend-list">
            {friendships.map((f) => {
              const p = otherProfile(f);
              return (
                <button
                  key={f.id}
                  className={p.id === selectedFriendId ? 'friend-list-item active' : 'friend-list-item'}
                  onClick={() => openConversation(p.id)}
                >
                  <FriendAvatar profile={p} online={onlineFriendIds.has(p.id)} />
                  <span>{friendLabel(p)}</span>
<PlayerTitle userId={p?.id} />
                  {unreadFrom.has(p.id) && <span className="friend-unread-dot" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="messages-thread card">
        {!selectedProfile ? (
          <div className="messages-empty">
            <p className="label">{t('messages.chooseAFriend')}</p>
          </div>
        ) : (
          <>
            <div className="messages-thread-header">
              <FriendAvatar profile={selectedProfile} size={34} online={onlineFriendIds.has(selectedProfile.id)} />
              <div className="messages-thread-header-info">
                <span>{friendLabel(selectedProfile)}</span>
<PlayerTitle userId={selectedProfile?.id} />
                <span className="messages-thread-header-status">
                  {onlineFriendIds.has(selectedProfile.id) ? t('messages.online') : t('messages.offline')}
                </span>
              </div>
              <button
                className="messages-remove-friend"
                onClick={() => removeFriend(selectedFriendship.id)}
                title={t('friends.removeFriend')}
              >
                {t('messages.remove')}
              </button>
            </div>

            <div className="messages-thread-body">
              {messagesLoading ? (
                <p className="label">{t('messages.loading')}</p>
              ) : messages.length === 0 ? (
                <p className="label">{t('messages.noMessagesYet')}</p>
              ) : (
                decryptedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={msg.sender_id === myId ? 'message-bubble mine' : 'message-bubble'}
                  >
                    {msg.text}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {selectedProfile.public_key ? (
              <form onSubmit={handleSend} className="messages-input-row">
                <input
                  type="text"
                  placeholder={t('messages.messagePlaceholder')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={2000}
                />
                <button type="submit" disabled={!draft.trim()}>
                  {t('messages.send')}
                </button>
              </form>
            ) : (
              <p className="label messages-no-key-hint">{t('messages.friendNoKeyYet')}</p>
            )}
          </>
        )}
      </div>

      {selectedProfile && (
        <div className="messages-friend-panel card">
          <FriendSummaryCard
            profile={selectedProfile}
            preview={friendPreviews[selectedProfile.id]}
            online={onlineFriendIds.has(selectedProfile.id)}
          />
        </div>
      )}
    </div>
  );
}

export default MessagesPage;
