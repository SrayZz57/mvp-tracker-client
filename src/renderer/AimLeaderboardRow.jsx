import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FriendAvatar, friendLabel } from './friendsShared.jsx';
import { PlayerTitle, usePlayerCard } from './battlePass/playerCosmetics.jsx';
import { cardKeyFromId, cardStyle } from './battlePass/playerCards.jsx';
import { useRankTiers } from './rankData.js';

const CARD_WIDTH = 220;
const CARD_MARGIN = 10;

// Une ligne de classement Aim Trainer (défi du jour ou amis), avec une carte
// au survol montrant rang + réglages souris pour CE score — chargée à la
// demande (pas pour toutes les lignes d'un coup, pour ne pas saturer le
// quota API sur un classement de 20 joueurs) et mise en cache pour ne pas
// rappeler l'API à chaque survol du même joueur.
//
// Rendue via un portail dans <body>, positionnée en `fixed` à partir du
// rectangle réel de la ligne (pas en `absolute` imbriquée dans la liste) :
// une carte de ~200px de haut ne tient pas dans l'espace d'UNE ligne de
// classement, donc la positionner en flux normal la faisait chevaucher et
// écraser visuellement les lignes suivantes plutôt que de flotter par-dessus.
function AimLeaderboardRow({ row, rank, myId, apiKey, friendStatus, onAddFriend, highlight }) {
  const { t } = useTranslation();
  const rankTiers = useRankTiers();
  const nameRef = useRef(null);
  const [cardPos, setCardPos] = useState(null); // null = pas survolé
  const [preview, setPreview] = useState(undefined); // undefined = pas encore chargé, null = échec

  const isSelf = row.user_id === myId;
  const equippedCard = cardStyle(cardKeyFromId(usePlayerCard(row.user_id)));

  const handleEnter = () => {
    // Ancrée sur le pseudo lui-même (pas sur toute la largeur de la ligne,
    // qui s'étend jusqu'au score tout à droite) — juste à côté du nom, à
    // droite par défaut, bascule à gauche si ça déborderait de la fenêtre.
    // Hauteur clampée pour ne jamais sortir en bas de l'écran.
    const rect = nameRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceRight = window.innerWidth - rect.right;
      const left =
        spaceRight >= CARD_WIDTH + CARD_MARGIN
          ? rect.right + CARD_MARGIN
          : Math.max(CARD_MARGIN, rect.left - CARD_WIDTH - CARD_MARGIN);
      const top = Math.min(rect.top - 8, window.innerHeight - 260);
      setCardPos({ top, left });
    }
    if (isSelf || !apiKey || !row.profiles) return;
    if (preview !== undefined) return; // déjà chargé (ou en échec) pour ce joueur
    const { riot_name: name, riot_tag: tag } = row.profiles;
    window.electronAPI
      .previewRiotAccount({ name, tag, apiKey })
      .then(setPreview)
      .catch(() => setPreview(null));
  };

  const tier = preview?.rank ? rankTiers.get(preview.rank.tierId) : null;
  const loadingPreview = preview === undefined;

  return (
    <div
      className={highlight ? 'aim-board-row me' : 'aim-board-row'}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setCardPos(null)}
    >
      <span className="aim-board-rank">{rank}</span>
      <FriendAvatar profile={row.profiles} size={26} />
      <span className="aim-board-name">
        <span ref={nameRef}>{friendLabel(row.profiles)}</span>
        <PlayerTitle userId={row.user_id} />
      </span>
      <span className="aim-board-score">{row.score}</span>

      {cardPos &&
        !isSelf &&
        createPortal(
          <div className="aim-board-hover-card" style={{ top: cardPos.top, left: cardPos.left }}>
            <div className="aim-board-hover-header" style={equippedCard}>
              <FriendAvatar profile={row.profiles} size={36} />
              <span className="aim-board-hover-name">{friendLabel(row.profiles)}</span>
              <PlayerTitle userId={row.user_id} />
            </div>

            <div className="aim-board-hover-stats">
              <div className="aim-board-hover-stat">
                {tier?.icon && <img src={tier.icon} alt="" />}
                <span>{preview === undefined ? '…' : (tier?.tierName ?? t('friends.unranked'))}</span>
              </div>
              {row.dpi && row.sens && (
                <div className="aim-board-hover-stat">
                  <span className="label">{t('aimTrainer.hoverSettings')}</span>
                  <span>{row.dpi} DPI · {row.sens}</span>
                </div>
              )}
            </div>

            {!loadingPreview && (
              <>
                {friendStatus === 'none' && (
                  <button
                    className="strategy-tool aim-board-hover-add"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddFriend(row.user_id);
                    }}
                  >
                    + {t('aimTrainer.addFriend')}
                  </button>
                )}
                {friendStatus === 'pending-out' && <p className="label">{t('friends.requestSent')}</p>}
                {friendStatus === 'pending-in' && <p className="label">{t('aimTrainer.pendingIncoming')}</p>}
                {friendStatus === 'accepted' && <p className="label">{t('aimTrainer.alreadyFriends')}</p>}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default AimLeaderboardRow;
