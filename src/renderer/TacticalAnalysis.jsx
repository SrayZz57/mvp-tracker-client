import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Footprints, Swords, Hourglass, Coins, Banknote, Wallet, Crosshair, Target, Radar, BowArrow } from 'lucide-react';
import { deathTimingStats, clutchStats, economyImpactStats, duelDistanceStats } from './valorantStats.js';
import LoadingState from './LoadingState.jsx';
import PlatformFilterToggle from './PlatformFilterToggle.jsx';
import usePlatformFilter from './usePlatformFilter.js';
import CollapsibleCard from './CollapsibleCard.jsx';
import Icon from './Icon.jsx';

const TIMING_ICONS = { early: Footprints, mid: Swords, late: Hourglass };
const ECONOMY_ICONS = { eco: Coins, semi: Banknote, full: Wallet };
const DISTANCE_ICONS = { close: Crosshair, mid: Target, long: Radar, verylong: BowArrow };

function clutchColor(winrate) {
  if (winrate === null) return 'var(--text)';
  if (winrate >= 50) return '#3ddc84';
  if (winrate >= 25) return 'var(--warning)';
  return 'var(--accent)';
}

function AnalyseRow({ icon, label, percent, meta, tone }) {
  return (
    <div className="fm-row">
      <span className="fm-row-label"><Icon icon={icon} size={16} /> {label}</span>
      <span className="fm-row-track" aria-hidden="true">
        <span className={`fm-row-fill ${tone ?? ''}`} style={{ width: `${percent ?? 4}%` }} />
      </span>
      <span className="fm-row-value">{percent === null ? '?' : `${percent.toFixed(0)}%`}</span>
      <span className="fm-row-meta">{meta}</span>
    </div>
  );
}

const winTone = (winrate) => (winrate === null ? '' : winrate >= 50 ? 'good' : 'bad');

function TacticalAnalysis({ settings, matches, loading }) {
  const { t } = useTranslation();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);
  const timing = useMemo(() => deathTimingStats(filteredMatches, settings.name, settings.tag), [filteredMatches, settings.name, settings.tag]);
  const clutch = useMemo(() => clutchStats(filteredMatches, settings.name, settings.tag), [filteredMatches, settings.name, settings.tag]);
  const economy = useMemo(() => economyImpactStats(filteredMatches, settings.name, settings.tag), [filteredMatches, settings.name, settings.tag]);
  const distance = useMemo(() => duelDistanceStats(filteredMatches, settings.name, settings.tag), [filteredMatches, settings.name, settings.tag]);

  if (matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('analyse.noMatchesYet')}</p>;
  }

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <CollapsibleCard id="analyse.timing" title={t('analyse.timingTitle', { count: timing.total })} className="gs-card">
        {timing.total === 0 ? (
          <p>{t('analyse.noDataYet')}</p>
        ) : (
          <div className="fm-rows">
            {timing.buckets.map((b) => (
              <AnalyseRow
                key={b.id}
                icon={TIMING_ICONS[b.id]}
                label={t(`analyse.timingBuckets.${b.id}`)}
                percent={b.percent}
                meta={t('analyse.deathsCount', { count: b.count })}
              />
            ))}
          </div>
        )}
      </CollapsibleCard>

      <CollapsibleCard id="analyse.distance" title={t('analyse.distanceTitle')} className="gs-card">
        {distance.rows.every((r) => r.total === 0) ? (
          <p>{t('analyse.notEnoughData')}</p>
        ) : (
          <>
            <div className="gs-figures fm-figures fm-figures-3">
              <div className="gs-figure">
                <span className="gs-figure-label">{t('analyse.avgKillDistance')}</span>
                <span className="gs-figure-value">
                  {distance.avgKillDistance === null ? '?' : `${distance.avgKillDistance.toFixed(1)}m`}
                </span>
              </div>
              <div className="gs-figure">
                <span className="gs-figure-label">{t('analyse.avgDeathDistance')}</span>
                <span className="gs-figure-value">
                  {distance.avgDeathDistance === null ? '?' : `${distance.avgDeathDistance.toFixed(1)}m`}
                </span>
              </div>
              <div className="gs-figure">
                <span className="gs-figure-label">{t('analyse.winrateGap')}</span>
                <span className={`gs-figure-value ${distance.dropOff === null ? '' : distance.dropOff > 0 ? 'down' : 'up'}`}>
                  {distance.dropOff === null ? '?' : `${distance.dropOff > 0 ? '-' : '+'}${Math.abs(distance.dropOff).toFixed(0)} pts`}
                </span>
              </div>
            </div>

            <div className="fm-rows" style={{ marginTop: '0.6rem' }}>
              {distance.rows.map((r) => (
                <AnalyseRow
                  key={r.id}
                  icon={DISTANCE_ICONS[r.id]}
                  label={t(`analyse.distanceBuckets.${r.id}`)}
                  percent={r.winrate}
                  tone={winTone(r.winrate)}
                  meta={t('analyse.killsDeathsMeta', { kills: r.kills, deaths: r.deaths })}
                />
              ))}
            </div>
          </>
        )}
      </CollapsibleCard>

      <CollapsibleCard id="analyse.clutch" title={t('analyse.clutchTitle')} className="gs-card">
        {clutch.attempts === 0 ? (
          <p>{t('analyse.noClutch')}</p>
        ) : (
          <div className="gs-figures fm-figures fm-figures-3">
            <div className="gs-figure">
              <span className="gs-figure-label">{t('analyse.clutchWinrate')}</span>
              <span className="gs-figure-value" style={{ color: clutchColor(clutch.winrate) }}>
                {clutch.winrate === null ? '?' : `${clutch.winrate.toFixed(0)} %`}
              </span>
            </div>
            <div className="gs-figure">
              <span className="gs-figure-label">{t('analyse.attempts')}</span>
              <span className="gs-figure-value">{clutch.attempts}</span>
            </div>
            <div className="gs-figure">
              <span className="gs-figure-label">{t('analyse.wins')}</span>
              <span className="gs-figure-value">{clutch.wins}</span>
            </div>
          </div>
        )}
        <p className="label" style={{ marginTop: '0.5rem' }}>{t('analyse.clutchHint')}</p>
      </CollapsibleCard>

      <CollapsibleCard id="analyse.economy" title={t('analyse.economyTitle')} className="gs-card">
        {economy.every((t2) => t2.rounds === 0) ? (
          <p>{t('analyse.noDataYet')}</p>
        ) : (
          <div className="fm-rows">
            {economy.map((tier) => (
              <AnalyseRow
                key={tier.id}
                icon={ECONOMY_ICONS[tier.id]}
                label={t(`common.economyTiers.${tier.id}`)}
                percent={tier.winrate}
                tone={winTone(tier.winrate)}
                meta={t('analyse.roundsMeta', { count: tier.rounds })}
              />
            ))}
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
}

export default TacticalAnalysis;
