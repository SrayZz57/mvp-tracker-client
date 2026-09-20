import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabaseClient.js';
import { TERMS_VERSION } from './TermsModal.jsx';
import LoadingState from './LoadingState.jsx';
import { normalizeRiotIdPart } from './valorantStats.js';

const PAGE_SIZE = 1000;
// Affichage progressif : quelques lignes au départ, puis "Voir plus" en
// ajoute STEP à la fois — plusieurs centaines de lignes d'un coup rendaient
// la page interminable à faire défiler.
const INITIAL_ROWS = 20;
const ROWS_STEP = 50;

// PostgREST plafonne une requête à 1000 lignes par défaut — on pagine pour
// que la liste reste complète quand la base d'utilisateurs dépasse ça.
async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function displayName(profile) {
  return profile.display_name || `${profile.riot_name ?? '?'}#${profile.riot_tag ?? '?'}`;
}

// Onglet Admin : qui a accepté les CGU (version courante) et qui ne l'a pas
// encore fait. Lecture seule — la vraie protection est la policy RLS
// terms_acceptances_select_own_or_admin (voir sql/terms_acceptances.sql),
// ceci n'est qu'un confort d'affichage.
function TermsAcceptancesPanel() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ loading: true, error: null, profiles: [], acceptedAtById: new Map() });
  const [filter, setFilter] = useState('');
  const [acceptedShown, setAcceptedShown] = useState(INITIAL_ROWS);
  const [pendingShown, setPendingShown] = useState(INITIAL_ROWS);
  const locale = i18n.language === 'en' ? 'en-US' : 'fr-FR';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [acceptances, profiles] = await Promise.all([
          fetchAll(() =>
            supabase
              .from('terms_acceptances')
              .select('user_id, accepted_at')
              .eq('version', TERMS_VERSION)
              .order('accepted_at', { ascending: false }),
          ),
          fetchAll(() =>
            supabase.from('profiles').select('id, display_name, riot_name, riot_tag').order('created_at', { ascending: true }),
          ),
        ]);
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          profiles,
          acceptedAtById: new Map(acceptances.map((a) => [a.user_id, a.accepted_at])),
        });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err.message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { accepted, pending } = useMemo(() => {
    const query = normalizeRiotIdPart(filter);
    const matches = (p) => !query || normalizeRiotIdPart(`${displayName(p)} ${p.riot_name ?? ''}#${p.riot_tag ?? ''}`).includes(query);
    const acceptedRows = state.profiles
      .filter((p) => state.acceptedAtById.has(p.id) && matches(p))
      .sort((a, b) => new Date(state.acceptedAtById.get(b.id)) - new Date(state.acceptedAtById.get(a.id)));
    const pendingRows = state.profiles.filter((p) => !state.acceptedAtById.has(p.id) && matches(p));
    return { accepted: acceptedRows, pending: pendingRows };
  }, [state.profiles, state.acceptedAtById, filter]);

  if (state.loading) return <LoadingState />;
  if (state.error) return <p className="warning">{t('terms.admin.error', { message: state.error })}</p>;

  const total = state.profiles.length;
  const acceptedCount = state.acceptedAtById.size;

  return (
    <div className="terms-admin">
      <h1>{t('terms.admin.title', { version: TERMS_VERSION })}</h1>
      <p className="label">{t('terms.admin.summary', { accepted: acceptedCount, total })}</p>

      <input
        type="text"
        className="terms-admin-filter"
        placeholder={t('terms.admin.filterPlaceholder')}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setAcceptedShown(INITIAL_ROWS);
          setPendingShown(INITIAL_ROWS);
        }}
      />

      <section className="admin-section">
        <h2>{t('terms.admin.acceptedTitle', { count: accepted.length })}</h2>
        {accepted.length === 0 ? (
          <p className="label">{t('terms.admin.noneAccepted')}</p>
        ) : (
          <ul className="tournament-admin-list">
            {accepted.slice(0, acceptedShown).map((p) => (
              <li key={p.id} className="tournament-admin-item">
                <span className="tournament-admin-name">{displayName(p)}</span>
                <span className="label">
                  {new Date(state.acceptedAtById.get(p.id)).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
        {accepted.length > acceptedShown && (
          <button className="account-forgot-password" onClick={() => setAcceptedShown((n) => n + ROWS_STEP)}>
            {t('terms.admin.showMore', { count: accepted.length - acceptedShown })}
          </button>
        )}
      </section>

      <section className="admin-section">
        <h2>{t('terms.admin.pendingTitle', { count: pending.length })}</h2>
        {pending.length === 0 ? (
          <p className="label">{t('terms.admin.nonePending')}</p>
        ) : (
          <ul className="tournament-admin-list">
            {pending.slice(0, pendingShown).map((p) => (
              <li key={p.id} className="tournament-admin-item">
                <span className="tournament-admin-name">{displayName(p)}</span>
              </li>
            ))}
          </ul>
        )}
        {pending.length > pendingShown && (
          <button className="account-forgot-password" onClick={() => setPendingShown((n) => n + ROWS_STEP)}>
            {t('terms.admin.showMore', { count: pending.length - pendingShown })}
          </button>
        )}
      </section>
    </div>
  );
}

export default TermsAcceptancesPanel;
