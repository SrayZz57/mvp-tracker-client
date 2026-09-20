import { useTranslation } from 'react-i18next';
import { CHANGELOG } from './changelog.js';

function formatDate(isoDate, locale) {
  return new Date(isoDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function ChangelogModal({ onClose }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card changelog-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('detail.close')}</button>
        <h2>{t('changelog.title')}</h2>

        <div className="changelog-body">
          {CHANGELOG.map((entry) => (
            <section key={entry.version} className="changelog-entry">
              <h4 className="account-subsection-title">
                v{entry.version} <span className="label">— {formatDate(entry.date, locale)}</span>
              </h4>
              <ul>
                {entry.items[lang].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ChangelogModal;
