import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Fenêtre overlay séparée, en haut à droite, affichée tant que Valorant
// tourne : victoires/défaites, % headshots et K/D du jour, alimentée par
// HenrikDev (jamais l'API locale du client — voir dailyStats.js côté main
// pour le calcul, refait toutes les 5 minutes). Purement passive : reçoit
// les stats déjà calculées par IPC, ne fait aucun calcul elle-même.
function DailyOverlay() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [dragMode, setDragMode] = useState(false);

  useEffect(() => {
    document.body.classList.add('overlay-window');
  }, []);

  // On redemande aussi les stats à l'ouverture : celles poussées par le process
  // principal au 'did-finish-load' arrivent avant que ce composant (chargé en
  // lazy) n'écoute — voir daily-overlay:get-stats dans main.js. `prev ??` pour
  // ne jamais écraser des stats plus récentes déjà reçues.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getDailyOverlayStats()
      .then((initial) => {
        if (!cancelled && initial) setStats((prev) => prev ?? initial);
      })
      .catch(() => {
        // Process principal plus ancien que cette fenêtre (ex. dev sans
        // redémarrage complet) : on attend simplement les stats poussées.
      });
    const unsubscribe = window.electronAPI.onDailyOverlayStats(setStats);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // La taille en % est appliquée via `zoom` (pas `transform: scale`) : ça
  // affecte le calcul de mise en page, pas juste le rendu visuel — sinon le
  // contenu déborderait de la fenêtre redimensionnée côté main.js au lieu de
  // s'y adapter (même piège que la fenêtre trop petite du premier jet).
  useEffect(() => {
    window.electronAPI.getDailyOverlaySize().then((percent) => {
      document.body.style.zoom = percent / 100;
    });
    return window.electronAPI.onDailyOverlaySize((percent) => {
      document.body.style.zoom = percent / 100;
    });
  }, []);

  useEffect(() => {
    window.electronAPI.getDailyOverlayDragMode().then(setDragMode);
    return window.electronAPI.onDailyOverlayDragMode(setDragMode);
  }, []);

  // Affiché dès la première récupération réussie, même à 0V-0D avant toute
  // partie jouée — demandé explicitement plutôt que d'attendre un premier
  // match pour apparaître.
  if (!stats) return null;

  const kdLabel = stats.kd.toFixed(2);
  const hsLabel = stats.hsPercent != null ? `${Math.round(stats.hsPercent)}` : '—';

  return (
    <div className={`overlay-daily ${dragMode ? 'overlay-daily-draggable' : ''}`}>
      <div className="overlay-daily-head">
        <span className="overlay-daily-dot" />
        <span className="overlay-daily-label">{t('dailyOverlay.title')}</span>
        {dragMode && <span className="overlay-daily-drag-hint">{t('dailyOverlay.dragHint')}</span>}
      </div>
      <div className="overlay-daily-stats">
        <div className="overlay-daily-cell">
          <span className="overlay-daily-value">
            <span className="overlay-daily-wins">{stats.wins}{t('dailyOverlay.winShort')}</span>
            <span className="overlay-daily-sep">-</span>
            <span className="overlay-daily-losses">{stats.losses}{t('dailyOverlay.lossShort')}</span>
          </span>
        </div>
        <div className="overlay-daily-cell">
          <span className="overlay-daily-value">{hsLabel}<span className="overlay-daily-unit">%</span></span>
          <span className="overlay-daily-caption">{t('dailyOverlay.hsShort')}</span>
        </div>
        <div className="overlay-daily-cell">
          <span className="overlay-daily-value">{kdLabel}</span>
          <span className="overlay-daily-caption">{t('dailyOverlay.kdShort')}</span>
        </div>
      </div>
    </div>
  );
}

export default DailyOverlay;
