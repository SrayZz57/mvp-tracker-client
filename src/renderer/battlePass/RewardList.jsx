import { useEffect, useMemo, useRef } from 'react';
import { BadgeCheck, Check, Crosshair, Gem, Gift, Hand, IdCard, Lock } from 'lucide-react';
import Icon from '../Icon.jsx';
import { WEAPON_MODELS } from '../aimTrainerModes.js';
import PlayerCardArt from './playerCards.jsx';
import GloveSwatch from './GloveSwatch.jsx';
import { cardKey, handKey, rewardRarity, titleKey } from './labels.js';
import { ECONOMY } from '../shop/economy.js';

// Liste verticale des niveaux : un rail, un nœud par niveau, les récompenses à
// côté. Cliquer une récompense l'affiche en grand dans l'aperçu.

export function rewardName(reward, t) {
  if (reward.type === 'weaponSkin') {
    return t(WEAPON_MODELS[reward.weapon]?.skins?.[reward.skin]?.labelKey ?? 'aimTrainer.skinStandard');
  }
  if (reward.type === 'card') return t(cardKey(reward));
  if (reward.type === 'handSkin') return t(handKey(reward));
  if (reward.type === 'currency') return t('battlePass.points', { amount: ECONOMY.passLevelPoints });
  return t(titleKey(reward));
}

export const rewardState = (reward) => (reward.claimed ? 'claimed' : reward.claimable ? 'claimable' : 'locked');

function RewardRow({ reward, maxLevel, previews, selected, onSelect, t }) {
  const rarity = rewardRarity(reward, maxLevel);
  const state = rewardState(reward);
  const isSkin = reward.type === 'weaponSkin';
  const isCard = reward.type === 'card';
  const isHands = reward.type === 'handSkin';
  const isPoints = reward.type === 'currency';

  return (
    <button
      type="button"
      className="bp-reward"
      data-rarity={rarity}
      data-state={state}
      data-selected={selected ? 'true' : 'false'}
      onClick={() => onSelect(reward.id)}
    >
      <span className="bp-reward-thumb">
        {isSkin ? (
          <img src={previews[reward.weapon]?.[reward.skin] ?? previews[reward.weapon]?.standard} alt="" loading="lazy" decoding="async" />
        ) : isCard ? (
          <PlayerCardArt cardId={reward.id} className="bp-reward-card" />
        ) : isHands ? (
          <GloveSwatch skin={reward.key} size={24} />
        ) : isPoints ? (
          <span className="bp-reward-points">
            <Icon icon={Gem} size={24} />
          </span>
        ) : (
          <Icon icon={BadgeCheck} size={26} />
        )}
      </span>
      <span className="bp-reward-text">
        <span className="bp-reward-kind">
          <Icon icon={isSkin ? Crosshair : isCard ? IdCard : isHands ? Hand : isPoints ? Gem : BadgeCheck} size={11} />
          {isSkin ? t(WEAPON_MODELS[reward.weapon]?.labelKey) : t(`battlePass.type.${reward.type}`)}
        </span>
        <strong className="bp-reward-name">{isSkin || isCard || isHands || isPoints ? rewardName(reward, t) : `« ${rewardName(reward, t)} »`}</strong>
        <span className="bp-reward-rarity">{t(`aimTrainer.rarity.${rarity}`)}</span>
      </span>
      <span className="bp-reward-state">
        {state === 'claimed' && <Icon icon={Check} size={14} />}
        {state === 'claimable' && (
          <>
            <Icon icon={Gift} size={14} /> {t('battlePass.claim')}
          </>
        )}
        {state === 'locked' && (
          <>
            <Icon icon={Lock} size={13} /> {t('battlePass.levelShort', { level: reward.level })}
          </>
        )}
      </span>
    </button>
  );
}

export default function RewardList({ season, levelState, rewards, previews, selectedId, onSelect, t }) {
  const listRef = useRef(null);
  const currentRef = useRef(null);
  const byLevel = useMemo(() => {
    const map = new Map();
    rewards.forEach((r) => map.set(r.level, [...(map.get(r.level) ?? []), r]));
    return map;
  }, [rewards]);
  const levels = useMemo(() => Array.from({ length: season.maxLevel }, (_, i) => i + 1), [season.maxLevel]);

  // Au premier affichage, la liste se centre sur le niveau actuel.
  useEffect(() => {
    const list = listRef.current;
    const node = currentRef.current;
    if (!list || !node) return;
    list.scrollTop = Math.max(0, node.offsetTop - list.clientHeight / 3);
    // Uniquement au montage : ne pas re-centrer quand l'XP monte pendant la lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bp-list" ref={listRef} role="list">
      {levels.map((level) => {
        const here = byLevel.get(level) ?? [];
        const current = level === levelState.level;
        return (
          <div
            key={level}
            role="listitem"
            ref={current ? currentRef : null}
            className={`bp-level${level <= levelState.level ? ' reached' : ''}${current ? ' current' : ''}`}
          >
            <div className="bp-level-node">
              <span>{level}</span>
            </div>
            <div className="bp-level-rewards">
              {here.map((reward) => (
                <RewardRow
                  key={reward.id}
                  reward={reward}
                  maxLevel={season.maxLevel}
                  previews={previews}
                  selected={reward.id === selectedId}
                  onSelect={onSelect}
                  t={t}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
