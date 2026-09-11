// Onglet Aim Trainer dans la fenêtre principale : depuis que l'Aim Trainer
// est une expérience autonome en plein écran (menu, modes, stats et réglages
// y vivent désormais — voir AimTrainerHub.jsx), cet onglet ne sert plus que
// de point d'entrée + carte d'impact sur les vraies parties (elle a besoin de
// `matches`/`settings`, propres à la fenêtre principale, donc reste ici).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Play } from 'lucide-react';
import Icon from '../Icon.jsx';
import CollapsibleCard from '../CollapsibleCard.jsx';
import PlatformFilterToggle from '../PlatformFilterToggle.jsx';
import usePlatformFilter from '../usePlatformFilter.js';
import { loadHistory } from '../aimScores.js';
import { computeTrainingImpact } from '../aimCorrelation.js';

const TUTORIAL_SEEN_KEY = 'mvptracker-aim-trainer-tutorial-seen';

function AimTrainerTutorialModal({ onClose, t }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('detail.close')}</button>
        <h3>{t('aimTrainer.tutorialTitle')}</h3>
        <p className="label">{t('aimTrainer.tutorialIntro')}</p>
        <div className="aim-howto-steps">
          <div className="aim-howto-step">
            <span className="aim-howto-num">1</span>
            <div>
              <strong>{t('aimTrainer.tutorialSensTitle')}</strong>
              <span className="label">{t('aimTrainer.tutorialSensText')}</span>
            </div>
          </div>
          <div className="aim-howto-step">
            <span className="aim-howto-num">2</span>
            <div>
              <strong>{t('aimTrainer.tutorialLaunchTitle')}</strong>
              <span className="label">{t('aimTrainer.tutorialLaunchText')}</span>
            </div>
          </div>
        </div>
        <button className="refresh" onClick={onClose} style={{ marginTop: '1rem' }}>
          {t('aimTrainer.tutorialGotIt')}
        </button>
      </div>
    </div>
  );
}

function AimTrainerTab({ myId, matches, settings, apiKey, rank, profile }) {
  const { t } = useTranslation();
  const [showTutorial, setShowTutorial] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!myId) return;
    const storageKey = `${TUTORIAL_SEEN_KEY}:${myId}`;
    if (!localStorage.getItem(storageKey)) {
      setShowTutorial(true);
      localStorage.setItem(storageKey, '1');
    }
  }, [myId]);

  const refresh = useCallback(() => {
    if (myId) loadHistory(myId).then(setHistory);
  }, [myId]);

  useEffect(() => {
    refresh();
    // Une session vient peut-être d'être jouée dans la fenêtre plein écran :
    // recharger l'historique dès qu'elle se ferme, sans changer d'onglet.
    return window.electronAPI.onAimTrainerClosed(refresh);
  }, [refresh]);

  const openHub = useCallback(() => {
    // name/tag/rank/avatar passent par la config au lancement (lus une seule
    // fois à l'ouverture de la fenêtre) plutôt que d'être re-fetchés dans le
    // hub : cette fenêtre plein écran est un rendu autonome, ces infos sont
    // déjà connues ici et coûteraient un aller-retour API en plus là-bas.
    window.electronAPI.openAimTrainer({
      userId: myId,
      apiKey,
      name: settings?.name,
      tag: settings?.tag,
      rank: rank ? { tierId: rank.tierId, tierName: rank.tierName, cardUuid: rank.cardUuid } : null,
      avatarCardUuid: profile?.avatar_card_uuid ?? rank?.cardUuid ?? null,
      displayName: profile?.display_name ?? null,
    });
  }, [myId, apiKey, settings?.name, settings?.tag, rank, profile]);

  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches, 'pc');
  const impact = useMemo(
    () => (settings?.name ? computeTrainingImpact(history, filteredMatches, settings.name, settings.tag) : null),
    [history, filteredMatches, settings?.name, settings?.tag],
  );

  return (
    <div>
      <div className="card aim-hub-launcher-card">
        <h3>{t('aimTrainer.title')}</h3>
        <p className="label">{t('aimTrainer.hint')}</p>
        <button className="refresh aim-launch-btn" onClick={openHub}>
          <Icon icon={Play} size={16} /> {t('aimTrainer.topbarTitle')}
        </button>
        <p className="label" style={{ marginTop: '0.5rem' }}>{t('aimTrainer.launchHint')}</p>
      </div>

      <CollapsibleCard
        id="aimTrainer.howto"
        title={t('aimTrainer.howtoTitle')}
        className="aim-howto-card"
        headerExtra={
          <button type="button" className="hof-suggest-button" onClick={() => setShowTutorial(true)}>
            <Icon icon={HelpCircle} size={14} /> {t('aimTrainer.tutorialReplay')}
          </button>
        }
      >
        <p className="label">{t('aimTrainer.howtoIntro')}</p>
        <div className="aim-howto-steps">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="aim-howto-step">
              <span className="aim-howto-num">{n}</span>
              <div>
                <strong>{t(`aimTrainer.howtoStep${n}Title`)}</strong>
                <span className="label">{t(`aimTrainer.howtoStep${n}Text`)}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleCard>

      {impact && (
        <CollapsibleCard id="aimTrainer.impact" title={t('aimTrainer.impactTitle')}>
          <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />
          {!impact.ready ? (
            <p className="label">
              {t('aimTrainer.impactNotReady', {
                trained: impact.trainedGames,
                untrained: impact.untrainedGames,
                needed: impact.needed,
              })}
            </p>
          ) : (
            <>
              <p className="label">{t('aimTrainer.impactHint')}</p>
              <div className="aim-impact-grid">
                {[
                  { key: 'hsPercent', label: t('aimTrainer.impactHs'), suffix: '%', decimals: 1 },
                  { key: 'kd', label: t('aimTrainer.impactKd'), suffix: '', decimals: 2 },
                  { key: 'winrate', label: t('aimTrainer.impactWinrate'), suffix: '%', decimals: 0 },
                ].map(({ key, label, suffix, decimals }) => {
                  const delta = impact.deltas[key];
                  if (delta === null) return null;
                  const positive = delta >= 0;
                  return (
                    <div key={key} className="aim-impact-tile">
                      <span className={positive ? 'aim-impact-delta up' : 'aim-impact-delta down'}>
                        {positive ? '+' : ''}
                        {delta.toFixed(decimals)}
                        {suffix}
                      </span>
                      <span className="aim-impact-label">{label}</span>
                      <span className="aim-impact-detail">
                        {impact.trained[key] === null ? '—' : impact.trained[key].toFixed(decimals)}
                        {suffix} vs {impact.untrained[key] === null ? '—' : impact.untrained[key].toFixed(decimals)}
                        {suffix}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="label aim-impact-footnote">
                {t('aimTrainer.impactFootnote', {
                  trained: impact.trained.games,
                  untrained: impact.untrained.games,
                })}
              </p>
            </>
          )}
        </CollapsibleCard>
      )}

      {showTutorial && <AimTrainerTutorialModal t={t} onClose={() => setShowTutorial(false)} />}
    </div>
  );
}

export default AimTrainerTab;
