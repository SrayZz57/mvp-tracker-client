import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { computePistolLoadout } from './pistolLoadout.js';
import { useShopArmors, useWeaponIcons } from './weaponIcons.js';
import { useAgentsById, useAgentAbilities } from './agentIcons.js';
import Icon from './Icon.jsx';

// Fenêtre overlay séparée, en bas à gauche, pendant la phase d'achat du PREMIER
// round : l'achat conseillé pour l'agent du joueur (tableau curé, voir
// pistolRoundBuys.js). Purement passive : reçoit `{ agentId, endsAt }` par IPC
// (voir buy-overlay:data dans main.js) et ne contacte aucun serveur de jeu.
// Aucune injection dans le jeu, juste une fenêtre de plus ; ne s'affiche qu'en
// Sans bordure / Fenêtré.
function BuyOverlay() {
  const { t } = useTranslation();
  const agentsById = useAgentsById();
  const agentAbilities = useAgentAbilities();
  const weaponIcons = useWeaponIcons();
  const shopArmors = useShopArmors();
  const [data, setData] = useState(null);

  useEffect(() => {
    document.body.classList.add('overlay-window');
  }, []);

  // On redemande aussi les données à l'ouverture : celles poussées par le process
  // principal arrivent avant que ce composant (chargé en lazy) n'écoute — voir
  // buy-overlay:get-data dans main.js. `prev ??` pour ne jamais écraser des
  // données plus récentes déjà reçues.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getBuyOverlayData()
      .then((initial) => {
        if (!cancelled && initial) setData((prev) => prev ?? initial);
      })
      .catch(() => {});
    const unsubscribe = window.electronAPI.onBuyOverlayData(setData);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const agent = data?.agentId ? agentsById.get(data.agentId.toLowerCase()) : null;
  const loadout = useMemo(
    () => (agent ? computePistolLoadout(agent.name, agent.icon, { agentAbilities, weaponIcons, shopArmors }) : null),
    [agent, agentAbilities, weaponIcons, shopArmors],
  );

  if (!data || !loadout) return null;

  // Barre qui se vide : une animation CSS (composée), pas un setInterval.
  const remainingMs = data.endsAt ? Math.max(0, data.endsAt - Date.now()) : 0;

  return (
    <div className="overlay-buy">
      <header className="overlay-buy-head">
        {loadout.agentIcon && <img src={loadout.agentIcon} alt="" className="overlay-buy-agent" />}
        <div className="overlay-buy-title">
          <span className="overlay-buy-label">{t('buyOverlay.title')}</span>
          <span className="overlay-buy-agent-name">{loadout.agentName}</span>
        </div>
        {loadout.cost != null && (
          <span className="overlay-buy-cost">
            <Icon icon={Coins} size={13} />
            {loadout.cost}
          </span>
        )}
      </header>

      <ul className="overlay-buy-list">
        <li className="overlay-buy-item" style={{ '--i': 0 }}>
          {loadout.weaponIcon ? (
            <img src={loadout.weaponIcon} alt="" className="overlay-buy-item-icon weapon" />
          ) : (
            <span className="overlay-buy-item-kind">{t('buyOverlay.weapon')}</span>
          )}
          <span className="overlay-buy-item-name">{loadout.weaponName ?? t('buyOverlay.keepClassic')}</span>
        </li>
        {loadout.shieldKind && (
          <li className="overlay-buy-item" style={{ '--i': 1 }}>
            {loadout.shieldIcon ? (
              <img src={loadout.shieldIcon} alt="" className="overlay-buy-item-icon" />
            ) : (
              <span className="overlay-buy-item-kind">{t('buyOverlay.shield')}</span>
            )}
            <span className="overlay-buy-item-name">{t('buyOverlay.lightShield')}</span>
          </li>
        )}
        {loadout.abilities.map((ability, index) => (
          <li key={ability.slot ?? ability.name} className="overlay-buy-item" style={{ '--i': index + 2 }}>
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

      {remainingMs > 0 && (
        <div className="overlay-buy-timer" aria-hidden="true">
          <span key={data.endsAt} style={{ animationDuration: `${remainingMs}ms` }} />
        </div>
      )}
    </div>
  );
}

export default BuyOverlay;
