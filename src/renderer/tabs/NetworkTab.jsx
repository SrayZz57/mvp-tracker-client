import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NetworkMonitor from '../NetworkMonitor.jsx';
import { pingCorrelation } from '../stats/valorantStats.js';
import CountUp from '../ui/CountUp.jsx';
import { supabase } from '../account/supabaseClient.js';
import Skeleton, { SkeletonText } from '../ui/Skeleton.jsx';
import LoadingGate from '../ui/LoadingGate.jsx';
import PlatformFilterToggle from '../ui/PlatformFilterToggle.jsx';
import usePlatformFilter from '../hooks/usePlatformFilter.js';
import CollapsibleCard from '../ui/CollapsibleCard.jsx';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

let lastPushed = null;

function PingGauge({ percent }) {
  const { t } = useTranslation();
  const offset = CIRCUMFERENCE * (1 - percent / 100);
  const color = percent >= 30 ? 'var(--accent)' : percent >= 15 ? 'var(--warning)' : '#3ddc84';

  return (
    <div className="ping-gauge">
      <svg viewBox="0 0 120 120">
        <circle className="ping-gauge-track" cx="60" cy="60" r={RADIUS} />
        <circle
          className="ping-gauge-fill"
          cx="60"
          cy="60"
          r={RADIUS}
          style={{ stroke: color, strokeDasharray: CIRCUMFERENCE, strokeDashoffset: offset }}
        />
      </svg>
      <div className="ping-gauge-center">
        <div className="value" style={{ color }}><CountUp value={percent} suffix="%" /></div>
        <div className="label">{t('network.deathsInSpike')}</div>
      </div>
    </div>
  );
}

const SPARKLINE_WIDTH = 300;
const SPARKLINE_HEIGHT = 60;
const SPARKLINE_SAMPLE_COUNT = 60;

function PingSparkline({ samples }) {
  const { t } = useTranslation();
  const recent = useMemo(
    () => [...samples].sort((a, b) => a.timestamp - b.timestamp).slice(-SPARKLINE_SAMPLE_COUNT),
    [samples],
  );

  if (recent.length < 2) {
    return <p className="label">{t('network.notEnoughReadings')}</p>;
  }

  const values = recent.map((s) => s.latency_ms);
  const max = Math.max(...values, 60);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const points = recent.map((s, i) => {
    const x = (i / (recent.length - 1)) * SPARKLINE_WIDTH;
    const y = SPARKLINE_HEIGHT - ((s.latency_ms - min) / range) * SPARKLINE_HEIGHT;
    return `${x},${y}`;
  });

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const color = avg < 60 ? '#3ddc84' : avg < 120 ? 'var(--warning)' : 'var(--accent)';
  const areaPoints = `0,${SPARKLINE_HEIGHT} ${points.join(' ')} ${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT}`;

  return (
    <div className="ping-sparkline-wrap">
      <svg
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        preserveAspectRatio="none"
        className="ping-sparkline"
      >
        <polygon points={areaPoints} style={{ fill: color }} className="ping-sparkline-area" />
        <polyline points={points.join(' ')} style={{ stroke: color }} className="ping-sparkline-line" />
      </svg>
      <div className="ping-sparkline-meta">
        <span>{t('network.recentReadings', { count: recent.length })}</span>
        <span>{t('network.sparklineMeta', { avg: avg.toFixed(0), min: min.toFixed(0), max: max.toFixed(0) })}</span>
      </div>
    </div>
  );
}

async function pushAndReadTotals(myId, deathsAnalyzed, deathsNearSpike) {
  const deviceId = await window.electronAPI.getDeviceId();
  if (!deviceId) return null;

  await supabase.from('network_ping_stats').upsert(
    {
      user_id: myId,
      device_id: deviceId,
      deaths_analyzed: deathsAnalyzed,
      deaths_near_spike: deathsNearSpike,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_id' },
  );

  const { data, error } = await supabase
    .from('network_ping_stats')
    .select('deaths_analyzed, deaths_near_spike')
    .eq('user_id', myId);
  if (error) {
    console.error('[network_ping_stats] échec de la lecture :', error.message);
    return null;
  }

  const totals = (data ?? []).reduce(
    (acc, row) => ({
      deathsAnalyzed: acc.deathsAnalyzed + row.deaths_analyzed,
      deathsNearSpike: acc.deathsNearSpike + row.deaths_near_spike,
    }),
    { deathsAnalyzed: 0, deathsNearSpike: 0 },
  );
  lastPushed = { userId: myId, deathsAnalyzed, deathsNearSpike, totals };
  return totals;
}

function NetworkTab({ settings, matches, pingSamples, myId }) {
  const { t } = useTranslation();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches, 'pc');
  const pingStats = useMemo(
    () => pingCorrelation(filteredMatches, pingSamples, settings.name, settings.tag),
    [filteredMatches, pingSamples, settings.name, settings.tag],
  );

  const percent = pingStats.deathsAnalyzed > 0 ? (pingStats.deathsNearSpike / pingStats.deathsAnalyzed) * 100 : 0;

  const [accountTotals, setAccountTotals] = useState(() => (lastPushed?.userId === myId ? lastPushed.totals : null));
  const [totalsLoading, setTotalsLoading] = useState(() => lastPushed?.userId !== myId);

  useEffect(() => {
    if (!myId || pingStats.deathsAnalyzed === 0) {
      setTotalsLoading(false);
      return undefined;
    }
    if (
      lastPushed &&
      lastPushed.userId === myId &&
      lastPushed.deathsAnalyzed === pingStats.deathsAnalyzed &&
      lastPushed.deathsNearSpike === pingStats.deathsNearSpike
    ) {
      setAccountTotals(lastPushed.totals);
      setTotalsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setTotalsLoading(true);

    pushAndReadTotals(myId, pingStats.deathsAnalyzed, pingStats.deathsNearSpike)
      .catch((err) => {
        console.error('[network_ping_stats] échec de la remontée :', err?.message ?? err);
        return null;
      })
      .then((totals) => {
        if (cancelled) return;
        setAccountTotals(totals);
        setTotalsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [myId, pingStats.deathsAnalyzed, pingStats.deathsNearSpike]);

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <NetworkMonitor />

      <CollapsibleCard id="network.pingHistory" title={t('network.pingHistory')}>
        <PingSparkline samples={pingSamples} />
      </CollapsibleCard>

      <CollapsibleCard collapsible={false} id="network.deathCorrelation" title={t('network.deathCorrelation')}>
        {pingStats.deathsAnalyzed === 0 ? (
          <p>{t('network.notEnoughNetworkData')}</p>
        ) : (
          <div className="ping-correlation-layout">
            <PingGauge percent={percent} />
            <div className="ping-correlation-details">
              <div className="stat-tiles">
                <div className="stat-tile">
                  <div className="value">{pingStats.deathsAnalyzed}</div>
                  <div className="label">{t('network.totalDeathsAnalyzed')}</div>
                </div>
                <div className="stat-tile">
                  <div className="value">{pingStats.deathsNearSpike}</div>
                  <div className="label">{t('network.duringPingSpike')}</div>
                </div>
              </div>
              <p className="label" style={{ marginTop: '0.75rem' }}>
                {t('network.correlationSummary', { percent: percent.toFixed(0) })}
              </p>
              <LoadingGate
                active={totalsLoading}
                fallback={
                  <Skeleton>
                    <p className="label" style={{ marginTop: '0.5rem' }}>
                      <SkeletonText style={{ width: '42%' }}>&nbsp;</SkeletonText>
                    </p>
                  </Skeleton>
                }
              >
                {accountTotals && (
                  <p className="label" style={{ marginTop: '0.5rem' }}>
                    {t('network.accountTotal', {
                      analyzed: accountTotals.deathsAnalyzed,
                      nearSpike: accountTotals.deathsNearSpike,
                    })}
                  </p>
                )}
              </LoadingGate>
            </div>
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
}

export default NetworkTab;
