import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, PartyPopper, Sunrise, Sun, Sunset, Moon, Flame, TrendingDown, Clock } from 'lucide-react';
import Icon from '../Icon.jsx';
import {
  groupStats,
  excludeDeathmatch,
  timeSlot,
  dayOfWeek,
  dayLabelKey,
  resultLabelKey,
  TIME_SLOT_ORDER,
  WEEK_ORDER,
  formStats,
} from '../valorantStats.js';
import LoadingState from '../LoadingState.jsx';
import PlatformFilterToggle from '../PlatformFilterToggle.jsx';
import usePlatformFilter from '../usePlatformFilter.js';
import CollapsibleCard from '../CollapsibleCard.jsx';

const WEEKDAY_ICONS = {
  Lundi: Calendar, Mardi: Calendar, Mercredi: Calendar, Jeudi: Calendar, Vendredi: Calendar, Samedi: PartyPopper, Dimanche: PartyPopper,
};

function timeSlotIcon(key) {
  const hour = parseInt(key, 10);
  if (hour >= 6 && hour < 12) return Sunrise;
  if (hour >= 12 && hour < 18) return Sun;
  if (hour >= 18 && hour < 24) return Sunset;
  return Moon;
}

// Fonction utilitaire (pas un composant) : reçoit `t` et une fonction de
// traduction de la clé de ligne (les jours sont en français en interne).
function renderStatBars(t, id, title, rows, icon, rowIcon, rowLabel) {
  return (
    <CollapsibleCard id={id} title={<><Icon icon={icon} size={16} /> {title}</>} className="gs-card">
      {rows.length === 0 ? (
        <p>{t('form.noDataYet')}</p>
      ) : (
        <div className="fm-rows">
          {rows.map((row) => (
            <div key={row.key} className="fm-row">
              <span className="fm-row-label">
                {rowIcon ? <Icon icon={rowIcon(row.key)} size={16} /> : null} {rowLabel ? rowLabel(row.key) : row.key}
              </span>
              <span className="fm-row-track" aria-hidden="true">
                <span
                  className={`fm-row-fill ${row.winrate === null ? '' : row.winrate >= 50 ? 'good' : 'bad'}`}
                  style={{ width: `${row.winrate ?? 4}%` }}
                />
              </span>
              <span className="fm-row-value">{row.winrate === null ? '?' : `${row.winrate.toFixed(0)}%`}</span>
              <span className="fm-row-meta">
                {t('form.gamesCount', { count: row.games })} — K/D/A {row.avgKills.toFixed(1)}/{row.avgDeaths.toFixed(1)}/{row.avgAssists.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function bestEntry(rows) {
  const withEnoughGames = rows.filter((row) => row.games >= 2 && row.winrate !== null);
  if (withEnoughGames.length === 0) return null;
  return withEnoughGames.reduce((best, row) => (row.winrate > best.winrate ? row : best));
}

function FormTab({ settings, matches, loading }) {
  const { t } = useTranslation();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);

  const form = useMemo(
    () => formStats(excludeDeathmatch(filteredMatches), settings.name, settings.tag),
    [filteredMatches, settings.name, settings.tag],
  );

  const timeSlotStats = useMemo(
    () =>
      groupStats(excludeDeathmatch(filteredMatches), settings.name, settings.tag, (match) => timeSlot(match)).sort(
        (a, b) => TIME_SLOT_ORDER.indexOf(a.key) - TIME_SLOT_ORDER.indexOf(b.key),
      ),
    [filteredMatches, settings.name, settings.tag],
  );

  const dayOfWeekStats = useMemo(
    () =>
      groupStats(excludeDeathmatch(filteredMatches), settings.name, settings.tag, (match) => dayOfWeek(match)).sort(
        (a, b) => WEEK_ORDER.indexOf(a.key) - WEEK_ORDER.indexOf(b.key),
      ),
    [filteredMatches, settings.name, settings.tag],
  );

  const bestTimeSlot = useMemo(() => bestEntry(timeSlotStats), [timeSlotStats]);
  const bestDay = useMemo(() => bestEntry(dayOfWeekStats), [dayOfWeekStats]);

  if (matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('stats.noMatchesYet')}</p>;
  }

  const streakTypeLabel = form.streakType ? t(resultLabelKey(form.streakType)) : t('form.noStreak');
  const kdTrend =
    form.recentKd !== null && form.overallKd !== null ? (form.recentKd >= form.overallKd ? 'up' : 'down') : '';
  const dayLabel = (key) => (dayLabelKey(key) ? t(dayLabelKey(key)) : key);

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <CollapsibleCard id="form.recentForm" title={t('form.recentForm')} className="gs-card">
        <div className="gs-figures fm-figures fm-figures-3">
          <div className="gs-figure">
            <span className="gs-figure-label">{t('form.currentStreak', { type: streakTypeLabel })}</span>
            {form.streakType === null ? (
              <span className="gs-figure-sub">{t('form.notEnoughData')}</span>
            ) : (
              <span className={`gs-figure-value ${form.streakType === 'Victoire' ? 'up' : 'down'}`}>
                {form.streakCount} <Icon icon={form.streakType === 'Victoire' ? Flame : TrendingDown} size={20} />
              </span>
            )}
          </div>
          <div className="gs-figure">
            <span className="gs-figure-label">{t('form.kdRecent', { count: form.recentCount })}</span>
            <span className={`gs-figure-value ${kdTrend}`}>{form.recentKd === null ? '?' : form.recentKd.toFixed(2)}</span>
          </div>
          <div className="gs-figure">
            <span className="gs-figure-label">{t('form.kdOverall')}</span>
            <span className="gs-figure-value">{form.overallKd === null ? '?' : form.overallKd.toFixed(2)}</span>
          </div>
        </div>
      </CollapsibleCard>

      {(bestTimeSlot || bestDay) && (
        <CollapsibleCard id="form.bestTimeToPlay" title={t('form.bestTimeToPlay')} className="gs-card">
          <div className="gs-figures fm-figures">
            {bestTimeSlot && (
              <div className="gs-figure">
                <span className="gs-figure-label">{t('form.statsByTimeSlot')}</span>
                <span className="gs-figure-value">
                  <Icon icon={timeSlotIcon(bestTimeSlot.key)} size={20} /> {bestTimeSlot.key}
                </span>
                <span className="gs-figure-sub">
                  {t('form.winratePlays', { percent: bestTimeSlot.winrate.toFixed(0), count: bestTimeSlot.games })}
                </span>
              </div>
            )}
            {bestDay && (
              <div className="gs-figure">
                <span className="gs-figure-label">{t('form.statsByWeekday')}</span>
                <span className="gs-figure-value">
                  <Icon icon={WEEKDAY_ICONS[bestDay.key]} size={20} /> {dayLabel(bestDay.key)}
                </span>
                <span className="gs-figure-sub">
                  {t('form.winratePlays', { percent: bestDay.winrate.toFixed(0), count: bestDay.games })}
                </span>
              </div>
            )}
          </div>
          <p className="label" style={{ marginTop: '0.7rem' }}>
            {t('form.bestMomentHint')}
          </p>
        </CollapsibleCard>
      )}

      {renderStatBars(t, 'form.statsByTimeSlot', t('form.statsByTimeSlot'), timeSlotStats, Clock, timeSlotIcon)}
      {renderStatBars(t, 'form.statsByWeekday', t('form.statsByWeekday'), dayOfWeekStats, Calendar, (key) => WEEKDAY_ICONS[key], dayLabel)}
    </div>
  );
}

export default FormTab;
