import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Heart } from 'lucide-react';
import Icon from './Icon.jsx';
import { useSkinsCatalog } from './skinsData.js';
import SkinDetailModal from './SkinDetailModal.jsx';
import Skeleton from './Skeleton.jsx';
import { loadWishlist, toggleWishlist, loadCollection, toggleCollection } from './personalData.js';
import CollapsibleCard from './CollapsibleCard.jsx';

// 40 = multiple de 8 (colonnes observées à largeur de carte habituelle) —
// réduit les lignes à moitié vides, même logique que pour les crosshairs.
const PAGE_SIZE = 40;

// Recherche insensible aux accents ("celeste" doit trouver "céleste").
function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const VIEWS = [
  { id: 'catalogue', labelKey: 'skins.views.catalog' },
  { id: 'wishlist', labelKey: 'skins.views.wishlist' },
];

function SkinCard({ skin, onClick, isWishlisted, isOwned, t }) {
  return (
    <div
      className="skin-card"
      style={{ borderColor: skin.tierColor, '--tier-color': skin.tierColor }}
      onClick={onClick}
    >
      {(isWishlisted || isOwned) && (
        <div className="skin-card-badges">
          {isOwned && <span className="skin-card-badge owned" title={t('skins.ownedTitle')}><Icon icon={Check} size={12} /></span>}
          {isWishlisted && <span className="skin-card-badge wishlist" title={t('skins.wishlistedTitle')}><Icon icon={Heart} size={12} /></span>}
        </div>
      )}
      <div className="skin-card-img-wrap">
        <img src={skin.displayIcon} alt={skin.name} loading="lazy" onError={(e) => e.currentTarget.classList.add('is-broken')} />
      </div>
      <p className="skin-card-name">{skin.name}</p>
      <p className="label" style={{ color: skin.tierColor }}>{skin.tierName} — {skin.weaponName}</p>
      <p className="skin-card-price">{skin.estimatedPriceVp} VP</p>
    </div>
  );
}

function SkinsCatalog({ myId }) {
  const { t } = useTranslation();
  const catalog = useSkinsCatalog();
  const [view, setView] = useState('catalogue');
  const [wishlist, setWishlist] = useState([]);
  const [collection, setCollection] = useState([]);
  const [selectedSkin, setSelectedSkin] = useState(null);

  const [search, setSearch] = useState('');
  const [weaponFilter, setWeaponFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!myId) return;
    loadWishlist(myId).then(setWishlist);
    loadCollection(myId).then(setCollection);
  }, [myId]);

  const weaponNames = useMemo(
    () => (catalog ? [...new Set(catalog.map((s) => s.weaponName))].sort() : []),
    [catalog],
  );
  const tierNames = useMemo(() => {
    if (!catalog) return [];
    const byRank = new Map(catalog.map((s) => [s.tierName, s.tierRank]));
    return [...byRank.keys()].sort((a, b) => byRank.get(a) - byRank.get(b));
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    if (!catalog) return [];
    const term = normalizeText(search.trim());
    const min = priceMin === '' ? -Infinity : Number(priceMin);
    const max = priceMax === '' ? Infinity : Number(priceMax);
    return catalog
      .filter(
        (s) =>
          (term === '' || normalizeText(s.name).includes(term)) &&
          (weaponFilter === '' || s.weaponName === weaponFilter) &&
          (tierFilter === '' || s.tierName === tierFilter) &&
          s.estimatedPriceVp >= min &&
          s.estimatedPriceVp <= max,
      )
      .sort((a, b) => b.tierRank - a.tierRank || b.estimatedPriceVp - a.estimatedPriceVp);
  }, [catalog, search, weaponFilter, tierFilter, priceMin, priceMax]);

  const wishlistSkins = useMemo(
    () => (catalog ? catalog.filter((s) => wishlist.includes(s.uuid)) : []),
    [catalog, wishlist],
  );

  const handleToggleWishlist = (uuid) => {
    toggleWishlist(myId, uuid).then(setWishlist);
  };

  const handleToggleCollection = (skin) => {
    toggleCollection(myId, skin.uuid, skin.estimatedPriceVp).then(setCollection);
  };

  if (!catalog) {
    return (
      <div className="card">
        <Skeleton lines={5} />
      </div>
    );
  }

  const visibleCatalog = showAll ? filteredCatalog : filteredCatalog.slice(0, PAGE_SIZE);

  return (
    <div>
      <nav className="tabs" style={{ marginBottom: '1rem' }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={v.id === view ? 'tab active' : 'tab'}
            onClick={() => setView(v.id)}
          >
            {t(v.labelKey)}
          </button>
        ))}
      </nav>

      {view === 'catalogue' && (
        <CollapsibleCard id="skins.catalogue" title={t('skins.catalogTitle', { count: filteredCatalog.length })}>
          <div className="filter-bar">
            <input
              placeholder={t('skins.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={weaponFilter} onChange={(e) => setWeaponFilter(e.target.value)}>
              <option value="">{t('skins.allWeapons')}</option>
              {weaponNames.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
              <option value="">{t('skins.allTiers')}</option>
              {tierNames.map((tierName) => (
                <option key={tierName} value={tierName}>{tierName}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder={t('skins.priceMin')}
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              style={{ width: '150px' }}
            />
            <input
              type="number"
              placeholder={t('skins.priceMax')}
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              style={{ width: '150px' }}
            />
          </div>

          <div className="skin-grid">
            {visibleCatalog.map((skin) => (
              <SkinCard
                key={skin.uuid}
                skin={skin}
                onClick={() => setSelectedSkin(skin)}
                isWishlisted={wishlist.includes(skin.uuid)}
                isOwned={collection.some((e) => e.uuid === skin.uuid)}
                t={t}
              />
            ))}
          </div>
          {filteredCatalog.length > PAGE_SIZE && (
            <button className="show-more-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? t('skins.showLess') : t('skins.showMore', { count: filteredCatalog.length - PAGE_SIZE })}
            </button>
          )}
        </CollapsibleCard>
      )}

      {view === 'wishlist' && (
        <CollapsibleCard id="skins.wishlist" title={t('skins.wishlistTitle', { count: wishlistSkins.length })}>
          {wishlistSkins.length === 0 ? (
            <p>{t('skins.emptyWishlist')}</p>
          ) : (
            <div className="skin-grid">
              {wishlistSkins.map((skin) => (
                <SkinCard
                  key={skin.uuid}
                  skin={skin}
                  onClick={() => setSelectedSkin(skin)}
                  isWishlisted
                  isOwned={collection.some((e) => e.uuid === skin.uuid)}
                  t={t}
                />
              ))}
            </div>
          )}
        </CollapsibleCard>
      )}

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

export default SkinsCatalog;
