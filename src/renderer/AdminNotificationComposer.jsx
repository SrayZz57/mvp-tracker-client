import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabaseClient.js';

const MAX_RESULTS = 8;

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
    const { error: insertError } = await supabase.from('announcements').insert({
      title: title.trim(),
      body: body.trim(),
      image_url: imageUrl.trim() || null,
      created_by: myId,
      recipient_id: audience === 'player' ? recipient.id : null,
    });
    setSending(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSentTo(audience === 'player' ? displayName(recipient) : t('admin.notify.everyone'));
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
        {sentTo && <p className="label">{t('admin.notify.sent', { to: sentTo })}</p>}

        <button type="submit" disabled={sending || !canSend}>
          {sending ? t('admin.notify.sending') : t('admin.notify.send')}
        </button>
      </form>
    </div>
  );
}

export default AdminNotificationComposer;
