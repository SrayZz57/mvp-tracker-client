import { app, BrowserWindow, ipcMain, shell, Menu, Notification, session, safeStorage, screen, autoUpdater, Tray } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';
import { getAccount, getMatches, getMmr, getMmrHistory } from './services/henrikdev.js';
import { excludeDeathmatch, formStats, tiltStatus, patchSelfIdentity, findMe, resultLabel, matchScore, hitStats } from './renderer/valorantStats.js';
import { computeHallOfFame } from './renderer/hallOfFame.js';
import {
  saveMatches,
  savePingSample,
  getAllPingSamples,
  prunePingSamples,
  saveCrosshair,
  getCrosshairs,
  deleteCrosshair,
  saveStrategy,
  getStrategiesForMap,
  deleteStrategy,
  getNarrativeForWeek,
  getPreviousNarrative,
  saveNarrative,
  getNarrativeHistory,
  getAssessmentForMatch,
  saveAssessment,
  getAssessmentHistory,
  getActivePlaySession,
  startPlaySession,
  endPlaySession,
  getPlaySessionHistory,
  backfillLegacyPuuid,
  getCareerRecords,
  saveCareerRecords,
  pruneOldMatchDetail,
  hasCachedMatch,
} from './services/db.js';
import { isValorantRunning, pingOnce, isValorantGameRunning } from './services/network.js';
import { syncMatches } from './services/matchSync.js';
import { getCachedMatchesAsync } from './services/matchesReader.js';
import { updateElectronApp } from 'update-electron-app';
import { captureEvent, captureException, shutdown as shutdownTelemetry } from './services/telemetry.js';
import { resolveSessionDay, computeDailyStats } from './renderer/dailyStats.js';

// Le service réseau de Chromium plantait en boucle sur ce poste ("Unable to
// move the cache: Accès refusé" au démarrage, cache disque probablement
// verrouillé/corrompu par un antivirus ou des instances précédentes) — chaque
// requête réseau (dont tous les appels aux API d'assets) échouait tant que le
// service redémarrait. Désactiver le cache disque HTTP contourne le problème.
app.commandLine.appendSwitch('disable-http-cache');

const store = new Store();

// Toutes les données "personnelles" (crosshairs, stratégies, paris,
// évaluations, wrapped, objectifs, skins) sont scopées par puuid —
// mais celui du compte MVP Tracker réellement LIÉ (Supabase), jamais celui
// de "qui est actuellement affiché à l'écran" (valorantSettings.puuid change
// à chaque recherche d'un autre joueur — utiliser ce champ ici recréait
// exactement le bug qu'on scope pour éviter). Le renderer tient cette valeur
// à jour via account:set-linked-puuid dès qu'il connaît le profil Supabase.
// L'API distingue "pc" et "console" pour la MMR (v3/mmr) et les matchs
// (v4/matches) — interroger la mauvaise plateforme renvoie soit 0 résultat,
// soit une erreur 500. `account.platforms` (v2/account) liste les
// plateformes déjà VUES sur le compte, mais un compte crossplay peut lister
// les deux ("PC" et "CONSOLE") même si l'essentiel de l'historique récent
// n'est que sur l'une des deux (constaté en conditions réelles : un compte
// avec platforms: ["PC", "CONSOLE"] renvoyait ses matchs sur "pc" et une
// erreur 500 sur "console"). Un choix figé se trompait donc à coup sûr pour
// ces comptes-là. platformCandidates() renvoie un ordre d'essai plutôt qu'un
// choix unique ; les appelants essaient chaque candidat jusqu'à un succès.
// Cache partagé et persistant (survit aux redémarrages) pour les "aperçus"
// d'AUTRES joueurs (rang, K/D récent) — classement Aim Trainer, amis, écran
// de liaison. Sans lui, chaque survol/ouverture repayait une requête même
// pour un joueur déjà consulté il y a 30 secondes. 5 minutes de fraîcheur :
// assez pour ne pas répéter les mêmes requêtes en rafale, assez court pour
// qu'un rang qui vient de changer se voie sans attendre une éternité.
const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

function previewCacheKey(kind, name, tag) {
  return `${kind}:${name}#${tag}`.toLowerCase();
}

function getPreviewCache(kind, name, tag) {
  const cache = store.get('apiPreviewCache') || {};
  const entry = cache[previewCacheKey(kind, name, tag)];
  if (!entry || Date.now() - entry.ts > PREVIEW_CACHE_TTL_MS) return undefined;
  return entry.data;
}

function setPreviewCache(kind, name, tag, data) {
  const cache = store.get('apiPreviewCache') || {};
  cache[previewCacheKey(kind, name, tag)] = { data, ts: Date.now() };
  store.set('apiPreviewCache', cache);
}

function platformCandidates(account) {
  const platforms = (account?.platforms ?? []).map((p) => String(p).toLowerCase());
  const hasPc = platforms.includes('pc');
  const hasConsole = platforms.includes('console');
  if (hasPc && hasConsole) return ['pc', 'console'];
  if (hasConsole) return ['console'];
  return ['pc'];
}

// Essaie chaque plateforme candidate dans l'ordre jusqu'à un succès ; relance
// la dernière erreur si aucune ne fonctionne (ex. compte réellement non classé).
async function getMmrWithFallback(account, name, tag, apiKey) {
  let lastErr;
  for (const platform of platformCandidates(account)) {
    try {
      return await getMmr(account.region, platform, name, tag, apiKey);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Cache mémoire partagé par les 3 chemins qui rafraîchissent le compte suivi :
// le bouton Rafraîchir (valorant:get-matches), checkTiltAndNotify (2 min) et
// refreshDailyOverlay (au lancement du jeu). Avant, chacun appelait HenrikDev
// de son côté sans rien savoir des autres. Volontairement en mémoire (pas
// electron-store) : tout tourne dans ce même process, et une donnée aussi
// courte ne doit pas survivre à un redémarrage.
//
// TTL STRICTEMENT supérieur au cooldown du bouton (REFRESH_COOLDOWN_MS = 60 s
// dans useValorantData.js), sinon un joueur qui clique toutes les 60 s
// déclencherait un vrai appel à chaque clic. Et volontairement inférieur au
// tick de checkTiltAndNotify (120 s) : à 120 s pile, un léger retard du timer
// tomberait sur une entrée encore valide et ferait sauter un cycle sur deux.
const SHARED_FETCH_CACHE_TTL_MS = 90 * 1000;
const sharedFetchCache = new Map();

// La promesse (pas le résultat) est stockée : deux appels simultanés — un
// clic sur Rafraîchir pile pendant un tick tilt — partagent la même requête.
// Une erreur (dont un 429) n'est jamais gardée, l'appel suivant réessaie.
function fetchShared(kind, name, tag, variant, loader) {
  const key = `${kind}:${name}#${tag}:${variant}`.toLowerCase();
  const entry = sharedFetchCache.get(key);
  if (entry && Date.now() - entry.at < SHARED_FETCH_CACHE_TTL_MS) return entry.promise;

  const promise = loader();
  const created = { at: Date.now(), promise };
  sharedFetchCache.set(key, created);
  // Les pages de matchs sont lourdes (détail complet de 10 matchs) : on les
  // libère à l'expiration au lieu de les laisser jusqu'au prochain appel.
  const evictTimer = setTimeout(() => {
    if (sharedFetchCache.get(key) === created) sharedFetchCache.delete(key);
  }, SHARED_FETCH_CACHE_TTL_MS);
  evictTimer.unref();
  promise.catch(() => {
    if (sharedFetchCache.get(key) === created) sharedFetchCache.delete(key);
    clearTimeout(evictTimer);
  });
  return promise;
}

const getAccountShared = (name, tag, apiKey) => fetchShared('account', name, tag, '', () => getAccount(name, tag, apiKey));

const getMmrWithFallbackShared = (account, name, tag, apiKey) =>
  fetchShared('mmr', name, tag, '', () => getMmrWithFallback(account, name, tag, apiKey));

// Seule la page la plus récente (start=0) est partagée : c'est celle que les
// 3 chemins redemandent. Les pages plus profondes (rattrapage d'historique)
// ne sont lues que par le bouton, ne se répètent pas d'un chemin à l'autre, et
// pèsent plusieurs Mo chacune — inutile de les garder en mémoire.
function getMatchesPageShared(region, platform, name, tag, apiKey, options = {}) {
  const { size = 10, start = 0 } = options;
  if (start !== 0) return getMatches(region, platform, name, tag, apiKey, options);
  return fetchShared('matches', name, tag, `${region}:${platform}:${size}`, () =>
    getMatches(region, platform, name, tag, apiKey, options),
  );
}

// `fetchPage` : par défaut un appel direct — les aperçus de coéquipiers
// (preview-recent-stats) ont leur propre cache de 5 min et restent inchangés.
async function getMatchesWithFallback(account, name, tag, apiKey, options, fetchPage = getMatches) {
  let lastErr;
  for (const platform of platformCandidates(account)) {
    try {
      return await fetchPage(account.region, platform, name, tag, apiKey, options);
    } catch (err) {
      lastErr = err;
      if (err.status === 429) break; // même quota épuisé, inutile d'essayer l'autre plateforme
    }
  }
  throw lastErr;
}

function currentPuuid() {
  return store.get('linkedAccountPuuid') ?? null;
}

// À appeler juste après chaque saveMatches() : fige les records "carrière"
// (meilleur ace, plus long clutch, plus longue distance de kill, compteurs
// cumulés...) dans career_records AVANT d'alléger le détail des matchs qui
// sortent des KEEP_FULL_DETAIL_COUNT plus récents (voir pruneOldMatchDetail
// dans db.js) — sans quoi ces records ne pourraient plus jamais être
// recalculés correctement une fois le détail supprimé. Uniquement pour le
// compte réellement lié (currentPuuid()) : Hall of Fame ne s'affiche jamais
// pour un profil simplement consulté, inutile d'y calculer quoi que ce soit
// — mais on allège quand même SON historique aussi, pour la taille du cache.
//
// `newMatchCount` (retour de saveMatches) : le recalcul relit TOUT l'historique
// du compte (des dizaines de Mo à parser) — inutile, et coûteux en pleine
// partie, quand la synchro n'a rien ramené de nouveau (cas de la quasi-totalité
// des vérifications toutes les 2 et 5 minutes). Seul le premier passage (aucun
// record encore figé) recalcule sans nouveau match.
async function updateCareerRecordsAndPrune(puuid, name, tag, newMatchCount) {
  const isSelf = !!puuid && puuid === currentPuuid();
  if (isSelf && (newMatchCount > 0 || !getCareerRecords(puuid))) {
    try {
      const allMatches = await getCachedMatchesAsync(puuid);
      const records = computeHallOfFame(allMatches, name, tag);
      saveCareerRecords(puuid, records);
    } catch (err) {
      // Un souci ici ne doit pas faire échouer la synchro qui a déclenché cet
      // appel — mais voir plus bas : sans records figés, on n'allège pas.
      console.error('[career-records] échec de mise à jour', err.message);
    }
  }
  // Jamais d'allègement du compte lié tant que ses records ne sont pas figés :
  // le détail supprimé ne pourrait plus jamais être relu pour les recalculer.
  if (isSelf && !getCareerRecords(puuid)) return;
  try {
    pruneOldMatchDetail(puuid);
  } catch (err) {
    console.error('[career-records] échec de l\'allègement du cache', err.message);
  }
}

// Migration ponctuelle (une seule fois, à l'introduction de ce scoping) :
// rattache les données déjà présentes au compte alors actif localement,
// avant même qu'un vrai compte lié (au sens Supabase) n'existe.
backfillLegacyPuuid(store.get('valorantSettings')?.puuid ?? null);

// Même chose côté electron-store : `personalGoals`/`skinsWishlist`/
// `skinsCollection` existaient en clés globales avant ce scoping — on les
// rattache au compte actuellement configuré si ce n'est pas déjà fait.
(function migrateLegacyStoreKeys() {
  const puuid = store.get('valorantSettings')?.puuid ?? null;
  if (!puuid) return;
  ['personalGoals', 'skinsWishlist', 'skinsCollection'].forEach((base) => {
    const legacy = store.get(base);
    const scopedKeyName = `${base}:${puuid}`;
    if (legacy !== undefined && store.get(scopedKeyName) === undefined) {
      store.set(scopedKeyName, legacy);
      store.delete(base);
    }
  });
})();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// app.quit() ne stoppe pas l'exécution du script : sans le exit() qui suit,
// tout le reste de ce fichier (fenêtres, timers, IPC...) continuait de
// tourner même dans cette invocation spéciale de Squirrel — censée juste
// poser les raccourcis puis quitter tout de suite — jusqu'à ce que le quit
// en attente finisse par détruire des objets en pleine création ("Object
// has been destroyed"), observé en vrai juste après une mise à jour.
if (started) {
  app.quit();
  app.exit(0);
}

// Filet de sécurité pour les crashs jamais rattrapés ailleurs dans le process
// principal — distinctId = compte MVP Tracker lié s'il est déjà connu à cet
// instant, sinon 'unknown' (ex. crash avant toute liaison de compte).
process.on('uncaughtException', (err) => {
  captureException(currentPuuid(), err);
});
process.on('unhandledRejection', (reason) => {
  captureException(currentPuuid(), reason instanceof Error ? reason : new Error(String(reason)));
});

// Vérifie les GitHub Releases au démarrage puis toutes les 10 minutes
// (valeur par défaut de update-electron-app) ; ne fait rien en dev (app pas
// empaquetée), donc sûr à laisser tel quel.
// `notifyUser: false` coupe la boîte de dialogue native que la lib affiche
// par défaut au-dessus de tout (y compris un jeu en plein écran) dès qu'une
// mise à jour est prête — signalé sur Discord par un joueur sorti de sa
// partie Valorant en pleine game à cause de cette popup. On écoute
// nous-mêmes 'update-downloaded' sur l'autoUpdater d'Electron (le même
// utilisé en interne par la lib) pour proposer la mise à jour dans l'app à
// la place, sans jamais voler le focus.
updateElectronApp({ repo: 'SrayZz57/mvp-tracker-client', notifyUser: false });

let pendingUpdate = null;

autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
  pendingUpdate = { releaseName };
  mainWindow?.webContents.send('app-update:ready', pendingUpdate);
});

ipcMain.handle('app-update:get-status', () => pendingUpdate);
// `isQuitting` doit passer à true AVANT quitAndInstall() : sinon le handler
// 'close' de mainWindow (voir plus bas, réduit dans la tray au lieu de
// fermer) intercepte la fermeture déclenchée par la mise à jour et cache la
// fenêtre au lieu de la laisser vraiment quitter — l'app restait plantée en
// arrière-plan dans le Gestionnaire des tâches au lieu de relancer la
// nouvelle version (signalé sur Discord).
ipcMain.handle('app-update:install', () => {
  isQuitting = true;
  autoUpdater.quitAndInstall();
});

// Si le joueur ferme l'app sans avoir cliqué sur le bouton "Redémarrer" (ex.
// il ferme juste sa session de jeu), on applique quand même la mise à jour
// déjà téléchargée à ce moment-là plutôt que de laisser traîner l'ancienne
// version indéfiniment — quitAndInstall() fait quitter puis relance l'app
// avec la nouvelle version, donc `installingUpdate` évite une boucle avec le
// 'before-quit' que cet appel redéclenche lui-même.
let installingUpdate = false;
app.on('before-quit', (event) => {
  if (pendingUpdate && !installingUpdate) {
    event.preventDefault();
    installingUpdate = true;
    autoUpdater.quitAndInstall();
  }
});

// Lancement automatique au démarrage de Windows — activé par défaut pour
// coller au comportement des autres trackers (demandé sur Discord, adri1_v :
// "qu'elle se lance au démarrage etc, qu'on y pense pas"). Le flag
// `autoLaunchInitialized` évite de le réimposer à chaque lancement si
// l'utilisateur le désactive ensuite depuis les réglages du compte.
ipcMain.handle('app-startup:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('app-startup:set', (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
});

// Squirrel.Windows (le moteur derrière update-electron-app) installe chaque
// version dans son propre dossier `app-<version>` et supprime normalement
// les anciennes une fois la mise à jour appliquée — mais seulement s'il a pu
// le faire (dossier pas verrouillé par une instance encore ouverte, app
// fermée proprement). Ça peut laisser d'anciennes versions traîner dans
// %LocalAppData%\MVP Tracker\ indéfiniment. Ce nettoyage ne touche QUE ce
// dossier d'installation (le code de l'app) — jamais `app.getPath('userData')`
// (%AppData%\MVP Tracker\, où vivent matches.db, les réglages, etc.), qui est
// un chemin totalement différent.
function cleanupOldSquirrelVersions() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    // En Squirrel.Windows, l'exécutable qui tourne est toujours
    // <racine>\app-<version courante>\<ProductName>.exe — on en déduit la
    // racine d'installation et le nom du dossier à préserver.
    const currentVersionDir = path.dirname(process.execPath);
    const installRoot = path.dirname(currentVersionDir);
    const currentVersionFolder = path.basename(currentVersionDir);
    if (!currentVersionFolder.startsWith('app-')) return;

    const entries = fs.readdirSync(installRoot, { withFileTypes: true });
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('app-') && entry.name !== currentVersionFolder)
      .forEach((entry) => {
        const staleDir = path.join(installRoot, entry.name);
        fs.rm(staleDir, { recursive: true, force: true }, (err) => {
          if (err) console.warn('[squirrel-cleanup] échec de la suppression de', staleDir, ':', err.message);
          else console.log('[squirrel-cleanup] ancienne version supprimée :', entry.name);
        });
      });
  } catch (err) {
    // Best-effort : un échec ici ne doit jamais empêcher l'app de démarrer.
    console.warn('[squirrel-cleanup] échec du nettoyage :', err.message);
  }
}

// Enlève le bandeau de menu natif (File/Edit/View/Window) — l'app a sa propre
// navigation, ce menu par défaut d'Electron n'a aucune utilité ici.
Menu.setApplicationMenu(null);

// Schéma personnalisé utilisé pour le lien de réinitialisation de mot de
// passe envoyé par Supabase — l'app n'a pas de site web pour héberger la
// page de redirection, donc le lien rouvre directement l'app à la place.
const DEEP_LINK_SCHEME = 'mvptracker';

let mainWindow = null;
let tray = null;
// true uniquement pour un vrai arrêt (menu "Quitter" de la tray, ou
// quitAndInstall d'une mise à jour) — sinon fermer la fenêtre la réduit juste
// dans la barre système (voir mainWindow.on('close', ...) plus bas).
let isQuitting = false;

// Copié dans les ressources du paquet via `extraResource` (forge.config.js) —
// src/assets/ n'est pas traité par le build Vite du process principal, donc
// ce chemin ne serait pas valide une fois empaqueté sans ça.
const trayIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.ico')
  : path.join(__dirname, '..', '..', 'src', 'assets', 'icon.ico');

function createTray() {
  if (tray) return;
  tray = new Tray(trayIconPath);
  tray.setToolTip('MVP Tracker');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Ouvrir MVP Tracker',
        click: () => {
          if (!mainWindow) return;
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// En dev (app pas empaquetée), il faut préciser explicitement l'exécutable
// et le script à relancer, sinon l'enregistrement du protocole ne pointe pas
// vers la bonne commande.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

// Extrait access_token/refresh_token du lien mvptracker://... et les
// transmet au renderer. Deux origines possibles, distinguées par `type` :
// - "recovery" (mvptracker://reset-password#...) : réinitialisation de mot
//   de passe, le renderer affiche l'écran de nouveau mot de passe.
// - sinon (mvptracker://auth/callback#...) : retour de la connexion Google
//   ouverte dans le navigateur système (signInWithOAuth), le renderer active
//   juste la session.
function handleDeepLink(url) {
  if (!url || !url.startsWith(`${DEEP_LINK_SCHEME}://`)) return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  const raw = (parsed.hash ? parsed.hash.slice(1) : '') || parsed.search.slice(1);
  const params = new URLSearchParams(raw);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return;
  if (params.get('type') === 'recovery') {
    mainWindow?.webContents.send('deep-link:recovery', { accessToken, refreshToken });
  } else {
    mainWindow?.webContents.send('deep-link:oauth', { accessToken, refreshToken });
  }
}

// Windows lance une deuxième instance quand on clique le lien — le verrou
// redirige cet appel vers l'instance déjà ouverte au lieu d'en ouvrir une
// deuxième qui écrirait dans les mêmes fichiers locaux.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLink = argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`));
    if (deepLink) handleDeepLink(deepLink);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    // Icône de la barre des tâches : une fois l'app empaquetée, celle de
    // l'exécutable suffit, mais en dev (npm start) Windows affichait celle
    // d'Electron faute de cette option.
    icon: trayIconPath,
    // `show: false` + maximize()/show() une fois prête évite un flash visible
    // de la fenêtre à sa petite taille par défaut avant l'agrandissement.
    show: false,
    autoHideMenuBar: true,
    // Pas de barre de titre native (Windows) — l'app dessine sa propre barre
    // (bouton fermer inclus) dans le renderer, voir TitleBar.jsx.
    frame: false,
    backgroundColor: '#0a0c10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-change', false));

  // Fermer réduit dans la barre système au lieu de vraiment quitter — demandé
  // sur Discord (adri1_v) pour laisser tourner juste le ping/la détection de
  // tilt en arrière-plan pendant une game sans garder la fenêtre ouverte
  // (comme les autres trackers). `isQuitting` distingue cette fermeture-là
  // d'un vrai "Quitter" (menu de la tray, ou quitAndInstall d'une mise à jour).
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  // Signale au renderer quand la fenêtre n'est plus au premier plan (perd le
  // focus, cachée dans la tray) pour couper les animations décoratives — un
  // testeur a signalé une hausse de latence d'affichage EN JEU pendant que
  // l'app tourne juste en arrière-plan (carte graphique visiblement
  // sollicitée dans le Gestionnaire des tâches). Les animations CSS
  // continues (halos, pulses...) tournent même fenêtre pas au premier plan
  // tant que rien ne les coupe explicitement — voir index.css .app-unfocused.
  const sendFocusChange = (focused) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window:focus-change', focused);
  };
  mainWindow.on('focus', () => sendFocusChange(true));
  mainWindow.on('blur', () => sendFocusChange(false));
  mainWindow.on('show', () => sendFocusChange(mainWindow.isFocused()));
  mainWindow.on('hide', () => sendFocusChange(false));

  // `Menu.setApplicationMenu(null)` ci-dessous supprime aussi le raccourci
  // DevTools par défaut (Ctrl+Maj+I) — celui-ci le restitue via F12, pour
  // pouvoir profiler l'app (utile pour investiguer un souci de perf signalé
  // par un utilisateur avancé) sans avoir à relancer en mode dev.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log('[renderer]', message);
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

ipcMain.handle('shell:open-external', (_event, url) => shell.openExternal(url));

// Medal.tv refuse d'être intégré en iframe (x-frame-options: SAMEORIGIN,
// vérifié) — mais Discord/Twitter arrivent bien à lire les clips Medal
// intégrés dans leurs propres embeds, et à en afficher une vraie miniature :
// ils ne mettent pas la PAGE en iframe, ils lisent le lien MP4 direct et
// l'image de miniature exposés dans les balises Open Graph/Twitter Card de
// la page (og:video/twitter:player:stream, og:image/twitter:image) et les
// passent à leur propre lecteur/à une <img>. Même principe ici — voir
// clipEmbed.js et ClipsFeed.jsx. Marche aussi pour Streamable (qui expose
// les mêmes balises), même si leur page s'intègre déjà en iframe sans souci
// — seule sa miniature manquait.
//
// Fait depuis le PROCESS PRINCIPAL, pas le renderer : la CSP du renderer
// (connect-src) ne liste ni medal.tv ni streamable.com pour du fetch brut,
// et il n'y a aucune raison de l'y ajouter juste pour ce seul usage — Node
// n'a pas cette restriction.
//
// Le lien vidéo est signé et propre à chaque requête (paramètres d'auth
// dans l'URL) : résolu à la volée à chaque lecture plutôt que mis en cache
// (voir ClipPlayer/MedalPlayer). La miniature, elle aussi signée mais avec
// une bien plus longue durée de validité (~1 an), est résolue UNE SEULE
// FOIS à la publication et stockée en base (clips.thumbnail_url) — la
// rescraper à chaque affichage du fil pour chaque visiteur serait inutile
// et lent.
ipcMain.handle('clips:resolve-clip-metadata', async (_event, clipUrl) => {
  const empty = { video: null, thumbnail: null };
  try {
    // `fetch` n'a aucun délai par défaut côté Node — sans ça, une plateforme
    // qui traîne ou ne répond jamais laisserait l'appelant coincé en
    // attente indéfiniment (l'IPC ne renverrait tout simplement jamais).
    const res = await fetch(clipUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return empty;
    const html = await res.text();
    const videoMatch =
      html.match(/<meta property="og:video(?::secure_url)?" content="([^"]+)"/) ||
      html.match(/<meta name="twitter:player:stream" content="([^"]+)"/);
    const thumbnailMatch =
      html.match(/<meta property="og:image(?::secure_url)?" content="([^"]+)"/) ||
      html.match(/<meta name="twitter:image" content="([^"]+)"/);
    // Les entités HTML (&amp; dans le HTML source) doivent être décodées
    // avant de servir ces URL telles quelles à un <video src>/<img src>.
    return {
      video: videoMatch ? videoMatch[1].replace(/&amp;/g, '&') : null,
      thumbnail: thumbnailMatch ? thumbnailMatch[1].replace(/&amp;/g, '&') : null,
    };
  } catch (err) {
    console.error('[clips] échec de résolution des métadonnées :', err.message);
    return empty;
  }
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);

// Relais des événements/erreurs du renderer vers PostHog — le renderer n'a
// pas accès direct au SDK (voir services/telemetry.js), il passe par ici.
ipcMain.handle('telemetry:capture-event', (_event, { distinctId, event, properties }) => {
  captureEvent(distinctId, event, properties);
});

ipcMain.handle('telemetry:capture-exception', (_event, { distinctId, message, stack, context }) => {
  const err = new Error(message);
  if (stack) err.stack = stack;
  captureException(distinctId, err, context);
});

// L'Aim Trainer tourne dans sa PROPRE fenêtre plein écran, pas dans un onglet
// de la fenêtre principale : c'est la seule façon d'avoir un vrai comportement
// de jeu (plein écran réel, souris capturée, aucune interface autour) sans que
// le reste de l'app ne rétrécisse le canvas ou ne vole le focus.
let aimTrainerWindow = null;

ipcMain.handle('aim-trainer:open', (_event, config) => {
  if (aimTrainerWindow && !aimTrainerWindow.isDestroyed()) {
    aimTrainerWindow.focus();
    return;
  }

  aimTrainerWindow = new BrowserWindow({
    fullscreen: true,
    icon: trayIconPath,
    autoHideMenuBar: true,
    backgroundColor: '#0a0c10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Les réglages passent par l'URL : la fenêtre de jeu est un rendu autonome
  // du même bundle, elle ne partage aucun état React avec la fenêtre principale.
  const query = `view=aim-trainer&config=${encodeURIComponent(JSON.stringify(config ?? {}))}`;
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    aimTrainerWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${query}`);
  } else {
    aimTrainerWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
      search: query,
    });
  }

  aimTrainerWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      aimTrainerWindow.webContents.toggleDevTools();
    }
    // F9 : bascule la fenêtre plein écran vers l'écran suivant — pratique en
    // dev pour tester le rendu sur un second moniteur à une autre résolution
    // (ex. 1920x1080) sans changer la résolution de l'écran principal.
    if (input.type === 'keyDown' && input.key === 'F9') {
      const displays = screen.getAllDisplays();
      if (displays.length < 2) return;
      const current = screen.getDisplayMatching(aimTrainerWindow.getBounds());
      const currentIndex = displays.findIndex((d) => d.id === current.id);
      const next = displays[(currentIndex + 1) % displays.length];
      aimTrainerWindow.setFullScreen(false);
      aimTrainerWindow.setBounds(next.bounds);
      aimTrainerWindow.setFullScreen(true);
    }
  });

  // Sans ça, les erreurs de la fenêtre de jeu (échec d'enregistrement d'un
  // score, par exemple) sont invisibles : elles ne remontent pas dans la
  // console du process principal comme celles de la fenêtre principale.
  aimTrainerWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log('[aim-trainer]', message);
  });

  aimTrainerWindow.on('closed', () => {
    aimTrainerWindow = null;
    // La fenêtre principale recharge ses records : une session vient d'être
    // jouée, l'onglet doit refléter le nouveau score sans redémarrage.
    mainWindow?.webContents.send('aim-trainer:closed');
  });
});

ipcMain.handle('aim-trainer:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});


ipcMain.handle('settings:get', () => store.get('valorantSettings') || null);

ipcMain.handle('settings:set', (_event, settings) => {
  store.set('valorantSettings', settings);
});

// Identifiant stable de cette installation — sert uniquement à distinguer les
// lignes de stats réseau de chaque appareil dans Supabase (un identifiant par
// PC, pas par personne), pour additionner les totaux sans qu'un appareil
// n'écrase les chiffres d'un autre.
ipcMain.handle('network:get-device-id', () => {
  let id = store.get('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    store.set('deviceId', id);
  }
  return id;
});

// Préférence de langue de l'interface — globale à l'app, indépendante du
// profil consulté ou du compte lié.
ipcMain.handle('language:get', () => store.get('appLanguage') || 'fr');

ipcMain.handle('language:set', (_event, language) => {
  store.set('appLanguage', language);
});

// Le renderer appelle ceci dès qu'il connaît (ou perd) le compte MVP Tracker
// lié — c'est cette valeur, pas valorantSettings.puuid, qui scope toutes les
// données personnelles (voir currentPuuid() plus haut).
ipcMain.handle('account:set-linked-puuid', (_event, puuid) => {
  if (puuid) {
    store.set('linkedAccountPuuid', puuid);
  } else {
    store.delete('linkedAccountPuuid');
  }
});

// Cache local (par compte MVP Tracker, pas par compte Riot) de la clé de
// messagerie déjà déchiffrée — chiffré par le coffre-fort du système
// (DPAPI sous Windows, Trousseau sous macOS) via safeStorage, PAS par
// electron-store lui-même (qui écrit du JSON en clair sur disque). Le mot
// de passe du compte ne sert donc qu'une fois par appareil : une fois cette
// clé mise en cache ici, les lancements suivants n'ont plus besoin de le
// redemander. Un nouvel appareil (ou ce cache vidé) redemande le mot de
// passe une fois — voir wrapped_private_key côté Supabase pour cette
// récupération, jamais la clé elle-même en clair côté serveur.
ipcMain.handle('messaging:cache-key', (_event, { userId, publicKey, secretKeyBase64 }) => {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const payload = JSON.stringify({ publicKey, secretKeyBase64 });
  const encrypted = safeStorage.encryptString(payload);
  store.set(`messagingKeyCache.${userId}`, encrypted.toString('base64'));
  return true;
});

ipcMain.handle('messaging:get-cached-key', (_event, userId) => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const cached = store.get(`messagingKeyCache.${userId}`);
  if (!cached) return null;
  try {
    const decrypted = safeStorage.decryptString(Buffer.from(cached, 'base64'));
    return JSON.parse(decrypted);
  } catch {
    // Coffre-fort système inaccessible/déplacé (ex. profil Windows recréé) —
    // pas grave, ça retombe sur la demande de mot de passe habituelle.
    return null;
  }
});

ipcMain.handle('messaging:clear-cached-key', (_event, userId) => {
  store.delete(`messagingKeyCache.${userId}`);
});

// Cherche un compte Riot sans rien enregistrer — sert à afficher un aperçu
// (bannière/rang/pseudo) avant que l'utilisateur confirme que c'est bien le
// sien, sur l'écran de liaison de compte.
ipcMain.handle('valorant:preview-account', async (_event, { name, tag, apiKey }) => {
  const cached = getPreviewCache('account', name, tag);
  if (cached) return cached;

  const account = await getAccount(name, tag, apiKey);
  let rank = null;
  try {
    const mmr = await getMmrWithFallback(account, name, tag, apiKey);
    rank = { tierId: mmr.current.tier.id, tierName: mmr.current.tier.name, rr: mmr.current.rr };
  } catch {
    // Compte non classé ou erreur MMR : pas grave, l'aperçu reste utile sans rang.
  }
  const result = {
    name,
    tag,
    puuid: account.puuid,
    region: account.region,
    platforms: account.platforms,
    accountLevel: account.account_level,
    cardUuid: account.card,
    rank,
  };
  setPreviewCache('account', name, tag, result);
  return result;
});

// Aperçu rapide K/D + winrate sur les 10 derniers matchs d'un coéquipier
// cliqué dans le graphe de synergie — volontairement séparé de
// valorant:get-matches, qui écrit `valorantSettings` sur disque (bascule le
// "joueur suivi" de toute l'app) : un simple coup d'œil ne doit jamais avoir
// cet effet de bord.
ipcMain.handle('valorant:preview-recent-stats', async (_event, { name, tag, apiKey }) => {
  const cached = getPreviewCache('recent-stats', name, tag);
  if (cached) return cached;

  const account = await getAccount(name, tag, apiKey);
  let rawMatches;
  try {
    rawMatches = await getMatchesWithFallback(account, name, tag, apiKey, { size: 10 });
  } catch (err) {
    console.error('[preview-recent-stats] échec de récupération des matchs :', err.message);
    throw err;
  }
  const matches = excludeDeathmatch(rawMatches);

  let kills = 0;
  let deaths = 0;
  let wins = 0;
  let games = 0;
  matches.forEach((match) => {
    const me = (match.players?.all_players || []).find((p) => p.puuid === account.puuid);
    if (!me?.team) return;
    games += 1;
    kills += me.stats?.kills ?? 0;
    deaths += me.stats?.deaths ?? 0;
    if (match.teams?.[me.team.toLowerCase()]?.has_won) wins += 1;
  });

  const result = {
    games,
    kd: games > 0 ? kills / Math.max(deaths, 1) : null,
    winrate: games > 0 ? (wins / games) * 100 : null,
  };
  setPreviewCache('recent-stats', name, tag, result);
  return result;
});

// Historique de RR du compte suivi (graphique de la page Stats). Une entrée par
// partie classée : on ne garde que ce qui sert au graphique pour que le cache
// disque reste léger, et la liste est mise en cache 15 min par compte — un
// appel de plus par ouverture de la page aurait coûté du quota HenrikDev pour
// une donnée qui ne bouge qu'à la fin d'une partie classée. En cas d'échec
// (429...), on ressert l'ancienne copie plutôt que de vider le graphique.
const MMR_HISTORY_TTL_MS = 15 * 60 * 1000;
// Le bouton de rechargement du bloc contourne ce délai de 15 min, mais pas plus
// souvent qu'une fois par minute : deux clics rapprochés ne doivent pas coûter
// deux vraies requêtes HenrikDev.
const MMR_HISTORY_MIN_REFRESH_MS = 60 * 1000;

function slimMmrHistory(rawEntries) {
  return rawEntries
    .map((entry) => ({
      date: entry.date,
      tierId: entry.tier?.id ?? null,
      tierName: entry.tier?.name ?? null,
      rr: entry.rr,
      elo: typeof entry.elo === 'number' ? entry.elo : null,
      change: typeof entry.last_change === 'number' ? entry.last_change : null,
      map: entry.map?.name ?? null,
    }))
    .filter((entry) => entry.date && entry.tierId !== null && typeof entry.rr === 'number');
}

// HenrikDev ne renvoie que les 20 dernières parties classées (≈ 12 jours pour un
// joueur régulier) : pour que le graphique puisse vraiment couvrir 20 jours, les
// parties déjà vues sont conservées localement et complétées à chaque appel.
// Clé de fusion = la date (unique par partie) ; en cas de doublon, la version
// la plus récente de l'API l'emporte. Au-delà de 30 jours on oublie, pour que le
// fichier de réglages ne grossisse pas indéfiniment.
const MMR_HISTORY_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

function mergeMmrHistory(stored, fresh) {
  const byDate = new Map();
  for (const entry of [...stored, ...fresh]) byDate.set(entry.date, entry);
  const cutoff = Date.now() - MMR_HISTORY_KEEP_MS;
  return [...byDate.values()]
    .filter((entry) => new Date(entry.date).getTime() >= cutoff)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

ipcMain.handle('valorant:get-mmr-history', async (_event, { force = false } = {}) => {
  const settings = store.get('valorantSettings');
  if (!settings?.name || !settings?.tag || !settings?.apiKey) return { history: [] };

  const cached = store.get('mmrHistoryCache');
  const sameAccount = cached && cached.key === `${settings.name}#${settings.tag}`.toLowerCase();
  const maxAge = force ? MMR_HISTORY_MIN_REFRESH_MS : MMR_HISTORY_TTL_MS;
  if (sameAccount && Date.now() - cached.at < maxAge) return { history: cached.history };

  try {
    const account = await getAccountShared(settings.name, settings.tag, settings.apiKey);
    let raw = null;
    let lastErr;
    for (const platform of platformCandidates(account)) {
      try {
        raw = await getMmrHistory(account.region, platform, settings.name, settings.tag, settings.apiKey);
        break;
      } catch (err) {
        lastErr = err;
        if (err.status === 429) break; // même quota, inutile d'essayer l'autre plateforme
      }
    }
    if (raw === null) throw lastErr;
    const history = mergeMmrHistory(sameAccount ? cached.history : [], slimMmrHistory(raw));
    store.set('mmrHistoryCache', { key: `${settings.name}#${settings.tag}`.toLowerCase(), at: Date.now(), history });
    return { history };
  } catch (err) {
    console.error('[henrikdev] historique de RR indisponible :', err.message);
    if (sameAccount) return { history: cached.history, stale: true };
    return { history: [], error: err.message };
  }
});

ipcMain.handle('valorant:get-matches', async (_event, { name, tag, apiKey }) => {
  const account = await getAccountShared(name, tag, apiKey);
  store.set('valorantSettings', { name, tag, apiKey, puuid: account.puuid });

  // Le rang passe AVANT le rattrapage d'historique : c'est une seule requête
  // légère, alors que le rattrapage ci-dessous peut en consommer beaucoup
  // (jusqu'à 50, un par match manquant) sur la même minute — sur la clé
  // Basic (30 req/min), le rang passait après coup et pouvait se retrouver
  // sans quota restant, faisant échouer silencieusement rien que lui. Là, il
  // profite du quota complet dès le début du rafraîchissement.
  try {
    const mmr = await getMmrWithFallbackShared(account, name, tag, apiKey);
    const rankInfo = {
      accountLevel: account.account_level,
      cardUuid: account.card,
      tierId: mmr.current.tier.id,
      tierName: mmr.current.tier.name,
      rr: mmr.current.rr,
      peakTierId: mmr.peak.tier.id,
      peakTierName: mmr.peak.tier.name,
      peakSeasonUuid: mmr.peak.season.id,
    };
    store.set(`valorantRank:${account.puuid}`, rankInfo);
  } catch {
    // Rang indisponible pour CE compte (non classé, erreur API, rate limit) —
    // on ne touche pas au cache d'un autre compte (voir le retour ci-dessous,
    // toujours scopé au puuid réellement recherché, jamais un "dernier connu"
    // global qui pouvait laisser transparaître le rang d'un autre joueur).
  }

  // v4/matches renvoie déjà le détail complet de chaque match (round par
  // round, kills avec position) — plus besoin d'un aller-retour "liste
  // d'IDs" puis "détail par ID" comme avant. Le nombre de résultats par
  // requête reste plafonné à 10 quel que soit `size` (même limite silencieuse
  // que l'ancien point d'accès, confirmée en test réel), mais `start` permet
  // de paginer au-delà — vérifié aussi. On tourne tant qu'une page est
  // pleine (encore de l'historique derrière), jusqu'à 40 matchs par sync
  // (marge de quota, comme avant) ou jusqu'à une limite de requêtes atteinte.
  const HISTORY_CAP = 40;
  const PAGE_SIZE = 10;

  // Un compte crossplay (account.platforms liste "PC" ET "CONSOLE") peut
  // avoir de vrais matchs sur LES DEUX — pas juste une seule "bonne"
  // plateforme à deviner. On récupère donc l'historique de chaque
  // plateforme listée plutôt que de s'arrêter à la première qui répond, et
  // chaque match garde sa plateforme d'origine (metadata.platform, déjà
  // conservée par le normaliseur) — ça permet à l'interface de proposer un
  // filtre PC/Console dans chaque onglet, uniquement quand les deux sont
  // réellement présentes en cache pour ce joueur (voir usePlatformFilter.js
  // côté renderer). Si une plateforme listée n'a en réalité aucun historique
  // exploitable (ex. erreur 500 constatée sur "console" pour un compte qui
  // ne joue que sur PC malgré le crossplay activé), elle est simplement
  // ignorée sans bloquer l'autre.
  // Les matchs les plus récents arrivent en premier (start=0) — dès qu'une
  // page entière est déjà en cache, tout ce qui suit l'est forcément aussi
  // (pas de trou possible dans l'historique). Une resynchro "à vide" (rien
  // de nouveau) coûte donc 1 requête par plateforme au lieu des 4 qu'il
  // fallait avant pour vérifier les 40 derniers matchs à chaque fois.
  const cachedIds = new Set((await getCachedMatchesAsync(account.puuid)).map((m) => m.metadata.matchid));

  let rateLimited = false;
  let newMatchCount = 0;
  for (const candidate of platformCandidates(account)) {
    if (rateLimited) break;
    for (let start = 0; start < HISTORY_CAP; start += PAGE_SIZE) {
      try {
        const page = await getMatchesPageShared(account.region, candidate, name, tag, apiKey, { size: PAGE_SIZE, start });
        console.log(`[henrikdev] page ${candidate}/start=${start} → ${page.length} match(s) normalisé(s)`);
        if (page.length > 0) newMatchCount += saveMatches(account.puuid, page);
        if (page.length > 0 && page.every((m) => cachedIds.has(m.metadata.matchid))) break; // rien de nouveau au-delà
        if (page.length < PAGE_SIZE) break; // plus d'historique derrière sur cette plateforme
      } catch (err) {
        if (err.status === 429) {
          // Limite de requêtes atteinte : inutile d'insister, y compris sur
          // l'autre plateforme (même quota) — reprise à la prochaine
          // synchronisation (chaque match déjà en cache n'est jamais redemandé).
          console.error("[henrikdev] limite de requêtes atteinte, rattrapage de l'historique interrompu pour cette sync");
          rateLimited = true;
        } else if (start === 0) {
          console.error(`[henrikdev] pas d'historique exploitable sur la plateforme ${candidate} :`, err.message);
        } else {
          console.error(`[henrikdev] échec de la page de matchs (plateforme=${candidate}, start=${start}) :`, err.message);
        }
        break;
      }
    }
  }

  await updateCareerRecordsAndPrune(account.puuid, name, tag, newMatchCount);

  return {
    matches: patchSelfIdentity(await getCachedMatchesAsync(account.puuid), account.puuid, name, tag),
    rank: store.get(`valorantRank:${account.puuid}`) || null,
  };
});

ipcMain.handle('valorant:get-rank-for', (_event, puuid) => {
  if (!puuid) return null;
  return store.get(`valorantRank:${puuid}`) || null;
});

ipcMain.handle('valorant:get-cached-matches', async () => {
  const settings = store.get('valorantSettings');
  if (!settings?.puuid) return [];
  return patchSelfIdentity(await getCachedMatchesAsync(settings.puuid), settings.puuid, settings.name, settings.tag);
});

// Variante par puuid explicite — sert aux widgets "personnels" (wrapped
// hebdo, etc.) qui doivent toujours parler du compte lié, pas de celui
// éventuellement affiché à l'écran si l'utilisateur consulte quelqu'un d'autre.
// `valorantSettings` n'est pas forcément CE compte (l'utilisateur peut être
// en train de consulter quelqu'un d'autre) — on ne corrige donc le nom que
// si le puuid correspond bien à ce qui est actuellement chargé.
ipcMain.handle('valorant:get-cached-matches-for', async (_event, puuid) => {
  if (!puuid) return [];
  const settings = store.get('valorantSettings');
  if (settings?.puuid === puuid) {
    return patchSelfIdentity(await getCachedMatchesAsync(puuid), puuid, settings.name, settings.tag);
  }
  return getCachedMatchesAsync(puuid);
});

// Records "carrière" persistés (voir updateCareerRecordsAndPrune) — null tant
// qu'aucune synchro n'a encore tourné pour ce puuid (compte tout juste lié) ;
// le renderer retombe alors sur un calcul local à partir de ce qu'il a déjà
// en mémoire (voir HallOfFame.jsx).
ipcMain.handle('hall-of-fame:get-records', (_event, puuid) => {
  if (!puuid) return null;
  return getCareerRecords(puuid);
});

let networkStatus = { valorantRunning: false, latestPing: null };

setInterval(async () => {
  const valorantRunning = await isValorantRunning();
  const latestPing = valorantRunning ? await pingOnce() : null;
  networkStatus = { valorantRunning, latestPing };
  if (valorantRunning && latestPing !== null && currentPuuid()) {
    savePingSample(currentPuuid(), latestPing);
  }
}, 5000);

ipcMain.handle('network:get-status', () => networkStatus);

// Accepte un puuid explicite plutôt que de compter uniquement sur
// currentPuuid() (lu depuis le disque) : au tout premier appel d'une
// session, cet appel et celui qui enregistre linkedAccountPuuid partent en
// parallèle depuis le renderer — currentPuuid() peut donc encore être vide
// au moment où celui-ci s'exécute, même si le puuid demandé est le bon.
// Fenêtre de lecture (interface) plus courte que la durée de conservation
// (disque) : les mesures un peu plus anciennes restent en base sans être
// transférées à chaque lancement.
const PING_READ_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const PING_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

ipcMain.handle('network:get-ping-samples', (_event, puuid) => {
  const target = puuid ?? currentPuuid();
  return target ? getAllPingSamples(target, Date.now() - PING_READ_WINDOW_MS) : [];
});

// Purge des vieilles mesures, un peu après le démarrage (pas dans le chemin
// d'affichage de la fenêtre) puis une fois par jour si l'app reste ouverte.
function purgeOldPingSamples() {
  try {
    const removed = prunePingSamples(Date.now() - PING_RETENTION_MS);
    if (removed > 0) console.log(`[db] ${removed} ancienne(s) mesure(s) de ping purgée(s)`);
  } catch (err) {
    console.error('[db] échec de la purge des mesures de ping', err.message);
  }
}
setTimeout(purgeOldPingSamples, 60 * 1000);
setInterval(purgeOldPingSamples, 24 * 60 * 60 * 1000);

// Coupe aussi les animations décoratives dès que le JEU est lancé (pas juste
// le client ouvert) — un joueur qui garde l'app visible sur un second écran
// pendant qu'il joue n'aurait sinon jamais le bénéfice de la coupure sur
// perte de focus (voir window:focus-change).
// Signal : le process du jeu tourne (tasklist, très léger). Anciennement :
// Valorant au premier plan, mesuré par un powershell.exe + Add-Type (compilation
// C#) relancé toutes les 6 s — un pic CPU régulier en pleine partie, signalé
// comme perte de FPS par un joueur (80-90 → 50-60 en skirmish). Contrepartie :
// les animations sont aussi coupées si le joueur alt-tab pendant que le jeu
// tourne, ce qui est plutôt un avantage.
// isValorantRunning() d'abord pour ne rien lancer tant que le client est fermé.
let lastMatchActive = false;

async function pollMatchActive() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const active = (await isValorantRunning()) && (await isValorantGameRunning());
  if (active !== lastMatchActive) {
    lastMatchActive = active;
    mainWindow.webContents.send('window:match-active-change', active);
  }
}

setInterval(pollMatchActive, 6000);

// Détection de tilt en direct : tant que Valorant tourne, on revérifie
// régulièrement si un nouveau match vient de se terminer et, si oui, on
// recalcule le statut de tilt pour prévenir par notification Windows —
// sans attendre que l'utilisateur ouvre l'app et clique sur l'onglet Tilt.
const tiltPollState = { lastMatchId: null, notified: false };

function tiltMessage(tilt, form) {
  return tilt.lossStreakTilt
    ? `Série de ${form.streakCount} défaites d'affilée. Une pause pourrait aider.`
    : `Ta perf a baissé sur tes 3 derniers matchs. Une pause pourrait aider.`;
}

function notifyTilt(tilt, form) {
  if (!Notification.isSupported()) return;
  if ((store.get('tiltNotificationsEnabled') ?? true) === false) return;
  const body = tiltMessage(tilt, form);
  const notification = new Notification({
    title: 'MVP Tracker — signe de tilt détecté',
    body,
    silent: false,
  });
  notification.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
}

// Récupération des derniers matchs du compte suivi (compte + page la plus
// récente, via le cache partagé) puis enregistrement local — la part commune
// de checkTiltAndNotify et de refreshDailyOverlay.
//
// Un match complet pèse ~500-600 Ko (round par round, kills avec position) : le
// cycle de 2 minutes en téléchargeait 10 à chaque tour pour seulement savoir
// s'il y en avait un nouveau. On demande d'abord UN seul match ; s'il est déjà
// en cache, il n'y a rien de nouveau et on s'arrête là (~10x moins de données
// par tour). La page complète n'est téléchargée que quand un nouveau match existe.
async function syncLatestMatches(settings) {
  const account = await getAccountShared(settings.name, settings.tag, settings.apiKey);

  const probe = await getMatchesWithFallback(
    account,
    settings.name,
    settings.tag,
    settings.apiKey,
    { size: 1 },
    getMatchesPageShared,
  );
  const latestId = probe[0]?.metadata?.matchid;
  if (!latestId || hasCachedMatch(account.puuid, latestId)) {
    return { account, freshMatches: probe };
  }

  const freshMatches = await getMatchesWithFallback(
    account,
    settings.name,
    settings.tag,
    settings.apiKey,
    undefined,
    getMatchesPageShared,
  );
  const newMatchCount = saveMatches(account.puuid, freshMatches);
  await updateCareerRecordsAndPrune(account.puuid, settings.name, settings.tag, newMatchCount);
  return { account, freshMatches };
}

// Notifications push vers le téléphone : le process principal n'a pas la session
// Supabase (donc pas accès aux jetons du téléphone) — il demande au renderer, qui
// les lit puis rappelle 'mobile-push:send' pour l'envoi réel vers Expo.
function requestMobilePush(title, body) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mobile-push:event', { title, body });
  }
}

// Fin de partie : résultat + score, héros, K/D et % de tirs à la tête. Les modes
// sans équipes (Combat à mort...) sont ignorés, comme pour le tilt.
function requestMobileMatchPush(match, settings) {
  if (!match || excludeDeathmatch([match]).length === 0) return;
  const me = findMe(match, settings.name, settings.tag);
  if (!me) return;
  const label = resultLabel(match, me);
  if (label !== 'Victoire' && label !== 'Défaite' && label !== 'Match nul') return;

  const kills = me.stats?.kills ?? 0;
  const deaths = me.stats?.deaths ?? 0;
  const assists = me.stats?.assists ?? 0;
  const kd = deaths > 0 ? kills / deaths : kills;
  const { hsPercent } = hitStats(me);
  const score = matchScore(match, me);
  const hero = me.character ?? 'Agent inconnu';
  const map = match.metadata?.map;

  const title = `${label}${score ? ` ${score.replace('-', '–')}` : ''} · ${hero}`;
  const body = [
    `K/D ${kd.toFixed(2)} (${kills}/${deaths}/${assists})`,
    hsPercent === null ? null : `HS ${hsPercent.toFixed(0)}%`,
    map ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
  requestMobilePush(title, body);
}

// Envoi via le service gratuit d'Expo, qui relaie vers Apple/Google. Retourne les
// jetons refusés (téléphone désinstallé...) pour que le renderer les supprime.
ipcMain.handle('mobile-push:send', async (_event, { tokens, title, body }) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return { invalid: [] };
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        tokens.map((to) => ({ to, title, body, sound: 'default', channelId: 'matches', priority: 'high', data: { push: true } })),
      ),
    });
    const json = await res.json();
    const tickets = Array.isArray(json?.data) ? json.data : [];
    const invalid = tokens.filter((_, i) => tickets[i]?.status === 'error' && tickets[i]?.details?.error === 'DeviceNotRegistered');
    return { invalid };
  } catch (err) {
    console.error("[mobile-push] échec de l'envoi", err.message);
    return { invalid: [] };
  }
});

async function checkTiltAndNotify() {
  const settings = store.get('valorantSettings');
  if (!settings?.name || !settings?.tag || !settings?.apiKey) return;
  try {
    const { account, freshMatches } = await syncLatestMatches(settings);

    // L'overlay de session n'a plus de timer propre : il se met à jour ici, à
    // la cadence de ce cycle, à partir des matchs qui viennent d'être
    // enregistrés — aucun appel API de plus. Avant les `return` ci-dessous :
    // il doit se rafraîchir même quand il n'y a pas de nouveau match pour le tilt.
    if (dailyOverlayLastRunning && (store.get('dailyOverlayEnabled') ?? true)) {
      await pushDailyOverlayStats(account.puuid, settings);
    }

    const latestId = freshMatches[0]?.metadata?.matchid ?? null;
    if (!latestId || latestId === tiltPollState.lastMatchId) return;
    const isFirstCheck = tiltPollState.lastMatchId === null;
    tiltPollState.lastMatchId = latestId;
    // Premier check depuis le lancement de l'app : sert juste de point de
    // départ, pour ne pas notifier immédiatement sur un tilt déjà ancien.
    if (isFirstCheck) return;

    requestMobileMatchPush(freshMatches[0], settings);

    const played = excludeDeathmatch(await getCachedMatchesAsync(account.puuid));
    const form = formStats(played, settings.name, settings.tag);
    const tilt = tiltStatus(played, settings.name, settings.tag, form);

    if (tilt.isTilted) {
      if (!tiltPollState.notified) {
        tiltPollState.notified = true;
        notifyTilt(tilt, form);
        requestMobilePush('Signe de tilt détecté', tiltMessage(tilt, form));
      }
    } else {
      tiltPollState.notified = false;
    }
  } catch {
    // Erreur ponctuelle (rate limit, réseau) : on retentera au prochain tick,
    // pas besoin de faire planter la vérification pour ça.
  }
}

// Uniquement tant que le JEU tourne (même signal que l'overlay de session : le
// process du jeu, pas le lanceur Riot ouvert seul) : lanceur ouvert sans partie
// lancée, il n'y a rien à calculer ni aucun appel API à faire.
setInterval(() => {
  if (dailyOverlayLastRunning) checkTiltAndNotify();
}, 120000);

// --- Overlay de session quotidienne (victoires/défaites, HS%, K/D) --------
// Alimenté uniquement par HenrikDev (jamais l'API locale du client, retirée
// en 1.10.6) — aucune capture d'écran ni OCR nécessaire ici (contrairement à
// l'ancien overlay d'achat auto, mis de côté et retiré du code pour être
// repris plus tard proprement). Fenêtre transparente, sans bordure,
// click-through par défaut, ne fonctionne qu'en Sans bordure/Fenêtré.
let dailyOverlayWindow = null;
let dailyOverlayTopmostInterval = null;
const dailyOverlayState = { dayKey: null };

// Taille de base (100%) — voir dailyOverlayDimensions(), réglable depuis Mon
// compte (dailyOverlaySize, store, en %).
const DAILY_OVERLAY_BASE_WIDTH = 380;
const DAILY_OVERLAY_BASE_HEIGHT = 110;

function dailyOverlayDimensions() {
  const percent = store.get('dailyOverlaySize') ?? 100;
  return {
    width: Math.round((DAILY_OVERLAY_BASE_WIDTH * percent) / 100),
    height: Math.round((DAILY_OVERLAY_BASE_HEIGHT * percent) / 100),
  };
}

function dailyOverlayDefaultPosition(width, height) {
  // En haut à droite par défaut : loin du centre de l'écran où se concentre
  // l'action, et de la minimap (généralement en bas) et de la boutique
  // (haut-gauche). Écrasé par une position sauvegardée si l'utilisateur a
  // déjà déplacé la fenêtre (voir dailyOverlayPosition, store).
  const display = screen.getPrimaryDisplay().workArea;
  return { x: display.x + display.width - width - 16, y: display.y + 16 };
}

// Mode "déplacement" : la fenêtre devient temporairement interactive et
// glissable (voir setDailyOverlayDragMode) pour permettre à l'utilisateur de
// la repositionner depuis Mon compte — jamais pendant une vraie partie (voir
// le garde-fou dans la boucle de détection plus bas). `focusable: false` par
// défaut est le vrai correctif du souci de blocage caméra remonté par des
// utilisateurs : une fenêtre non-focusable, même toujours au premier plan,
// ne peut jamais voler le focus clavier/souris au jeu — seule
// setIgnoreMouseEvents ne suffisait apparemment pas.
let dailyOverlayDragMode = false;

function createDailyOverlay() {
  const { width, height } = dailyOverlayDimensions();

  dailyOverlayWindow = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    focusable: dailyOverlayDragMode,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 'screen-saver' : seul niveau confirmé s'afficher réellement par-dessus
  // Valorant en test (l'ancien overlay d'achat, avant qu'on passe à
  // 'floating' pour la perf — jamais revérifié visuellement après ce
  // changement). Priorité à la visibilité d'abord, on reviendra sur un
  // niveau plus léger une fois confirmé que ça s'affiche.
  dailyOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  if (dailyOverlayDragMode) {
    dailyOverlayWindow.setIgnoreMouseEvents(false);
  } else {
    dailyOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  const saved = store.get('dailyOverlayPosition');
  const pos = saved ?? dailyOverlayDefaultPosition(width, height);
  dailyOverlayWindow.setPosition(pos.x, pos.y);

  // Ne persiste la position que pendant un déplacement volontaire — un
  // setPosition() programmatique (ci-dessus, ou un futur redimensionnement)
  // ne doit jamais être interprété comme "l'utilisateur a bougé la fenêtre".
  dailyOverlayWindow.on('moved', () => {
    if (!dailyOverlayDragMode || !dailyOverlayWindow) return;
    const [x, y] = dailyOverlayWindow.getPosition();
    store.set('dailyOverlayPosition', { x, y });
  });

  const query = 'view=daily-overlay';
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    dailyOverlayWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${query}`);
  } else {
    dailyOverlayWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
      search: query,
    });
  }

  dailyOverlayWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log('[daily-overlay]', message);
  });
  dailyOverlayWindow.webContents.on('did-fail-load', (_e, code, description) => {
    console.error(`[daily-overlay] échec de chargement de la page (${code} ${description})`);
  });
  dailyOverlayWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[daily-overlay] process de rendu arrêté :', details.reason);
  });

  dailyOverlayWindow.showInactive();
  if (!dailyOverlayTopmostInterval) {
    dailyOverlayTopmostInterval = setInterval(() => {
      try {
        if (dailyOverlayWindow && !dailyOverlayWindow.isDestroyed()) {
          dailyOverlayWindow.moveTop();
        }
      } catch {
        clearInterval(dailyOverlayTopmostInterval);
        dailyOverlayTopmostInterval = null;
      }
    }, 3000);
  }
}

function closeDailyOverlay() {
  clearInterval(dailyOverlayTopmostInterval);
  dailyOverlayTopmostInterval = null;
  if (dailyOverlayWindow && !dailyOverlayWindow.isDestroyed()) {
    try {
      dailyOverlayWindow.close();
    } catch {
      // déjà détruite entre le check et l'appel — rien à faire de plus.
    }
  }
  dailyOverlayWindow = null;
}

// Aperçu figé envoyé quand on active le mode déplacement hors partie (aucune
// vraie stat disponible à ce moment-là) — juste de quoi voir la fenêtre pour
// la faire glisser, jamais persisté nulle part.
const DAILY_OVERLAY_PREVIEW_STATS = { dayKey: 'preview', matchesPlayed: 1, wins: 3, losses: 1, kd: 1.24, hsPercent: 53 };

// Dernières vraies stats calculées — la fenêtre overlay les redemande elle-même
// une fois montée (voir daily-overlay:get-stats). Envoyer uniquement au
// 'did-finish-load' ne suffit plus : DailyOverlay est chargé en React.lazy
// (renderer.jsx), son composant et son écouteur IPC n'existent donc qu'APRÈS
// ce signal — le message partait dans le vide et l'overlay restait invisible
// (impossible à déplacer hors partie, et absent en jeu jusqu'au refresh suivant).
let dailyOverlayLatestStats = null;

ipcMain.handle('daily-overlay:get-stats', () =>
  dailyOverlayLatestStats ?? (dailyOverlayDragMode ? DAILY_OVERLAY_PREVIEW_STATS : null),
);

// Active/désactive le mode déplacement — voir le commentaire sur
// dailyOverlayDragMode plus haut. Toujours forcé à `false` dès qu'une vraie
// partie démarre (voir la boucle de détection plus bas) : ne doit jamais
// rester interactif pendant que l'utilisateur joue.
function setDailyOverlayDragMode(enabled) {
  dailyOverlayDragMode = enabled;
  console.log(`[daily-overlay] mode déplacement ${enabled ? 'activé' : 'désactivé'} (jeu détecté : ${dailyOverlayLastRunning})`);

  if (enabled) {
    const needsPreview = !dailyOverlayWindow || dailyOverlayWindow.isDestroyed();
    if (needsPreview) createDailyOverlay();
    dailyOverlayWindow.setFocusable(true);
    dailyOverlayWindow.setIgnoreMouseEvents(false);
    dailyOverlayWindow.webContents.send('daily-overlay:drag-mode', true);
    if (needsPreview) {
      dailyOverlayWindow.webContents.once('did-finish-load', () => {
        if (dailyOverlayWindow && !dailyOverlayWindow.isDestroyed()) {
          dailyOverlayWindow.webContents.send('daily-overlay:stats', DAILY_OVERLAY_PREVIEW_STATS);
        }
      });
    }
    return;
  }

  if (dailyOverlayWindow && !dailyOverlayWindow.isDestroyed()) {
    dailyOverlayWindow.setFocusable(false);
    dailyOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
    dailyOverlayWindow.webContents.send('daily-overlay:drag-mode', false);
    // Hors partie, pas de raison de laisser tourner une fenêtre juste
    // affichée pour le repositionnement.
    if (!dailyOverlayLastRunning) closeDailyOverlay();
  }
}

ipcMain.handle('daily-overlay:get-drag-mode', () => dailyOverlayDragMode);
ipcMain.handle('daily-overlay:set-drag-mode', (_event, enabled) => setDailyOverlayDragMode(enabled));

ipcMain.handle('daily-overlay:get-size', () => store.get('dailyOverlaySize') ?? 100);
ipcMain.handle('daily-overlay:set-size', (_event, percent) => {
  store.set('dailyOverlaySize', percent);
  if (dailyOverlayWindow && !dailyOverlayWindow.isDestroyed()) {
    const { width, height } = dailyOverlayDimensions();
    dailyOverlayWindow.setSize(width, height);
    dailyOverlayWindow.webContents.send('daily-overlay:size', percent);
  }
});

ipcMain.handle('tilt-notifications:get-enabled', () => store.get('tiltNotificationsEnabled') ?? true);
ipcMain.handle('tilt-notifications:set-enabled', (_event, enabled) => store.set('tiltNotificationsEnabled', enabled));

ipcMain.handle('daily-overlay:get-enabled', () => store.get('dailyOverlayEnabled') ?? true);

ipcMain.handle('daily-overlay:set-enabled', (_event, enabled) => {
  store.set('dailyOverlayEnabled', enabled);
  if (!enabled) closeDailyOverlay();
});

// Modes à exclure du score du jour, en plus des modes sans vraie
// victoire/défaite déjà exclus automatiquement (voir dailyStats.js/
// computeDailyStats). Réglable via une modale DANS l'app principale (voir
// DailyOverlaySettings.jsx, App.jsx) — pas de fenêtre séparée côté main.js,
// juste ces deux handlers pour lire/écrire le choix dans electron-store.
ipcMain.handle('daily-overlay:get-excluded-modes', () => store.get('dailyOverlayExcludedModes') ?? []);

ipcMain.handle('daily-overlay:set-excluded-modes', (_event, modeIds) => {
  store.set('dailyOverlayExcludedModes', modeIds);
});

// Recalcule la journée en cours (voir resolveSessionDay dans dailyStats.js
// pour la règle de bascule à minuit) à partir des matchs DÉJÀ enregistrés en
// local, puis envoie le résultat à la fenêtre — la crée si besoin, comme
// showBuySuggestion. Aucun appel API ici : c'est l'appelant (refreshDailyOverlay
// au lancement du jeu, checkTiltAndNotify ensuite) qui a synchronisé les matchs.
async function pushDailyOverlayStats(puuid, settings) {
  try {
    const t0 = Date.now();
    // Seule la journée en cours compte pour l'overlay : les 100 matchs les
    // plus récents suffisent largement, inutile de reparser tout l'historique
    // en pleine partie.
    const allMatches = await getCachedMatchesAsync(puuid, 100);
    const t1 = Date.now();
    dailyOverlayState.dayKey = resolveSessionDay(allMatches, dailyOverlayState.dayKey);
    const excludedModes = store.get('dailyOverlayExcludedModes') ?? [];
    const stats = computeDailyStats(allMatches, settings.name, settings.tag, dailyOverlayState.dayKey, excludedModes);
    const t2 = Date.now();
    console.log('[daily-overlay] stats calculées', stats);
    dailyOverlayLatestStats = stats;
    // Le process principal n'a pas la session Supabase (elle vit dans le
    // renderer) : on lui passe les stats pour qu'il les publie vers le téléphone.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('daily-overlay:stats', stats);
    }
    console.log(`[daily-overlay] timing: getCachedMatches=${t1 - t0}ms compute=${t2 - t1}ms TOTAL=${t2 - t0}ms`);

    if (!dailyOverlayWindow || dailyOverlayWindow.isDestroyed()) {
      console.log('[daily-overlay] création de la fenêtre');
      createDailyOverlay();
      // loadURL/loadFile est asynchrone : envoyer tout de suite risquait de
      // perdre le message si la page (et son écouteur IPC) n'avait pas fini
      // de charger — le tout premier envoi partait dans le vide (constaté
      // en test le 2026-09-16 : "stats envoyées" loggé AVANT même la
      // connexion vite de la fenêtre). On attend que la page soit prête.
      dailyOverlayWindow.webContents.once('did-finish-load', () => {
        if (!dailyOverlayWindow || dailyOverlayWindow.isDestroyed()) return;
        dailyOverlayWindow.webContents.send('daily-overlay:stats', stats);
        console.log('[daily-overlay] stats envoyées à la fenêtre (après chargement)');
      });
    } else {
      dailyOverlayWindow.webContents.send('daily-overlay:stats', stats);
      console.log('[daily-overlay] stats envoyées à la fenêtre');
    }
  } catch (err) {
    console.error('[daily-overlay] échec de mise à jour des stats', err);
  }
}

// Premier affichage de l'overlay au lancement du jeu : synchronise les matchs
// (via le cache partagé — si le cycle tilt vient de tourner, aucun appel API
// réel) puis affiche. Ensuite l'overlay est mis à jour par checkTiltAndNotify.
async function refreshDailyOverlay() {
  const enabled = store.get('dailyOverlayEnabled') ?? true;
  if (!enabled) {
    console.log('[daily-overlay] désactivé (toggle Mon compte)');
    return;
  }

  const settings = store.get('valorantSettings');
  if (!settings?.name || !settings?.tag || !settings?.apiKey) {
    console.log('[daily-overlay] valorantSettings incomplet, abandon', {
      hasName: !!settings?.name,
      hasTag: !!settings?.tag,
      hasApiKey: !!settings?.apiKey,
    });
    return;
  }

  try {
    console.log('[daily-overlay] rafraîchissement pour', settings.name, settings.tag);
    const { account } = await syncLatestMatches(settings);
    await pushDailyOverlayStats(account.puuid, settings);
  } catch (err) {
    // Erreur ponctuelle (rate limit, réseau) : le prochain cycle tilt
    // remettra l'overlay à jour, même logique que checkTiltAndNotify.
    console.error('[daily-overlay] échec de rafraîchissement', err);
  }
}

// Se déclenche DÈS le lancement du JEU, sans attendre le prochain cycle de
// checkTiltAndNotify (jusqu'à 2 min) — un check plus fréquent (même cadence
// que pollMatchActive) détecte la transition et lance un premier
// rafraîchissement immédiat. Il n'y a plus de timer de 5 min : les mises à
// jour suivantes viennent de checkTiltAndNotify (voir pushDailyOverlayStats).
//
// isValorantGameRunning() (process VALORANT-Win64-Shipping.exe) plutôt que
// isValorantRunning() (process du Riot Client, vrai dès l'écran d'accueil) —
// signalé par l'utilisateur : l'overlay apparaissait trop tôt, avant même
// d'avoir lancé une partie.
let dailyOverlayLastRunning = false;

function scheduleDailyOverlayRefresh() {
  console.log('[daily-overlay] Valorant détecté, lancement du suivi');
  refreshDailyOverlay();
}

setInterval(async () => {
  const running = await isValorantGameRunning();

  // Garde-fou : jamais interactif/déplaçable une fois en partie, même si le
  // mode déplacement avait été laissé actif par erreur (fenêtre fermée sans
  // repasser par le toggle, par exemple). Uniquement sur la transition
  // fermé→lancé (pas à chaque tick tant que `running` reste vrai) : sinon un
  // glissement volontaire en cours pendant que le jeu est déjà ouvert se
  // faisait couper dès que ce setInterval retombait sur `running`, ramenant
  // l'overlay à sa dernière position persistée si le clic n'était pas
  // relâché à temps.
  if (running && !dailyOverlayLastRunning && dailyOverlayDragMode) {
    console.log('[daily-overlay] partie détectée, verrouillage forcé du mode déplacement');
    setDailyOverlayDragMode(false);
  }

  if (running && !dailyOverlayLastRunning) {
    scheduleDailyOverlayRefresh();
  } else if (!running && dailyOverlayLastRunning) {
    console.log('[daily-overlay] Valorant fermé, arrêt du suivi');
    closeDailyOverlay();
    // Le tilt repart de zéro à chaque fermeture du jeu : sans ça, l'alerte déjà
    // envoyée (notified) bloquait toute nouvelle alerte à la session suivante, et
    // le dernier match mémorisé faisait traiter le premier match de la nouvelle
    // session comme la suite de l'ancienne.
    tiltPollState.lastMatchId = null;
    tiltPollState.notified = false;
  }
  dailyOverlayLastRunning = running;
}, 6000);

ipcMain.handle('sync:matches', (_event, payload) => syncMatches(payload));

ipcMain.handle('crosshair:list', () => (currentPuuid() ? getCrosshairs(currentPuuid()) : []));

ipcMain.handle('crosshair:save', (_event, { name, code, color, image }) =>
  saveCrosshair(currentPuuid(), name, code, color, image),
);

ipcMain.handle('crosshair:delete', (_event, id) => deleteCrosshair(currentPuuid(), id));

ipcMain.handle('strategy:list', (_event, map) => (currentPuuid() ? getStrategiesForMap(currentPuuid(), map) : []));

ipcMain.handle('strategy:save', (_event, { name, map, canvasJson }) =>
  saveStrategy(currentPuuid(), name, map, canvasJson),
);

ipcMain.handle('strategy:delete', (_event, id) => deleteStrategy(currentPuuid(), id));

// Clé `electron-store` scopée par compte — `skinsWishlist` / `skinsCollection`
// / `personalGoals` suivent maintenant le compte plutôt que la machine.
function scopedKey(base) {
  const puuid = currentPuuid();
  return puuid ? `${base}:${puuid}` : null;
}

// Blocs réduits (chaque carte de chaque onglet, voir CollapsibleCard.jsx) —
// liste d'identifiants stables (ex. "stats.profileHeader"), scopée au compte
// LIÉ comme le reste des préférences personnelles (jamais au profil
// actuellement affiché, qui change à chaque recherche).
ipcMain.handle('ui:get-collapsed-blocks', () => {
  const key = scopedKey('collapsedBlocks');
  return key ? store.get(key) || [] : [];
});

ipcMain.handle('ui:toggle-collapsed-block', (_event, blockId) => {
  const key = scopedKey('collapsedBlocks');
  if (!key) return [];
  const collapsed = store.get(key) || [];
  const next = collapsed.includes(blockId) ? collapsed.filter((id) => id !== blockId) : [...collapsed, blockId];
  store.set(key, next);
  return next;
});

ipcMain.handle('skins:get-wishlist', () => {
  const key = scopedKey('skinsWishlist');
  return key ? store.get(key) || [] : [];
});

ipcMain.handle('skins:toggle-wishlist', (_event, uuid) => {
  const key = scopedKey('skinsWishlist');
  if (!key) return [];
  const wishlist = store.get(key) || [];
  const next = wishlist.includes(uuid) ? wishlist.filter((id) => id !== uuid) : [...wishlist, uuid];
  store.set(key, next);
  return next;
});

ipcMain.handle('skins:get-collection', () => {
  const key = scopedKey('skinsCollection');
  return key ? store.get(key) || [] : [];
});

ipcMain.handle('skins:toggle-collection', (_event, { uuid, defaultPriceVp }) => {
  const key = scopedKey('skinsCollection');
  if (!key) return [];
  const collection = store.get(key) || [];
  const exists = collection.some((entry) => entry.uuid === uuid);
  const next = exists
    ? collection.filter((entry) => entry.uuid !== uuid)
    : [...collection, { uuid, priceVp: defaultPriceVp }];
  store.set(key, next);
  return next;
});

ipcMain.handle('skins:set-collection-price', (_event, { uuid, priceVp }) => {
  const key = scopedKey('skinsCollection');
  if (!key) return [];
  const collection = store.get(key) || [];
  const next = collection.map((entry) => (entry.uuid === uuid ? { ...entry, priceVp } : entry));
  store.set(key, next);
  return next;
});

ipcMain.handle('play-session:get-active', () => (currentPuuid() ? getActivePlaySession(currentPuuid()) : null));

ipcMain.handle('play-session:start', () => (currentPuuid() ? startPlaySession(currentPuuid()) : null));

ipcMain.handle('play-session:end', (_event, id) => {
  if (currentPuuid()) endPlaySession(currentPuuid(), id);
});

ipcMain.handle('play-session:history', (_event, limit) =>
  currentPuuid() ? getPlaySessionHistory(currentPuuid(), limit ?? 30) : [],
);

ipcMain.handle('assessment:get', (_event, matchId) =>
  currentPuuid() ? getAssessmentForMatch(currentPuuid(), matchId) : null,
);

ipcMain.handle('assessment:save', (_event, { matchId, date, map, answersJson }) =>
  saveAssessment(currentPuuid(), matchId, date, map, answersJson),
);

ipcMain.handle('assessment:history', (_event, limit) =>
  currentPuuid() ? getAssessmentHistory(currentPuuid(), limit ?? 30) : [],
);

ipcMain.handle('narrative:get', (_event, weekStart) =>
  currentPuuid() ? getNarrativeForWeek(currentPuuid(), weekStart) : null,
);

ipcMain.handle('narrative:get-previous', (_event, weekStart) =>
  currentPuuid() ? getPreviousNarrative(currentPuuid(), weekStart) : null,
);

ipcMain.handle('narrative:save', (_event, { weekStart, recapJson, rankJson, narrativeJson }) =>
  saveNarrative(currentPuuid(), weekStart, recapJson, rankJson, narrativeJson),
);

ipcMain.handle('narrative:history', (_event, limit) =>
  currentPuuid() ? getNarrativeHistory(currentPuuid(), limit ?? 20) : [],
);

ipcMain.handle('goals:get', () => {
  const key = scopedKey('personalGoals');
  return key ? store.get(key) || [] : [];
});

ipcMain.handle('goals:add', (_event, goal) => {
  const key = scopedKey('personalGoals');
  if (!key) return [];
  const goals = store.get(key) || [];
  const next = [...goals, { ...goal, id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, done: false, createdAt: Date.now() }];
  store.set(key, next);
  return next;
});

ipcMain.handle('goals:toggle-done', (_event, id) => {
  const key = scopedKey('personalGoals');
  if (!key) return [];
  const goals = store.get(key) || [];
  const next = goals.map((goal) => (goal.id === id ? { ...goal, done: !goal.done } : goal));
  store.set(key, next);
  return next;
});

ipcMain.handle('goals:delete', (_event, id) => {
  const key = scopedKey('personalGoals');
  if (!key) return [];
  const goals = store.get(key) || [];
  const next = goals.filter((goal) => goal.id !== id);
  store.set(key, next);
  return next;
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  cleanupOldSquirrelVersions();

  // Content-Security-Policy — uniquement en production packagée : le serveur
  // de dev Vite a besoin d'unsafe-eval pour le rechargement à chaud, inutile
  // (et contre-productif) de le restreindre en dev. Les seules origines
  // distantes réellement contactées par l'app : HenrikDev (matchs/rang),
  // valorant-api.com (assets du jeu, images servies depuis le sous-domaine
  // media.valorant-api.com) et Supabase (comptes/social, https + websocket
  // pour le temps réel).
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      // https: en plus de valorant-api.com : les annonces admin (écran
      // d'accueil) référencent une image par URL externe collée à la main
      // (Discord CDN, Imgur...), pas d'upload intégré — voir AdminPage.jsx.
      "img-src 'self' data: https:",
      // Les vidéos de skins (SkinDetailModal.jsx, `skin.video` = le champ
      // streamedVideo de valorant-api.com) n'ont jamais eu de directive ici
      // — sans media-src, elles retombent sur default-src 'self' et sont
      // bloquées en build packagé (jamais remarqué avant, la CSP ne
      // s'applique pas en dev). Même largeur que img-src ci-dessus.
      "media-src 'self' https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.henrikdev.xyz https://valorant-api.com https://*.valorant-api.com https://hbfqtrqztyrnsqrrvmep.supabase.co wss://hbfqtrqztyrnsqrrvmep.supabase.co",
      // Lecteurs intégrés en iframe (YouTube/Streamable) pour Lineups
      // (TechLibrary.jsx) et Clips (ClipsFeed.jsx) — voir VideoPlayer.jsx et
      // clipEmbed.js, partagés par les deux. Pas medal.tv : leurs pages
      // refusent l'intégration en iframe hors leur propre site
      // (x-frame-options: SAMEORIGIN, vérifié) — ouvert dans le navigateur
      // système/lu via <video> à la place, jamais en iframe.
      "frame-src 'self' https://www.youtube-nocookie.com https://streamable.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
    });
  }

  // YouTube refuse ses lecteurs intégrés (erreur 153, "configuration du
  // lecteur vidéo") quand la requête n'a pas de Referer. L'app packagée est
  // chargée depuis file://, dont Chromium n'envoie aucun Referer — l'écran des
  // clips/lineups YouTube restait noir. En dev (http://localhost) le Referer
  // existe, d'où un bug qu'on ne voyait pas en `npm start`. Vérifié dans un
  // vrai Electron : sans en-tête → erreur 153, avec → lecture normale.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] },
    (details, callback) => {
      callback({ requestHeaders: { ...details.requestHeaders, Referer: 'https://mvptracker.fr/' } });
    },
  );

  // Empêche toute fenêtre de l'app de naviguer ailleurs que vers son propre
  // contenu — les liens externes (Discord, mailto...) passent déjà par
  // shell.openExternal, jamais par une navigation dans la fenêtre. Défense
  // en profondeur si du contenu inattendu tentait de rediriger la fenêtre.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (navEvent, url) => {
      const isAppUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL
        ? url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)
        : url.startsWith('file://');
      if (!isAppUrl) navEvent.preventDefault();
    });
  });

  if (app.isPackaged && !store.get('autoLaunchInitialized')) {
    app.setLoginItemSettings({ openAtLogin: true });
    store.set('autoLaunchInitialized', true);
  }

  createWindow();
  createTray();

  // Sert de base au calcul PostHog des utilisateurs actifs (DAU/WAU/MAU) —
  // distinctId pas encore connu ici (compte pas forcément lié à ce stade),
  // PostHog regroupe quand même par distinctId 'unknown' pour ces lancements.
  captureEvent(currentPuuid(), 'app_launched', { app_version: app.getVersion(), platform: process.platform });

  // Premier lancement déclenché directement par le lien (l'app n'était pas
  // encore ouverte) — le lien arrive dans les arguments de démarrage.
  const startupDeepLink = process.argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`));
  if (startupDeepLink) {
    mainWindow.webContents.once('did-finish-load', () => handleDeepLink(startupDeepLink));
  }

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// macOS lance ce lien via 'open-url' plutôt que les arguments de démarrage.
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Vide la file d'événements PostHog avant fermeture — sans ça, les derniers
// events d'une session (ex. le crash qui vient de la faire quitter) peuvent
// se perdre s'ils n'ont pas encore été envoyés.
app.on('will-quit', () => {
  shutdownTelemetry();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
