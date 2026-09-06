import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

// Fenêtre au premier plan sous Windows (nom du process, via l'API Win32
// GetForegroundWindow) — sert à couper les animations décoratives dès que
// Valorant a le focus, MÊME hors match (menus, Terrain d'entraînement...),
// contrairement à la détection de partie active (pregame/core-game de
// l'API locale) qui ne couvre pas ces cas. Le script est écrit une seule
// fois dans un fichier temporaire plutôt qu'inliné dans la commande : passer
// un bloc PowerShell multi-lignes (Add-Type) via un argument de ligne de
// commande pose des problèmes d'échappement en cascade (cmd → PowerShell) ;
// un `-File` évite ça complètement.
const FOREGROUND_SCRIPT_PATH = path.join(tmpdir(), 'mvptracker-foreground-process.ps1');
const FOREGROUND_SCRIPT = `Add-Type @'
using System;
using System.Runtime.InteropServices;
public class MvpTrackerForegroundWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
'@
$hwnd = [MvpTrackerForegroundWindow]::GetForegroundWindow()
$procId = 0
[MvpTrackerForegroundWindow]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
(Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
`;

function ensureForegroundScript() {
  if (!existsSync(FOREGROUND_SCRIPT_PATH)) writeFileSync(FOREGROUND_SCRIPT_PATH, FOREGROUND_SCRIPT, 'utf-8');
  return FOREGROUND_SCRIPT_PATH;
}

export function isValorantFocused() {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ensureForegroundScript()],
      { timeout: 3000 },
      (err, stdout) => resolve(!err && /valorant/i.test(stdout)),
    );
  });
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
