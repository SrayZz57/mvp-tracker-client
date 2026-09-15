import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computePistolLoadout } from './pistolLoadout.js';
import { recommendBuy } from './buySimulator.js';
import { agentAbilityBudget } from './abilityCosts.js';
import { useShopWeapons, useShopArmors, useWeaponIcons } from './weaponIcons.js';
import { useAgentIcons, useAgentRoles, useAgentAbilities } from './agentIcons.js';
import { getPistolRoundBuy } from './pistolRoundBuys.js';

// Fenêtre overlay séparée, affichée en bas à gauche pendant que Valorant a le
// focus : suggestion d'achat calculée à partir de l'économie détectée par
// capture d'écran + OCR (voir services/screenCapture.js, creditsOcr.js,
// agentIconMatch.js côté main). Aucune injection dans le jeu, juste une
// fenêtre Windows de plus, et ne fonctionne qu'en Sans bordure / Fenêtré.
//
// Anciennement déclenchée manuellement (picker d'agent, Alt+Q) pour le seul
// round 1 — remplacé par une détection automatique continue, à chaque round
// (2026-09-16). Reçoit `{ credits, agentName }` par IPC (agentName peut être
// `null` si le matching d'icônes n'a pas identifié l'agent avec assez de
// confiance) et calcule elle-même la suggestion à afficher :
//   - proche de 800 crédits ET agent identifié avec une entrée dans
//     pistolRoundBuys.js → réutilise ce loadout curé (plus fiable que la
//     règle générale à ce montant précis, voir le commentaire dans ce fichier).
//   - sinon → règle générale (buySimulator.js/recommendBuy), sans capacités
//     si l'agent n'a pas été identifié.
const PISTOL_CREDITS_MIN = 700;
const PISTOL_CREDITS_MAX = 900;

function buildEconomySuggestion(t, credits, agentName, { weapons, armors, agentIcons, agentRoles, agentAbilities }) {
  if (weapons.length === 0 || armors.length === 0) return null;

  const role = agentName ? agentRoles.get(agentName)?.roleName ?? null : null;
  const recommendation = recommendBuy(t, credits, weapons, armors, role);
  if (!recommendation) return null;

  const shieldKind = recommendation.shield ? (recommendation.shield.cost >= 1000 ? 'heavy' : 'light') : null;

  const budget = agentName ? agentAbilityBudget(agentName, agentAbilities.get(agentName)) : null;
  const abilities = (budget ?? []).map((ability) => ({
    ...ability,
    affordable: ability.cost <= recommendation.remaining,
  }));

  return {
    mode: 'economy',
    agentName,
    agentIcon: agentName ? agentIcons.get(agentName) ?? null : null,
    weaponName: recommendation.weapon?.name ?? null,
    weaponIcon: recommendation.weapon?.icon ?? null,
    shieldKind,
    shieldIcon: recommendation.shield?.icon ?? null,
    abilities,
    cost: recommendation.spent,
    remaining: recommendation.remaining,
    noteKey: null,
  };
}

function BuyOverlay() {
  const { t } = useTranslation();
  const [input, setInput] = useState(null); // { credits, agentName } | null
  const weapons = useShopWeapons();
  const armors = useShopArmors();
  const agentIcons = useAgentIcons();
  const agentRoles = useAgentRoles();
  const agentAbilities = useAgentAbilities();
  const weaponIcons = useWeaponIcons();

  useEffect(() => {
    document.body.classList.add('overlay-window');
  }, []);

  useEffect(() => window.electronAPI.onBuySuggestionInput(setInput), []);

  const loadout = useMemo(() => {
    if (!input || input.credits == null) return null;
    const { credits, agentName } = input;

    const looksLikePistolRound = credits >= PISTOL_CREDITS_MIN && credits <= PISTOL_CREDITS_MAX;
    if (looksLikePistolRound && agentName && getPistolRoundBuy(agentName)) {
      return computePistolLoadout(agentName, agentIcons.get(agentName), {
        agentAbilities,
        weaponIcons,
        shopArmors: armors,
      });
    }

    return buildEconomySuggestion(t, credits, agentName, { weapons, armors, agentIcons, agentRoles, agentAbilities });
  }, [input, t, weapons, armors, agentIcons, agentRoles, agentAbilities, weaponIcons]);

  if (!loadout) return null;

  return (
    <div className="overlay-buy">
      <header className="overlay-buy-head">
        {loadout.agentIcon && <img src={loadout.agentIcon} alt="" className="overlay-buy-agent" />}
        <div className="overlay-buy-title">
          <span className="overlay-buy-label">{t('buyOverlay.title')}</span>
          <span className="overlay-buy-agent-name">{loadout.agentName ?? t('buyOverlay.agentUnknown')}</span>
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
          <span className="overlay-buy-item-name">
            {loadout.weaponName ?? (loadout.mode === 'pistol' ? t('buyOverlay.keepClassic') : t('buyOverlay.noWeapon'))}
          </span>
        </li>
        {loadout.shieldKind && (
          <li className="overlay-buy-item">
            {loadout.shieldIcon ? (
              <img src={loadout.shieldIcon} alt="" className="overlay-buy-item-icon" />
            ) : (
              <span className="overlay-buy-item-kind">{t('buyOverlay.shield')}</span>
            )}
            <span className="overlay-buy-item-name">
              {loadout.shieldKind === 'heavy' ? t('buyOverlay.heavyShield') : t('buyOverlay.lightShield')}
            </span>
          </li>
        )}
        {loadout.abilities.map((ability) => (
          <li key={ability.slot ?? ability.name} className="overlay-buy-item">
            {ability.icon ? (
              <img src={ability.icon} alt="" className="overlay-buy-item-icon" />
            ) : (
              <span className="overlay-buy-item-kind">{t('buyOverlay.ability')}</span>
            )}
            <span className="overlay-buy-item-name">{ability.name}</span>
            {ability.count > 1 && <span className="overlay-buy-count">×{ability.count}</span>}
            {loadout.mode === 'economy' && (
              <span className={`overlay-buy-affordable ${ability.affordable ? 'yes' : 'no'}`}>
                {t('buyOverlay.creditsSuffix', { cost: ability.cost })}
              </span>
            )}
          </li>
        ))}
      </ul>

      {loadout.noteKey && <p className="overlay-buy-note">{t(loadout.noteKey)}</p>}
    </div>
  );
}

export default BuyOverlay;
