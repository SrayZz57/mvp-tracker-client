import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Deuxième fenêtre overlay, affichée au tout début de chaque partie : rappelle
// quoi acheter au round pistolet selon l'agent joué. Mêmes garanties que
// l'overlay de sélection d'agent (voir createBuyOverlay dans main.js) —
// aucune injection dans le jeu, juste une fenêtre Windows de plus, et ne
// fonctionne qu'en Sans bordure / Fenêtré.
//
// Volontairement passive : tout est résolu dans la fenêtre principale (agent
// joué, noms/icônes de capacités, langue) et relayé ici par IPC. Elle se
// contente d'afficher le `loadout` reçu.
function BuyOverlay() {
  const { t } = useTranslation();
  const [loadout, setLoadout] = useState(null);

  useEffect(() => {
    document.body.classList.add('overlay-window');
  }, []);

  useEffect(() => window.electronAPI.onBuyOverlayLoadout(setLoadout), []);

  if (!loadout) return null;

  return (
    <div className="overlay-buy">
      <header className="overlay-buy-head">
        {loadout.agentIcon && <img src={loadout.agentIcon} alt="" className="overlay-buy-agent" />}
        <div className="overlay-buy-title">
          <span className="overlay-buy-label">{t('buyOverlay.title')}</span>
          <span className="overlay-buy-agent-name">{loadout.agentName}</span>
        </div>
        {loadout.cost != null && <span className="overlay-buy-cost">{t('buyOverlay.credits', { cost: loadout.cost })}</span>}
      </header>

      <ul className="overlay-buy-list">
        <li className="overlay-buy-item">
          {loadout.weaponIcon ? (
            <img src={loadout.weaponIcon} alt="" className="overlay-buy-item-icon" />
          ) : (
            <span className="overlay-buy-item-kind">{t('buyOverlay.weapon')}</span>
          )}
          <span className="overlay-buy-item-name">{loadout.weapon ?? t('buyOverlay.keepClassic')}</span>
        </li>
        {loadout.shield && (
          <li className="overlay-buy-item">
            {loadout.shieldIcon ? (
              <img src={loadout.shieldIcon} alt="" className="overlay-buy-item-icon" />
            ) : (
              <span className="overlay-buy-item-kind">{t('buyOverlay.shield')}</span>
            )}
            <span className="overlay-buy-item-name">{t('buyOverlay.lightShield')}</span>
          </li>
        )}
        {loadout.abilities.map((ability) => (
          <li key={ability.slot} className="overlay-buy-item">
            {ability.icon ? (
              <img src={ability.icon} alt="" className="overlay-buy-item-icon" />
            ) : (
              <span className="overlay-buy-item-kind">{t('buyOverlay.ability')}</span>
            )}
            <span className="overlay-buy-item-name">{ability.name}</span>
            {ability.count > 1 && <span className="overlay-buy-count">×{ability.count}</span>}
          </li>
        ))}
      </ul>

      {loadout.noteKey && <p className="overlay-buy-note">{t(loadout.noteKey)}</p>}
    </div>
  );
}

export default BuyOverlay;
