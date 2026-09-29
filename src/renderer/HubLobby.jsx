import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Boxes, Check, Crosshair, Crown, Flame, Gauge, Gem, Gift, ShoppingBag, LogOut, Palette, Play, Settings as SettingsIcon, SlidersHorizontal, Trophy, Volume2, VolumeX } from 'lucide-react';
import Icon from './Icon.jsx';
import { MODES, VALORANT_MODE_IDS, WEAPON_MODELS } from './aimTrainerModes.js';
import { ModeArt } from './ModesScreen.jsx';
import { SKIN_RARITY } from './skinRarity.js';
import { rewardName } from './battlePass/RewardList.jsx';
import PlayerCardArt, { cardKeyFromId, cardStyle } from './battlePass/playerCards.jsx';
import GloveSwatch from './battlePass/GloveSwatch.jsx';
import { PlayerTitle, usePlayerCard } from './battlePass/playerCosmetics.jsx';
import { challengeLabel, challengeProgress, challengeValueText, rewardRarity } from './battlePass/labels.js';
import arenaEditorPreview from '../assets/arena-editor-preview.png';
import { ECONOMY } from './shop/economy.js';
import './hubLobby.css';

// Accueil de l'Aim Trainer façon « lobby » de jeu : au centre, le mode en cours
// et le bouton Jouer sur le visuel de sa catégorie, puis des tuiles vers le
// Casier et les catégories de modes ; le défi du jour et les outils à gauche ;
// les chiffres, défis du pass et amis à droite ; le Battle Pass en bas.
//
// Présentation seule : tout l'état reste dans AimTrainerHub, qui passe ce qu'il
// faut ici (et les cartes de classement déjà existantes, en `slots`).

const TIP_COUNT = 7;

function Tip({ t }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % TIP_COUNT), 9000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="lb-tip" key={index}>
      <b>{t('aimTrainer.hubTipLabel')}</b> {t(`aimTrainer.hubTip${index + 1}`)}
    </p>
  );
}

function ProfileChip({ userId, name, tag, avatar, tier, level, onClick, t }) {
  const banner = cardStyle(cardKeyFromId(usePlayerCard(userId)));
  return (
    <button type="button" className="lb-profile" onClick={onClick} style={banner}>
      <span className="lb-profile-veil" aria-hidden="true" />
      <span className="lb-profile-avatar">{avatar ? <img src={avatar} alt="" /> : (name || '?').charAt(0).toUpperCase()}</span>
      <span className="lb-profile-id">
        <strong>
          {name || t('aimTrainer.hubGuest')}
          {tag && <small>#{tag}</small>}
        </strong>
        <PlayerTitle userId={userId} className="lb-profile-title" />
        {!userId || !tier ? null : (
          <span className="lb-profile-rank">
            {tier.icon && <img src={tier.icon} alt="" />}
            {tier.name}
          </span>
        )}
      </span>
      {level != null && (
        <span className="lb-profile-level" title={t('battlePass.levelLong', { level })}>
          <small>{t('battlePass.level')}</small>
          {level}
        </span>
      )}
    </button>
  );
}

function RewardThumb({ reward, previews }) {
  if (reward.type === 'weaponSkin') {
    return <img src={previews[reward.weapon]?.[reward.skin] ?? previews[reward.weapon]?.standard} alt="" />;
  }
  if (reward.type === 'card') return <PlayerCardArt cardId={reward.id} className="lb-thumb-card" />;
  if (reward.type === 'handSkin') return <GloveSwatch skin={reward.key} size={20} />;
  if (reward.type === 'currency') return <Icon icon={Gem} size={22} />;
  return <Icon icon={Trophy} size={22} />;
}

function BattlePassStrip({ bp, previews, onOpen, t }) {
  if (bp.status === 'unavailable' || bp.status === 'signed-out') return null;
  const ready = bp.status === 'ready' && bp.levelState;
  const next = ready ? bp.rewards.find((r) => !r.claimed && !r.claimable) : null;
  const rarity = next ? rewardRarity(next, bp.season.maxLevel) : null;

  return (
    <button type="button" className="lb-bp" onClick={onOpen}>
      <span className="lb-bp-label">
        <Icon icon={Trophy} size={18} />
        <span>
          <b>{t('battlePass.title')}</b>
          <small>{ready ? t('battlePass.season', { number: bp.season.number }) : t('battlePass.state.noSeason')}</small>
        </span>
      </span>

      {ready && (
        <>
          <span className="lb-bp-level">{bp.levelState.level}</span>
          <span className="lb-bp-progress">
            <span className="lb-bp-bar">
              <span style={{ width: `${bp.levelState.progress * 100}%` }} />
            </span>
            <small>
              {bp.levelState.maxed
                ? t('battlePass.maxLevel')
                : t('battlePass.xpProgress', { current: bp.levelState.xpIntoLevel, needed: bp.levelState.xpForNext })}
            </small>
          </span>
          {next && (
            <span className="lb-bp-next" data-rarity={rarity}>
              <span className="lb-bp-thumb">
                <RewardThumb reward={next} previews={previews} />
              </span>
              <span>
                <small>{t('aimTrainer.lobby.nextReward', { level: next.level })}</small>
                <b>{rewardName(next, t)}</b>
              </span>
            </span>
          )}
        </>
      )}

      {bp.claimableCount > 0 ? (
        <span className="lb-bp-cta lb-bp-cta-claim">
          <Icon icon={Gift} size={16} /> {t('battlePass.toClaim', { count: bp.claimableCount })}
        </span>
      ) : (
        <span className="lb-bp-cta">{t('aimTrainer.lobby.openPass')}</span>
      )}
    </button>
  );
}

function PassChallenges({ bp, t }) {
  const daily = (bp.challenges ?? []).filter((c) => c.period === 'daily');
  if (bp.status !== 'ready' || daily.length === 0) return null;
  return (
    <section className="lb-card lb-challenges">
      <header>
        <span className="lb-card-title">{t('aimTrainer.lobby.passChallenges')}</span>
      </header>
      <ul>
        {daily.map((c) => {
          const label = challengeLabel(c);
          const done = c.completed || c.awarded;
          const modeName = label.mode ? t(MODES[label.mode]?.labelKey ?? 'aimTrainer.customTitle') : '';
          return (
            <li key={c.id} data-done={done ? 'true' : 'false'}>
              <span className="lb-challenge-text">{t(label.key, { ...label.params, mode: modeName })}</span>
              <span className="lb-challenge-xp">{done ? '✓' : `+${c.xp}`}</span>
              <span className="lb-challenge-bar">
                <span style={{ width: `${challengeProgress(c) * 100}%` }} />
              </span>
              <small>
                {challengeValueText(c)}/{c.target}
              </small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function HubLobby({
  t,
  sfx,
  profile,
  bp,
  shopBalance = null,
  dailyClaimed = null,
  config,
  previews,
  activeModeId,
  personalBest,
  globalBest,
  recentModes,
  stats,
  muted,
  onToggleMute,
  onExit,
  onPlay,
  onLaunchMode,
  onNavigate,
  onOpenSkin,
  onOpenFinder,
  onOpenEditor,
  onWarmup,
  background,
  modeImages,
  challenge,
  challengeDone,
  challengeBoard,
  onPlayChallenge,
  onOpenModeCategory,
  friendsCard,
}) {
  const mode = MODES[activeModeId];
  const weapon = ['vandal', 'glock'].includes(config.weaponModel) ? config.weaponModel : 'vandal';
  const skin = config.weaponSkins?.[weapon] ?? 'standard';
  const skinLabel = WEAPON_MODELS[weapon]?.skins?.[skin]?.labelKey ?? 'aimTrainer.skinStandard';
  const skinRarity = SKIN_RARITY[skin] ?? 'base';
  const challengeModeDef = MODES[challenge.mode];
  const categoryOf = (id) => (id === 'custom' || !MODES[id] ? 'custom' : VALORANT_MODE_IDS.includes(id) ? 'valorant' : 'classic');
  const challengeCategory = categoryOf(challenge.mode);
  const modeCategory = categoryOf(activeModeId);
  const click = (fn) => () => {
    sfx.click();
    fn();
  };

  const tabs = [
    { id: 'modes', icon: Crosshair, label: t('aimTrainer.lobby.tabs.modes') },
    { id: 'battlepass', icon: Trophy, label: t('aimTrainer.lobby.tabs.battlepass'), badge: bp.claimableCount, hidden: bp.status === 'unavailable' },
    { id: 'stats', icon: BarChart3, label: t('aimTrainer.lobby.tabs.stats') },
    { id: 'leaderboard', icon: Crown, label: t('aimTrainer.lobby.tabs.leaderboard') },
    { id: 'shop', icon: ShoppingBag, label: t('aimTrainer.lobby.tabs.shop'), hidden: shopBalance === null },
    { id: 'settings', icon: SettingsIcon, label: t('aimTrainer.lobby.tabs.settings') },
  ];

  return (
    <div className="lb">
      <div className="lb-bg" aria-hidden="true">
        {background}
      </div>

      <header className="lb-top">
        <div className="lb-brand">
          <img src={profile.logo} alt="MVP Tracker" className="lb-brand-logo" />
          <b>{t('aimTrainer.title')}</b>
        </div>

        <nav className="lb-tabs">
          <button type="button" className="lb-tab active">
            <Icon icon={Play} size={15} /> {t('aimTrainer.lobby.tabs.play')}
          </button>
          {tabs
            .filter((tab) => !tab.hidden)
            .map((tab) => (
              <button key={tab.id} type="button" className="lb-tab" onMouseEnter={sfx.hover} onClick={() => onNavigate(tab.id)}>
                <Icon icon={tab.icon} size={15} /> {tab.label}
                {tab.badge > 0 && <span className="lb-tab-badge">{tab.badge}</span>}
              </button>
            ))}
          <button type="button" className="lb-tab" onMouseEnter={sfx.hover} onClick={() => onNavigate('locker')}>
            <Icon icon={Palette} size={15} /> {t('aimTrainer.lobby.tabs.locker')}
          </button>
        </nav>

        <div className="lb-top-right">
          {shopBalance !== null && (
            <button type="button" className="lb-currency" onMouseEnter={sfx.hover} onClick={() => onNavigate('shop')} title={t('aimTrainer.shop.earnHint')}>
              <Icon icon={Gem} size={15} />
              {shopBalance.toLocaleString()}
            </button>
          )}
          <button type="button" className="lb-icon-btn" onClick={onToggleMute} title={muted ? t('aimTrainer.hubMuteOff') : t('aimTrainer.hubMuteOn')}>
            <Icon icon={muted ? VolumeX : Volume2} size={16} />
          </button>
          <button type="button" className="lb-icon-btn" onClick={onExit} title={t('aimTrainer.hubExit')}>
            <Icon icon={LogOut} size={16} />
          </button>
          <ProfileChip
            userId={profile.userId}
            name={profile.name}
            tag={profile.tag}
            avatar={profile.avatar}
            tier={profile.tier}
            level={bp.status === 'ready' ? bp.levelState?.level : null}
            onClick={() => onNavigate('stats')}
            t={t}
          />
        </div>
      </header>

      <main className="lb-body">
        <section className="lb-left">
          <article className="lb-challenge" data-cat={challengeCategory}>
            <span className="lb-challenge-art" aria-hidden="true">
              <ModeArt category={challengeCategory} images={modeImages} />
            </span>
            <span className="lb-feature-tag">
              <Icon icon={Flame} size={13} /> {t('aimTrainer.dailyChallenge')}
            </span>
            <h3>
              {challengeModeDef && <Icon icon={challengeModeDef.icon} size={22} />}
              {challengeModeDef ? t(challengeModeDef.labelKey) : ''}
            </h3>
            <p>
              {t('aimTrainer.challengeSetup', {
                seconds: challenge.duration,
                size: challenge.targetSize.toFixed(2),
                count: challenge.targetCount,
              })}
            </p>
            <button type="button" className="lb-challenge-cta" onMouseEnter={sfx.hover} onClick={onPlayChallenge}>
              <Icon icon={Play} size={15} />
              {challengeDone ? t('aimTrainer.retryChallenge') : t('aimTrainer.playChallenge')}
            </button>
            {challengeBoard && (
              <div className="lb-challenge-board">
                <span className="lb-card-title">{t('aimTrainer.todayRanking')}</span>
                {challengeBoard}
              </div>
            )}
          </article>

          <span className="lb-eyebrow">{t('aimTrainer.lobby.tools')}</span>
          <div className="lb-tools">
            <button type="button" className="lb-tool" onMouseEnter={sfx.hover} onClick={click(onWarmup)}>
              <Icon icon={Flame} size={18} />
              <span>
                <b>{t('aimTrainer.modesHub.warmupTitle')}</b>
                <small>{t('aimTrainer.modesHub.warmupDesc')}</small>
              </span>
            </button>
            <button type="button" className="lb-tool" onMouseEnter={sfx.hover} onClick={click(onOpenFinder)}>
              <Icon icon={Gauge} size={18} />
              <span>
                <b>{t('aimTrainer.lobby.finder')}</b>
                <small>{t('aimTrainer.finderHint')}</small>
              </span>
            </button>
          </div>

          <button type="button" className="lb-tool-feature" onMouseEnter={sfx.hover} onClick={click(onOpenEditor)}>
            <img className="lb-tool-feature-art" src={arenaEditorPreview} alt="" />
            <span className="lb-tool-feature-shade" aria-hidden="true" />
            <Icon icon={Boxes} size={26} />
            <span>
              <b>{t('aimTrainer.arenaEditor.toolTitle')}</b>
              <small>{t('aimTrainer.arenaEditor.toolDesc')}</small>
            </span>
            <Icon className="lb-tool-feature-arrow" icon={ArrowRight} size={16} />
          </button>
        </section>

        <section className="lb-center">
          <article className="lb-feature" data-cat={modeCategory} style={{ '--mode-accent': mode?.accent ?? '#ff4655' }}>
            <span className="lb-feature-art" aria-hidden="true">
              <ModeArt category={modeCategory} images={modeImages} />
            </span>
            <span className="lb-feature-shade" aria-hidden="true" />
            <div className="lb-feature-body">
              <span className="lb-feature-tag">
                {mode && <Icon icon={mode.icon} size={13} />} {t('aimTrainer.lobby.selectedMode')}
              </span>
              <h2>{mode ? t(mode.labelKey) : t('aimTrainer.customTitle')}</h2>
              {mode && <p>{t(mode.descKey)}</p>}
              <div className="lb-feature-bests">
                <span>
                  <b>{personalBest ?? '—'}</b>
                  <small>{t('aimTrainer.yourBest')}</small>
                </span>
                <span>
                  <b className="lb-gold">{globalBest ?? '—'}</b>
                  <small>{t('aimTrainer.globalBest')}</small>
                </span>
              </div>
              <div className="lb-feature-actions">
                <button type="button" className="lb-play" onMouseEnter={sfx.hover} onClick={onPlay}>
                  <Icon icon={Play} size={30} />
                  {t('aimTrainer.hubPlay')}
                </button>
                <button type="button" className="lb-link" onMouseEnter={sfx.hover} onClick={() => onNavigate('modes')}>
                  {t('aimTrainer.lobby.changeMode')} →
                </button>
              </div>
            </div>
            {recentModes.length > 0 && (
              <div className="lb-feature-board lb-recent-panel">
                <span className="lb-card-title">{t('aimTrainer.lobby.recent')}</span>
                {recentModes.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="lb-chip"
                    style={{ '--mode-accent': MODES[id].accent }}
                    onMouseEnter={sfx.hover}
                    onClick={() => onLaunchMode(id)}
                    title={t('aimTrainer.lobby.launchNow')}
                  >
                    <Icon icon={MODES[id].icon} size={15} /> {t(MODES[id].labelKey)}
                    <Icon icon={Play} size={12} />
                  </button>
                ))}
              </div>
            )}
          </article>

          <div className="lb-tiles">
            <button type="button" className="lb-tile lb-tile-locker" data-rarity={skinRarity} onMouseEnter={sfx.hover} onClick={() => onNavigate('locker')}>
              <img className="lb-tile-weapon" src={previews[weapon]?.[skin] ?? previews[weapon]?.standard} alt="" />
              <span className="lb-tile-body">
                <span className="lb-tile-tag">
                  <Icon icon={Palette} size={13} /> {t('aimTrainer.lobby.tabs.locker')}
                </span>
                <strong>
                  {t(WEAPON_MODELS[weapon]?.labelKey)} <span>{t(skinLabel)}</span>
                </strong>
                <span className={`skin-rarity skin-rarity-${skinRarity}`}>{t(`aimTrainer.rarity.${skinRarity}`)}</span>
              </span>
              <Icon icon={ArrowRight} size={18} className="lb-tile-arrow" />
            </button>

            {['valorant', 'custom'].map((category) => (
              <button
                key={category}
                type="button"
                className="lb-tile lb-tile-mode"
                data-cat={category}
                onMouseEnter={sfx.hover}
                onClick={click(() => onOpenModeCategory(category))}
              >
                <span className="lb-tile-art" aria-hidden="true">
                  <ModeArt category={category} images={modeImages} />
                </span>
                <span className="lb-tile-body">
                  <span className="lb-tile-tag">
                    <Icon icon={category === 'valorant' ? Crosshair : SlidersHorizontal} size={13} /> {t(`aimTrainer.modesHub.${category}.tag`)}
                  </span>
                  <strong>{t(`aimTrainer.modesHub.${category}.name`)}</strong>
                </span>
                <Icon icon={ArrowRight} size={18} className="lb-tile-arrow" />
              </button>
            ))}
          </div>

          <Tip t={t} />
        </section>

        <aside className="lb-right">
          <button type="button" className="lb-stats" onMouseEnter={sfx.hover} onClick={() => onNavigate('stats')}>
            <span>
              <b>{stats.sessions}</b>
              <small>{t('aimTrainer.hubStatSessions')}</small>
            </span>
            <span>
              <b>{stats.streak}</b>
              <small>{t('aimTrainer.hubStatStreak')}</small>
            </span>
            <span>
              <b>{stats.records}</b>
              <small>{t('aimTrainer.hubStatRecords')}</small>
            </span>
          </button>
          <PassChallenges bp={bp} t={t} />
          {friendsCard}
          {dailyClaimed !== null && (
            <button type="button" className="lb-daily" data-ready={dailyClaimed ? 'false' : 'true'} onMouseEnter={sfx.hover} onClick={click(() => onNavigate('daily'))}>
              <span className="lb-daily-icon">
                <Icon icon={dailyClaimed ? Check : Gift} size={22} />
              </span>
              <span className="lb-daily-text">
                <b>{t('aimTrainer.shop.dailyLogin.cardTitle')}</b>
                <small>
                  {dailyClaimed ? t('aimTrainer.shop.dailyLogin.cardDone') : t('aimTrainer.shop.dailyLogin.cardReady', { amount: ECONOMY.dailyLoginPoints.toLocaleString() })}
                </small>
              </span>
              <Icon icon={ArrowRight} size={16} />
            </button>
          )}
        </aside>
      </main>

      <footer className="lb-bottom">
        <BattlePassStrip bp={bp} previews={previews} onOpen={() => onNavigate('battlepass')} t={t} />
      </footer>
    </div>
  );
}
