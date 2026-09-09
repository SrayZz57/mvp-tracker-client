import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgentsById, useAgentIcons, useAgentAbilities, useAgentRoles } from './agentIcons.js';
import { useRankTiers } from './rankData.js';
import { useAgentSelectData } from './useAgentSelectData.js';
import { useMapUrlToName } from './mapImages.js';
import { suggestAgents } from './agentSuggestion.js';
import { getPistolRoundBuy, pistolRoundCost, LIGHT_SHIELD_COST, NO_STANDARD_BUY_MODE_IDS } from './pistolRoundBuys.js';
import { useWeaponIcons, useShopArmors } from './weaponIcons.js';
import { AGENT_ABILITY_COSTS } from './abilityCosts.js';

// Durée d'affichage de l'overlay d'achat : le temps de la phase d'achat du
// premier round, pas plus — passé ce délai il n'a plus rien à dire et n'a
// aucune raison de rester par-dessus le jeu.
const BUY_OVERLAY_MS = 40000;

// =============================================================================
// SÉLECTION D'AGENT EN DIRECT, PUIS DÉBUT DE PARTIE
//
// Affiche le rang et l'agent choisi des autres joueurs, plus une suggestion
// de pick pendant la sélection. Entièrement alimenté par l'API locale du
// client Valorant (joueurs) et l'historique déjà stocké localement (stats) :
// aucune requête HenrikDev, donc aucun quota consommé et aucune latence.
//
// Le bandeau n'apparaît QUE pendant la sélection ou le tout début de partie
// et disparaît tout seul ensuite — c'est le seul moment où l'info sert.
//
// Deux phases, deux vues :
//   - 'select' : sélection d'agent. Riot n'expose que MON équipe à ce
//     stade (`EnemyTeam` est null) — impossible d'y voir les adversaires.
//   - 'game' : dès le chargement de la partie qui suit, les DEUX équipes
//     sont exposées — on les affiche groupées, alliés puis adversaires.
// =============================================================================

function PlayerCard({ player, agentsById, rankTiers, t }) {
  const agent = player.agentId ? agentsById.get(player.agentId.toLowerCase()) : null;
  const tier = rankTiers.get(player.competitiveTier);
  const locked = player.selectionState === 'locked';

  return (
    <div className={`agent-select-player ${locked ? 'locked' : ''} ${player.isMe ? 'me' : ''}`}>
      <div className="agent-select-avatar">
        {agent?.icon ? <img src={agent.icon} alt="" /> : <span className="agent-select-pending">?</span>}
      </div>

      <div className="agent-select-info">
        <span className="agent-select-agent">{agent?.name ?? t('agentSelect.choosing')}</span>

        <span className="agent-select-rank">
          {tier?.icon && <img src={tier.icon} alt="" />}
          {/* Palier 0 = non classé : afficher « Unranked » plutôt qu'un nom de rang vide. */}
          <span style={tier?.color ? { color: tier.color } : undefined}>
            {player.competitiveTier > 0 ? tier?.name ?? '—' : t('agentSelect.unranked')}
          </span>
        </span>
      </div>

      {player.isMe && <span className="agent-select-you">{t('agentSelect.you')}</span>}
      {locked && !player.isMe && <span className="agent-select-lock">{t('agentSelect.locked')}</span>}
    </div>
  );
}

function SuggestionRow({ suggestion, agentIcons, t }) {
  return (
    <div className="agent-suggestion-row">
      <div className="agent-suggestion-avatar">
        {agentIcons.get(suggestion.agent) && <img src={agentIcons.get(suggestion.agent)} alt="" />}
      </div>
      <span className="agent-suggestion-name">{suggestion.agent}</span>
      <span className="agent-suggestion-reason">
        {suggestion.source === 'personal'
          ? t('agentSelect.suggestPersonal', { winrate: suggestion.winrate, games: suggestion.games })
          : t('agentSelect.suggestCommunity')}
      </span>
      {suggestion.fillsGap && <span className="agent-suggestion-gap">{t('agentSelect.suggestFillsGap')}</span>}
    </div>
  );
}

function AgentSelectLive({ matches = [], settings = null }) {
  const { t } = useTranslation();
  const agentsById = useAgentsById();
  const agentIcons = useAgentIcons();
  const agentAbilities = useAgentAbilities();
  const weaponIcons = useWeaponIcons();
  const shopArmors = useShopArmors();
  const agentRoles = useAgentRoles();
  const rankTiers = useRankTiers();
  const mapUrlToName = useMapUrlToName();
  const data = useAgentSelectData();

  const inGame = data.state === 'ok' && data.phase === 'game';
  const inSelect = data.state === 'ok' && data.phase === 'select';
  const me = data.state === 'ok' ? data.players.find((p) => p.isMe) : null;
  const mapName = data.state === 'ok' ? mapUrlToName.get(data.mapId) ?? null : null;

  const suggestions = useMemo(() => {
    if (!inSelect || !settings?.name || me?.selectionState === 'locked') return [];
    const teammateAgentNames = data.players
      .filter((p) => !p.isMe && p.agentId)
      .map((p) => agentsById.get(p.agentId.toLowerCase())?.name)
      .filter(Boolean);
    return suggestAgents({
      matches,
      name: settings.name,
      tag: settings.tag,
      mapName,
      teammateAgentNames,
      agentRoles,
    });
  }, [inSelect, settings, me?.selectionState, data.players, agentsById, matches, mapName, agentRoles]);

  useEffect(() => {
    window.electronAPI.setAgentSelectSuggestions(suggestions);
  }, [suggestions]);

  // Fenêtre principale : toujours ouverte, donc source sûre pour déclencher
  // la création/fermeture de la fenêtre overlay (coûteuse en GPU, créée à la
  // demande côté main.js — voir agent-select-overlay:set-visible). L'overlay
  // elle-même ne doit jamais piloter sa propre création : tant qu'elle
  // n'existe pas encore, rien à l'intérieur ne peut tourner pour le demander.
  const overlayVisible = data.state === 'ok' && data.players.length > 0;
  useEffect(() => {
    window.electronAPI.setAgentSelectOverlayVisible(overlayVisible);
  }, [overlayVisible]);

  // --- Overlay d'achat du round 1 -----------------------------------------
  // Se déclenche à l'ENTRÉE en partie, une seule fois par match :
  // `shownForMatch` évite qu'il revienne à chaque tour de polling tant qu'on
  // est dans la même partie.
  const shownForMatch = useRef(null);
  // Les minuteurs vivent dans une ref, pas dans le cleanup de l'effet : le
  // bandeau repasse en 'idle' au bout de 25-30 s (voir useAgentSelectData), et
  // un cleanup les annulerait avant la fin des 40 s — l'overlay resterait
  // alors affiché indéfiniment.
  const buyTimers = useRef([]);

  const myAgentName = me?.agentId ? agentsById.get(me.agentId.toLowerCase())?.name ?? null : null;

  useEffect(() => {
    if (!inGame || !data.matchId || !myAgentName) return;
    if (shownForMatch.current === data.matchId) return;
    // Deathmatch, Spike Rush, Skirmish (bots)... : pas de vrai round 1 à 800
    // crédits, l'overlay n'a rien de pertinent à montrer.
    // TEMPORAIRE — à retirer une fois l'identifiant de mode des parties
    // personnalisées confirmé en vrai (aucune doc publique ne le liste) :
    // ce log remonte jusqu'au terminal (voir console-message sur mainWindow
    // dans main.js), donc visible sans ouvrir les DevTools.
    console.log('[buy-overlay] mode détecté :', JSON.stringify(data.mode));
    if (NO_STANDARD_BUY_MODE_IDS.has(data.mode)) {
      console.log('[buy-overlay] mode exclu, overlay non déclenché');
      shownForMatch.current = data.matchId;
      return;
    }
    // Les capacités arrivent d'un fetch : tant qu'elles ne sont pas là, on
    // laisse le prochain rendu réessayer plutôt que d'afficher une liste vide.
    const abilities = agentAbilities.get(myAgentName);
    if (!abilities) return;

    const buy = getPistolRoundBuy(myAgentName);
    if (!buy) return;

    shownForMatch.current = data.matchId;

    const bySlot = new Map(abilities.map((ability) => [ability.slot, ability]));
    // Même quand on garde le Classic (buy.weapon === null), il a lui aussi
    // une icône — on la montre au lieu de laisser juste un libellé texte.
    const lightShield = shopArmors.find((armor) => armor.cost === LIGHT_SHIELD_COST);
    const loadout = {
      agentName: myAgentName,
      agentIcon: agentIcons.get(myAgentName) ?? null,
      weapon: buy.weapon,
      weaponIcon: weaponIcons.get(buy.weapon ?? 'Classic') ?? null,
      shield: buy.shield,
      shieldIcon: buy.shield === 'light' ? lightShield?.icon ?? null : null,
      abilities: buy.abilities.map(({ slot, count }) => ({
        slot,
        count,
        name: bySlot.get(slot)?.name ?? slot,
        icon: bySlot.get(slot)?.icon ?? null,
      })),
      cost: pistolRoundCost(buy, AGENT_ABILITY_COSTS[myAgentName]),
      noteKey: buy.noteKey ?? null,
    };

    buyTimers.current.forEach(clearTimeout);
    window.electronAPI.setBuyOverlayVisible(true);
    // La fenêtre vient d'être créée : ce court délai laisse son rendu se
    // monter avant de lui envoyer le contenu, sinon l'écouteur IPC n'est pas
    // encore branché et le message se perd.
    buyTimers.current = [
      setTimeout(() => window.electronAPI.setBuyOverlayLoadout(loadout), 500),
      setTimeout(() => window.electronAPI.setBuyOverlayVisible(false), BUY_OVERLAY_MS),
    ];
  }, [inGame, data.matchId, data.mode, myAgentName, agentAbilities, agentIcons, weaponIcons, shopArmors]);

  // Fermeture de l'app : on ne laisse jamais la fenêtre overlay derrière nous.
  useEffect(
    () => () => {
      buyTimers.current.forEach(clearTimeout);
      window.electronAPI.setBuyOverlayVisible(false);
    },
    [],
  );

  if (data.state !== 'ok' || data.players.length === 0) return null;

  const allies = inGame ? data.players.filter((p) => p.team !== 'enemy') : data.players;
  const enemies = inGame ? data.players.filter((p) => p.team === 'enemy') : [];

  return (
    <section className="agent-select">
      <header className="agent-select-head">
        <span className="agent-select-live">
          <span className="agent-select-dot" aria-hidden="true" />
          {t(inGame ? 'agentSelect.titleGame' : 'agentSelect.title')}
        </span>
        <span className="label">{t(inGame ? 'agentSelect.hintGame' : 'agentSelect.hint')}</span>
      </header>

      {suggestions.length > 0 && (
        <div className="agent-suggestion-block">
          <p className="agent-select-team-label">{t('agentSelect.suggestTitle')}</p>
          {suggestions.map((suggestion) => (
            <SuggestionRow key={suggestion.agent} suggestion={suggestion} agentIcons={agentIcons} t={t} />
          ))}
        </div>
      )}

      {inGame && enemies.length > 0 ? (
        <>
          <p className="agent-select-team-label">{t('agentSelect.allies')}</p>
          <div className="agent-select-grid">
            {allies.map((player) => (
              <PlayerCard key={player.puuid} player={player} agentsById={agentsById} rankTiers={rankTiers} t={t} />
            ))}
          </div>
          <p className="agent-select-team-label">{t('agentSelect.enemies')}</p>
          <div className="agent-select-grid">
            {enemies.map((player) => (
              <PlayerCard key={player.puuid} player={player} agentsById={agentsById} rankTiers={rankTiers} t={t} />
            ))}
          </div>
        </>
      ) : (
        <div className="agent-select-grid">
          {allies.map((player) => (
            <PlayerCard key={player.puuid} player={player} agentsById={agentsById} rankTiers={rankTiers} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

export default AgentSelectLive;
