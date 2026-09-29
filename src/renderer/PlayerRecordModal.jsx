import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp } from 'lucide-react';
import Icon from './Icon.jsx';
import MatchDetailModal from './MatchDetailModal.jsx';
import { resultLabelKey } from './valorantStats.js';

// Fiche d'un joueur croisé : ce qui s'est passé dans vos parties communes, en
// deux blocs (dans ton équipe / face à face), puis l'historique. Purement
// factuelle — voir la note en bas de la fenêtre. Calculs dans playerRecord.js.

const HISTORY_PAGE = 10;

const initials = (name) => (name || '?').slice(0, 2).toUpperCase();

// Écart avec TA moyenne : flèche verte quand tu fais mieux avec/contre ce joueur.
function Delta({ value, digits = 0, unit = '' }) {
  if (value === null || value === undefined || Math.abs(value) < 10 ** -(digits + 1)) return null;
  const up = value > 0;
  return (
    <span className="wrapped-delta" data-up={up ? 'true' : 'false'}>
      <Icon icon={up ? TrendingUp : TrendingDown} size={11} />
      {up ? '+' : ''}
      {value.toFixed(digits)}
      {unit}
    </span>
  );
}

const diff = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : a - b);

function Bucket({ title, emptyText, bucket, baseline, agentIcons, t }) {
  if (bucket.games === 0) {
    return (
      <section className="pr-bucket pr-bucket-empty">
        <h4>{title}</h4>
        <p>{emptyText}</p>
      </section>
    );
  }
  const num = (v, digits = 2) => (v === null || v === undefined ? '?' : v.toFixed(digits));
  const AgentList = ({ label, agents }) =>
    agents.length > 0 && (
      <div className="pr-agents">
        <small>{label}</small>
        <span>
          {agents.slice(0, 4).map((a) => (
            <span key={a.agent} className="pr-agent" title={`${a.agent} ×${a.games}`}>
              {agentIcons.get(a.agent) && <img src={agentIcons.get(a.agent)} alt="" />}
              <em>×{a.games}</em>
            </span>
          ))}
        </span>
      </div>
    );

  return (
    <section className="pr-bucket">
      <h4>{title}</h4>
      <div className="pr-tiles">
        <div>
          <b>{bucket.games}</b>
          <small>{t('social.record.games')}</small>
          <em>{bucket.wins}V · {bucket.losses}D</em>
        </div>
        <div>
          <b>{bucket.winrate === null ? '?' : `${bucket.winrate.toFixed(0)}%`}</b>
          <small>{t('social.record.winrate')}</small>
        </div>
        <div>
          <b>{num(bucket.kd)}</b>
          <small>{t('social.record.kd')}</small>
          <Delta value={diff(bucket.kd, baseline.kd)} digits={2} />
        </div>
        <div>
          <b>{bucket.hsPercent === null ? '?' : `${bucket.hsPercent.toFixed(0)}%`}</b>
          <small>{t('social.record.hs')}</small>
          <Delta value={diff(bucket.hsPercent, baseline.hsPercent)} unit=" pts" />
        </div>
        <div>
          <b>{bucket.adr === null ? '?' : bucket.adr.toFixed(0)}</b>
          <small>{t('social.record.adr')}</small>
          <Delta value={diff(bucket.adr, baseline.adr)} />
        </div>
      </div>
      <p className="pr-vs">{t('social.record.vsAverage')}</p>
      <AgentList label={t('social.record.yourAgents')} agents={bucket.myAgents} />
      <AgentList label={t('social.record.theirAgents')} agents={bucket.theirAgents} />
    </section>
  );
}

function PlayerRecordModal({ record, settings, agentIcons, onClose, onQuickView }) {
  const { t, i18n } = useTranslation();
  const [visible, setVisible] = useState(HISTORY_PAGE);
  const [openMatch, setOpenMatch] = useState(null);

  const date = (ms, withYear = true) =>
    new Date(ms).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  const shown = record.games.slice(0, visible);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card pr-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('detail.close')}</button>

        <header className="pr-head">
          <span className="pr-avatar">{initials(record.name)}</span>
          <div>
            <h3>
              {record.name}
              <span className="profile-tag">#{record.tag}</span>
            </h3>
            <p>{t('social.record.summary', { count: record.total, from: date(record.firstPlayed), to: date(record.lastPlayed) })}</p>
          </div>
          {onQuickView && (
            <button type="button" className="pr-quick" onClick={() => onQuickView(record)}>
              {t('social.record.quickview')}
            </button>
          )}
        </header>

        {!record.solid && <p className="pr-note">{t('social.record.lowSample', { count: record.total })}</p>}

        <div className="pr-columns">
          <Bucket title={t('social.record.together')} emptyText={t('social.record.noneTogether')} bucket={record.together} baseline={record.baseline} agentIcons={agentIcons} t={t} />
          <Bucket title={t('social.record.against')} emptyText={t('social.record.noneAgainst')} bucket={record.against} baseline={record.baseline} agentIcons={agentIcons} t={t} />
        </div>

        {record.against.games > 0 && (
          <p className="pr-duels">{t('social.record.duels', { mine: record.duels.mine, theirs: record.duels.theirs })}</p>
        )}

        <h4 className="pr-history-title">{t('social.record.history')}</h4>
        <div className="pr-history">
          {shown.map((entry) => {
            const label = resultLabelKey(entry.result) ? t(resultLabelKey(entry.result)) : entry.result;
            const tone = entry.result === 'Victoire' ? 'win' : entry.result === 'Défaite' ? 'loss' : 'draw';
            return (
              <button key={entry.match.metadata?.matchid} type="button" className="pr-game" data-tone={tone} onClick={() => setOpenMatch(entry.match)}>
                <span className="pr-game-date">{date((entry.match.metadata?.game_start ?? 0) * 1000, false)}</span>
                <span className="pr-side" data-side={entry.side}>
                  {t(entry.side === 'together' ? 'social.record.togetherTag' : 'social.record.againstTag')}
                </span>
                <span className="pr-game-map">{entry.match.metadata?.map ?? '?'}</span>
                <span className="pr-game-agents">
                  {entry.myAgent && agentIcons.get(entry.myAgent) && <img src={agentIcons.get(entry.myAgent)} alt={entry.myAgent} title={entry.myAgent} />}
                  <em>{entry.side === 'together' ? '+' : 'vs'}</em>
                  {entry.theirAgent && agentIcons.get(entry.theirAgent) && <img src={agentIcons.get(entry.theirAgent)} alt={entry.theirAgent} title={entry.theirAgent} />}
                </span>
                <span className="pr-game-kda">
                  {entry.myKills}/{entry.myDeaths}/{entry.myAssists}
                </span>
                <span className="pr-game-result">{label}</span>
              </button>
            );
          })}
        </div>
        {record.games.length > HISTORY_PAGE && (
          <button type="button" className="show-more-btn" onClick={() => setVisible((v) => (v >= record.games.length ? HISTORY_PAGE : record.games.length))}>
            {visible >= record.games.length ? t('social.record.showLess') : t('social.record.showAll', { count: record.games.length })}
          </button>
        )}

        <p className="pr-disclaimer">{t('social.record.disclaimer')}</p>

        {openMatch && <MatchDetailModal match={openMatch} settings={settings} agentIcons={agentIcons} onClose={() => setOpenMatch(null)} />}
      </div>
    </div>
  );
}

export default PlayerRecordModal;
