import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { supabase } from './supabaseClient.js';
import Icon from './Icon.jsx';

const MAX_RESULTS = 8;
// Derniers messages affichés dans la liste « envoyés ».
const SENT_LIMIT = 30;
// `!recipient_id` : announcements a deux liens vers profiles (created_by et
// recipient_id), PostgREST refuse la jointure sans savoir lequel suivre.
const RECIPIENT = 'recipient:profiles!recipient_id(display_name, riot_name, riot_tag)';

function displayName(profile) {
  return profile.display_name || `${profile.riot_name ?? '?'}#${profile.riot_tag ?? '?'}`;
}

// Onglet Admin : envoie un message dans la cloche d'annonces, à tout le monde
// (recipient_id NULL) ou à un seul joueur. Même table que les annonces de
// l'onglet Admin principal — voir sql/announcements_recipient.sql pour la
// colonne recipient_id et la règle qui garde un message ciblé privé. La vraie
// protection est cette règle côté base, pas l'affichage de cet onglet.
function AdminNotificationComposer({ myId }) {
  const { t } = useTranslation();
  const [audience, setAudience] = useState('everyone'); // 'everyone' | 'player'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [recipient, setRecipient] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  // Dernier message envoyé (pour « Annuler l'envoi » juste après) et liste des envoyés.
  const [lastSent, setLastSent] = useState(null); // { id }
  const [sentList, setSentList] = useState([]);
  const [sentLoading, setSentLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  async function loadSent() {
    const columns = 'id, title, body, is_active, created_at';
    let { data, error: loadError } = await supabase
      .from('announcements')
      .select(`${columns}, recipient_id, ${RECIPIENT}`)
      .order('created_at', { ascending: false })
      .limit(SENT_LIMIT);
    if (loadError) {
      // Migration recipient_id pas encore passée : on liste sans les destinataires.
      ({ data } = await supabase.from('announcements').select(columns).order('created_at', { ascending: false }).limit(SENT_LIMIT));
    }
    setSentList(data ?? []);
    setSentLoading(false);
  }

  useEffect(() => {
    loadSent();
  }, []);

  // Retire un message de la cloche d'annonces. Sans ligne renvoyée, la base a refusé
  // la suppression (droits) sans lever d'erreur : on le dit plutôt que de faire croire
  // que c'est fait.
  async function removeMessage(id, { confirm = true } = {}) {
    if (confirm && !window.confirm(t('admin.notify.removeConfirm'))) return;
    setRemovingId(id);
    setError(null);
    const { data, error: deleteError } = await supabase.from('announcements').delete().eq('id', id).select('id');
    setRemovingId(null);
    if (deleteError || !data || data.length === 0) {
      setError(deleteError?.message ?? t('admin.notify.removeFailed'));
      return;
    }
    if (lastSent?.id === id) {
      setLastSent(null);
      setSentTo(null);
    }
    loadSent();
  }

  async function handleSearch(e) {
    e.preventDefault();
    // Retire les caractères qui casseraient le filtre PostgREST (virgules,
    // parenthèses) ou serviraient de jokers ilike.
    const clean = query.replace(/[,()%_*\\]/g, ' ').trim();
    if (clean.length < 2) return;
    setSearching(true);
    setError(null);
    const { data, error: searchError } = await supabase
      .from('profiles')
      .select('id, display_name, riot_name, riot_tag')
      .or(`riot_name.ilike.%${clean}%,display_name.ilike.%${clean}%`)
      .limit(MAX_RESULTS);
    setSearching(false);
    if (searchError) {
      setError(searchError.message);
      return;
    }
    setResults(data ?? []);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    if (audience === 'player' && !recipient) return;
    if (audience === 'everyone' && !window.confirm(t('admin.notify.confirmEveryone'))) return;

    setSending(true);
    setError(null);
    setSentTo(null);
    setLastSent(null);
    const { data: inserted, error: insertError } = await supabase
      .from('announcements')
      .insert({
      title: title.trim(),
      body: body.trim(),
      image_url: imageUrl.trim() || null,
      created_by: myId,
      recipient_id: audience === 'player' ? recipient.id : null,
      })
      .select('id')
      .single();
    setSending(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSentTo(audience === 'player' ? displayName(recipient) : t('admin.notify.everyone'));
    if (inserted?.id) setLastSent({ id: inserted.id });
    loadSent();
    setTitle('');
    setBody('');
    setImageUrl('');
  }

  const canSend = title.trim() && body.trim() && (audience === 'everyone' || recipient);

  return (
    <div className="notify-admin">
      <h1>{t('admin.notify.title')}</h1>
      <p className="label">{t('admin.notify.intro')}</p>

      <div className="account-role-picker">
        <button
          type="button"
          className={audience === 'everyone' ? 'account-role-option active' : 'account-role-option'}
          onClick={() => setAudience('everyone')}
        >
          <span>{t('admin.notify.everyone')}</span>
        </button>
        <button
          type="button"
          className={audience === 'player' ? 'account-role-option active' : 'account-role-option'}
          onClick={() => setAudience('player')}
        >
          <span>{t('admin.notify.onePlayer')}</span>
        </button>
      </div>

      {audience === 'player' && (
        <section className="admin-section">
          <form className="notify-admin-search" onSubmit={handleSearch}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('admin.notify.searchPlaceholder')}
            />
            <button type="submit" disabled={searching}>
              {searching ? t('admin.notify.searching') : t('admin.notify.search')}
            </button>
          </form>

          {recipient && (
            <p className="notify-admin-recipient">
              {t('admin.notify.recipient')} <strong>{displayName(recipient)}</strong>
            </p>
          )}

          {results.length > 0 && (
            <ul className="tournament-admin-list">
              {results.map((profile) => (
                <li key={profile.id} className="tournament-admin-item">
                  <span className="tournament-admin-name">{displayName(profile)}</span>
                  <span className="label">{profile.riot_name}#{profile.riot_tag}</span>
                  <button
                    type="button"
                    className="account-forgot-password"
                    onClick={() => setRecipient(profile)}
                  >
                    {recipient?.id === profile.id ? t('admin.notify.selected') : t('admin.notify.select')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <form className="tournament-create-form" onSubmit={handleSend}>
        <label>
          {t('admin.announcements.titleLabel')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
        </label>

        <label>
          {t('admin.announcements.bodyLabel')}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={500} required />
        </label>

        <label>
          {t('admin.announcements.imageUrlLabel')}
          <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </label>

        {error && <p className="error-banner">{error}</p>}
        {sentTo && (
          <p className="label notify-sent-banner">
            {t('admin.notify.sent', { to: sentTo })}
            {lastSent && (
              <button
                type="button"
                className="account-forgot-password"
                disabled={removingId === lastSent.id}
                onClick={() => removeMessage(lastSent.id, { confirm: false })}
              >
                {t('admin.notify.undo')}
              </button>
            )}
          </p>
        )}

        <button type="submit" disabled={sending || !canSend}>
          {sending ? t('admin.notify.sending') : t('admin.notify.send')}
        </button>
      </form>

      <section className="admin-section notify-sent">
        <h2>{t('admin.notify.sentListTitle')}</h2>
        {sentLoading ? (
          <p className="label">{t('admin.announcements.loading')}</p>
        ) : sentList.length === 0 ? (
          <p className="label">{t('admin.notify.sentListEmpty')}</p>
        ) : (
          <ul className="notify-sent-list">
            {sentList.map((message) => (
              <li key={message.id} className="notify-sent-item">
                <div className="notify-sent-main">
                  <div className="notify-sent-head">
                    <strong className="notify-sent-title">{message.title}</strong>
                    <span className={`notify-sent-to${message.recipient_id ? ' personal' : ''}`}>
                      {message.recipient_id && message.recipient ? displayName(message.recipient) : t('admin.notify.everyone')}
                    </span>
                    {!message.is_active && <span className="notify-sent-inactive">{t('admin.announcements.inactive')}</span>}
                  </div>
                  <p className="notify-sent-body">{message.body}</p>
                  <span className="notify-sent-date">{new Date(message.created_at).toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  className="strategy-tool icon-only danger"
                  title={t('admin.notify.remove')}
                  disabled={removingId === message.id}
                  onClick={() => removeMessage(message.id)}
                >
                  <Icon icon={Trash2} size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default AdminNotificationComposer;
