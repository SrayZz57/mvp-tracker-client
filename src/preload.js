// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  resolveClipMetadata: (url) => ipcRenderer.invoke('clips:resolve-clip-metadata', url),
  onRecoveryDeepLink: (callback) => {
    const listener = (_event, tokens) => callback(tokens);
    ipcRenderer.on('deep-link:recovery', listener);
    return () => ipcRenderer.removeListener('deep-link:recovery', listener);
  },
  onOAuthDeepLink: (callback) => {
    const listener = (_event, tokens) => callback(tokens);
    ipcRenderer.on('deep-link:oauth', listener);
    return () => ipcRenderer.removeListener('deep-link:oauth', listener);
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  getLanguage: () => ipcRenderer.invoke('language:get'),
  saveLanguage: (language) => ipcRenderer.invoke('language:set', language),
  setLinkedPuuid: (puuid) => ipcRenderer.invoke('account:set-linked-puuid', puuid),
  cacheMessagingKey: (payload) => ipcRenderer.invoke('messaging:cache-key', payload),
  getCachedMessagingKey: (userId) => ipcRenderer.invoke('messaging:get-cached-key', userId),
  clearCachedMessagingKey: (userId) => ipcRenderer.invoke('messaging:clear-cached-key', userId),
  getMatches: (settings) => ipcRenderer.invoke('valorant:get-matches', settings),
  getMmrHistory: (options) => ipcRenderer.invoke('valorant:get-mmr-history', options),
  previewRiotAccount: (payload) => ipcRenderer.invoke('valorant:preview-account', payload),
  previewRecentStats: (payload) => ipcRenderer.invoke('valorant:preview-recent-stats', payload),
  getCachedMatches: () => ipcRenderer.invoke('valorant:get-cached-matches'),
  getCachedMatchesFor: (puuid) => ipcRenderer.invoke('valorant:get-cached-matches-for', puuid),
  getHallOfFameRecords: (puuid) => ipcRenderer.invoke('hall-of-fame:get-records', puuid),
  getRankFor: (puuid) => ipcRenderer.invoke('valorant:get-rank-for', puuid),
  getNetworkStatus: () => ipcRenderer.invoke('network:get-status'),
  getPingSamples: (puuid) => ipcRenderer.invoke('network:get-ping-samples', puuid),
  syncMatches: (payload) => ipcRenderer.invoke('sync:matches', payload),
  // Stats de la session du jour (victoires/défaites, HS%, K/D), calculées par
  // main.js et publiées vers le téléphone — la fenêtre d'overlay correspondante
  // a été remplacée par l'overlay des rangs de la partie.
  getTiltNotificationsEnabled: () => ipcRenderer.invoke('tilt-notifications:get-enabled'),
  setTiltNotificationsEnabled: (enabled) => ipcRenderer.invoke('tilt-notifications:set-enabled', enabled),
  getDailyOverlayEnabled: () => ipcRenderer.invoke('daily-overlay:get-enabled'),
  setDailyOverlayEnabled: (enabled) => ipcRenderer.invoke('daily-overlay:set-enabled', enabled),
  onDailyOverlayStats: (callback) => {
    const listener = (_event, stats) => callback(stats);
    ipcRenderer.on('daily-overlay:stats', listener);
    return () => ipcRenderer.removeListener('daily-overlay:stats', listener);
  },
  onMobilePushEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('mobile-push:event', listener);
    return () => ipcRenderer.removeListener('mobile-push:event', listener);
  },
  sendMobilePush: (payload) => ipcRenderer.invoke('mobile-push:send', payload),
  getDailyOverlayExcludedModes: () => ipcRenderer.invoke('daily-overlay:get-excluded-modes'),
  setDailyOverlayExcludedModes: (modeIds) => ipcRenderer.invoke('daily-overlay:set-excluded-modes', modeIds),
  // Un raccourci par overlay : id 'ranks' ou 'buy' (voir OVERLAY_HOTKEYS dans main.js).
  getOverlayHotkey: (id) => ipcRenderer.invoke('overlay-hotkey:get', id),
  setOverlayHotkey: (id, accelerator) => ipcRenderer.invoke('overlay-hotkey:set', id, accelerator),
  // Overlay des rangs de la partie (opt-in, API locale du client Riot — voir main.js).
  getMatchRanksOverlayEnabled: () => ipcRenderer.invoke('match-ranks-overlay:get-enabled'),
  setMatchRanksOverlayEnabled: (enabled) => ipcRenderer.invoke('match-ranks-overlay:set-enabled', enabled),
  getMatchRanksOverlayData: () => ipcRenderer.invoke('match-ranks-overlay:get-data'),
  onMatchRanksOverlayData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('match-ranks-overlay:data', listener);
    return () => ipcRenderer.removeListener('match-ranks-overlay:data', listener);
  },
  // Overlay d'achat du premier round (opt-in, API locale du client Riot — voir main.js).
  getBuyOverlayEnabled: () => ipcRenderer.invoke('buy-overlay:get-enabled'),
  setBuyOverlayEnabled: (enabled) => ipcRenderer.invoke('buy-overlay:set-enabled', enabled),
  getBuyOverlayData: () => ipcRenderer.invoke('buy-overlay:get-data'),
  onBuyOverlayData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('buy-overlay:data', listener);
    return () => ipcRenderer.removeListener('buy-overlay:data', listener);
  },
  getDeviceId: () => ipcRenderer.invoke('network:get-device-id'),
  openAimTrainer: (config) => ipcRenderer.invoke('aim-trainer:open', config),
  closeAimTrainer: () => ipcRenderer.invoke('aim-trainer:close'),
  openMainTab: (tab) => ipcRenderer.invoke('aim-trainer:open-tab', tab),
  onOpenTab: (callback) => {
    const handler = (_event, tab) => callback(tab);
    ipcRenderer.on('app:open-tab', handler);
    return () => ipcRenderer.removeListener('app:open-tab', handler);
  },
  onAimTrainerClosed: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('aim-trainer:closed', handler);
    return () => ipcRenderer.removeListener('aim-trainer:closed', handler);
  },
  listCrosshairs: () => ipcRenderer.invoke('crosshair:list'),
  saveCrosshair: (name, code, color, image) =>
    ipcRenderer.invoke('crosshair:save', { name, code, color, image }),
  deleteCrosshair: (id) => ipcRenderer.invoke('crosshair:delete', id),
  listStrategies: (map) => ipcRenderer.invoke('strategy:list', map),
  saveStrategy: (name, map, canvasJson) =>
    ipcRenderer.invoke('strategy:save', { name, map, canvasJson }),
  deleteStrategy: (id) => ipcRenderer.invoke('strategy:delete', id),
  getActivePlaySession: () => ipcRenderer.invoke('play-session:get-active'),
  startPlaySession: () => ipcRenderer.invoke('play-session:start'),
  endPlaySession: (id) => ipcRenderer.invoke('play-session:end', id),
  getPlaySessionHistory: (limit) => ipcRenderer.invoke('play-session:history', limit),
  getRankSnapshots: () => ipcRenderer.invoke('evolution:rank-snapshots'),
  getActiveGuidedSession: () => ipcRenderer.invoke('guided-session:get-active'),
  startGuidedSession: (planJson) => ipcRenderer.invoke('guided-session:start', planJson),
  endGuidedSession: (id, resultJson) => ipcRenderer.invoke('guided-session:end', { id, resultJson }),
  getGuidedSessionHistory: (limit) => ipcRenderer.invoke('guided-session:history', limit),
  getMatchAssessment: (matchId) => ipcRenderer.invoke('assessment:get', matchId),
  saveMatchAssessment: (matchId, date, map, answersJson) =>
    ipcRenderer.invoke('assessment:save', { matchId, date, map, answersJson }),
  getMatchAssessmentHistory: (limit) => ipcRenderer.invoke('assessment:history', limit),
  getWeeklyNarrative: (weekStart) => ipcRenderer.invoke('narrative:get', weekStart),
  getPreviousWeeklyNarrative: (weekStart) => ipcRenderer.invoke('narrative:get-previous', weekStart),
  saveWeeklyNarrative: (weekStart, recapJson, rankJson, narrativeJson) =>
    ipcRenderer.invoke('narrative:save', { weekStart, recapJson, rankJson, narrativeJson }),
  getWeeklyNarrativeHistory: (limit) => ipcRenderer.invoke('narrative:history', limit),
  getCollapsedBlocks: () => ipcRenderer.invoke('ui:get-collapsed-blocks'),
  toggleCollapsedBlock: (blockId) => ipcRenderer.invoke('ui:toggle-collapsed-block', blockId),
  getSkinsWishlist: () => ipcRenderer.invoke('skins:get-wishlist'),
  toggleSkinWishlist: (uuid) => ipcRenderer.invoke('skins:toggle-wishlist', uuid),
  getSkinsCollection: () => ipcRenderer.invoke('skins:get-collection'),
  toggleSkinCollection: (uuid, defaultPriceVp) =>
    ipcRenderer.invoke('skins:toggle-collection', { uuid, defaultPriceVp }),
  setSkinCollectionPrice: (uuid, priceVp) =>
    ipcRenderer.invoke('skins:set-collection-price', { uuid, priceVp }),
  getGoals: () => ipcRenderer.invoke('goals:get'),
  addGoal: (goal) => ipcRenderer.invoke('goals:add', goal),
  toggleGoalDone: (id) => ipcRenderer.invoke('goals:toggle-done', id),
  deleteGoal: (id) => ipcRenderer.invoke('goals:delete', id),
  captureEvent: (distinctId, event, properties) =>
    ipcRenderer.invoke('telemetry:capture-event', { distinctId, event, properties }),
  captureException: (distinctId, error, context) =>
    ipcRenderer.invoke('telemetry:capture-exception', {
      distinctId,
      message: error?.message ?? String(error),
      stack: error?.stack,
      context,
    }),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window:maximized-change', listener);
    return () => ipcRenderer.removeListener('window:maximized-change', listener);
  },
  onWindowFocusChange: (callback) => {
    const listener = (_event, focused) => callback(focused);
    ipcRenderer.on('window:focus-change', listener);
    return () => ipcRenderer.removeListener('window:focus-change', listener);
  },
  onMatchActiveChange: (callback) => {
    const listener = (_event, active) => callback(active);
    ipcRenderer.on('window:match-active-change', listener);
    return () => ipcRenderer.removeListener('window:match-active-change', listener);
  },
  getUpdateStatus: () => ipcRenderer.invoke('app-update:get-status'),
  checkForUpdate: () => ipcRenderer.invoke('app-update:check'),
  installUpdate: () => ipcRenderer.invoke('app-update:install'),
  getAutoLaunch: () => ipcRenderer.invoke('app-startup:get'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('app-startup:set', enabled),
  onUpdateReady: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('app-update:ready', listener);
    return () => ipcRenderer.removeListener('app-update:ready', listener);
  },
});
