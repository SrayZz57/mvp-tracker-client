import { useEffect, useState } from 'react';

// Liste des manettes branchées — un simple indicateur de connexion pour les
// écrans (Réglages, Sensitivity Finder...), PAS le pipeline d'entrée du jeu
// (voir InputManager.js pour ça, lu à chaque frame dans AimTrainerGame.jsx).
// Un intervalle léger suffit ici : "quelle manette est branchée", pas sa
// position de stick en direct.
export function useConnectedGamepads() {
  const [pads, setPads] = useState(() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads().filter(Boolean) : []));
  useEffect(() => {
    const poll = () => {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      setPads(navigator.getGamepads().filter(Boolean));
    };
    const id = setInterval(poll, 500);
    window.addEventListener('gamepadconnected', poll);
    window.addEventListener('gamepaddisconnected', poll);
    return () => {
      clearInterval(id);
      window.removeEventListener('gamepadconnected', poll);
      window.removeEventListener('gamepaddisconnected', poll);
    };
  }, []);
  return pads;
}
