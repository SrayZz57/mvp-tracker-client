import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Gem, Shirt } from 'lucide-react';
import Icon from './Icon.jsx';
import { useSkinsCatalog } from './skinsData.js';
import SkinDetailModal from './SkinDetailModal.jsx';
import Skeleton from './Skeleton.jsx';
import CountUp from './CountUp.jsx';
import { loadCollection, loadWishlist, toggleWishlist, toggleCollection, setCollectionPrice } from './personalData.js';
import CollapsibleCard from './CollapsibleCard.jsx';

const GOLD = '#ffc857';

// Page dédiée à la collection personnelle — auparavant un petit onglet noyé
// dans "Skins", maintenant sa propre page dans "Mon compte" puisque c'est une
// donnée intrinsèquement personnelle (pas liée au joueur qu'on suit). Repris
// du port mobile (app/account/collection.tsx) : valeur totale en avant, skin
// le plus cher mis en avant, répartition par rareté, puis la grille.
function MySkinsCollection({ myId }) {
  const { t } = useTranslation();
  const catalog = useSkinsCatalog();
  const [collection, setCollection] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [selectedSkin, setSelectedSkin] = useState(null);

  useEffect(() => {
    if (!myId) return;
    loadCollection(myId).then(setCollection);
    loadWishlist(myId).then(setWishlist);
  }, [myId]);

  const collectionSkins = useMemo(() => {
    if (!catalog) return [];
    return collection
      .map((entry) => {
        const skin = catalog.find((s) => s.uuid === entry.uuid);
        return skin ? { ...skin, priceVp: entry.priceVp } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.priceVp || 0) - (a.priceVp || 0));
  }, [catalog, collection]);

  const totalVp = useMemo(() => collection.reduce((sum, entry) => sum + (entry.priceVp || 0), 0), [collection]);
  const totalValueEuros = totalVp * 0.01;
  const topSkin = collectionSkins[0];

  // Répartition par rareté : barre segmentée + légende, même principe que le
  // graphique de répartition des matchs par map/mode (StatsTab).
  const tiers = useMemo(() => {
    const byTier = new Map();
    collectionSkins.forEach((skin) => {
      const name = skin.tierName ?? t('skins.otherTier');
      const entry = byTier.get(name) ?? { name, color: skin.tierColor ?? 'var(--text-muted)', count: 0 };
      entry.count += 1;
      byTier.set(name, entry);
    });
    return [...byTier.values()].sort((a, b) => b.count - a.count);
  }, [collectionSkins, t]);

  const handleToggleWishlist = (uuid) => {
    toggleWishlist(myId, uuid).then(setWishlist);
  };

  const handleToggleCollection = (skin) => {
    toggleCollection(myId, skin.uuid, skin.estimatedPriceVp).then(setCollection);
  };

  const handleSetPrice = (uuid, priceVp) => {
    setCollectionPrice(myId, uuid, priceVp).then(setCollection);
  };

  if (!catalog) {
    return (
      <div className="card">
        <Skeleton lines={5} />
      </div>
    );
  }

  return (
    <div>
      <div className="collection-highlights">
        <div className="collection-hero">
          <Icon icon={Gem} className="collection-hero-decor" size={140} strokeWidth={1} />
          <div className="collection-hero-text">
            <div className="label">{t('skins.estimatedValue')}</div>
            <div className="collection-hero-amount">
              <CountUp value={totalValueEuros} decimals={2} suffix="€" />
            </div>
            <div className="collection-hero-chips">
              <span className="collection-hero-chip">
                <Icon icon={Shirt} size={13} />
                {t('skins.skinCount', { count: collection.length })}
              </span>
              <span className="collection-hero-chip">
                <Icon icon={Gem} size={13} />
                {totalVp.toLocaleString()} VP
              </span>
            </div>
          </div>
        </div>

        {topSkin && (
          <div className="collection-hero collection-hero-top">
            {topSkin.displayIcon && <img className="collection-hero-skin" src={topSkin.displayIcon} alt="" />}
            <div className="collection-hero-text">
              <div className="label collection-top-label">
                <Icon icon={Crown} size={14} color={GOLD} />
                {t('skins.mostExpensive')}
              </div>
              <div className="collection-hero-amount collection-top-name">{topSkin.name}</div>
              <div className="collection-hero-chips">
                <span className="collection-hero-chip">
                  <Icon icon={Gem} size={13} />
                  {topSkin.priceVp} VP
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {tiers.length > 1 && (
        <CollapsibleCard id="skins.rarities" title={t('skins.raritiesTitle')}>
          <div className="collection-segmented">
            {tiers.map((tier) => (
              <div key={tier.name} className="collection-segment" style={{ flex: tier.count, background: tier.color }} />
            ))}
          </div>
          <div className="collection-legend">
            {tiers.map((tier) => (
              <span key={tier.name} className="collection-legend-item">
                <span className="collection-legend-dot" style={{ background: tier.color }} />
                {tier.name}
                <span className="label">{tier.count}</span>
              </span>
            ))}
          </div>
        </CollapsibleCard>
      )}

      <CollapsibleCard id="skins.myCollection" title={t('skins.myCollectionTitle', { count: collectionSkins.length })}>
        {collectionSkins.length === 0 ? (
          <p>{t('skins.emptyCollection')}</p>
        ) : (
          <div className="skin-grid">
            {collectionSkins.map((skin) => (
              <div
                key={skin.uuid}
                className="skin-card"
                style={{ borderColor: skin.tierColor, '--tier-color': skin.tierColor }}
              >
                <div className="skin-card-img-wrap" onClick={() => setSelectedSkin(skin)}>
                  <img src={skin.displayIcon} alt={skin.name} />
                </div>
                <p className="skin-card-name">{skin.name}</p>
                <p className="label" style={{ color: skin.tierColor }}>{skin.tierName} — {skin.weaponName}</p>
                <div className="skin-price-row">
                  <input
                    type="number"
                    className="skin-price-input"
                    value={skin.priceVp}
                    onChange={(e) => handleSetPrice(skin.uuid, Number(e.target.value))}
                  />
                  <span className="label">VP</span>
                </div>
                <button onClick={() => handleToggleCollection(skin)}>{t('skins.removeFromCollection')}</button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleCard>

      {selectedSkin && (
        <SkinDetailModal
          skin={selectedSkin}
          isWishlisted={wishlist.includes(selectedSkin.uuid)}
          isOwned={collection.some((e) => e.uuid === selectedSkin.uuid)}
          onToggleWishlist={() => handleToggleWishlist(selectedSkin.uuid)}
          onToggleCollection={() => handleToggleCollection(selectedSkin)}
          onClose={() => setSelectedSkin(null)}
        />
      )}
    </div>
  );
}

export default MySkinsCollection;
