import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsibleCard from './CollapsibleCard.jsx';

function NetworkMonitor() {
  const { t } = useTranslation();
  const [status, setStatus] = useState({ valorantRunning: false, latestPing: null });

  useEffect(() => {
    const poll = () => window.electronAPI.getNetworkStatus().then(setStatus);
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const pingClass = status.latestPing === null ? '' : status.latestPing < 60 ? 'good' : status.latestPing < 120 ? 'mid' : 'bad';

  return (
    <CollapsibleCard id="network.status" title={t('network.status')} className="gs-card">
      <div className={`network-status-banner ${status.valorantRunning ? 'online' : ''}`}>
        <span className="status-dot-lg" />
        {status.valorantRunning ? t('network.detected') : t('network.notDetected')}
      </div>
      {status.valorantRunning && (
        <div className="gs-figures fm-figures fm-figures-1">
          <div className="gs-figure">
            <span className="gs-figure-label">{t('network.pingGeneral')}</span>
            <span className={`gs-figure-value ping-value ${pingClass}`}>
              {status.latestPing === null ? '...' : `${status.latestPing} ms`}
            </span>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}

export default NetworkMonitor;
