import { useTranslation } from 'react-i18next';

// À incrémenter (ex. 'v2') quand le texte change au point de devoir être
// re-validé : chaque compte sera alors redemandé, et l'ancienne acceptation
// reste conservée en base sous son ancienne version.
export const TERMS_VERSION = 'v1';

const SECTION_KEYS =['purpose', 'account', 'data', 'community', 'liability', 'changes'];

// Modale bloquante (pas de fermeture au clic dehors) : montrée une seule fois,
// à la première entrée dans l'app — voir le flag localStorage dans App.jsx.
function TermsModal({ onAccept, onDecline }) {
  const { t } = useTranslation();

  return (
    <div className="modal-overlay terms-overlay">
      <div className="modal-card terms-card" role="dialog" aria-modal="true" aria-labelledby="terms-title">
        <h2 id="terms-title">{t('terms.title')}</h2>
        <p className="label">{t('terms.intro')}</p>

        <div className="terms-body">
          {SECTION_KEYS.map((key) => (
            <section key={key}>
              <h4 className="account-subsection-title">{t(`terms.sections.${key}.title`)}</h4>
              <p>{t(`terms.sections.${key}.text`)}</p>
            </section>
          ))}
          <p className="label terms-riot-notice">{t('terms.riotNotice')}</p>
        </div>

        <div className="account-settings-actions">
          <button className="sidebar-signout account-signout" onClick={onDecline}>
            {t('terms.decline')}
          </button>
          <button className="refresh" onClick={onAccept}>
            {t('terms.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TermsModal;
