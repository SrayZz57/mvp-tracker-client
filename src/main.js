import { app, BrowserWindow, ipcMain, shell, Menu, Notification, session, safeStorage, screen, autoUpdater, Tray } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';
import { getAccount, getMatches, getMmr, henrikDedupCount } from './services/henrikdev.js';
import { excludeDeathmatch, formStats, tiltStatus, patchSelfIdentity } from './renderer/stats/valorantStats.js';
import {
  saveMatches,
  getCachedMatches,
  getCachedMatchIds,
  getLatestCachedMatchId,
  savePingSample,
  getAllPingSamples,
  backfillLegacyPuuid,
} from './services/db.js';
import { isValorantRunning, pingOnce } from './services/network.js';
import { getAgentSelect } from './services/valorantLocal.js';
import { syncMatches } from './services/matchSync.js';
import { updateElectronApp } from 'update-electron-app';
import { captureEvent, captureException, shutdown as shutdownTelemetry } from './services/telemetry.js';
import { initApiCache, remember, write, forget, ageOf, cacheStats } from './services/apiCache.js';
import { debug } from './logger.js';
import { register as registerLibraryIpc } from './ipc/library.js';
import { register as registerPreferencesIpc } from './ipc/preferences.js';
import { register as registerJournalIpc } from './ipc/journal.js';

app.commandLine.appendSwitch('disable-http-cache');

if (!app.isPackaged) app.setAppUserModelId('fr.mvptracker.dev');

const store = new Store();

initApiCache(store);

const ACCOUNT_TTL_MS = 6 * 60 * 60 * 1000;
const RANK_TTL_MS = 10 * 60 * 1000;
const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

const SYNC_COOLDOWN_MS = 60 * 1000;

const accountKey = (name, tag) => `account:${String(name).toLowerCase()}#${String(tag).toLowerCase()}`;
const mmrKey = (puuid) => `mmr:${puuid}`;
const previewKey = (name, tag) => `preview:${String(name).toLowerCase()}#${String(tag).toLowerCase()}`;
const syncKey = (puuid) => `sync:${puuid}`;

function platformCandidates(account) {
  const platforms = (account?.platforms ?? []).map((p) => String(p).toLowerCase());
  const hasPc = platforms.includes('pc');
  const hasConsole = platforms.includes('console');
  if (hasPc && hasConsole) return ['pc', 'console'];
  if (hasConsole) return ['console'];
  return ['pc'];
}

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

async function getMatchesWithFallback(account, name, tag, apiKey, options) {
  let lastErr;
  for (const platform of platformCandidates(account)) {
    try {
      return await getMatches(account.region, platform, name, tag, apiKey, options);
    } catch (err) {
      lastErr = err;
      if (err.status === 429) break;
    }
  }
  throw lastErr;
}

async function getAccountCached(name, tag, apiKey, { force = false } = {}) {
  const key = accountKey(name, tag);
  if (force) forget(key);
  return remember(key, ACCOUNT_TTL_MS, () => getAccount(name, tag, apiKey));
}

async function getMmrCached(account, name, tag, apiKey, { force = false } = {}) {
  const key = mmrKey(account.puuid);
  if (force) forget(key);
  return remember(key, RANK_TTL_MS, () => getMmrWithFallback(account, name, tag, apiKey));
}

async function refreshRank(account, name, tag, apiKey, { force = false } = {}) {
  try {
    const mmr = await getMmrCached(account, name, tag, apiKey, { force });
    store.set(`valorantRank:${account.puuid}`, {
      accountLevel: account.account_level,
      cardUuid: account.card,
      tierId: mmr.current.tier.id,
      tierName: mmr.current.tier.name,
      rr: mmr.current.rr,
      peakTierId: mmr.peak.tier.id,
      peakTierName: mmr.peak.tier.name,
      peakSeasonUuid: mmr.peak.season.id,
    });
    return true;
  } catch {
    return false;
  }
}

function currentPuuid() {
  return store.get('linkedAccountPuuid') ?? null;
}

backfillLegacyPuuid(store.get('valorantSettings')?.puuid ?? null);

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

if (started) {
  app.quit();
  app.exit(0);
}

process.on('uncaughtException', (err) => {
  captureException(currentPuuid(), err);
});
process.on('unhandledRejection', (reason) => {
  captureException(currentPuuid(), reason instanceof Error ? reason : new Error(String(reason)));
});

updateElectronApp({ repo: 'SrayZz57/mvp-tracker-client', notifyUser: false });

let pendingUpdate = null;

autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
  pendingUpdate = { releaseName };
  mainWindow?.webContents.send('app-update:ready', pendingUpdate);
});

ipcMain.handle('app-update:get-status', () => pendingUpdate);
ipcMain.handle('app-update:install', () => autoUpdater.quitAndInstall());

let installingUpdate = false;
app.on('before-quit', (event) => {
  if (pendingUpdate && !installingUpdate) {
    event.preventDefault();
    installingUpdate = true;
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle('app-startup:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('app-startup:set', (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
});

function cleanupOldSquirrelVersions() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
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
          else debug('[squirrel-cleanup] ancienne version supprimée :', entry.name);
        });
      });
  } catch (err) {
    console.warn('[squirrel-cleanup] échec du nettoyage :', err.message);
  }
}

Menu.setApplicationMenu(null);

const DEEP_LINK_SCHEME = 'mvptracker';

let mainWindow = null;
let tray = null;
let isQuitting = false;

const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'favicon.ico')
  : path.join(__dirname, '..', '..', 'src', 'assets', 'favicon.ico');

function createTray() {
  if (tray) return;
  tray = new Tray(appIconPath);
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

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

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
  if (params.get('type') !== 'recovery') return;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return;
  mainWindow?.webContents.send('deep-link:recovery', { accessToken, refreshToken });
}

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
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    icon: appIconPath,
    frame: false,
    backgroundColor: '#0a0c11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-change', false));

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('console-message', (_e, _level, message) => {
    debug('[renderer]', message);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

const ALLOWED_PERMISSIONS = new Set(['pointerLock', 'notifications', 'clipboard-sanitized-write']);

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:']);

ipcMain.handle('shell:open-external', (_event, url) => {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return;
  }
  if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) return;
  return shell.openExternal(parsed.href);
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('telemetry:capture-event', (_event, { distinctId, event, properties }) => {
  captureEvent(distinctId, event, properties);
});

ipcMain.handle('telemetry:capture-exception', (_event, { distinctId, message, stack, context }) => {
  const err = new Error(message);
  if (stack) err.stack = stack;
  captureException(distinctId, err, context);
});

let aimTrainerWindow = null;

ipcMain.handle('aim-trainer:open', (_event, config) => {
  if (aimTrainerWindow && !aimTrainerWindow.isDestroyed()) {
    aimTrainerWindow.focus();
    return;
  }

  aimTrainerWindow = new BrowserWindow({
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#0a0c10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  aimTrainerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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
  });

  aimTrainerWindow.webContents.on('console-message', (_e, _level, message) => {
    debug('[aim-trainer]', message);
  });

  aimTrainerWindow.on('closed', () => {
    aimTrainerWindow = null;
    mainWindow?.webContents.send('aim-trainer:closed');
  });
});

ipcMain.handle('aim-trainer:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

const API_KEY_ENC_PREFIX = 'enc:v1:';

function encryptApiKey(key) {
  if (!key || !safeStorage.isEncryptionAvailable()) return key || '';
  return API_KEY_ENC_PREFIX + safeStorage.encryptString(key).toString('base64');
}

function decryptApiKey(stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith(API_KEY_ENC_PREFIX)) return stored || '';
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(API_KEY_ENC_PREFIX.length), 'base64'));
  } catch {
    return '';
  }
}

function getValorantSettings() {
  const s = store.get('valorantSettings');
  if (!s) return null;
  return { ...s, apiKey: decryptApiKey(s.apiKey) };
}

function setValorantSettings(settings) {
  if (!settings) {
    store.set('valorantSettings', settings);
    return;
  }
  store.set('valorantSettings', { ...settings, apiKey: encryptApiKey(settings.apiKey) });
}

ipcMain.handle('settings:get', () => getValorantSettings());

ipcMain.handle('settings:set', (_event, settings) => {
  setValorantSettings(settings);
});

ipcMain.handle('network:get-device-id', () => {
  let id = store.get('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    store.set('deviceId', id);
  }
  return id;
});

ipcMain.handle('language:get', () => store.get('appLanguage') || 'fr');

ipcMain.handle('language:set', (_event, language) => {
  store.set('appLanguage', language);
});

ipcMain.handle('account:set-linked-puuid', (_event, puuid) => {
  if (puuid) {
    store.set('linkedAccountPuuid', puuid);
  } else {
    store.delete('linkedAccountPuuid');
  }
});

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
    return null;
  }
});

ipcMain.handle('messaging:clear-cached-key', (_event, userId) => {
  store.delete(`messagingKeyCache.${userId}`);
});

ipcMain.handle('valorant:preview-account', async (_event, { name, tag, apiKey }) => {
  return remember(previewKey(name, tag), PREVIEW_CACHE_TTL_MS, async () => {
    const account = await getAccountCached(name, tag, apiKey);
    let rank = null;
    try {
      const mmr = await getMmrCached(account, name, tag, apiKey);
      rank = { tierId: mmr.current.tier.id, tierName: mmr.current.tier.name, rr: mmr.current.rr };
    } catch {}
    return {
      name,
      tag,
      puuid: account.puuid,
      region: account.region,
      platforms: account.platforms,
      accountLevel: account.account_level,
      cardUuid: account.card,
      rank,
    };
  });
});

const matchSyncInFlight = new Map();

async function syncAndReadMatches({ name, tag, apiKey, force = false }) {
  const account = await getAccountCached(name, tag, apiKey);
  setValorantSettings({ name, tag, apiKey, puuid: account.puuid });

  const readResult = () => ({
    matches: patchSelfIdentity(getCachedMatches(account.puuid), account.puuid, name, tag),
    rank: store.get(`valorantRank:${account.puuid}`) || null,
  });

  if (!force && ageOf(syncKey(account.puuid)) < SYNC_COOLDOWN_MS) {
    debug(`[henrikdev] synchro ignorée (moins de ${SYNC_COOLDOWN_MS / 1000}s depuis la précédente) → cache local`);
    return readResult();
  }

  const rankWasForced = force;
  await refreshRank(account, name, tag, apiKey, { force: rankWasForced });

  const HISTORY_CAP = 40;
  const PAGE_SIZE = 10;

  const cachedIds = new Set(getCachedMatchIds(account.puuid));

  let rateLimited = false;
  let newMatches = 0;
  for (const candidate of platformCandidates(account)) {
    if (rateLimited) break;
    for (let start = 0; start < HISTORY_CAP; start += PAGE_SIZE) {
      try {
        const page = await getMatches(account.region, candidate, name, tag, apiKey, { size: PAGE_SIZE, start });
        const fresh = page.filter((m) => !cachedIds.has(m.metadata?.matchid));
        debug(`[henrikdev] page ${candidate}/start=${start} → ${page.length} match(s), dont ${fresh.length} nouveau(x)`);
        if (page.length > 0) saveMatches(account.puuid, page);
        fresh.forEach((m) => cachedIds.add(m.metadata?.matchid));
        newMatches += fresh.length;
        if (page.length > 0 && fresh.length === 0) break;
        if (page.length < PAGE_SIZE) break;
      } catch (err) {
        if (err.status === 429) {
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

  if (newMatches > 0 && !rankWasForced) {
    await refreshRank(account, name, tag, apiKey, { force: true });
  }

  if (!rateLimited) write(syncKey(account.puuid), Date.now());

  const stats = cacheStats();
  debug(
    `[henrikdev] synchro terminée · ${newMatches} nouveau(x) match(s) · requêtes évitées depuis le lancement : ${stats.saved + henrikDedupCount()}`,
  );

  return readResult();
}

ipcMain.handle('valorant:get-matches', async (_event, { name, tag, apiKey, force = false }) => {
  const key = `${String(name).toLowerCase()}#${String(tag).toLowerCase()}`;
  const pending = matchSyncInFlight.get(key);
  if (pending && (!force || pending.force)) return pending.promise;

  const run = () => syncAndReadMatches({ name, tag, apiKey, force });
  const promise = (pending ? pending.promise.then(run, run) : run()).finally(() => {
    if (matchSyncInFlight.get(key)?.promise === promise) matchSyncInFlight.delete(key);
  });
  matchSyncInFlight.set(key, { promise, force });
  return promise;
});

ipcMain.handle('valorant:get-rank-for', (_event, puuid) => {
  if (!puuid) return null;
  return store.get(`valorantRank:${puuid}`) || null;
});

ipcMain.handle('valorant:get-cached-matches', () => {
  const settings = getValorantSettings();
  if (!settings?.puuid) return [];
  return patchSelfIdentity(getCachedMatches(settings.puuid), settings.puuid, settings.name, settings.tag);
});

ipcMain.handle('valorant:get-cached-matches-for', (_event, puuid) => {
  if (!puuid) return [];
  const settings = store.get('valorantSettings');
  if (settings?.puuid === puuid) {
    return patchSelfIdentity(getCachedMatches(puuid), puuid, settings.name, settings.tag);
  }
  return getCachedMatches(puuid);
});

let networkStatus = { valorantRunning: false, latestPing: null };

setInterval(async () => {
  const valorantRunning = isValorantRunning();
  const latestPing = valorantRunning ? await pingOnce() : null;
  networkStatus = { valorantRunning, latestPing };
  if (valorantRunning && latestPing !== null && currentPuuid()) {
    savePingSample(currentPuuid(), latestPing);
  }
}, 5000);

ipcMain.handle('network:get-status', () => networkStatus);

const tiltPollState = { lastMatchId: null, notified: false };

function notifyTilt(tilt, form) {
  if (!Notification.isSupported()) return;
  const body = tilt.lossStreakTilt
    ? `Série de ${form.streakCount} défaites d'affilée. Une pause pourrait aider.`
    : `Ta perf a baissé sur tes 3 derniers matchs. Une pause pourrait aider.`;
  const notification = new Notification({
    title: 'MVP Tracker · signe de tilt détecté',
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

async function checkTiltAndNotify() {
  const settings = getValorantSettings();
  if (!settings?.name || !settings?.tag || !settings?.apiKey) return false;
  try {
    const account = await getAccountCached(settings.name, settings.tag, settings.apiKey);

    if (tiltPollState.lastMatchId === null) {
      tiltPollState.lastMatchId = getLatestCachedMatchId(account.puuid);
    }

    const freshMatches = await getMatchesWithFallback(account, settings.name, settings.tag, settings.apiKey);
    saveMatches(account.puuid, freshMatches);

    const latestId = freshMatches[0]?.metadata?.matchid ?? null;
    if (!latestId || latestId === tiltPollState.lastMatchId) return false;
    tiltPollState.lastMatchId = latestId;

    forget(mmrKey(account.puuid));

    const played = excludeDeathmatch(getCachedMatches(account.puuid));
    const form = formStats(played, settings.name, settings.tag);
    const tilt = tiltStatus(played, settings.name, settings.tag, form);

    if (tilt.isTilted) {
      if (!tiltPollState.notified) {
        tiltPollState.notified = true;
        notifyTilt(tilt, form);
      }
    } else {
      tiltPollState.notified = false;
    }
    return true;
  } catch {
    return false;
  }
}

const LOCAL_STATE_POLL_MS = 30 * 1000;
const MATCH_END_FIRST_DELAY_MS = 60 * 1000;
const MATCH_END_RETRY_DELAY_MS = 150 * 1000;
const API_FALLBACK_POLL_MS = 15 * 60 * 1000;

const IN_MATCH_STATES = new Set(['pregame', 'coregame']);

let lastLocalState = null;
let lastFallbackCheck = 0;
let matchEndPending = false;

async function onMatchEnded() {
  if (matchEndPending) return;
  matchEndPending = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, MATCH_END_FIRST_DELAY_MS));
    if (await checkTiltAndNotify()) return;
    await new Promise((resolve) => setTimeout(resolve, MATCH_END_RETRY_DELAY_MS));
    await checkTiltAndNotify();
  } finally {
    matchEndPending = false;
  }
}

setInterval(async () => {
  if (!isValorantRunning()) {
    lastLocalState = null;
    return;
  }

  let state = 'unavailable';
  try {
    state = (await getAgentSelect()).state;
  } catch {}

  if (state !== 'unavailable') {
    const wasInMatch = IN_MATCH_STATES.has(lastLocalState);
    const isInMatch = IN_MATCH_STATES.has(state);
    lastLocalState = state;
    if (wasInMatch && !isInMatch) onMatchEnded();
    return;
  }

  if (Date.now() - lastFallbackCheck >= API_FALLBACK_POLL_MS) {
    lastFallbackCheck = Date.now();
    checkTiltAndNotify();
  }
}, LOCAL_STATE_POLL_MS);

ipcMain.handle('network:get-ping-samples', (_event, puuid) => {
  const target = puuid ?? currentPuuid();
  return target ? getAllPingSamples(target) : [];
});

ipcMain.handle('valorant-local:agent-select', () => getAgentSelect());

let agentSelectOverlayWindow = null;

let overlayTopmostInterval = null;

function createAgentSelectOverlay() {
  agentSelectOverlayWindow = new BrowserWindow({
    width: 300,
    height: 700,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  agentSelectOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  agentSelectOverlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const display = screen.getPrimaryDisplay().workArea;
  agentSelectOverlayWindow.setPosition(display.x + display.width - 316, display.y + 16);

  const query = 'view=agent-select-overlay';
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    agentSelectOverlayWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${query}`);
  } else {
    agentSelectOverlayWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
      search: query,
    });
  }

  agentSelectOverlayWindow.webContents.on('console-message', (_e, _level, message) => {
    debug('[agent-select-overlay]', message);
  });

  agentSelectOverlayWindow.showInactive();
  if (!overlayTopmostInterval) {
    overlayTopmostInterval = setInterval(() => {
      try {
        if (agentSelectOverlayWindow && !agentSelectOverlayWindow.isDestroyed()) {
          agentSelectOverlayWindow.moveTop();
        }
      } catch {
        clearInterval(overlayTopmostInterval);
        overlayTopmostInterval = null;
      }
    }, 1000);
  }
}

ipcMain.handle('agent-select-overlay:get-enabled', () => store.get('agentSelectOverlayEnabled') ?? true);

ipcMain.handle('agent-select-overlay:set-enabled', (_event, enabled) => {
  store.set('agentSelectOverlayEnabled', enabled);
  if (!enabled && agentSelectOverlayWindow && !agentSelectOverlayWindow.isDestroyed()) {
    clearInterval(overlayTopmostInterval);
    overlayTopmostInterval = null;
    agentSelectOverlayWindow.close();
    agentSelectOverlayWindow = null;
  }
});

ipcMain.handle('agent-select-overlay:set-visible', (_event, visible) => {
  if (visible) {
    const enabled = store.get('agentSelectOverlayEnabled') ?? true;
    if (enabled && (!agentSelectOverlayWindow || agentSelectOverlayWindow.isDestroyed())) {
      createAgentSelectOverlay();
    }
  } else {
    clearInterval(overlayTopmostInterval);
    overlayTopmostInterval = null;
    if (agentSelectOverlayWindow && !agentSelectOverlayWindow.isDestroyed()) {
      try {
        agentSelectOverlayWindow.close();
      } catch {}
    }
    agentSelectOverlayWindow = null;
  }
});

ipcMain.handle('agent-select-overlay:set-suggestions', (_event, suggestions) => {
  if (!agentSelectOverlayWindow || agentSelectOverlayWindow.isDestroyed()) return;
  agentSelectOverlayWindow.webContents.send('agent-select-overlay:suggestions', suggestions);
});

ipcMain.handle('sync:matches', (_event, payload) => syncMatches(payload));

registerLibraryIpc({ currentPuuid });
registerPreferencesIpc({ currentPuuid, store });
registerJournalIpc({ currentPuuid });





app.whenReady().then(() => {
  cleanupOldSquirrelVersions();

  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "media-src 'self' https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.henrikdev.xyz https://valorant-api.com https://*.valorant-api.com https://hbfqtrqztyrnsqrrvmep.supabase.co wss://hbfqtrqztyrnsqrrvmep.supabase.co",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(ALLOWED_PERMISSIONS.has(permission)),
    );

    session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
      ALLOWED_PERMISSIONS.has(permission),
    );

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
    });
  }

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

  captureEvent(currentPuuid(), 'app_launched', { app_version: app.getVersion(), platform: process.platform });

  const startupDeepLink = process.argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`));
  if (startupDeepLink) {
    mainWindow.webContents.once('did-finish-load', () => handleDeepLink(startupDeepLink));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  shutdownTelemetry();
});

