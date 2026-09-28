import { lazy, Suspense, useEffect, useState } from 'react';
import { BadgeCheck, Check, Clock, Eye, Gem, Gift, ShoppingBag } from 'lucide-react';
import Icon from '../Icon.jsx';
import { WEAPON_MODELS } from '../aimTrainerModes.js';
import GloveSwatch from '../battlePass/GloveSwatch.jsx';
import { remainingLabel } from '../battlePass/labels.js';
import { titleName } from '../battlePass/playerCosmetics.jsx';
import { SHOP_ITEM_BY_ID } from './catalog.js';
import '../aimPages.css';
import './shop.css';

// L'aperçu embarque three.js : chargé au premier clic seulement.
const ShopPreview = lazy(() => import('./ShopPreview.jsx'));

// Boutique de l'Aim Trainer : pack de bienvenue en bandeau, offre vedette de la
// semaine en grand, offres du jour à côté. Un clic ouvre l'aperçu (et l'achat).
// Présentation seule : les données viennent de useShop.

export const itemName = (item, t) => {
  if (item.type === 'weaponSkin') return t(WEAPON_MODELS[item.weapon]?.skins?.[item.skin]?.labelKey ?? 'aimTrainer.skinStandard');
  if (item.type === 'handSkin') return t(`battlePass.hands.${item.key}`);
  if (item.type === 'title') return `« ${titleName(t, item.id)} »`;
  if (item.type === 'bundle') return t('aimTrainer.shop.bundleName');
  return item.id;
};

export const itemKind = (item, t) =>
  item.type === 'weaponSkin'
    ? t(WEAPON_MODELS[item.weapon]?.labelKey)
    : item.type === 'bundle'
      ? t('aimTrainer.shop.bundleTag')
      : t(`battlePass.type.${item.type}`);

export const bundleItems = (bundle) => (bundle.items ?? []).map((id) => SHOP_ITEM_BY_ID.get(id)).filter(Boolean);
export const bundleValue = (bundle) => bundleItems(bundle).reduce((sum, item) => sum + item.price, 0);

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Price({ value, size = 15 }) {
  return (
    <span className="sh-price">
      <Icon icon={Gem} size={size} /> {value.toLocaleString()}
    </span>
  );
}

function ItemArt({ item, previews, big = false }) {
  if (item.type === 'weaponSkin') {
    return <img className="sh-art-img" src={previews[item.weapon]?.[item.skin] ?? previews[item.weapon]?.standard} alt="" decoding="async" />;
  }
  if (item.type === 'handSkin') {
    return (
      <span className="sh-art-glove">
        <GloveSwatch skin={item.key} size={big ? 150 : 64} />
      </span>
    );
  }
  return (
    <span className="sh-art-title">
      <Icon icon={BadgeCheck} size={big ? 44 : 28} />
    </span>
  );
}

function PriceTag({ offer, owned, t }) {
  if (owned) {
    return (
      <span className="sh-owned">
        <Icon icon={Check} size={15} /> {t('aimTrainer.shop.owned')}
      </span>
    );
  }
  return (
    <span className="sh-tagprice">
      <Price value={offer.price} />
    </span>
  );
}

function Countdown({ endsAt, now, t }) {
  const label = remainingLabel(Date.parse(endsAt), now);
  return (
    <span className="sh-countdown">
      <Icon icon={Clock} size={13} /> {t('aimTrainer.shop.endsIn', { time: t(label.key, label.params) })}
    </span>
  );
}

function BundleBanner({ offer, owned, previews, onOpen, t }) {
  const items = bundleItems(offer.item);
  return (
    <section className="sh-bundle" data-rarity={offer.item.rarity} data-owned={owned ? 'true' : 'false'}>
      <span className="sh-bundle-shine" aria-hidden="true" />
      <div className="sh-bundle-info">
        <span className="sh-tag">
          <Icon icon={Gift} size={13} /> {t('aimTrainer.shop.bundleTag')}
        </span>
        <h3>{t('aimTrainer.shop.bundleName')}</h3>
        <p>{t('aimTrainer.shop.bundleDesc')}</p>
        <div className="sh-bundle-buy">
          {owned ? (
            <span className="sh-owned">
              <Icon icon={Check} size={15} /> {t('aimTrainer.shop.bundleOwned')}
            </span>
          ) : (
            <>
              <s className="sh-bundle-value">{t('aimTrainer.shop.bundleValue', { value: bundleValue(offer.item).toLocaleString() })}</s>
              <button type="button" className="sh-buy sh-buy-big" onClick={() => onOpen(offer, offer.item)}>
                <Price value={offer.price} size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="sh-bundle-items">
        {items.map((item) => (
          <button key={item.id} type="button" className="sh-bundle-item" data-rarity={item.rarity} onClick={() => onOpen(offer, item)}>
            <span className="sh-bundle-art">
              <ItemArt item={item} previews={previews} />
            </span>
            <span className="sh-kind">{itemKind(item, t)}</span>
            <strong>{itemName(item, t)}</strong>
            <span className="sh-preview-hint">
              <Icon icon={Eye} size={13} /> {t('aimTrainer.shop.preview')}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function ShopScreen({ t, shop, previews, weapon, weaponSkin }) {
  const now = useNow();
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState(null);

  // useShop ne charge les offres qu'une fois au démarrage de l'Aim Trainer
  // (userId), pas à chaque fois qu'on rouvre cet écran — sans ça, un
  // changement d'offres côté serveur pendant que l'app tourne déjà (semis
  // rejoué, correction de rotation...) resterait invisible jusqu'au
  // redémarrage complet de l'app.
  useEffect(() => {
    shop.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const bundle = shop.offers.find((o) => o.kind === 'bundle') ?? null;
  const daily = shop.offers.filter((o) => o.kind === 'daily');
  const owned = (offer) => shop.ownedIds.has(offer.item_id);
  const open = (offer, item = offer.item) => setPreview({ offer, item });

  const buy = async (offer) => {
    const result = await shop.buy(offer);
    if (result === 'ok') {
      setPreview(null);
      setToast({ ok: true, text: t('aimTrainer.shop.success', { name: itemName(offer.item, t) }) });
    } else if (result === 'unavailable') {
      setPreview(null);
      setToast({ ok: false, text: t('aimTrainer.shop.unavailable') });
    } else if (result === 'insufficient') setToast({ ok: false, text: t('aimTrainer.shop.tooExpensive') });
    else if (result !== 'owned') setToast({ ok: false, text: t('aimTrainer.shop.error') });
  };

  let body;
  if (shop.status === 'loading') body = <p className="ap-empty">{t('battlePass.state.loading')}</p>;
  else if (shop.status === 'signed-out') body = <p className="ap-empty">{t('battlePass.state.signedOut')}</p>;
  else if (shop.status === 'unavailable') body = <p className="ap-empty">{t('aimTrainer.shop.closed')}</p>;
  else if (shop.status === 'error') body = <p className="ap-empty">{t('aimTrainer.shop.error')}</p>;
  else if (!bundle && daily.length === 0) body = <p className="ap-empty">{t('aimTrainer.shop.empty')}</p>;
  else {
    body = (
      <div className="sh-body">
        {bundle && <BundleBanner offer={bundle} owned={owned(bundle)} previews={previews} onOpen={open} t={t} />}

        {daily.length > 0 && (
          <div className="sh-grid">
            <section className="sh-daily">
              <header className="sh-tagline">
                <span className="sh-tag">
                  <Icon icon={ShoppingBag} size={13} /> {t('aimTrainer.shop.daily')}
                </span>
                {daily[0] && <Countdown endsAt={daily[0].ends_at} now={now} t={t} />}
              </header>
              <div className="sh-daily-grid">
                {daily.map((offer) => (
                  <button
                    key={offer.id}
                    type="button"
                    className="sh-card"
                    data-rarity={offer.item.rarity}
                    data-owned={owned(offer) ? 'true' : 'false'}
                    onClick={() => open(offer)}
                  >
                    <span className="sh-card-art">
                      <ItemArt item={offer.item} previews={previews} />
                      <span className="sh-preview-hint">
                        <Icon icon={Eye} size={13} /> {t('aimTrainer.shop.preview')}
                      </span>
                    </span>
                    <span className="sh-card-info">
                      <span className="sh-kind">{itemKind(offer.item, t)}</span>
                      <strong>{itemName(offer.item, t)}</strong>
                      <span className="sh-rarity">{t(`aimTrainer.rarity.${offer.item.rarity}`)}</span>
                    </span>
                    <PriceTag offer={offer} owned={owned(offer)} t={t} />
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ap-screen sh-screen">
      <header className="sh-head">
        <div className="ap-head">
          <span className="ap-eyebrow">{t('aimTrainer.title')}</span>
          <h2>{t('aimTrainer.shop.title')}</h2>
          <p>{t('aimTrainer.shop.subtitle')}</p>
        </div>
        {shop.status === 'ready' && (
          <div className="sh-balance" title={t('aimTrainer.shop.earnHint')}>
            <Icon icon={Gem} size={26} />
            <span>
              <b>{shop.balance.toLocaleString()}</b>
              <small>{t('aimTrainer.shop.currency')}</small>
            </span>
          </div>
        )}
      </header>

      {body}

      {shop.status === 'ready' && <p className="ap-hint">{t('aimTrainer.shop.earnHint')}</p>}

      {preview && (
        <Suspense fallback={null}>
          <ShopPreview
            t={t}
            offer={preview.offer}
            item={preview.item}
            owned={owned(preview.offer)}
            ownedIds={shop.ownedIds}
            balance={shop.balance}
            busy={shop.buying !== null}
            weapon={weapon}
            weaponSkin={weaponSkin}
            previews={previews}
            onSelect={(item) => setPreview((p) => ({ ...p, item }))}
            onBuy={buy}
            onClose={() => setPreview(null)}
          />
        </Suspense>
      )}

      {toast && (
        <div className={toast.ok ? 'sh-toast' : 'sh-toast sh-toast-error'} role="status">
          {toast.ok && <Icon icon={Check} size={16} />} {toast.text}
          {toast.ok && <small>{t('aimTrainer.shop.equipAfter')}</small>}
        </div>
      )}
    </div>
  );
}
