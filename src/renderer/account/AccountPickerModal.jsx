import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabaseClient.js';
import { PROFILE_FIELDS } from '../social/friendsShared.jsx';
import Button from '../ui/Button';

function AccountPickerModal({ onSelect, onClose }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(undefined);

  async function handleSearch() {
    setSearching(true);
    setResult(undefined);
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .ilike('riot_name', name.trim())
      .eq('riot_tag', tag.trim())
      .maybeSingle();
    setSearching(false);
    setResult(error ? null : (data ?? null));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" type="button" className="modal-close" onClick={onClose}>
          {t('detail.close')}
        </Button>
        <h3>{t('tournaments.pickAccount')}</h3>
        <p className="label">{t('tournaments.pickAccountHint')}</p>

        <div className="account-picker-search">
          <input placeholder={t('tournaments.riotName')} value={name} onChange={(e) => setName(e.target.value)} />
          <span>#</span>
          <input placeholder={t('tournaments.riotTag')} value={tag} onChange={(e) => setTag(e.target.value)} />
          <Button
            variant="primary"
            type="button"
            loading={searching}
            loadingLabel={t('tournaments.saving')}
            disabled={searching || !name.trim() || !tag.trim()}
            onClick={handleSearch}
          >
            {t('tournaments.search')}
          </Button>
        </div>

        {result === null && <p className="warning">{t('tournaments.pickAccountNotFound')}</p>}

        {result && (
          <div className="account-picker-result">
            <span className="tournaments-mine-name">
              {result.riot_name}#{result.riot_tag}
            </span>
            <Button variant="primary" type="button" onClick={() => onSelect(result)}>
              {t('tournaments.select')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AccountPickerModal;
