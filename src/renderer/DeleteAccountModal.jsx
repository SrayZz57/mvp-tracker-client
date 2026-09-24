import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabaseClient.js';

const REASON_KEYS = ['noLongerPlaying', 'notWhatExpected', 'bugs', 'privacy', 'tooManyNotifications', 'other'];

// Deux étapes dans la même fenêtre plutôt que deux modals séparées :
// 1) pourquoi tu pars (retour libre, enregistré dans account_deletion_feedback
//    — voir sql/account_deletion_feedback.sql — pour qu'on puisse le lire
//    même après la suppression du compte qui suit juste derrière) ;
// 2) la confirmation destructive elle-même, séparée pour qu'un clic sur
//    "Continuer" à l'étape 1 ne supprime jamais rien par accident.
function DeleteAccountModal({ email, onClose, onDeleted }) {
  const { t } = useTranslation();
  const [step, setStep] = useState('reasons'); // 'reasons' | 'confirm'
  const [reasons, setReasons] = useState([]);
  const [otherText, setOtherText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const toggleReason = (key) => {
    setReasons((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]));
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Le retour est un bonus pour nous, pas une condition à la suppression —
    // si l'insertion échoue (réseau, RLS...), on continue quand même vers la
    // vraie suppression plutôt que de bloquer l'utilisateur pour ça.
    if (user) {
      await supabase.from('account_deletion_feedback').insert({
        user_id: user.id,
        email,
        reasons,
        other_text: otherText.trim() || null,
      });
    }

    const { data, error: invokeError } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (invokeError || data?.error) {
      setDeleting(false);
      setError(data?.error ?? invokeError?.message ?? t('account.deleteAccountError'));
      return;
    }
    onDeleted();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card delete-account-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>
          {t('detail.close')}
        </button>

        {step === 'reasons' ? (
          <>
            <h3>{t('account.deleteReasonsTitle')}</h3>
            <p className="label">{t('account.deleteReasonsHint')}</p>

            <div className="delete-account-reasons">
              {REASON_KEYS.map((key) => (
                <label key={key} className="delete-account-reason-row">
                  <input type="checkbox" checked={reasons.includes(key)} onChange={() => toggleReason(key)} />
                  {t(`account.deleteReason.${key}`)}
                </label>
              ))}
            </div>

            {reasons.includes('other') && (
              <textarea
                className="delete-account-other-text"
                placeholder={t('account.deleteReasonOtherPlaceholder')}
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                rows={3}
              />
            )}

            <div className="delete-account-actions">
              <button type="button" className="account-forgot-password" onClick={onClose}>
                {t('account.cancel')}
              </button>
              <button type="button" className="danger-zone-button" onClick={() => setStep('confirm')}>
                {t('account.continueTo')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>{t('account.deleteFinalTitle')}</h3>
            <p className="warning">{t('account.deleteAccountHint')}</p>

            <div className="delete-account-actions">
              <button type="button" className="account-forgot-password" onClick={() => setStep('reasons')} disabled={deleting}>
                {t('account.back')}
              </button>
              <button type="button" className="danger-zone-button" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? t('account.deleteAccountConfirming') : t('account.deleteAccountButton')}
              </button>
            </div>

            {error && <p className="warning">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default DeleteAccountModal;
