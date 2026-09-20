import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import RiotProfilePreview from './RiotProfilePreview.jsx';
import AnnouncementCard from './AnnouncementCard.jsx';
import { excludeDeathmatch, formStats, overallWinrate, overallHsPercent, resultLabelKey, resultLabel, findMe } from './valorantStats.js';
import logo from '../assets/logo.png';

const ORBS = [1, 2, 3, 4, 5, 6, 7];

// Écran d'accueil affiché à chaque lancement une fois le compte lié. Deux
// entrées côte à côte : consulter ses stats, ou s'échauffer avant de jouer —
// l'Aim Trainer étant surtout utile juste avant une session, c'est ici qu'il
// a le plus de chances d'être lancé.
function AccountGreeting({ settings, rank, matches = [], announcements = [], onEnter, onOpenAimTrainer }) {
  const { t } = useTranslation();

  // Résumé rapide du compte suivi : évite un grand vide entre l'aperçu de
  // profil et les boutons, et donne déjà une information utile avant même
  // d'entrer dans le tracker.
  const summary = useMemo(() => {
    const ranked = excludeDeathmatch(matches);
    if (ranked.length === 0) return null;
    const form = formStats(ranked, settings.name, settings.tag);
    return {
      games: ranked.length,
      winrate: overallWinrate(ranked, settings.name, settings.tag),
      kd: form.overallKd,
      hs: overallHsPercent(matches, settings.name, settings.tag),
      streakType: form.streakType,
      streakCount: form.streakCount,
    };
  }, [matches, settings.name, settings.tag]);

  // Cinq derniers résultats, du plus ancien au plus récent (sens de lecture).
  const recent = useMemo(
    () =>
      excludeDeathmatch(matches)
        .slice(0, 5)
        .map((match) => resultLabel(match, findMe(match, settings.name, settings.tag)))
        .reverse(),
    [matches, settings.name, settings.tag],
  );

  return (
    <div className="welcome-screen greeting-screen">
      <div className="welcome-bg" aria-hidden="true">
        {ORBS.map((i) => (
          <span key={i} className={`welcome-orb welcome-orb-${i}`} />
        ))}
      </div>

      <img src={logo} alt="MVP Tracker" className="welcome-logo" />
      <h1>{t('accountGreeting.title')}</h1>
      <p className="welcome-tagline">{t('accountGreeting.tagline')}</p>

      {announcements.length > 0 && (
        <div className="announcement-stack">
          {announcements.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
        </div>
      )}

      <div className="greeting-split">
        <section className="greeting-panel">
          <span className="greeting-panel-label">{t('accountGreeting.trackerLabel')}</span>
          <RiotProfilePreview name={settings.name} tag={settings.tag} cardUuid={rank?.cardUuid} rank={rank} />

          {summary ? (
            <>
              <div className="greeting-stats">
                <div className="greeting-stat">
                  <span className="greeting-stat-value">{summary.games}</span>
                  <span className="greeting-stat-label">{t('accountGreeting.statGames')}</span>
                </div>
                <div className="greeting-stat">
                  <span
                    className="greeting-stat-value"
                    style={{ color: summary.winrate >= 50 ? '#3ddc84' : 'var(--accent)' }}
                  >
                    {summary.winrate === null ? '—' : `${summary.winrate.toFixed(0)}%`}
                  </span>
                  <span className="greeting-stat-label">{t('accountGreeting.statWinrate')}</span>
                </div>
                <div className="greeting-stat">
                  <span className="greeting-stat-value">{summary.kd === null ? '—' : summary.kd.toFixed(2)}</span>
                  <span className="greeting-stat-label">{t('accountGreeting.statKd')}</span>
                </div>
                <div className="greeting-stat">
                  <span className="greeting-stat-value">{summary.hs === null ? '—' : `${summary.hs.toFixed(0)}%`}</span>
                  <span className="greeting-stat-label">{t('accountGreeting.statHs')}</span>
                </div>
              </div>

              {recent.length > 0 && (
                <div className="greeting-recent">
                  <span className="label">{t('accountGreeting.recentLabel')}</span>
                  <div className="greeting-dots">
                    {recent.map((label, i) => {
                      const key = resultLabelKey(label);
                      const tone = key === 'result.win' ? 'win' : key === 'result.loss' ? 'loss' : 'draw';
                      return <span key={i} className={`greeting-dot ${tone}`} title={key ? t(key) : label} />;
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="label greeting-empty">{t('accountGreeting.noMatches')}</p>
          )}

          <div className="riot-confirm-actions">
            <button className="riot-confirm-yes" onClick={onEnter}>
              {t('accountGreeting.enter')}
            </button>
          </div>
        </section>

        <section className="greeting-panel greeting-aim">
          <span className="greeting-panel-label greeting-aim-label">{t('accountGreeting.aimLabel')}</span>

          {/* Illustration de l'arène : dessinée en CSS plutôt qu'une capture,
              pour rester nette à toutes les tailles et ne rien alourdir. */}
          <div className="aim-preview" aria-hidden="true">
            <span className="aim-preview-sky" />
            <span className="aim-preview-floor" />
            <span className="aim-preview-target aim-preview-target-1" />
            <span className="aim-preview-target aim-preview-target-2" />
            <span className="aim-preview-target aim-preview-target-3" />
            <span className="aim-preview-crosshair" />
            <span className="aim-preview-hud">
              <span>30s</span>
              <span>18</span>
              <span>95%</span>
            </span>
          </div>

          <h2 className="greeting-aim-title">{t('accountGreeting.aimTitle')}</h2>
          <p className="label greeting-aim-text">{t('accountGreeting.aimText')}</p>

          <button className="refresh greeting-aim-btn" onClick={onOpenAimTrainer}>
            {t('accountGreeting.aimCta')}
          </button>
        </section>
      </div>
    </div>
  );
}

export default AccountGreeting;
