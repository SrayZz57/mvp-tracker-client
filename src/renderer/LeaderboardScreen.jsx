import { useEffect, useState } from 'react';
import { Crown, Trophy, UserPlus } from 'lucide-react';
import Icon from './Icon.jsx';
import { FriendAvatar, friendLabel } from './friendsShared.jsx';
import { PlayerTitle } from './battlePass/playerCosmetics.jsx';
import { cardKeyFromId, cardStyle } from './battlePass/playerCards.jsx';
import { loadLeaderboard } from './battlePass/leaderboard.js';
import './aimPages.css';

// Classements de saison et global (Aim Rating) — phase 6 du battle pass. Même
// calcul, deux fenêtres de dates différentes (voir bp_leaderboard côté SQL) :
// un onglet suffit à basculer de l'un à l'autre.

const SCOPES = ['season', 'global'];

function Row({ entry, myId, apiKey, friendStatus, onAddFriend, t }) {
  const { profile } = entry;
  const banner = cardStyle(cardKeyFromId(profile?.card_id));
  const isSelf = entry.user_id === myId;

  return (
    <div className={isSelf ? 'lbrd-row lbrd-row-me' : 'lbrd-row'} style={banner}>
      <span className="lbrd-veil" aria-hidden="true" />
      <span className="lbrd-rank" data-podium={entry.rank <= 3 ? entry.rank : ''}>
        {entry.rank}
      </span>
      <FriendAvatar profile={profile} size={34} />
      <span className="lbrd-id">
        <strong>{profile ? friendLabel(profile) : '—'}</strong>
        <PlayerTitle userId={entry.user_id} />
      </span>
      {entry.level != null && (
        <span className="lbrd-level" title={t('battlePass.levelLong', { level: entry.level })}>
          {t('battlePass.levelShort', { level: entry.level })}
        </span>
      )}
      <span className="lbrd-modes">{t('aimTrainer.leaderboardPage.modesPlayed', { count: entry.modes_played })}</span>
      <span className="lbrd-rating">
        <b>{Number(entry.rating).toFixed(1)}</b>
        <small>{t('aimTrainer.leaderboardPage.rating')}</small>
      </span>
      {!isSelf && myId && apiKey && friendStatus === 'none' && (
        <button type="button" className="lbrd-add" onClick={() => onAddFriend(entry.user_id)} title={t('aimTrainer.addFriend')}>
          <Icon icon={UserPlus} size={14} />
        </button>
      )}
    </div>
  );
}

export default function LeaderboardScreen({ t, myId, apiKey, friendStatusByUser, onAddFriend }) {
  const [scope, setScope] = useState('season');
  const [rows, setRows] = useState({ season: null, global: null }); // null = chargement

  useEffect(() => {
    let alive = true;
    for (const s of SCOPES) {
      loadLeaderboard(s, 10).then((data) => {
        if (alive) setRows((prev) => ({ ...prev, [s]: data }));
      });
    }
    return () => {
      alive = false;
    };
  }, []);

  const current = rows[scope];

  return (
    <div className="ap-screen">
      <header className="ap-head">
        <span className="ap-eyebrow">{t('aimTrainer.title')}</span>
        <h2>{t('aimTrainer.leaderboardPage.title')}</h2>
        <p>{t('aimTrainer.leaderboardPage.subtitle')}</p>
      </header>

      <div className="ap-card">
        <div className="lbrd-tabs" role="tablist">
          {SCOPES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={scope === s} className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>
              <Icon icon={s === 'global' ? Trophy : Crown} size={15} />
              {t(`aimTrainer.leaderboardPage.scope.${s}`)}
            </button>
          ))}
        </div>

        {current === null ? (
          <p className="ap-empty">{t('battlePass.state.loading')}</p>
        ) : current.length === 0 ? (
          <p className="ap-empty">{t(`aimTrainer.leaderboardPage.empty.${scope}`)}</p>
        ) : (
          <div className="lbrd-list">
            {current.map((entry) => (
              <Row
                key={entry.user_id}
                entry={entry}
                myId={myId}
                apiKey={apiKey}
                friendStatus={friendStatusByUser[entry.user_id] ?? 'none'}
                onAddFriend={onAddFriend}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      <p className="ap-hint">{t('aimTrainer.leaderboardPage.minModes')}</p>
    </div>
  );
}
