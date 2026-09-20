import { useTranslation } from 'react-i18next';
import AnnouncementCard from './AnnouncementCard.jsx';

// Ouverte par la cloche de la barre du haut : toutes les annonces actives
// publiées par l'admin, les plus récentes d'abord.
function AnnouncementsModal({ announcements, onClose }) {
  const { t } = useTranslation();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card announcements-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('detail.close')}</button>
        <h2>{t('announcements.title')}</h2>

        {announcements.length === 0 ? (
          <p className="label">{t('announcements.empty')}</p>
        ) : (
          <div className="announcements-modal-list">
            {announcements.map((announcement) => (
              <AnnouncementCard key={announcement.id} announcement={announcement} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnnouncementsModal;
