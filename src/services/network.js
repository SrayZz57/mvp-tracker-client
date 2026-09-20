import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const LOCKFILE_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'Riot Games',
  'Riot Client',
  'Config',
  'lockfile',
);

const PING_TARGET = '1.1.1.1';
const LATENCY_REGEX = /(?:temps|time)[=<](\d+)/i;

// Le lockfile ("name:pid:port:password:protocol") n'est pas toujours effacé
// proprement à la fermeture de Riot (crash, fermeture forcée, session Windows
// coupée) — sa seule présence sur le disque ne prouve donc pas que le client
// tourne encore, seulement qu'il a tourné à un moment donné. On vérifie en
// plus que le PID qu'il contient correspond à un processus toujours actif.
export function isValorantRunning() {
  if (!existsSync(LOCKFILE_PATH)) return false;

  let pid;
  try {
    pid = Number(readFileSync(LOCKFILE_PATH, 'utf-8').split(':')[1]);
  } catch {
    return false;
  }
  if (!pid) return false;

  try {
    // Signal 0 ne tue rien, ne fait que tester l'existence du processus.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = le processus existe mais appartient à un autre utilisateur
    // (toujours "en cours"). Tout le reste (ESRCH...) = PID mort, lockfile périmé.
    return err.code === 'EPERM';
  }
}

// Nom du process du JEU lui-même (pas le Riot Client, ni son launcher) —
// confirmé publiquement par de nombreux outils tiers et discussions
// anti-triche. Sert à distinguer "le client Riot est ouvert" (isValorantRunning
// ci-dessus, vrai dès l'écran d'accueil/le lanceur) de "on est vraiment DANS
// le jeu" — signalé par l'utilisateur : l'overlay de session se déclenchait
// trop tôt, dès le Riot Client ouvert, avant même d'avoir lancé Valorant.
const VALORANT_GAME_PROCESS = 'VALORANT-Win64-Shipping.exe';

// `tasklist` plutôt que PowerShell (comme isValorantFocused ci-dessous) :
// un outil Windows natif dédié à lister les process par nom, pas besoin de
// tout l'attirail PowerShell/Add-Type pour une simple recherche par nom —
// l'équivalent exact de regarder dans le Gestionnaire des tâches, aucune
// lecture de fichier ni du jeu lui-même. `/FO CSV` est indispensable : le
// format par défaut tronque les noms de process longs à 25 caractères
// ("VALORANT-Win64-Shipping.e" au lieu de "...exe"), ce qui faisait
// systématiquement échouer la comparaison malgré Valorant bien lancé — bug
// reproduit et confirmé en direct le 2026-09-17. Le CSV n'a pas cette limite.
//
// Résultat partagé pendant GAME_CHECK_TTL_MS : plusieurs boucles de main.js
// (overlay, coupure des animations) posent la même question à ~6 s d'écart —
// sans ce partage, chacune lançait son propre `tasklist` pendant que le joueur
// est en partie, ce qui ajoute des pics CPU inutiles dans le jeu.
const GAME_CHECK_TTL_MS = 4000;
let gameCheck = { at: 0, promise: null };

export function isValorantGameRunning() {
  if (process.platform !== 'win32') return Promise.resolve(false);
  const now = Date.now();
  if (gameCheck.promise && now - gameCheck.at < GAME_CHECK_TTL_MS) return gameCheck.promise;

  const promise = new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', `IMAGENAME eq ${VALORANT_GAME_PROCESS}`, '/FO', 'CSV', '/NH'],
      { timeout: 3000 },
      (err, stdout) => resolve(!err && stdout.toLowerCase().includes(VALORANT_GAME_PROCESS.toLowerCase())),
    );
  });
  gameCheck = { at: now, promise };
  return promise;
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
