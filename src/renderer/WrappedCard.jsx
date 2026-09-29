import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Crosshair, Flame, Map as MapIcon, Star, Swords, TrendingDown, TrendingUp, Trophy, X } from 'lucide-react';
import Icon from './Icon.jsx';
import { toPng } from 'html-to-image';
import { lastCompletedWeekStart, weekStartKey } from './valorantStats.js';
import { buildWeekRecap, generateNarrative } from './weeklyNarrative.js';
import { PERIOD_KINDS, buildPeriodRecap, compareRecaps, defaultPeriod, listPeriods, previousPeriod, rrForPeriod } from './wrappedStats.js';
import { useAgentPortraits } from './agentIcons.js';
import { useRankTiers, useSeasonNames } from './rankData.js';

// Wrapped : le récapitulatif partageable d'une semaine, d'un mois ou d'un acte,
// avec comparaison à la période précédente, records et évolution du RR. La
// version hebdomadaire d'origine garde son récit (sauvegardé par semaine).

function formatPlaytime(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

// Écart avec la période précédente : flèche verte quand ça s'améliore, rouge
// sinon. `unit` est collé à la valeur ("pts", ""), `digits` = décimales.
function Delta({ value, unit = '', digits = 0 }) {
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

function WrappedCard({ settings, matches, rank }) {
  const { t, i18n } = useTranslation();
  const portraits = useAgentPortraits();
  const rankTiers = useRankTiers();
  const seasonNames = useSeasonNames();
  const cardRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [kind, setKind] = useState('week');
  const [periodId, setPeriodId] = useState(null);
  const [mmrHistory, setMmrHistory] = useState([]);
  const [narrative, setNarrative] = useState(null);
  const [history, setHistory] = useState([]);

  const periods = useMemo(() => listPeriods(kind, matches), [kind, matches]);
  const period = useMemo(() => periods.find((p) => p.id === periodId) ?? defaultPeriod(periods), [periods, periodId]);
  const previous = useMemo(() => previousPeriod(periods, period), [periods, period]);

  const recap = useMemo(() => (period ? buildPeriodRecap(period.matches, settings.name, settings.tag) : null), [period, settings.name, settings.tag]);
  const previousRecap = useMemo(() => (previous ? buildPeriodRecap(previous.matches, settings.name, settings.tag) : null), [previous, settings.name, settings.tag]);
  const delta = useMemo(() => compareRecaps(recap, previousRecap), [recap, previousRecap]);
  const rr = useMemo(() => (period ? rrForPeriod(mmrHistory, period.start, period.end) : null), [mmrHistory, period]);

  useEffect(() => {
    setPeriodId(null);
  }, [kind]);

  // L'historique de RR n'est demandé qu'à l'ouverture (cache de 15 min côté process principal).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    window.electronAPI
      .getMmrHistory({ force: false })
      .then((result) => !cancelled && setMmrHistory(result?.history ?? []))
      .catch(() => !cancelled && setMmrHistory([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const periodLabel = (p) => {
    if (!p) return '';
    if (p.kind === 'week') return t('wrapped.period.week', { date: new Date(p.start).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) });
    if (p.kind === 'month') {
      const text = new Date(p.start).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    return seasonNames.get(p.id) ?? t('wrapped.period.actUnknown');
  };

  // Récit : uniquement pour une semaine (il est sauvegardé par semaine). Pour la
  // dernière semaine terminée on garde le comportement d'origine (rang actuel +
  // comparaison au dernier instantané) ; pour une semaine plus ancienne sans récit
  // enregistré, on le génère sans rang et sans le sauvegarder.
  const weekKey = kind === 'week' && period ? weekStartKey(new Date(period.start)) : null;
  const isLatestCompletedWeek = kind === 'week' && period && period.start === lastCompletedWeekStart().getTime();
  useEffect(() => {
    setNarrative(null);
    if (!weekKey || !recap) return undefined;
    let cancelled = false;
    const weekRecap = buildWeekRecap(period.matches, settings.name, settings.tag);

    window.electronAPI.getWeeklyNarrative(weekKey).then(async (existing) => {
      if (cancelled) return;
      if (existing) {
        setNarrative(JSON.parse(existing.narrative_json));
        return;
      }
      if (!isLatestCompletedWeek) {
        setNarrative(generateNarrative(t, weekRecap, null, null));
        return;
      }
      const previousSnapshot = await window.electronAPI.getPreviousWeeklyNarrative(weekKey);
      const previousRank = previousSnapshot?.rank_json ? JSON.parse(previousSnapshot.rank_json) : null;
      const currentRank = rank ? { tierId: rank.tierId, tierName: rank.tierName, rr: rank.rr } : null;
      const paragraphs = generateNarrative(t, weekRecap, currentRank, previousRank);
      await window.electronAPI.saveWeeklyNarrative(weekKey, JSON.stringify(weekRecap), currentRank ? JSON.stringify(currentRank) : null, JSON.stringify(paragraphs));
      if (!cancelled) setNarrative(paragraphs);
    });

    return () => {
      cancelled = true;
    };
  }, [weekKey, recap, period, isLatestCompletedWeek, rank, settings.name, settings.tag, t]);

  useEffect(() => {
    if (!open || kind !== 'week') return;
    window.electronAPI.getWeeklyNarrativeHistory(20).then((rows) => setHistory(rows.filter((r) => r.week_start !== weekKey)));
  }, [open, kind, weekKey]);

  const handleExport = () => {
    if (!cardRef.current) return;
    setExporting(true);
    toPng(cardRef.current, { pixelRatio: 2 })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `mvp-wrapped-${kind}.png`;
        link.click();
      })
      .finally(() => setExporting(false));
  };

  const portrait = recap?.bestAgent ? portraits.get(recap.bestAgent.key) : null;
  const currentTier = rank ? rankTiers.get(rank.tierId) : null;
  const percent = (value) => (value === null ? '?' : `${value.toFixed(0)}%`);

  return (
    <>
      <button className="weekly-notch" onClick={() => setOpen(true)} title={t('weekly.widgetTitle')}>
        <span className="weekly-notch-icon" aria-hidden="true"><Icon icon={Trophy} size={16} /></span>
        <span>{t('weekly.notchLabel')}</span>
      </button>

      {open && (
        <div className="weekly-drawer-backdrop" onClick={() => setOpen(false)}>
          <div className="weekly-drawer wrapped-drawer" onClick={(e) => e.stopPropagation()}>
            <button className="weekly-drawer-close" onClick={() => setOpen(false)}><Icon icon={X} size={16} /></button>

            <div className="wrapped-controls">
              <div className="wrapped-tabs" role="tablist">
                {PERIOD_KINDS.map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={k === kind} className={k === kind ? 'active' : ''} onClick={() => setKind(k)}>
                    {t(`wrapped.kind.${k}`)}
                  </button>
                ))}
              </div>
              {periods.length > 0 && (
                <select value={period?.id ?? ''} onChange={(e) => setPeriodId(e.target.value)}>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {periodLabel(p)} · {t('wrapped.gamesShort', { count: p.matches.length })}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!recap ? (
              <div className="weekly-recap-card weekly-recap-empty">
                <p>{t(`wrapped.empty.${kind}`)}</p>
              </div>
            ) : (
              <div className="weekly-recap-wrap">
                <div className="weekly-recap-card wrapped-card" ref={cardRef} style={portrait ? { backgroundImage: `url(${portrait})` } : undefined}>
                  <div className="weekly-recap-overlay">
                    <div className="weekly-recap-title">WRAPPED · {t(`wrapped.kind.${kind}`).toUpperCase()}</div>
                    <div className="wrapped-period">{periodLabel(period)}</div>

                    <div className="weekly-recap-identity">
                      <div className="weekly-recap-name">
                        {settings.name}<span className="profile-tag">#{settings.tag}</span>
                      </div>
                      {rank && (
                        <div className="weekly-recap-rank">
                          {currentTier?.icon && <img src={currentTier.icon} alt="" />}
                          <span>{rank.tierName} — {rank.rr} RR</span>
                        </div>
                      )}
                    </div>

                    <div className="weekly-recap-hero">
                      <div className="weekly-recap-hero-value">{recap.games}</div>
                      <div className="weekly-recap-hero-label">{t('weekly.gamesPlayed')}</div>
                      <div className="wrapped-record">
                        <b data-tone="win">{recap.wins}</b> {t('wrapped.winsShort')} · <b data-tone="loss">{recap.losses}</b> {t('wrapped.lossesShort')}
                        {delta && <Delta value={delta.games} />}
                      </div>
                    </div>

                    <div className="weekly-recap-stats">
                      <div className="weekly-recap-stat">
                        <div className="value">{percent(recap.winrate)}</div>
                        <div className="label">{t('weekly.winrate')}</div>
                        {delta && <Delta value={delta.winrate} unit=" pts" />}
                      </div>
                      <div className="weekly-recap-stat">
                        <div className="value">{recap.kd === null ? '?' : recap.kd.toFixed(2)}</div>
                        <div className="label">{t('weekly.kdAverage')}</div>
                        {delta && <Delta value={delta.kd} digits={2} />}
                      </div>
                      <div className="weekly-recap-stat">
                        <div className="value">{percent(recap.hsPercent)}</div>
                        <div className="label">{t('weekly.hsPrecision')}</div>
                        {delta && <Delta value={delta.hsPercent} unit=" pts" />}
                      </div>
                    </div>

                    {rr && (
                      <div className="wrapped-rr" data-up={rr.net >= 0 ? 'true' : 'false'}>
                        <Icon icon={rr.net >= 0 ? TrendingUp : TrendingDown} size={16} />
                        <b>{rr.net >= 0 ? '+' : ''}{rr.net} RR</b>
                        <span>
                          {t('wrapped.rrGames', { count: rr.games })}
                          {rr.partial ? ` · ${t('wrapped.rrPartial')}` : ''}
                        </span>
                      </div>
                    )}

                    <ul className="wrapped-records">
                      {recap.bestAgent && (
                        <li>
                          <Icon icon={Swords} size={14} />
                          {t('wrapped.bestAgent', { agent: recap.bestAgent.key, count: recap.bestAgent.games })}
                        </li>
                      )}
                      {recap.bestMap ? (
                        <li>
                          <Icon icon={MapIcon} size={14} />
                          {t('weekly.bestMap', { map: recap.bestMap.key, percent: recap.bestMap.winrate.toFixed(0) })}
                        </li>
                      ) : (
                        recap.mostPlayedMap && (
                          <li>
                            <Icon icon={MapIcon} size={14} />
                            {t('wrapped.mostPlayedMap', { map: recap.mostPlayedMap.key, count: recap.mostPlayedMap.games })}
                          </li>
                        )
                      )}
                      {recap.mostKillsMatch && (
                        <li>
                          <Icon icon={Crosshair} size={14} />
                          {t('wrapped.mostKills', { kills: recap.mostKillsMatch.kills, agent: recap.mostKillsMatch.agent ?? '?', map: recap.mostKillsMatch.map ?? '?' })}
                        </li>
                      )}
                      {recap.bestKdMatch && (
                        <li>
                          <Icon icon={Star} size={14} />
                          {t('weekly.bestKd', { kd: recap.bestKdMatch.kd.toFixed(2) })}
                        </li>
                      )}
                      {recap.longestWinStreak >= 2 && (
                        <li>
                          <Icon icon={Flame} size={14} />
                          {t('wrapped.winStreak', { count: recap.longestWinStreak })}
                        </li>
                      )}
                      {recap.clutch && (
                        <li>
                          <Icon icon={Trophy} size={14} />
                          {t('wrapped.clutches', { wins: recap.clutch.wins, attempts: recap.clutch.attempts })}
                        </li>
                      )}
                      <li>
                        <Icon icon={Clock} size={14} />
                        {t('wrapped.playtime', { time: formatPlaytime(recap.playtimeSeconds) })}
                      </li>
                    </ul>

                    <div className="wrapped-compare">
                      {previousRecap ? t(`wrapped.compare.${kind}`) : t(`wrapped.noCompare.${kind}`)}
                    </div>
                  </div>
                </div>

                <button className="show-more-btn" onClick={handleExport} disabled={exporting}>
                  {exporting ? t('weekly.exporting') : t('weekly.exportBtn')}
                </button>

                {narrative && (
                  <div className="weekly-narrative">
                    <h4>{t('weekly.narrativeTitle')}</h4>
                    {narrative.map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </div>
                )}

                {kind === 'week' && <p className="weekly-drawer-hint">{t('weekly.hint')}</p>}

                {kind === 'week' && history.length > 0 && (
                  <div className="weekly-narrative-history">
                    <h4>{t('weekly.previousWeeks')}</h4>
                    {history.map((row) => (
                      <div key={row.id} className="weekly-narrative-history-item">
                        <div className="weekly-narrative-history-date">{t('weekly.weekOf', { date: row.week_start })}</div>
                        {JSON.parse(row.narrative_json).map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default WrappedCard;
