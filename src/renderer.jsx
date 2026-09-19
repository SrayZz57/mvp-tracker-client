// Polices bundlées localement (pas de CDN) : l'app doit garder son identité
// visuelle même sans connexion. Chakra Petch = titres/chiffres (même police
// que le site vitrine), Inter = texte courant, Bebas Neue = grosses accroches
// façon écran de jeu (cartes d'accueil de l'Aim Trainer notamment) — condensée
// et en capitales, elle porte bien mieux un gros texte qu'une police normale
// à cette taille.
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource-variable/inter';
import '@fontsource/bebas-neue/latin-400.css';
import './index.css';
import './renderer/i18n/index.js';
import { StrictMode, Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import TitleBar from './renderer/TitleBar.jsx';
import LoadingState from './renderer/LoadingState.jsx';
import { CollapsedBlocksProvider } from './renderer/CollapsedBlocksContext.jsx';
import { E2EEProvider } from './renderer/E2EEContext.jsx';

// Chargés à la demande selon `view` plutôt qu'au démarrage — ce fichier sert
// de point d'entrée à TOUTES les fenêtres (principale, Aim Trainer plein
// écran, overlay quotidien), donc un import statique ici embarquait
// systématiquement le code (et les dépendances, dont three.js pour l'Aim
// Trainer) des deux autres vues dans le bundle chargé par la fenêtre
// principale, même quand l'utilisateur ne les ouvre jamais dans la session.
const App = lazy(() => import('./renderer/App.jsx'));
const AimTrainerHub = lazy(() => import('./renderer/AimTrainerHub.jsx'));
const DailyOverlay = lazy(() => import('./renderer/DailyOverlay.jsx'));

window.addEventListener('error', (e) => {
  console.error('window error', e.message, e.filename);
  window.electronAPI?.captureException(null, e.error ?? new Error(e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('unhandled rejection', e.reason);
  window.electronAPI?.captureException(null, e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
});

// Certaines fenêtres chargent le même bundle que la fenêtre principale, mais
// avec un `?view=...` : elles rendent uniquement leur contenu propre, sans le
// reste de l'app (pas de sidebar, pas de compte, pas de requête inutile).
const params = new URLSearchParams(window.location.search);
const view = params.get('view');

let gameConfig = {};
if (view === 'aim-trainer') {
  try {
    gameConfig = JSON.parse(params.get('config') ?? '{}');
  } catch {
    gameConfig = {};
  }
}

function Root() {
  // Coupe les animations décoratives (halos, pulses...) dès que la fenêtre
  // n'est plus au premier plan — un testeur a signalé une hausse de latence
  // d'affichage EN JEU juste parce que l'app tournait en arrière-plan, carte
  // graphique visiblement sollicitée dans le Gestionnaire des tâches. Voir
  // .app-unfocused dans index.css : coupe TOUTES les animations d'un coup
  // plutôt que d'avoir à modifier chacune des ~20 qui existent déjà.
  useEffect(() => {
    if (view) return undefined; // fenêtres aim-trainer/overlay non concernées
    return window.electronAPI.onWindowFocusChange((focused) => {
      document.body.classList.toggle('app-unfocused', !focused);
    });
  }, []);

  // Même coupure, mais sur l'état de la partie plutôt que le focus de la
  // fenêtre — un joueur qui garde l'app visible sur un second écran pendant
  // qu'il joue ne perd jamais le focus, donc app-unfocused seul ne suffisait
  // pas à couper les animations pendant une vraie game.
  useEffect(() => {
    if (view) return undefined;
    return window.electronAPI.onMatchActiveChange((active) => {
      document.body.classList.toggle('app-in-match', active);
    });
  }, []);

  // La fenêtre plein écran s'ouvre toujours sur le hub (menu principal) —
  // c'est lui qui décide quand monter AimTrainerGame, pas cette route : la
  // fenêtre reste la même du menu jusqu'à la fin de la session, sans se
  // recharger, pour permettre un vrai fondu entre les deux (voir
  // AimTrainerHub.jsx).
  if (view === 'aim-trainer') {
    return (
      <Suspense fallback={null}>
        <AimTrainerHub config={gameConfig} />
      </Suspense>
    );
  }
  if (view === 'daily-overlay') {
    return (
      <Suspense fallback={null}>
        <DailyOverlay />
      </Suspense>
    );
  }
  return (
    <div className="app-frame">
      <TitleBar />
      <div className="app-frame-body">
        <E2EEProvider>
          <CollapsedBlocksProvider>
            <Suspense fallback={<div className="app-boot-loading"><LoadingState /></div>}>
              <App />
            </Suspense>
          </CollapsedBlocksProvider>
        </E2EEProvider>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
