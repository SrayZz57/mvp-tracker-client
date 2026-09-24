import { execFile } from 'node:child_process';

const PING_TARGET = '1.1.1.1';
const LATENCY_REGEX = /(?:temps|time)[=<](\d+)/i;

// Détection de Valorant par NOM de process uniquement, avec `tasklist` :
// l'équivalent exact de regarder dans le Gestionnaire des tâches. Aucun fichier
// de Riot n'est lu (avant, le `lockfile` du Riot Client l'était — il contient
// l'identifiant et le mot de passe de l'API locale, dont on ne se servait que
// du numéro de process) et aucun accès n'est ouvert sur un process de Riot
// (l'ancien `process.kill(pid, 0)` en demandait un sur le Riot Client).
//
// `tasklist` plutôt que PowerShell : un outil Windows natif dédié à lister les
// process par nom, pas besoin de tout l'attirail PowerShell/Add-Type. `/FO CSV`
// est indispensable : le format par défaut tronque les noms de process longs à
// 25 caractères ("VALORANT-Win64-Shipping.e" au lieu de "...exe"), ce qui faisait
// systématiquement échouer la comparaison malgré Valorant bien lancé — bug
// reproduit et confirmé en direct le 2026-09-17. Le CSV n'a pas cette limite.
//
// Le filtre `/FI IMAGENAME eq …` est volontaire (plutôt que lister tous les
// process puis chercher dedans) : l'app ne demande à Windows que ces deux noms
// précis et ne voit jamais le reste de ce qui tourne sur le PC.

// Process du Riot Client (le lanceur), présent dès l'écran d'accueil de Riot :
// c'est lui dont le PID figurait dans l'ancien lockfile. Ne veut PAS dire qu'on
// est en partie — voir VALORANT_GAME_PROCESS.
const RIOT_CLIENT_PROCESS = 'RiotClientServices.exe';

// Process du JEU lui-même (pas le Riot Client, ni son launcher) — confirmé
// publiquement par de nombreux outils tiers et discussions anti-triche. Sert à
// distinguer "le client Riot est ouvert" de "on est vraiment DANS le jeu" —
// signalé par l'utilisateur : l'overlay de session se déclenchait trop tôt,
// dès le Riot Client ouvert, avant même d'avoir lancé Valorant.
const VALORANT_GAME_PROCESS = 'VALORANT-Win64-Shipping.exe';

// Chaque réponse est partagée pendant un court délai : plusieurs boucles de
// main.js (ping, overlay, coupure des animations) posent la même question à
// quelques secondes d'écart — sans ce partage, chacune lançait son propre
// `tasklist`, ce qui ajoute des pics CPU inutiles pendant qu'on joue. Tant que
// le process est ABSENT, on redemande beaucoup moins souvent : le PC est alors
// au repos et il n'y a aucune raison de lancer un programme toutes les 5 s.
const checks = new Map();

function isProcessRunning(imageName, { activeTtl, idleTtl }) {
  if (process.platform !== 'win32') return Promise.resolve(false);
  const now = Date.now();
  const cached = checks.get(imageName);
  if (cached && now - cached.at < (cached.running === false ? idleTtl : activeTtl)) return cached.promise;

  const entry = { at: now, running: undefined, promise: null };
  entry.promise = new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'],
      { timeout: 3000, windowsHide: true },
      (err, stdout) => {
        entry.running = !err && stdout.toLowerCase().includes(imageName.toLowerCase());
        resolve(entry.running);
      },
    );
  });
  checks.set(imageName, entry);
  return entry.promise;
}

// Le Riot Client est ouvert (lanceur compris, avant même de lancer une partie).
export function isValorantRunning() {
  return isProcessRunning(RIOT_CLIENT_PROCESS, { activeTtl: 5000, idleTtl: 15000 });
}

// Le jeu tourne réellement. À n'interroger qu'une fois le client confirmé
// ouvert (le jeu ne peut pas tourner sans lui) pour ne rien lancer inutilement.
export function isValorantGameRunning() {
  return isProcessRunning(VALORANT_GAME_PROCESS, { activeTtl: 4000, idleTtl: 4000 });
}

// `execFile` plutôt que `exec` : `exec` passe systématiquement par un shell
// (cmd.exe sous Windows) pour interpréter la commande, ce qui veut dire
// démarrer un interpréteur de commande complet en plus du ping lui-même —
// à chaque appel, toutes les 5 secondes tant que Valorant tourne (voir
// main.js). `execFile` lance directement ping.exe, sans shell intermédiaire.
// Aucune fonctionnalité shell n'était utilisée ici (pas de pipe, pas de
// redirection), donc rien ne change dans le résultat, juste dans le coût.
export function pingOnce(target = PING_TARGET) {
  return new Promise((resolve) => {
    execFile('ping', ['-n', '1', '-w', '2000', target], (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const match = stdout.match(LATENCY_REGEX);
      resolve(match ? Number(match[1]) : null);
    });
  });
}
