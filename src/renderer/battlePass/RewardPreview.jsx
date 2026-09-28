import { useRef } from 'react';
import { BadgeCheck, Check, Crosshair, Gem, Gift, Lock, RotateCcw, Sparkles } from 'lucide-react';
import Icon from '../Icon.jsx';
import WeaponStage from '../WeaponStage.jsx';
import { WEAPON_MODELS } from '../aimTrainerModes.js';
import { PlayerCardFrame } from './playerCards.jsx';
import { titleName } from './playerCosmetics.jsx';
import { rewardName, rewardState } from './RewardList.jsx';
import { rewardRarity } from './labels.js';

// Aperçu de la récompense sélectionnée : l'arme en 3D en direct (la même scène
// que le Vestiaire, qu'on tourne à la souris et qu'on peut faire tirer), la
// carte de joueur en grand, ou le titre. La scène 3D reste montée quand on passe
// sur autre chose, pour ne pas recréer un contexte WebGL à chaque clic.
export default function RewardPreview({ reward, season, maxLevel, equipped, config, busy, profile, onClaim, onEquipSkin, onEquipHands, onEquip, t }) {
  const stageRef = useRef(null);
  const lastSkin = useRef(null);

  const isSkin = reward?.type === 'weaponSkin';
  const isHands = reward?.type === 'handSkin';
  const is3d = isSkin || isHands;
  // Gants : montrés sur l'arme et le skin actuellement équipés.
  if (isSkin) lastSkin.current = { weapon: reward.weapon, skin: reward.skin, hands: null };
  if (isHands) {
    lastSkin.current = {
      weapon: WEAPON_MODELS[config.weaponModel] ? config.weaponModel : 'vandal',
      skin: config.weaponSkin ?? 'standard',
      hands: reward.key,
    };
  }

  if (!reward) return <section className="bp-preview" />;

  const rarity = rewardRarity(reward, maxLevel);
  const state = rewardState(reward);
  const name = rewardName(reward, t);
  const kind = reward.type; // 'weaponSkin' | 'handSkin' | 'title' | 'card'
  const working = busy.has(reward.id) || busy.has(`equip:${kind}`);
  const skinEquipped = isSkin && config.weaponModel === reward.weapon && (config.weaponSkin ?? 'standard') === reward.skin;
  const handsEquipped = isHands && (config.handSkin ?? 'standard') === reward.key;
  const cosmeticEquipped = !is3d && equipped[`${kind}_id`] === reward.id;
  const shown = lastSkin.current;

  let action;
  if (state === 'locked') {
    action = (
      <span className="bp-preview-status">
        <Icon icon={Lock} size={16} /> {t('battlePass.levelLong', { level: reward.level })}
      </span>
    );
  } else if (state === 'claimable') {
    action = (
      <button type="button" className="bp-btn bp-btn-primary bp-btn-big" disabled={working} onClick={() => onClaim(reward.id)}>
        <Icon icon={Gift} size={18} /> {t('battlePass.claim')}
      </button>
    );
  } else if (isSkin) {
    action = skinEquipped ? (
      <span className="bp-preview-status ok">
        <Icon icon={Check} size={16} /> {t('battlePass.equipped')}
      </span>
    ) : (
      <button type="button" className="bp-btn bp-btn-primary bp-btn-big" onClick={() => onEquipSkin(reward.weapon, reward.skin)}>
        {t('battlePass.equip')}
      </button>
    );
  } else if (kind === 'currency') {
    action = (
      <span className="bp-preview-status ok">
        <Icon icon={Check} size={16} /> {t('aimTrainer.shop.claimed')}
      </span>
    );
  } else if (isHands) {
    action = handsEquipped ? (
      <span className="bp-preview-status ok">
        <Icon icon={Check} size={16} /> {t('battlePass.equipped')}
      </span>
    ) : (
      <button type="button" className="bp-btn bp-btn-primary bp-btn-big" onClick={() => onEquipHands(reward.key)}>
        {t('battlePass.equip')}
      </button>
    );
  } else {
    action = cosmeticEquipped ? (
      <button type="button" className="bp-btn bp-btn-ghost bp-btn-big" disabled={working} onClick={() => onEquip(kind, null)}>
        <Icon icon={Check} size={16} /> {t('battlePass.equipped')} · {t('battlePass.unequip')}
      </button>
    ) : (
      <button type="button" className="bp-btn bp-btn-primary bp-btn-big" disabled={working} onClick={() => onEquip(kind, reward.id)}>
        {t('battlePass.equip')}
      </button>
    );
  }

  return (
    <section className="bp-preview" data-rarity={rarity} data-kind={kind} aria-live="polite">
      {shown && (
        <div className="bp-stage" hidden={!is3d}>
          <WeaponStage ref={stageRef} weapon={shown.weapon} skin={shown.skin} hands={shown.hands} className="skin-viewer-canvas" />
        </div>
      )}

      <div className="skin-viewer-watermark bp-watermark" aria-hidden="true">
        {name}
      </div>

      {kind === 'title' && (
        <div className="bp-preview-title">
          <Icon icon={BadgeCheck} size={72} />
          <span>« {name} »</span>
        </div>
      )}

      {kind === 'currency' && (
        <div className="bp-preview-title bp-preview-points">
          <Icon icon={Gem} size={96} />
          <span>{name}</span>
        </div>
      )}

      {kind === 'card' && (
        <div className="bp-preview-card-wrap">
          <PlayerCardFrame
            cardId={reward.id}
            rarity={rarity}
            name={profile?.name}
            title={titleName(t, equipped.title_id)}
            avatar={profile?.avatar}
            levelLabel={t('battlePass.levelLong', { level: reward.level })}
            rarityLabel={t(`aimTrainer.rarity.${rarity}`)}
          />
        </div>
      )}

      <header className="bp-preview-head">
        <span className="skin-viewer-eyebrow">
          {t('battlePass.season', { number: season.number })} · {t('battlePass.levelLong', { level: reward.level })}
        </span>
        <h2>
          {isSkin ? t(WEAPON_MODELS[reward.weapon]?.labelKey) : t(`battlePass.type.${kind}`)} <span>{name}</span>
        </h2>
        <span className={`skin-rarity skin-rarity-${rarity}`}>{t(`aimTrainer.rarity.${rarity}`)}</span>
        {isSkin && <p className="skin-viewer-desc">{t(`aimTrainer.skinDesc.${reward.skin}`, { defaultValue: '' })}</p>}
      </header>

      <footer className="bp-preview-foot">
        {is3d && (
          <div className="bp-preview-tools">
            <button
              type="button"
              className="skin-viewer-fire"
              onPointerDown={() => stageRef.current?.startFiring()}
              onPointerUp={() => stageRef.current?.stopFiring()}
              onPointerLeave={() => stageRef.current?.stopFiring()}
            >
              <Icon icon={Crosshair} size={16} /> {t('aimTrainer.skinViewerFire')}
            </button>
            {rarity === 'transcendent' && (
              <button type="button" className="skin-viewer-icon-btn" onClick={() => stageRef.current?.replayIntro()} title={t('aimTrainer.skinViewerIntro')}>
                <Icon icon={Sparkles} size={16} />
              </button>
            )}
            <button type="button" className="skin-viewer-icon-btn" onClick={() => stageRef.current?.resetView()} title={t('aimTrainer.skinViewerReset')}>
              <Icon icon={RotateCcw} size={16} />
            </button>
            <span className="skin-viewer-hint">{t('aimTrainer.skinViewerHint')}</span>
          </div>
        )}
        <div className="bp-preview-action">{action}</div>
      </footer>
    </section>
  );
}
