// Achat recommandé au premier round de chaque partie (toujours 800 crédits),
// agent par agent — dicté par SrayZz, pas calculé : recommendBuy() du
// simulateur d'achat raisonne en "meilleure arme finançable" et sortirait un
// Shorty au pistol round (les fusils à pompe passent avant les pistolets dans
// sa priorité de catégories), ce qui n'a aucun sens ici.
//
// Les capacités sont désignées par leur SLOT, jamais par leur nom : le nom et
// l'icône réels sont résolus à l'affichage depuis valorant-api (voir
// useAgentAbilities), donc ça reste juste quelle que soit la langue du client
// et si Riot renomme une capacité.

// Coût des armes du round 1 (valorant-api/shopData) — repris ici en dur pour
// le contrôle de budget, la boutique ne bougeant pas d'un patch à l'autre.
export const PISTOL_WEAPONS = {
  Classic: 0,
  Frenzy: 450,
  Ghost: 500,
};

export const LIGHT_SHIELD_COST = 400;
export const PISTOL_ROUND_CREDITS = 800;

// Modes sans vraie économie de round 1 à 800 crédits : l'overlay n'a rien de
// pertinent à dire, donc il ne doit jamais s'y afficher.
//   - 'deathmatch' (Combat à mort) et 'hurm'/'console_hurm' (Combat à mort
//     par équipe) : pas de phase d'achat, armes aléatoires en boucle.
//   - 'spikerush' : loadout aléatoire imposé à chaque round, pas d'achat.
//   - 'skirmish' : partie contre des bots, seulement pour s'entraîner —
//     valeur non confirmée officiellement (aucune doc publique ne liste les
//     queueId), à corriger si elle s'avère fausse en jeu.
// `data.mode` vient de `QueueID` (sélection) ou `ModeID` (partie) côté
// valorantLocal.js — mêmes valeurs dans les deux cas (vérifié via le filtre
// déjà en place sur 'competitive' dans fillMissingRanks).
export const NO_STANDARD_BUY_MODE_IDS = new Set(['deathmatch', 'hurm', 'console_hurm', 'spikerush', 'skirmish']);

// `weapon: null` = on garde le Classic (gratuit, donné à chaque round 1).
// `shield: 'light'` = bouclier léger. `note` = précision affichée telle
// quelle quand l'achat ne se résume pas à une liste fixe.
export const PISTOL_ROUND_BUYS = {
  // --- Duellistes ---------------------------------------------------------
  Jett: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Grenade', count: 1 }] },
  Phoenix: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability2', count: 1 }] },
  // Reyna démarre avec une charge de Dévoration : une seule à acheter.
  Reyna: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },
  Raze: { weapon: null, shield: 'light', abilities: [{ slot: 'Ability1', count: 2 }] },
  Yoru: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },
  Neon: { weapon: 'Frenzy', shield: null, abilities: [{ slot: 'Grenade', count: 1 }] },
  Waylay: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },
  Iso: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },

  // --- Initiateurs --------------------------------------------------------
  Sova: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  'KAY/O': { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },
  Breach: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  Gekko: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },
  Skye: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  Fade: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Grenade', count: 1 }] },
  Tejo: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },

  // --- Contrôleurs --------------------------------------------------------
  Omen: { weapon: null, shield: 'light', abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }] },
  Brimstone: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  Viper: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },
  Miks: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  Clove: { weapon: null, shield: 'light', abilities: [{ slot: 'Grenade', count: 1 }, { slot: 'Ability2', count: 2 }] },
  // Les étoiles d'Astra sont interchangeables : le joueur choisit selon la map.
  Astra: { weapon: 'Ghost', shield: null, abilities: [], noteKey: 'buyOverlay.notes.astraStars' },
  Harbor: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },

  // --- Sentinelles --------------------------------------------------------
  Killjoy: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  Vyse: { weapon: 'Ghost', shield: null, abilities: [{ slot: 'Ability1', count: 1 }] },
  Sage: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  Cypher: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  // Le Chasseur de têtes EST son arme de round 1 : pas de Ghost, on met le
  // reste du budget dans les balles.
  Chamber: { weapon: null, shield: null, abilities: [{ slot: 'Grenade', count: 1 }], noteKey: 'buyOverlay.notes.chamberBullets' },
  Deadlock: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }, { slot: 'Grenade', count: 1 }] },
  Veto: { weapon: null, shield: null, abilities: [{ slot: 'Ability1', count: 1 }, { slot: 'Ability2', count: 1 }] },
};

export function getPistolRoundBuy(agentName) {
  return PISTOL_ROUND_BUYS[agentName] ?? null;
}

/**
 * Total de l'achat, quand tous les prix sont connus. Les coûts de capacités
 * ne sont documentés que pour une partie du roster (voir abilityCosts.js) :
 * si l'un manque, on renvoie `null` plutôt qu'un total faux — l'affichage
 * masque alors simplement le compteur de crédits.
 */
export function pistolRoundCost(buy, abilityCostsForAgent) {
  if (!buy) return null;
  let total = PISTOL_WEAPONS[buy.weapon ?? 'Classic'] ?? 0;
  if (buy.shield === 'light') total += LIGHT_SHIELD_COST;
  for (const { slot, count } of buy.abilities) {
    const unit = abilityCostsForAgent?.[slot];
    if (unit === undefined) return null;
    total += unit * count;
  }
  return total;
}
