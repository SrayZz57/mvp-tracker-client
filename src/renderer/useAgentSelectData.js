import { useEffect, useRef, useState } from 'react';

// 4 s : la sélection dure environ 100 s et un joueur peut changer d'agent
// jusqu'au dernier moment. Plus court solliciterait le client pour rien,
// plus long ferait rater des changements.
const POLL_MS = 4000;

// Riot n'expose aucun signal "le round a commencé, tu peux bouger" — l'API
// core-game reste active du chargement jusqu'à la fin du match, sans
// distinction. On masque donc nous-mêmes, à l'ancienneté, un délai fixe
// plutôt que de laisser le bandeau/l'overlay affichés toute la partie.
//
// Deux cas, selon que le mode a une vraie phase de sélection ('select',
// pregame) ou pas :
//   - AVEC sélection (Compétitif, Non classé...) : comme avant, on attend
//     l'apparition d'un adversaire (signe que le chargement est bien
//     entamé) avant de compter.
//   - SANS sélection (Combat à mort, modes sans équipes...) : personne n'a
//     jamais le tag `team === 'enemy'` (pas de vraies équipes), donc ce
//     déclencheur ne se déclenchait jamais et l'overlay restait affiché
//     indéfiniment (signalé en vrai) — on compte plutôt dès l'entrée en
//     partie, avec un délai un peu plus long vu que ça part plus tôt.
const AUTO_HIDE_AFTER_ENEMIES_MS = 25000;
const AUTO_HIDE_NO_SELECT_MS = 30000;

// Partagé entre le bandeau intégré (AgentSelectLive) et la fenêtre overlay
// (AgentSelectOverlay) : même source de données, deux affichages.
export function useAgentSelectData() {
  const [data, setData] = useState({ state: 'idle' });
  // matchId du dernier résultat vu (pour détecter un nouveau match / la fin
  // du match courant) et matchId qu'on a décidé de masquer après le délai.
  const lastMatchIdRef = useRef(null);
  const hiddenMatchIdRef = useRef(null);
  const hideTimerRef = useRef(null);
  // A-t-on vu une phase 'select' pour le match en cours ? Détermine quel
  // délai/déclencheur de masquage s'applique (voir plus haut).
  const hadSelectPhaseRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = null;

    const clearHideTimer = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const poll = async () => {
      try {
        const result = await window.electronAPI.getAgentSelect();
        if (cancelled) return;

        // Uniquement si l'API répond vraiment sur un match : un résultat
        // non-'ok' (blip passager de l'API locale — non officielle, un raté
        // ponctuel est normal) ne doit JAMAIS être traité comme "on a quitté
        // le match". Sinon la mémoire "overlay déjà masqué pour ce match"
        // est effacée par erreur, et le prochain poll qui retrouve la MÊME
        // partie en cours la prend pour une nouvelle — l'overlay réapparaît
        // en pleine game pour un nouveau délai de 25-30s (signalé en vrai).
        if (result.state === 'ok') {
          const matchId = result.matchId;
          if (matchId !== lastMatchIdRef.current) {
            // Vrai nouveau match : la décision de masquage précédente ne
            // concernait que l'ancien.
            lastMatchIdRef.current = matchId;
            hiddenMatchIdRef.current = null;
            hadSelectPhaseRef.current = false;
            clearHideTimer();
          }

          if (result.phase === 'select') {
            hadSelectPhaseRef.current = true;
          }

          const inGame = result.phase === 'game';
          const hasEnemies = inGame && result.players.some((p) => p.team === 'enemy');
          const shouldStartHideTimer = hadSelectPhaseRef.current ? hasEnemies : inGame;
          const hideDelay = hadSelectPhaseRef.current ? AUTO_HIDE_AFTER_ENEMIES_MS : AUTO_HIDE_NO_SELECT_MS;

          if (shouldStartHideTimer && !hideTimerRef.current && hiddenMatchIdRef.current !== matchId) {
            hideTimerRef.current = setTimeout(() => {
              hiddenMatchIdRef.current = matchId;
              hideTimerRef.current = null;
              if (!cancelled) setData({ state: 'idle' });
            }, hideDelay);
          }

          setData(matchId === hiddenMatchIdRef.current ? { state: 'idle' } : result);
        } else {
          setData(result);
        }
      } catch {
        // L'API locale est non officielle : un échec ne doit jamais casser
        // l'interface, on retentera au prochain tour.
        if (!cancelled) setData({ state: 'unavailable' });
      }
      if (!cancelled) pollTimer = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearHideTimer();
    };
  }, []);

  return data;
}
