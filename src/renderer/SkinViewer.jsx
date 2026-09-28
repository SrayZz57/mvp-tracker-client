import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Crosshair, RotateCcw, Sparkles } from 'lucide-react';
import { skinLockInfo } from './battlePass/ownership.js';
import Icon from './Icon.jsx';
import { WEAPON_MODELS } from './aimTrainerModes.js';
import WeaponStage from './WeaponStage.jsx';
import { SKIN_RARITY } from './skinRarity.js';


// Vestiaire des skins : l'arme en 3D en direct (mêmes modèles et effets qu'en
// jeu), qu'on fait tourner à la souris, qu'on zoome à la molette, et qu'on peut
// faire tirer pour voir ses animations. Le skin n'est équipé qu'au clic sur
// « Équiper » : on peut en essayer plusieurs sans rien changer.
// isLocked(weapon, skin) : le skin est-il verrouillé par le battle pass ?
// (aperçu toujours permis, seul « Équiper » est bloqué).
function SkinViewer({ config, set, previews, onClose, isLocked = () => false }) {
  const { t } = useTranslation();
  const equippedWeapon = WEAPON_MODELS[config.weaponModel] ? config.weaponModel : 'vandal';
  const [weapon, setWeapon] = useState(equippedWeapon);
  const skins = WEAPON_MODELS[weapon]?.skins ?? { standard: { labelKey: 'aimTrainer.skinStandard' } };
  const [skin, setSkin] = useState(weapon === equippedWeapon ? config.weaponSkin ?? 'standard' : 'standard');
  const stageRef = useRef(null);

  const equipped = weapon === equippedWeapon && skin === (config.weaponSkin ?? 'standard');
  const locked = isLocked(weapon, skin);
  const source = locked ? skinLockInfo(weapon, skin) : null;
  const rarity = SKIN_RARITY[skin] ?? 'base';

  const startFiring = () => stageRef.current?.startFiring();
  const stopFiring = () => stageRef.current?.stopFiring();
  const replayIntro = () => stageRef.current?.replayIntro();
  const resetView = () => stageRef.current?.resetView();

  const chooseWeapon = (id) => {
    setWeapon(id);
    setSkin(id === equippedWeapon ? config.weaponSkin ?? 'standard' : 'standard');
  };

  return (
    <div className="skin-viewer" role="dialog" aria-label={t('aimTrainer.skinViewerTitle')}>
      <div className="skin-viewer-stage">
        <WeaponStage ref={stageRef} weapon={weapon} skin={skin} className="skin-viewer-canvas" />
        <div className="skin-viewer-watermark" aria-hidden="true">
          {t(skins[skin]?.labelKey ?? 'aimTrainer.skinStandard')}
        </div>
        <header className="skin-viewer-head">
          <span className="skin-viewer-eyebrow">MVP Tracker · {t('aimTrainer.skinViewerTitle')}</span>
          <h2>
            {t(WEAPON_MODELS[weapon]?.labelKey)} <span>{t(skins[skin]?.labelKey ?? 'aimTrainer.skinStandard')}</span>
          </h2>
          <span className={`skin-rarity skin-rarity-${rarity}`}>{t(`aimTrainer.rarity.${rarity}`)}</span>
          <p className="skin-viewer-desc">{t(`aimTrainer.skinDesc.${{ glock: skin === 'standard' ? 'glock' : skin, sniper: skin === 'standard' ? 'sniper' : skin }[weapon] ?? skin}`)}</p>
        </header>
        <div className="skin-viewer-controls">
          <button
            type="button"
            className="skin-viewer-fire"
            onPointerDown={startFiring}
            onPointerUp={stopFiring}
            onPointerLeave={stopFiring}
          >
            <Icon icon={Crosshair} size={16} /> {t('aimTrainer.skinViewerFire')}
          </button>
          {rarity === 'transcendent' && (
            <button type="button" className="skin-viewer-icon-btn" onClick={replayIntro} title={t('aimTrainer.skinViewerIntro')}>
              <Icon icon={Sparkles} size={16} />
            </button>
          )}
          <button type="button" className="skin-viewer-icon-btn" onClick={resetView} title={t('aimTrainer.skinViewerReset')}>
            <Icon icon={RotateCcw} size={16} />
          </button>
          <span className="skin-viewer-hint">{t('aimTrainer.skinViewerHint')}</span>
        </div>
      </div>

      <aside className="skin-viewer-panel">
        <div className="skin-viewer-panel-head">
          <div className="skin-viewer-tabs">
            {Object.entries(WEAPON_MODELS).map(([id, w]) => (
              <button key={id} type="button" className={weapon === id ? 'active' : ''} onClick={() => chooseWeapon(id)}>
                {t(w.labelKey)}
              </button>
            ))}
          </div>
          <button type="button" className="skin-viewer-icon-btn" onClick={onClose} aria-label={t('aimTrainer.skinDone')}>
            <Icon icon={X} size={18} />
          </button>
        </div>

        <div className="skin-viewer-list">
          {/* Seulement les skins possédés : ceux à gagner ou à acheter se
              découvrent dans le Battle Pass et la Boutique, pas ici. */}
          {Object.entries(skins).filter(([id]) => !isLocked(weapon, id)).map(([id, s]) => {
            const isEquipped = weapon === equippedWeapon && id === (config.weaponSkin ?? 'standard');
            return (
              <button
                key={id}
                type="button"
                className={`skin-card skin-card-${SKIN_RARITY[id] ?? 'base'} ${skin === id ? 'active' : ''}`}
                onClick={() => setSkin(id)}
              >
                <img src={previews[weapon]?.[id] ?? previews[weapon]?.standard} alt="" />
                <span className="skin-card-name">{t(s.labelKey)}</span>
                <span className="skin-card-rarity">{t(`aimTrainer.rarity.${SKIN_RARITY[id] ?? 'base'}`)}</span>
                {isEquipped && (
                  <span className="skin-card-equipped">
                    <Icon icon={Check} size={12} /> {t('aimTrainer.skinEquipped')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {locked && (
          <p className="skin-viewer-lock">
            {source?.kind === 'pass'
              ? t('battlePass.lock.unlockAt', { season: source.seasonNumber, level: source.level })
              : source?.kind === 'shop'
                ? t('aimTrainer.shop.lockShop', { price: source.price.toLocaleString() })
                : t('battlePass.lock.notAvailable')}
          </p>
        )}
        <button
          type="button"
          className="skin-viewer-equip"
          disabled={equipped || locked}
          onClick={() => set({ weaponModel: weapon, weaponSkin: skin, showWeapon: true })}
        >
          {equipped ? t('aimTrainer.skinEquipped') : locked ? t('battlePass.lock.locked') : t('aimTrainer.skinEquip')}
        </button>
      </aside>
    </div>
  );
}

export default SkinViewer;
