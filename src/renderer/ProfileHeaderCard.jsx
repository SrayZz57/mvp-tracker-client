import { useTranslation } from 'react-i18next';

// Encadré principal de la page Stats : qui est le joueur suivi, et son rang.
// Identité à gauche (icône de carte, pseudo, meilleur rang atteint), panneau du
// rang à droite dans le même langage que « Stats globales » (angles coupés,
// liseré, capitales espacées, gros chiffres). La bannière de la carte de
// joueur reste en fond, teintée par la couleur réelle du palier (--rank-color).
// AccountPage.jsx garde ses propres classes (profile-header-*) : rien de
// partagé ici.
function ProfileHeaderCard({ settings, rank, playerCardArt, currentTier, peakTier, seasonNames }) {
  const { t } = useTranslation();
  const rankColor = currentTier?.color;
  const peakSeason = rank?.peakSeasonUuid ? seasonNames.get(rank.peakSeasonUuid) : null;

  return (
    <div
      className={`card ph-card ${rankColor ? 'rank-glow' : ''}`}
      style={{
        backgroundImage: playerCardArt.banner ? `url(${playerCardArt.banner})` : undefined,
        borderColor: rankColor,
        '--rank-color': rankColor,
      }}
    >
      <div className="ph-overlay">
        <div className="ph-identity">
          {playerCardArt.icon && <img src={playerCardArt.icon} alt="" className="ph-avatar" />}
          <div className="ph-id-text">
            <span className="gs-eyebrow">{t('stats.profileEyebrow')}</span>
            <h2 className="ph-name">
              {settings.name}
              <span className="ph-tag">#{settings.tag}</span>
            </h2>
            {rank?.peakTierName && (
              <div className="profile-peak-badge">
                {peakTier?.icon && <img src={peakTier.icon} alt={rank.peakTierName} />}
                <span>
                  {t('stats.peak', { tier: rank.peakTierName })}
                  {peakSeason ? ` — ${peakSeason}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {rank ? (
          <div className="ph-rank">
            {currentTier?.icon && <img src={currentTier.icon} alt={rank.tierName} className="ph-rank-icon" />}
            <div className="ph-rank-body">
              <span className="gs-eyebrow">{t('stats.currentRankLabel')}</span>
              <span className="ph-rank-name" style={{ color: rankColor }}>{rank.tierName}</span>
              <span className="ph-rr">
                <strong>{rank.rr}</strong> RR
              </span>
              <span className="ph-rr-track" aria-hidden="true">
                <span style={{ width: `${Math.min(rank.rr, 100)}%`, background: rankColor }} />
              </span>
            </div>
          </div>
        ) : (
          <p className="label">{t('nav.rankUnavailable')}</p>
        )}
      </div>
    </div>
  );
}

export default ProfileHeaderCard;
