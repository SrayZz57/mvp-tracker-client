import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Check, Gem, Gift, RotateCcw, X } from 'lucide-react';
import Icon from '../Icon.jsx';
import WeaponStage from '../WeaponStage.jsx';
import { WEAPON_MODELS } from '../aimTrainerModes.js';
import { Price, bundleItems, bundleValue, itemKind, itemName } from './ShopScreen.jsx';

// Aperçu d'une offre : l'objet en 3D (comme dans le Vestiaire) et l'achat.
// Pour un pack, on passe d'un objet du contenu à l'autre ; l'achat porte
// toujours sur l'offre (le pack entier).
// L'achat demande deux clics : prix, puis confirmation.

export default function ShopPreview({ t, offer, item, owned, ownedIds, balance, busy, weapon, weaponSkin, previews, onSelect, onBuy, onClose }) {
  const stageRef = useRef(null);
  const [confirming, setConfirming] = useState(false);
  const isBundle = offer.item.type === 'bundle';
  const contents = isBundle ? bundleItems(offer.item) : [];
  const shown = item.type === 'bundle' ? contents[0] : item;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => setConfirming(false), [offer.id]);

  // Des gants se montrent sur l'arme équipée, avec son skin actuel.
  const gloveWeapon = WEAPON_MODELS[weapon] ? weapon : 'vandal';
  const stage =
    shown?.type === 'weaponSkin'
      ? { weapon: shown.weapon, skin: shown.skin, hands: null }
      : shown?.type === 'handSkin'
        ? { weapon: gloveWeapon, skin: weaponSkin ?? 'standard', hands: shown.key }
        : null;

  const rarity = offer.item.rarity;
  const tooExpensive = balance < offer.price;

  let action;
  if (owned) {
    action = (
      <span className="sh-owned">
        <Icon icon={Check} size={15} /> {t(isBundle ? 'aimTrainer.shop.bundleOwned' : 'aimTrainer.shop.owned')}
      </span>
    );
  } else if (confirming) {
    action = (
      <div className="sh-pv-confirm">
        <p>{t('aimTrainer.shop.confirmText', { name: itemName(offer.item, t), price: offer.price.toLocaleString() })}</p>
        <p className="sh-modal-after">{t('aimTrainer.shop.balanceAfter', { balance: (balance - offer.price).toLocaleString() })}</p>
        <div className="sh-modal-actions">
          <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setConfirming(false)}>
            {t('aimTrainer.shop.cancel')}
          </button>
          <button type="button" className="ap-btn" disabled={busy} onClick={() => onBuy(offer)}>
            <Icon icon={Gem} size={15} /> {t('aimTrainer.shop.confirm')}
          </button>
        </div>
      </div>
    );
  } else {
    action = (
      <>
        {isBundle && <s className="sh-bundle-value">{t('aimTrainer.shop.bundleValue', { value: bundleValue(offer.item).toLocaleString() })}</s>}
        <button
          type="button"
          className="sh-buy sh-buy-big"
          disabled={busy || tooExpensive}
          title={tooExpensive ? t('aimTrainer.shop.tooExpensive') : ''}
          onClick={() => setConfirming(true)}
        >
          {t('aimTrainer.shop.buy')} · <Price value={offer.price} size={18} />
        </button>
        {tooExpensive && <span className="sh-pv-short">{t('aimTrainer.shop.tooExpensive')}</span>}
      </>
    );
  }

  return (
    <div className="sh-pv" role="dialog" aria-modal="true" aria-label={t('aimTrainer.shop.preview')} onClick={onClose}>
      <div className="sh-pv-card" data-rarity={shown?.rarity ?? rarity} onClick={(e) => e.stopPropagation()}>
        <div className="sh-pv-stage">
          <div className="skin-viewer-watermark sh-pv-watermark" aria-hidden="true">
            {shown ? itemName(shown, t) : ''}
          </div>
          {stage ? (
            <>
              <WeaponStage ref={stageRef} weapon={stage.weapon} skin={stage.skin} hands={stage.hands} className="skin-viewer-canvas" />
              <button type="button" className="sh-pv-reset" onClick={() => stageRef.current?.resetView()} title={t('aimTrainer.skinViewerReset')}>
                <Icon icon={RotateCcw} size={15} />
              </button>
            </>
          ) : (
            <div className="sh-pv-title">
              <Icon icon={BadgeCheck} size={72} />
              <span>{shown ? itemName(shown, t) : ''}</span>
            </div>
          )}
        </div>

        <aside className="sh-pv-side" data-rarity={rarity}>
          <button type="button" className="sh-pv-close" onClick={onClose} aria-label={t('aimTrainer.shop.close')}>
            <Icon icon={X} size={18} />
          </button>
          <span className="sh-kind">{itemKind(offer.item, t)}</span>
          <h3>{itemName(offer.item, t)}</h3>
          <span className={`skin-rarity skin-rarity-${rarity}`}>{t(`aimTrainer.rarity.${rarity}`)}</span>
          {isBundle && <p className="sh-pv-desc">{t('aimTrainer.shop.bundleDesc')}</p>}

          {isBundle && (
            <div className="sh-pv-contents">
              <span className="sh-kind">
                <Icon icon={Gift} size={12} /> {t('aimTrainer.shop.contents')}
              </span>
              {contents.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="sh-pv-item"
                  data-rarity={c.rarity}
                  aria-pressed={shown?.id === c.id}
                  onClick={() => onSelect(c)}
                >
                  <img src={previews[c.weapon]?.[c.skin] ?? previews[c.weapon]?.standard} alt="" decoding="async" />
                  <span>
                    <small>{itemKind(c, t)}</small>
                    <b>{itemName(c, t)}</b>
                  </span>
                  {ownedIds.has(c.id) && <Icon icon={Check} size={14} />}
                </button>
              ))}
            </div>
          )}

          <div className="sh-pv-action">{action}</div>
        </aside>
      </div>
    </div>
  );
}
