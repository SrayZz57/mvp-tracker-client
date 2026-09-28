import { useMemo } from 'react';
import { Crown, Flame, Play, Snowflake, Target, Timer, Trophy, Zap } from 'lucide-react';
import Icon from './Icon.jsx';
import { MODES } from './aimTrainerModes.js';
import './aimPages.css';

// Page Statistiques de l'Aim Trainer : chiffres clés, progression par mode,
// calendrier d'activité, détail par mode, puis classements. Tout est calculé à
// partir de l'historique déjà chargé par le hub (aucune requête en plus).

const WEEKS = 18;
const DAY_MS = 86400000;

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// Grille jour par jour des WEEKS dernières semaines, lundi en haut.
function useActivity(history) {
  return useMemo(() => {
    const counts = new Map();
    for (const row of history) {
      const key = dayKey(new Date(row.created_at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = new Date(today.getTime() - (mondayOffset + (WEEKS - 1) * 7) * DAY_MS);
    const cells = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const date = new Date(start.getTime() + i * DAY_MS);
      cells.push({ date, count: date > today ? null : (counts.get(dayKey(date)) ?? 0) });
    }
    const activeDays = cells.filter((c) => c.count > 0).length;
    return { cells, activeDays };
  }, [history]);
}

const level = (count) => (count === null ? 'future' : count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4);

function ActivityCalendar({ history, t, lang }) {
  const { cells, activeDays } = useActivity(history);
  return (
    <section className="ap-card">
      <header className="ap-card-head">
        <h3>{t('aimTrainer.statsPage.activity')}</h3>
        <span>{t('aimTrainer.statsPage.activeDays', { count: activeDays })}</span>
      </header>
      <div className="ap-calendar" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
        {cells.map((cell) => (
          <span
            key={cell.date.getTime()}
            className="ap-day"
            data-level={level(cell.count)}
            title={
              cell.count === null
                ? ''
                : `${cell.date.toLocaleDateString(lang, { day: 'numeric', month: 'long' })} · ${t('aimTrainer.statsPage.sessionsCount', { count: cell.count })}`
            }
          />
        ))}
      </div>
      <div className="ap-calendar-legend">
        <span>{t('aimTrainer.statsPage.less')}</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="ap-day" data-level={l} />
        ))}
        <span>{t('aimTrainer.statsPage.more')}</span>
      </div>
    </section>
  );
}

function ModeTable({ history, personalBests, globalBests, selected, onSelect, onLaunch, t, lang }) {
  const rows = useMemo(() => {
    const map = new Map();
    for (const row of history) {
      if (!MODES[row.mode]) continue;
      const entry = map.get(row.mode) ?? { id: row.mode, sessions: 0, accuracySum: 0, accuracyN: 0, last: null };
      entry.sessions += 1;
      if (row.accuracy != null) {
        entry.accuracySum += Number(row.accuracy);
        entry.accuracyN += 1;
      }
      if (!entry.last || row.created_at > entry.last) entry.last = row.created_at;
      map.set(row.mode, entry);
    }
    return [...map.values()].sort((a, b) => b.sessions - a.sessions);
  }, [history]);

  if (rows.length === 0) {
    return (
      <section className="ap-card">
        <header className="ap-card-head">
          <h3>{t('aimTrainer.statsPage.byMode')}</h3>
        </header>
        <p className="ap-empty">{t('aimTrainer.statsPage.noSessions')}</p>
      </section>
    );
  }

  return (
    <section className="ap-card">
      <header className="ap-card-head">
        <h3>{t('aimTrainer.statsPage.byMode')}</h3>
        <span>{t('aimTrainer.statsPage.byModeHint')}</span>
      </header>
      <div className="ap-table" role="table">
        <div className="ap-tr ap-th" role="row">
          <span>{t('aimTrainer.statsPage.mode')}</span>
          <span>{t('aimTrainer.hubStatSessions')}</span>
          <span>{t('aimTrainer.yourBest')}</span>
          <span>{t('aimTrainer.globalBest')}</span>
          <span>{t('aimTrainer.statsPage.accuracy')}</span>
          <span>{t('aimTrainer.statsPage.lastPlayed')}</span>
          <span />
        </div>
        {rows.map((row) => {
          const mode = MODES[row.id];
          const best = personalBests[row.id];
          const global = globalBests[row.id];
          const record = best !== undefined && global !== undefined && best >= global;
          return (
            <div
              key={row.id}
              role="row"
              className="ap-tr"
              data-selected={row.id === selected ? 'true' : 'false'}
              style={{ '--mode-accent': mode.accent }}
              onClick={() => onSelect(row.id)}
            >
              <span className="ap-mode">
                <Icon icon={mode.icon} size={16} /> {t(mode.labelKey)}
              </span>
              <span>{row.sessions}</span>
              <span className="ap-strong">
                {best ?? '—'} {record && <Icon icon={Crown} size={13} className="ap-crown" />}
              </span>
              <span className="ap-muted">{global ?? '—'}</span>
              <span>{row.accuracyN ? `${Math.round(row.accuracySum / row.accuracyN)} %` : '—'}</span>
              <span className="ap-muted">{new Date(row.last).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}</span>
              <button
                type="button"
                className="ap-row-play"
                title={t('aimTrainer.lobby.launchNow')}
                onClick={(event) => {
                  event.stopPropagation();
                  onLaunch(row.id);
                }}
              >
                <Icon icon={Play} size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function StatsScreen({
  t,
  lang,
  history,
  streak,
  records,
  personalBests,
  globalBests,
  progressionMode,
  onSelectMode,
  onLaunchMode,
  progressionPanel,
  challengeRanking,
  friendsRanking,
}) {
  const kpis = useMemo(() => {
    const withAccuracy = history.filter((r) => r.accuracy != null);
    const withReaction = history.filter((r) => r.avg_reaction != null);
    return {
      accuracy: withAccuracy.length ? Math.round(withAccuracy.reduce((s, r) => s + Number(r.accuracy), 0) / withAccuracy.length) : null,
      reaction: withReaction.length ? Math.round(withReaction.reduce((s, r) => s + Number(r.avg_reaction), 0) / withReaction.length) : null,
    };
  }, [history]);

  const tiles = [
    { key: 'sessions', icon: Target, value: history.length, label: t('aimTrainer.hubStatSessions') },
    { key: 'streak', icon: streak > 0 ? Flame : Snowflake, value: streak, label: t('aimTrainer.streakLabel', { count: streak }), hot: streak > 0 },
    { key: 'records', icon: Trophy, value: records, label: t('aimTrainer.statsPage.recordsHeld') },
    { key: 'accuracy', icon: Zap, value: kpis.accuracy === null ? '—' : `${kpis.accuracy} %`, label: t('aimTrainer.statsPage.avgAccuracy') },
    { key: 'reaction', icon: Timer, value: kpis.reaction === null ? '—' : `${kpis.reaction} ms`, label: t('aimTrainer.statsPage.avgReaction') },
  ];

  return (
    <div className="ap-screen">
      <header className="ap-head">
        <span className="ap-eyebrow">{t('aimTrainer.title')}</span>
        <h2>{t('aimTrainer.statsPage.title')}</h2>
        <p>{streak > 0 ? t('aimTrainer.streakKeep') : t('aimTrainer.streakStart')}</p>
      </header>

      <div className="ap-kpis">
        {tiles.map((tile) => (
          <div key={tile.key} className="ap-kpi" data-hot={tile.hot ? 'true' : 'false'}>
            <Icon icon={tile.icon} size={20} />
            <b>{tile.value}</b>
            <small>{tile.label}</small>
          </div>
        ))}
      </div>

      <div className="ap-grid">
        <div className="ap-col">
          <section className="ap-card">{progressionPanel}</section>
          <ModeTable
            history={history}
            personalBests={personalBests}
            globalBests={globalBests}
            selected={progressionMode}
            onSelect={onSelectMode}
            onLaunch={onLaunchMode}
            t={t}
            lang={lang}
          />
        </div>
        <div className="ap-col">
          <ActivityCalendar history={history} t={t} lang={lang} />
          <section className="ap-card">{challengeRanking}</section>
          <section className="ap-card">{friendsRanking}</section>
        </div>
      </div>
    </div>
  );
}
