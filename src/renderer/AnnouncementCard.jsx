import { useTranslation } from 'react-i18next';
import { Megaphone } from 'lucide-react';
import Icon from './Icon.jsx';
import { usePlayerCardArt } from './rankData.js';

// Auteur affiché en dur comme "Fondateur" : un seul admin publie ces
// annonces pour l'instant. Le nom/l'avatar, eux, restent dynamiques (tirés
// du vrai profil MVP Tracker de l'auteur) plutôt qu'en dur, pour rester
// à jour si SrayZz change sa photo/son pseudo affiché.
function AnnouncementAuthor({ author, t }) {
  const avatarArt = usePlayerCardArt(author?.avatar_card_uuid);
  if (!author) return null;
  const name = author.display_name || (author.riot_name ? `${author.riot_name}#${author.riot_tag}` : null);
  if (!name) return null;

  return (
    <div className="announcement-card-author">
      {avatarArt.icon ? (
        <img src={avatarArt.icon} alt="" className="announcement-card-author-avatar" />
      ) : (
        <span className="announcement-card-author-avatar announcement-card-author-fallback">{name.charAt(0)}</span>
      )}
      <span className="announcement-card-author-name">{t('accountGreeting.announcementFounder', { name })}</span>
    </div>
  );
}

// Partagée entre l'écran d'accueil (AccountGreeting) et la cloche d'annonces de
// la barre du haut (AnnouncementsModal).
function AnnouncementCard({ announcement }) {
  const { t } = useTranslation();
  return (
    <div
      className={`announcement-card ${announcement.image_url ? 'has-image' : ''}`}
      style={announcement.image_url ? { backgroundImage: `url(${announcement.image_url})` } : undefined}
    >
      <div className="announcement-card-overlay">
        <div className="announcement-card-head">
          <span className="announcement-card-icon">
            <Icon icon={Megaphone} size={16} />
          </span>
          <h3 className="announcement-card-title">{announcement.title}</h3>
          {announcement.recipient_id && <span className="announcement-card-personal">{t('announcements.personal')}</span>}
        </div>
        <p className="announcement-card-body">{announcement.body}</p>
        <AnnouncementAuthor author={announcement.author} t={t} />
      </div>
    </div>
  );
}

export default AnnouncementCard;
