import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NetworkMonitor from '../NetworkMonitor.jsx';
import { pingCorrelation } from '../valorantStats.js';
import CountUp from '../CountUp.jsx';
import { supabase } from '../supabaseClient.js';
import PlatformFilterToggle from '../PlatformFilterToggle.jsx';
import usePlatformFilter from '../usePlatformFilter.js';
import CollapsibleCard from '../CollapsibleCard.jsx';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Ce qui a déjà été envoyé pour ce lancement, hors du composant pour survivre
// au démontage de l'onglet.
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

function NetworkTab({ settings, matches, pingSamples, myId }) {
  const { t } = useTranslation();
  // Le ping mesuré ici vient du réseau de CET appareil — corréler des morts
  // survenues sur une partie console jouée ailleurs n'aurait aucun sens.
  // Filtre par défaut sur "pc" quand les deux plateformes sont détectées
  // (l'utilisateur peut quand même changer s'il veut comparer).
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches, 'pc');
  const pingStats = useMemo(
    () => pingCorrelation(filteredMatches, pingSamples, settings.name, settings.tag),
    [filteredMatches, pingSamples, settings.name, settings.tag],
  );

  const percent = pingStats.deathsAnalyzed > 0 ? (pingStats.deathsNearSpike / pingStats.deathsAnalyzed) * 100 : 0;

  // Chaque appareil envoie son propre total (pas l'historique brut du ping,
  // qui n'a de sens que sur ce réseau précis) vers le compte, sous sa propre
  // ligne — pour additionner les totaux de tous les PCs sans qu'un appareil
  // n'écrase les chiffres d'un autre.
  const [accountTotals, setAccountTotals] = useState(() => (lastPushed?.userId === myId ? lastPushed.totals : null));

  // L'onglet est démonté dès qu'on en change, donc chaque retour dessus
  // relançait l'écriture puis la relecture, avec exactement les mêmes
  // chiffres. On ne repart que quand le total local a réellement bougé, le
  // reste du temps l'affichage repart de ce qui a déjà été lu.
  useEffect(() => {
    if (!myId || pingStats.deathsAnalyzed === 0) return;
    if (
      lastPushed &&
      lastPushed.userId === myId &&
      lastPushed.deathsAnalyzed === pingStats.deathsAnalyzed &&
      lastPushed.deathsNearSpike === pingStats.deathsNearSpike
    ) {
      setAccountTotals(lastPushed.totals);
      return;
    }
    let cancelled = false;

    window.electronAPI.getDeviceId().then(async (deviceId) => {
      if (cancelled || !deviceId) return;
      await supabase.from('network_ping_stats').upsert(
        {
          user_id: myId,
          device_id: deviceId,
          deaths_analyzed: pingStats.deathsAnalyzed,
          deaths_near_spike: pingStats.deathsNearSpike,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' },
      );
      const { data, error } = await supabase
        .from('network_ping_stats')
        .select('deaths_analyzed, deaths_near_spike')
        .eq('user_id', myId);
      if (cancelled) return;
      if (error) {
        console.error('[network_ping_stats] échec de la lecture :', error.message);
        return;
      }
      const totals = (data ?? []).reduce(
        (acc, row) => ({
          deathsAnalyzed: acc.deathsAnalyzed + row.deaths_analyzed,
          deathsNearSpike: acc.deathsNearSpike + row.deaths_near_spike,
        }),
        { deathsAnalyzed: 0, deathsNearSpike: 0 },
      );
      lastPushed = {
        userId: myId,
        deathsAnalyzed: pingStats.deathsAnalyzed,
        deathsNearSpike: pingStats.deathsNearSpike,
        totals,
      };
      setAccountTotals(totals);
    });

    return () => {
      cancelled = true;
    };
  }, [myId, pingStats.deathsAnalyzed, pingStats.deathsNearSpike]);

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <NetworkMonitor />

      <CollapsibleCard id="network.pingHistory" title={t('network.pingHistory')} className="gs-card">
        <PingSparkline samples={pingSamples} />
      </CollapsibleCard>

      <CollapsibleCard id="network.deathCorrelation" title={t('network.deathCorrelation')} className="gs-card">
        {pingStats.deathsAnalyzed === 0 ? (
          <p>{t('network.notEnoughNetworkData')}</p>
        ) : (
          <div className="ping-correlation-layout">
            <PingGauge percent={percent} />
            <div className="ping-correlation-details">
              <div className="gs-figures fm-figures">
                <div className="gs-figure">
                  <span className="gs-figure-label">{t('network.totalDeathsAnalyzed')}</span>
                  <span className="gs-figure-value">{pingStats.deathsAnalyzed}</span>
                </div>
                <div className="gs-figure">
                  <span className="gs-figure-label">{t('network.duringPingSpike')}</span>
                  <span className="gs-figure-value">{pingStats.deathsNearSpike}</span>
                </div>
              </div>
              <p className="label" style={{ marginTop: '0.75rem' }}>
                {t('network.correlationSummary', { percent: percent.toFixed(0) })}
              </p>
              {accountTotals && (
                <p className="label" style={{ marginTop: '0.5rem' }}>
                  {t('network.accountTotal', {
                    analyzed: accountTotals.deathsAnalyzed,
                    nearSpike: accountTotals.deathsNearSpike,
                  })}
                </p>
              )}
            </div>
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
}

export default NetworkTab;
