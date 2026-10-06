import { useEffect, useState } from 'react';

let agentsPromise = null;

function loadAgents() {
  if (!agentsPromise) {
    agentsPromise = fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=fr-FR')
      .then((response) => response.json())
      .then((json) => json.data);
  }
  return agentsPromise;
}

export function useAgentIcons() {
  const [icons, setIcons] = useState(new Map());

  useEffect(() => {
    loadAgents().then((agents) => {
      setIcons(new Map(agents.map((agent) => [agent.displayName, agent.displayIcon])));
    });
  }, []);

  return icons;
}

// Indexé par UUID et non par nom : certaines sources ne donnent que l'uuid de
// l'agent, jamais son nom.
export function useAgentsById() {
  const [agents, setAgents] = useState(new Map());

  useEffect(() => {
    loadAgents().then((list) => {
      setAgents(
        new Map(
          list.map((agent) => [
            agent.uuid.toLowerCase(),
            { name: agent.displayName, icon: agent.displayIcon, portrait: agent.fullPortrait },
          ]),
        ),
      );
    });
  }, []);

  return agents;
}

export function useAgentPortraits() {
  const [portraits, setPortraits] = useState(new Map());

  useEffect(() => {
    loadAgents().then((agents) => {
      setPortraits(new Map(agents.map((agent) => [agent.displayName, agent.fullPortrait])));
    });
  }, []);

  return portraits;
}

export function useAgentRoles() {
  const [roles, setRoles] = useState(new Map());

  useEffect(() => {
    loadAgents().then((agents) => {
      setRoles(
        new Map(
          agents.map((agent) => [
            agent.displayName,
            { roleName: agent.role?.displayName ?? null, roleIcon: agent.role?.displayIcon ?? null },
          ]),
        ),
      );
    });
  }, []);

  return roles;
}

// Données brutes complètes (rôle, description, capacités avec description) —
// pour le wiki, qui a besoin de plus que les Maps ciblées des autres hooks.
export function useAgentsData() {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    loadAgents().then(setAgents);
  }, []);

  return agents;
}

const PLACEABLE_SLOTS = ['Ability1', 'Ability2', 'Grenade', 'Ultimate'];

export function useAgentAbilities() {
  const [abilities, setAbilities] = useState(new Map());

  useEffect(() => {
    loadAgents().then((agents) => {
      setAbilities(
        new Map(
          agents.map((agent) => [
            agent.displayName,
            agent.abilities
              .filter((ability) => PLACEABLE_SLOTS.includes(ability.slot) && ability.displayIcon)
              .map((ability) => ({ name: ability.displayName, icon: ability.displayIcon, slot: ability.slot })),
          ]),
        ),
      );
    });
  }, []);

  return abilities;
}
