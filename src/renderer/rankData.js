import { useEffect, useState } from 'react';

let tiersCache = null;

async function loadCompetitiveTiers() {
  if (tiersCache) return tiersCache;
  const response = await fetch('https://valorant-api.com/v1/competitivetiers');
  const json = await response.json();
  const latestEpisode = json.data[json.data.length - 1];
  tiersCache = new Map(
    latestEpisode.tiers.map((tier) => [
      tier.tier,
      // `name` s'ajoute aux champs existants (icône, couleur) : l'API locale
      // du client ne renvoie qu'un NUMÉRO de palier pour les coéquipiers en
      // sélection d'agent, il faut donc pouvoir le traduire en nom lisible.
      { icon: tier.largeIcon, color: `#${tier.color.slice(0, 6)}`, name: tier.tierName },
    ]),
  );
  return tiersCache;
}

export function useRankTiers() {
  const [tiers, setTiers] = useState(new Map());

  useEffect(() => {
    loadCompetitiveTiers().then(setTiers);
  }, []);

  return tiers;
}

let rankLadderPromise = null;

// Échelle ordonnée des rangs (nom + division + icône) pour le wiki — tier 0
// ("Sans grade") gardé, tiers < 3 (placeholders sans vraie icône) filtrés.
function loadRankLadder() {
  if (!rankLadderPromise) {
    rankLadderPromise = fetch('https://valorant-api.com/v1/competitivetiers?language=fr-FR')
      .then((response) => response.json())
      .then((json) => {
        const latestEpisode = json.data[json.data.length - 1];
        return latestEpisode.tiers
          .filter((tier) => (tier.tier === 0 || tier.tier >= 3) && tier.largeIcon)
          .map((tier) => ({
            tier: tier.tier,
            tierName: tier.tierName,
            divisionName: tier.divisionName,
            color: `#${tier.color.slice(0, 6)}`,
            icon: tier.largeIcon,
          }));
      });
  }
  return rankLadderPromise;
}

export function useRankLadder() {
  const [ladder, setLadder] = useState([]);

  useEffect(() => {
    loadRankLadder().then(setLadder);
  }, []);

  return ladder;
}

let seasonsCache = null;

async function loadSeasonNames() {
  if (seasonsCache) return seasonsCache;
  const response = await fetch('https://valorant-api.com/v1/seasons?language=fr-FR');
  const json = await response.json();
  const byUuid = new Map(json.data.map((season) => [season.uuid, season]));
  seasonsCache = new Map(
    json.data
      .filter((season) => season.type === 'EAresSeasonType::Act')
      .map((act) => {
        const episode = byUuid.get(act.parentUuid);
        const episodeName = episode ? capitalize(episode.displayName) : '';
        // "ACTE III" reste tel quel (chiffre romain), seule "ÉPISODE 6" est mise en forme.
        return [act.uuid, episodeName ? `${episodeName} — ${act.displayName}` : act.displayName];
      }),
  );
  return seasonsCache;
}

function capitalize(text) {
  return text.charAt(0) + text.slice(1).toLowerCase();
}

export function useSeasonNames() {
  const [seasons, setSeasons] = useState(new Map());

  useEffect(() => {
    loadSeasonNames().then(setSeasons);
  }, []);

  return seasons;
}

let seasonOrderCache = null;

// Ordre chronologique des actes (uuid -> timestamp de début) — l'API renvoie
// déjà ses actes dans cet ordre, mais un Map par nom (useSeasonNames) ne le
// garde pas. Sert au tri du rang par acte (Rang par acte, StatsTab.jsx).
async function loadSeasonOrder() {
  if (seasonOrderCache) return seasonOrderCache;
  const response = await fetch('https://valorant-api.com/v1/seasons');
  const json = await response.json();
  seasonOrderCache = new Map(
    json.data
      .filter((season) => season.type === 'EAresSeasonType::Act')
      .map((act) => [act.uuid, new Date(act.startTime).getTime()]),
  );
  return seasonOrderCache;
}

export function useSeasonOrder() {
  const [order, setOrder] = useState(new Map());

  useEffect(() => {
    loadSeasonOrder().then(setOrder);
  }, []);

  return order;
}

const cardArtCache = new Map();
const EMPTY_CARD_ART = { icon: null, banner: null };

let allPlayerCardsPromise = null;

// Catalogue complet des cartes de joueur du jeu — sert de sélecteur de photo
// de profil pour le compte MVP Tracker (pas de notion d'inventaire possédé
// exposée par l'API publique, donc on propose tout le catalogue).
function loadAllPlayerCards() {
  if (!allPlayerCardsPromise) {
    allPlayerCardsPromise = fetch('https://valorant-api.com/v1/playercards?language=fr-FR')
      .then((response) => response.json())
      .then((json) =>
        (json.data ?? [])
          .filter((card) => card.smallArt)
          .map((card) => ({ uuid: card.uuid, displayName: card.displayName, icon: card.smallArt }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      );
  }
  return allPlayerCardsPromise;
}

export function useAllPlayerCards() {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    loadAllPlayerCards().then(setCards);
  }, []);

  return cards;
}

export function usePlayerCardArt(cardUuid) {
  const [art, setArt] = useState(cardUuid ? cardArtCache.get(cardUuid) ?? EMPTY_CARD_ART : EMPTY_CARD_ART);

  useEffect(() => {
    if (!cardUuid) {
      setArt(EMPTY_CARD_ART);
      return;
    }
    if (cardArtCache.has(cardUuid)) {
      setArt(cardArtCache.get(cardUuid));
      return;
    }
    fetch(`https://valorant-api.com/v1/playercards/${cardUuid}`)
      .then((response) => response.json())
      .then((json) => {
        const result = { icon: json.data?.smallArt ?? null, banner: json.data?.wideArt ?? null };
        cardArtCache.set(cardUuid, result);
        setArt(result);
      });
  }, [cardUuid]);

  return art;
}
