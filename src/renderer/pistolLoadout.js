import { getPistolRoundBuy, pistolRoundCost, LIGHT_SHIELD_COST } from './pistolRoundBuys.js';
import { AGENT_ABILITY_COSTS } from './abilityCosts.js';

// Loadout curé du round 1 (800 crédits pile) pour un agent donné — logique
// déplacée depuis l'ancien AgentSelectOverlay.jsx (picker manuel, retiré au
// profit de la détection automatique par capture d'écran, voir main.js).
// Retourne `null` si l'agent n'a pas d'entrée dans pistolRoundBuys.js
// (BuyOverlay.jsx doit alors retomber sur la suggestion générique via
// buySimulator.js/recommendBuy).
export function computePistolLoadout(agentName, agentIcon, { agentAbilities, weaponIcons, shopArmors }) {
  const buy = getPistolRoundBuy(agentName);
  if (!buy) return null;

  const abilities = agentAbilities.get(agentName);
  const bySlot = new Map((abilities ?? []).map((ability) => [ability.slot, ability]));
  // Même quand on garde le Classic (buy.weapon === null), il a lui aussi une
  // icône — on la montre au lieu de laisser juste un libellé texte.
  const lightShield = shopArmors.find((armor) => armor.cost === LIGHT_SHIELD_COST);

  return {
    mode: 'pistol',
    agentName,
    agentIcon: agentIcon ?? null,
    weaponName: buy.weapon,
    weaponIcon: weaponIcons.get(buy.weapon ?? 'Classic') ?? null,
    shieldKind: buy.shield,
    shieldIcon: buy.shield === 'light' ? lightShield?.icon ?? null : null,
    abilities: buy.abilities.map(({ slot, count }) => ({
      slot,
      count,
      name: bySlot.get(slot)?.name ?? slot,
      icon: bySlot.get(slot)?.icon ?? null,
    })),
    cost: pistolRoundCost(buy, AGENT_ABILITY_COSTS[agentName]),
    remaining: null,
    noteKey: buy.noteKey ?? null,
  };
}
