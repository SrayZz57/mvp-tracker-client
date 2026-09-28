import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Clock, Gift, RefreshCw, Sparkles } from 'lucide-react';
import Icon from '../Icon.jsx';
import { MODES } from '../aimTrainerModes.js';
import RewardList, { rewardName } from './RewardList.jsx';
import RewardPreview from './RewardPreview.jsx';
import './battlePass.css';
import { upcomingSeason } from './catalog.js';
import { challengeLabel, challengeProgress, challengeValueText, remainingLabel, rewardRarity } from './labels.js';
import { xpForNextLevel } from './levels.js';

// Écran du battle pass. Présentation seule : toutes les données arrivent par la
// prop `bp` (voir useBattlePass), ce qui permet de le rendre avec des données
// factices pour le tester.

// Se rafraîchit chaque minute : les comptes à rebours restent justes sans que
// l'écran ne soit rechargé.
function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const PERIODS = ['daily', 'weekly', 'season'];

function Countdown({ endsAt, now, t, prefixKey }) {
  const label = remainingLabel(Date.parse(endsAt), now);
  return (
    <span className="bp-countdown">
      <Icon icon={Clock} size={13} /> {prefixKey ? t(prefixKey, { time: t(label.key, label.params) }) : t(label.key, label.params)}
    </span>
  );
}

function ChallengeRow({ challenge, t }) {
  const label = challengeLabel(challenge);
  const progress = challengeProgress(challenge);
  const done = challenge.completed || challenge.awarded;
  const modeName = label.mode ? t(MODES[label.mode]?.labelKey ?? 'aimTrainer.customTitle') : '';
  return (
    <li className="bp-challenge" data-done={done ? 'true' : 'false'} data-tier={challenge.tier}>
      <span className="bp-challenge-tier">{t(`battlePass.tier.${challenge.tier}`)}</span>
      <div className="bp-challenge-body">
        <span className="bp-challenge-text">{t(label.key, { ...label.params, mode: modeName })}</span>
        <div className="bp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={challenge.target} aria-valuenow={Math.min(Number(challenge.value) || 0, challenge.target)}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <span className="bp-challenge-count">
        {challengeValueText(challenge)}/{challenge.target}
      </span>
      <span className="bp-challenge-xp">
        {done ? (
          <>
            <Icon icon={Check} size={14} /> {t('battlePass.done')}
          </>
        ) : (
          t('battlePass.xpReward', { xp: challenge.xp })
        )}
      </span>
    </li>
  );
}

function ChallengesPanel({ challenges, now, t }) {
  return (
    <div className="bp-challenges">
      {PERIODS.map((period) => {
        const list = challenges.filter((c) => c.period === period);
        if (list.length === 0) return null;
        // Tous les défis d'une période se terminent au même instant.
        return (
          <section key={period} className="bp-challenge-group">
            <header>
              <h3>{t(`battlePass.periods.${period}`)}</h3>
              <Countdown endsAt={list[0].ends_at} now={now} t={t} prefixKey={period === 'season' ? 'battlePass.endsIn' : 'battlePass.resetsIn'} />
            </header>
            <ul>
              {list.map((c) => (
                <ChallengeRow key={c.id} challenge={c} t={t} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Message({ icon, title, text, action }) {
  return (
    <div className="bp-message">
      <Icon icon={icon} size={28} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export default function BattlePassScreen({ bp, previews, config, profile, onEquipSkin, onEquipHands }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const [tab, setTab] = useState('rewards');

  // Sélection : par défaut la première récompense à réclamer, sinon la prochaine.
  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => {
    const rewards = bp.rewards ?? [];
    return (
      rewards.find((r) => r.id === selectedId) ??
      rewards.find((r) => r.claimable) ??
      rewards.find((r) => !r.claimed) ??
      rewards[rewards.length - 1] ??
      null
    );
  }, [bp.rewards, selectedId]);

  const nextReward = useMemo(() => bp.rewards?.find((r) => !r.claimed && !r.claimable) ?? null, [bp.rewards]);

  if (bp.status === 'loading') {
    return <div className="bp-screen bp-screen-single"><div className="bp-loading" aria-busy="true">{t('battlePass.state.loading')}</div></div>;
  }
  if (bp.status === 'signed-out') {
    return <div className="bp-screen bp-screen-single"><Message icon={Sparkles} title={t('battlePass.state.signedOut')} /></div>;
  }
  if (bp.status === 'error') {
    return (
      <div className="bp-screen bp-screen-single">
        <Message
          icon={RefreshCw}
          title={t('battlePass.state.error')}
          action={<button type="button" className="bp-btn bp-btn-primary" onClick={bp.refresh}>{t('battlePass.retry')}</button>}
        />
      </div>
    );
  }
  if (bp.status === 'outdated') {
    return <div className="bp-screen bp-screen-single"><Message icon={Sparkles} title={t('battlePass.state.outdated')} text={t('battlePass.state.outdatedText')} /></div>;
  }
  if (bp.status === 'no-season' || !bp.season) {
    const next = upcomingSeason();
    const date = next ? new Date(next.startsAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) : null;
    return (
      <div className="bp-screen bp-screen-single">
        <Message
          icon={Sparkles}
          title={t('battlePass.state.noSeason')}
          text={next ? t('battlePass.state.nextSeason', { number: next.number, date }) : t('battlePass.state.noSeasonText')}
        />
      </div>
    );
  }

  const { season, levelState } = bp;
  const needed = levelState.maxed ? 0 : xpForNextLevel(season, levelState.level);

  return (
    <div className="bp-screen">
      <div className="bp-left">
      <header className="bp-header">
        <div className="bp-header-title">
          <span className="bp-eyebrow">{t('battlePass.title')}</span>
          <h2>{t('battlePass.season', { number: season.number })}</h2>
          <Countdown endsAt={season.endsAt} now={now} t={t} prefixKey="battlePass.endsIn" />
        </div>

        <div className="bp-level-badge" style={{ '--p': levelState.progress }} aria-label={t('battlePass.levelLong', { level: levelState.level })}>
          <span className="bp-level-badge-ring" aria-hidden="true" />
          <span className="bp-level-badge-inner">
            <small>{t('battlePass.level')}</small>
            <strong>{levelState.level}</strong>
          </span>
        </div>

        <div className="bp-header-xp">
          {levelState.maxed ? (
            <strong>{t('battlePass.maxLevel')}</strong>
          ) : (
            <>
              <strong>{t('battlePass.xpProgress', { current: levelState.xpIntoLevel, needed })}</strong>
              <div className="bp-progress bp-progress-lg" role="progressbar" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={levelState.xpIntoLevel}>
                <span style={{ width: `${levelState.progress * 100}%` }} />
              </div>
            </>
          )}
          {nextReward && (
            <span className="bp-next">
              {t('battlePass.nextReward', {
                level: nextReward.level,
                name: rewardName(nextReward, t),
              })}
              <em data-rarity={rewardRarity(nextReward, season.maxLevel)} />
            </span>
          )}
          {bp.claimableCount > 0 && (
            <button type="button" className="bp-btn bp-btn-primary bp-claim-all" onClick={bp.claimAll}>
              <Icon icon={Gift} size={15} /> {t('battlePass.claimAll', { count: bp.claimableCount })}
            </button>
          )}
        </div>
      </header>

      {bp.lastAward?.xp_gained > 0 && (
        <p className="bp-since" role="status">
          <Icon icon={Sparkles} size={14} /> {t('battlePass.sinceLastVisit', { xp: bp.lastAward.xp_gained })}
        </p>
      )}

      <div className="bp-tabs" role="tablist">
        {['rewards', 'challenges'].map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {t(`battlePass.tabs.${id}`)}
            {id === 'rewards' && bp.claimableCount > 0 && <span className="bp-dot" aria-label={t('battlePass.toClaim', { count: bp.claimableCount })} />}
          </button>
        ))}
      </div>

      {tab === 'rewards' ? (
        <RewardList
          season={season}
          levelState={levelState}
          rewards={bp.rewards}
          previews={previews}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          t={t}
        />
      ) : (
        <ChallengesPanel challenges={bp.challenges} now={now} t={t} />
      )}
      </div>

      <RewardPreview
        reward={selected}
        season={season}
        maxLevel={season.maxLevel}
        equipped={bp.equipped}
        config={config}
        profile={profile}
        busy={bp.busy}
        onClaim={bp.claim}
        onEquipSkin={onEquipSkin}
        onEquipHands={onEquipHands}
        onEquip={bp.equip}
        t={t}
      />
    </div>
  );
}
