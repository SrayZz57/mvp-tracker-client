import { useMemo } from 'react';
import { BadgeCheck, Check, Hand, IdCard, Lock, Palette } from 'lucide-react';
import Icon from './Icon.jsx';
import { WEAPON_MODELS } from './aimTrainerModes.js';
import { SKIN_RARITY } from './skinRarity.js';
import { SEASONS, listRewards } from './battlePass/catalog.js';
import { rewardRarity } from './battlePass/labels.js';
import PlayerCardArt, { PlayerCardFrame } from './battlePass/playerCards.jsx';
import { titleName } from './battlePass/playerCosmetics.jsx';
import GloveSwatch from './battlePass/GloveSwatch.jsx';
import { HAND_SKINS } from './handSkins.js';
import { isHandLocked } from './battlePass/ownership.js';
import { SHOP_ITEMS } from './shop/catalog.js';
import './aimPages.css';
import './battlePass/battlePass.css';

// Casier : ce que les autres joueurs voient de toi (carte de joueur et titre),
// et l'accès aux skins d'armes. Toutes les récompenses de toutes les saisons y
// figurent ; celles que tu n'as pas encore indiquent où les obtenir.

// Toutes les cartes et tous les titres du catalogue, avec leur saison d'origine
// (la première qui les offre).
function useCatalogCosmetics() {
  return useMemo(() => {
    const seen = new Map();
    for (const season of SEASONS) {
      for (const reward of listRewards(season)) {
        if ((reward.type === 'card' || reward.type === 'title') && !seen.has(reward.id)) {
          seen.set(reward.id, { ...reward, seasonNumber: season.number, rarity: rewardRarity(reward, season.maxLevel) });
        }
      }
    }
    // Exclusivités de la boutique (titres), avec leur prix à la place du niveau.
    SHOP_ITEMS.filter((i) => i.type === 'title' && !seen.has(i.id)).forEach((i) => seen.set(i.id, { ...i, shopPrice: i.price }));
    const all = [...seen.values()];
    return { cards: all.filter((r) => r.type === 'card'), titles: all.filter((r) => r.type === 'title') };
  }, []);
}

function LockHint({ reward, t }) {
  return (
    <span className="lk-lock">
      <Icon icon={Lock} size={12} /> {t('battlePass.lock.unlockAt', { season: reward.seasonNumber, level: reward.level })}
    </span>
  );
}

// owned : tout ce que le joueur possède (pass + boutique) ; shopActive : la
// boutique est-elle en service (sinon ses objets ne sont pas verrouillés).
export default function LockerScreen({ t, bp, owned: ownedAll, shopActive = false, profile, config, previews, onOpenSkins, onEquipHands, isAdmin = false }) {
  const { cards, titles } = useCatalogCosmetics();
  const owned = ownedAll ?? bp.ownedRewardIds ?? new Set();
  const usable = bp.status !== 'unavailable' && bp.status !== 'signed-out';
  const equippedCard = bp.equipped?.card_id ?? null;
  const equippedTitle = bp.equipped?.title_id ?? null;
  const busy = bp.busy ?? new Set();

  const previewRarity = useMemo(() => cards.find((c) => c.id === equippedCard)?.rarity ?? 'base', [cards, equippedCard]);
  const weapon = WEAPON_MODELS[config.weaponModel] ? config.weaponModel : 'vandal';
  const skin = config.weaponSkin ?? 'standard';
  const skinRarity = SKIN_RARITY[skin] ?? 'base';

  const toggle = (kind, id, isEquipped) => bp.equip(kind, isEquipped ? null : id);

  return (
    <div className="ap-screen">
      <header className="ap-head">
        <span className="ap-eyebrow">{t('aimTrainer.title')}</span>
        <h2>{t('aimTrainer.locker.title')}</h2>
        <p>{t('aimTrainer.locker.subtitle')}</p>
      </header>

      {!usable && <p className="ap-empty">{bp.status === 'signed-out' ? t('battlePass.state.signedOut') : t('aimTrainer.locker.unavailable')}</p>}

      <div className="lk-top">
        <section className="ap-card lk-preview" data-rarity={previewRarity}>
          <header className="ap-card-head">
            <h3>
              <Icon icon={IdCard} size={17} /> {t('aimTrainer.locker.preview')}
            </h3>
            <span>{t('aimTrainer.locker.previewHint')}</span>
          </header>
          <div className="lk-preview-stage">
            {equippedCard ? (
              <PlayerCardFrame
                cardId={equippedCard}
                rarity={previewRarity}
                name={profile.name}
                title={titleName(t, equippedTitle)}
                avatar={profile.avatar}
                levelLabel={bp.levelState ? t('battlePass.levelLong', { level: bp.levelState.level }) : ''}
                rarityLabel={t(`aimTrainer.rarity.${previewRarity}`)}
              />
            ) : (
              <div className="lk-nocard">
                <span className="lk-nocard-avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : (profile.name || '?').charAt(0)}</span>
                <span>
                  <b>{profile.name}</b>
                  {equippedTitle && <em>« {titleName(t, equippedTitle)} »</em>}
                  <small>{t('aimTrainer.locker.noCard')}</small>
                </span>
              </div>
            )}
          </div>
        </section>

        <button type="button" className="ap-card lk-skins" data-rarity={skinRarity} onClick={onOpenSkins}>
          <header className="ap-card-head">
            <h3>
              <Icon icon={Palette} size={17} /> {t('aimTrainer.locker.skins')}
            </h3>
          </header>
          <img src={previews[weapon]?.[skin] ?? previews[weapon]?.standard} alt="" />
          <strong>
            {t(WEAPON_MODELS[weapon]?.labelKey)} <span>{t(WEAPON_MODELS[weapon]?.skins?.[skin]?.labelKey ?? 'aimTrainer.skinStandard')}</span>
          </strong>
          <span className="ap-btn">{t('aimTrainer.locker.openSkins')} →</span>
        </button>
      </div>

      <section className="ap-card">
        <header className="ap-card-head">
          <h3>
            <Icon icon={IdCard} size={17} /> {t('aimTrainer.locker.cards')}
          </h3>
          <span>{t('aimTrainer.locker.owned', { owned: cards.filter((c) => owned.has(c.id)).length, total: cards.length })}</span>
        </header>
        <div className="lk-cards">
          {cards.map((card) => {
            const has = owned.has(card.id);
            const isEquipped = equippedCard === card.id;
            return (
              <button
                key={card.id}
                type="button"
                className="lk-card"
                data-rarity={card.rarity}
                data-owned={has ? 'true' : 'false'}
                data-equipped={isEquipped ? 'true' : 'false'}
                disabled={!has || !usable || busy.has('equip:card')}
                onClick={() => toggle('card', card.id, isEquipped)}
              >
                <PlayerCardArt cardId={card.id} className="lk-card-art" />
                <span className="lk-card-info">
                  <b>{t(`battlePass.cards.${card.key}`)}</b>
                  <small>{t(`aimTrainer.rarity.${card.rarity}`)}</small>
                </span>
                {isEquipped ? (
                  <span className="lk-state lk-state-on">
                    <Icon icon={Check} size={12} /> {t('battlePass.equipped')}
                  </span>
                ) : has ? (
                  <span className="lk-state">{t('battlePass.equip')}</span>
                ) : (
                  <LockHint reward={card} t={t} />
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="ap-card">
        <header className="ap-card-head">
          <h3>
            <Icon icon={Hand} size={17} /> {t('aimTrainer.locker.gloves')}
          </h3>
          <span>{t('aimTrainer.locker.glovesHint')}</span>
        </header>
        <div className="lk-gloves">
          {/* Seulement les gants possédés (sans Battle Pass — migration absente,
              pas de compte — rien n'est verrouillé, donc tout s'affiche ;
              les comptes admin voient et équipent tout). */}
          {Object.keys(HAND_SKINS)
            .filter((key) => isAdmin || !isHandLocked(owned, key, { pass: usable, shop: shopActive }))
            .map((key) => {
              const isEquipped = (config.handSkin ?? 'standard') === key;
              return (
                <button
                  key={key}
                  type="button"
                  className="lk-glove"
                  data-owned="true"
                  data-equipped={isEquipped ? 'true' : 'false'}
                  disabled={isEquipped}
                  onClick={() => onEquipHands(key)}
                >
                  <span className="lk-glove-art">
                    <GloveSwatch skin={key} size={34} />
                  </span>
                  <b>{t(`battlePass.hands.${key}`)}</b>
                  {isEquipped ? (
                    <span className="lk-state lk-state-on">
                      <Icon icon={Check} size={12} /> {t('battlePass.equipped')}
                    </span>
                  ) : (
                    <span className="lk-state">{t('battlePass.equip')}</span>
                  )}
                </button>
              );
            })}
        </div>
      </section>

      <section className="ap-card">
        <header className="ap-card-head">
          <h3>
            <Icon icon={BadgeCheck} size={17} /> {t('aimTrainer.locker.titles')}
          </h3>
          <span>{t('aimTrainer.locker.owned', { owned: titles.filter((c) => owned.has(c.id)).length, total: titles.length })}</span>
        </header>
        <div className="lk-titles">
          {titles.map((title) => {
            const has = owned.has(title.id);
            const isEquipped = equippedTitle === title.id;
            return (
              <button
                key={title.id}
                type="button"
                className="lk-title"
                data-rarity={title.rarity}
                data-owned={has ? 'true' : 'false'}
                data-equipped={isEquipped ? 'true' : 'false'}
                disabled={!has || !usable || busy.has('equip:title')}
                onClick={() => toggle('title', title.id, isEquipped)}
                title={has ? '' : title.shopPrice ? t('aimTrainer.shop.lockShop', { price: title.shopPrice.toLocaleString() }) : t('battlePass.lock.unlockAt', { season: title.seasonNumber, level: title.level })}
              >
                <span className="lk-title-name">« {titleName(t, title.id)} »</span>
                {isEquipped ? (
                  <span className="lk-state lk-state-on">
                    <Icon icon={Check} size={12} /> {t('battlePass.equipped')}
                  </span>
                ) : has ? (
                  <span className="lk-state">{t('battlePass.equip')}</span>
                ) : (
                  <span className="lk-lock">
                    <Icon icon={Lock} size={12} /> {title.shopPrice ? `${title.shopPrice.toLocaleString()} ✦` : t('battlePass.levelShort', { level: title.level })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
