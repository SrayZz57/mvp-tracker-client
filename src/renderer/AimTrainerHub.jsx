// Écran d'accueil autonome de l'Aim Trainer — tourne dans la fenêtre plein
// écran dédiée (voir aim-trainer:open dans main.js), pas dans un onglet de la
// fenêtre principale. Rôle de ce fichier : uniquement l'habillage (menu,
// sélection de mode, stats, réglages, transitions, son d'ambiance) — la
// mécanique de jeu elle-même reste entièrement dans AimTrainerGame.jsx,
// inchangée, simplement montée ici au lieu d'être ouverte dans une nouvelle
// fenêtre séparée.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Crosshair,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Crown,
  Wrench,
  ListMusic,
  Flame,
  Volume2,
  VolumeX,
  ArrowLeft,
  ChevronRight,
  Lightbulb,
  Palette,
  UserRound,
  Check,
  Gauge,
  Trophy,
  Hammer,
  Map as MapIcon,
} from 'lucide-react';
import useBattlePass from './battlePass/useBattlePass.js';
import useShop from './shop/useShop.js';
import WelcomeBonusModal from './shop/WelcomeBonusModal.jsx';
import { utcDayKey } from './shop/dailyLogin.js';
import ModesScreen from './ModesScreen.jsx';
import HubLobby from './HubLobby.jsx';
import StatsScreen from './StatsScreen.jsx';
import SettingsScreen from './SettingsScreen.jsx';
import ControllerCalibration from './input/ControllerCalibration.jsx';
import LockerScreen from './LockerScreen.jsx';
import LeaderboardScreen from './LeaderboardScreen.jsx';
import { PlayerTitle } from './battlePass/playerCosmetics.jsx';
import { isHandLocked, isSkinLocked } from './battlePass/ownership.js';
import { DEFAULT_CONFIG, MODES, VALORANT_MODE_IDS, WEAPON_MODELS } from './aimTrainerModes.js';
import { PLAYABLE_MAP_IDS } from './playableMapIds.js';
import SensitivityFinder from './SensitivityFinder.jsx';
import { analyzeFinderResults } from './sensitivityFit.js';
import Icon from './Icon.jsx';
import mvpTrackerLogo from '../assets/logo-text.png';
import weaponDefaultPreview from '../assets/weapon-default-preview.png';
import weaponVandalPreview from '../assets/weapon-vandal-preview.png';
import weaponGlockPreview from '../assets/weapon-glock-preview.png';
import weaponVandalMagmaPreview from '../assets/weapon-vandal-magma-preview.png';
import weaponVandalCircuitPreview from '../assets/weapon-vandal-circuit-preview.png';
import weaponVandalCelestePreview from '../assets/weapon-vandal-celeste-preview.png';
import weaponVandalJadePreview from '../assets/weapon-vandal-jade-preview.png';
import weaponVandalClockworkPreview from '../assets/weapon-vandal-clockwork-preview.png';
import weaponSniperPreview from '../assets/weapon-sniper-preview.png';
import weaponVandalDunePreview from '../assets/weapon-vandal-dune-preview.png';
import weaponVandalCobaltPreview from '../assets/weapon-vandal-cobalt-preview.png';
import weaponVandalTidalPreview from '../assets/weapon-vandal-tidal-preview.png';
import weaponVandalRedlinePreview from '../assets/weapon-vandal-redline-preview.png';
import weaponGlockOlivePreview from '../assets/weapon-glock-olive-preview.png';
import weaponGlockIvoryPreview from '../assets/weapon-glock-ivory-preview.png';
import weaponGlockSunsetPreview from '../assets/weapon-glock-sunset-preview.png';
import weaponGlockVoltPreview from '../assets/weapon-glock-volt-preview.png';
import weaponSniperUrbanPreview from '../assets/weapon-sniper-urban-preview.png';
import weaponSniperForestPreview from '../assets/weapon-sniper-forest-preview.png';
import weaponSniperAmethystPreview from '../assets/weapon-sniper-amethyst-preview.png';
import weaponSniperCryoPreview from '../assets/weapon-sniper-cryo-preview.png';
import weaponVandalLithospherePreview from '../assets/weapon-vandal-lithosphere-preview.png';
import weaponVandalSymbiotePreview from '../assets/weapon-vandal-symbiote-preview.png';
import weaponVandalHeliopausePreview from '../assets/weapon-vandal-heliopause-preview.png';
import weaponVandalReliquaryPreview from '../assets/weapon-vandal-reliquary-preview.png';
import weaponVandalNullbytePreview from '../assets/weapon-vandal-nullbyte-preview.png';
import weaponVandalPatchbayPreview from '../assets/weapon-vandal-patchbay-preview.png';
import weaponVandalDownforcePreview from '../assets/weapon-vandal-downforce-preview.png';
import weaponVandalSingularityPreview from '../assets/weapon-vandal-singularity-preview.png';
import weaponGlockMetamorphPreview from '../assets/weapon-glock-metamorph-preview.png';
import weaponSniperRiftPreview from '../assets/weapon-sniper-rift-preview.png';
import weaponVandalOrigamiPreview from '../assets/weapon-vandal-origami-preview.png';
import weaponVandalHivePreview from '../assets/weapon-vandal-hive-preview.png';
import weaponVandalVoxelPreview from '../assets/weapon-vandal-voxel-preview.png';
import weaponVandalMaelstromPreview from '../assets/weapon-vandal-maelstrom-preview.png';
import weaponVandalSumiPreview from '../assets/weapon-vandal-sumi-preview.png';
import weaponGlockArcadePreview from '../assets/weapon-glock-arcade-preview.png';
import weaponGlockHanabiPreview from '../assets/weapon-glock-hanabi-preview.png';
import weaponGlockMiragePreview from '../assets/weapon-glock-mirage-preview.png';
import weaponGlockCandyPreview from '../assets/weapon-glock-candy-preview.png';
import weaponGlockKintsugiPreview from '../assets/weapon-glock-kintsugi-preview.png';
import weaponSniperLocomotivePreview from '../assets/weapon-sniper-locomotive-preview.png';
import weaponSniperKaleidoscopePreview from '../assets/weapon-sniper-kaleidoscope-preview.png';
import weaponSniperMarblePreview from '../assets/weapon-sniper-marble-preview.png';
import weaponSniperWeaverPreview from '../assets/weapon-sniper-weaver-preview.png';
import weaponSniperCorsairPreview from '../assets/weapon-sniper-corsair-preview.png';
import weaponVandalTitanPreview from '../assets/weapon-vandal-titan-preview.png';
import weaponVandalArcanePreview from '../assets/weapon-vandal-arcane-preview.png';
import weaponVandalMercuryPreview from '../assets/weapon-vandal-mercury-preview.png';
import weaponVandalSylvanPreview from '../assets/weapon-vandal-sylvan-preview.png';
import weaponVandalSpectrePreview from '../assets/weapon-vandal-spectre-preview.png';
import weaponSniperOrbitalPreview from '../assets/weapon-sniper-orbital-preview.png';
import weaponSniperOssuaryPreview from '../assets/weapon-sniper-ossuary-preview.png';
import weaponSniperStainedPreview from '../assets/weapon-sniper-stained-preview.png';
import weaponSniperAbyssalPreview from '../assets/weapon-sniper-abyssal-preview.png';
import weaponSniperSupernovaPreview from '../assets/weapon-sniper-supernova-preview.png';
import weaponGlockChronosPreview from '../assets/weapon-glock-chronos-preview.png';
import weaponGlockMonarchPreview from '../assets/weapon-glock-monarch-preview.png';
import weaponGlockScorpionPreview from '../assets/weapon-glock-scorpion-preview.png';
import weaponGlockQuantumPreview from '../assets/weapon-glock-quantum-preview.png';
import weaponGlockHarlequinPreview from '../assets/weapon-glock-harlequin-preview.png';
import weaponVandalAuroraPreview from '../assets/weapon-vandal-aurora-preview.png';
import weaponVandalSakuraPreview from '../assets/weapon-vandal-sakura-preview.png';
import weaponVandalRadiationPreview from '../assets/weapon-vandal-radiation-preview.png';
import weaponVandalPharaohPreview from '../assets/weapon-vandal-pharaoh-preview.png';
import weaponVandalHologramPreview from '../assets/weapon-vandal-hologram-preview.png';
import weaponGlockFuturisticPreview from '../assets/weapon-glock-futuristic-preview.png';
import weaponGlockBananaPreview from '../assets/weapon-glock-banana-preview.png';
import weaponGlockSynthwavePreview from '../assets/weapon-glock-synthwave-preview.png';
import weaponGlockKrakenPreview from '../assets/weapon-glock-kraken-preview.png';
import weaponGlockOniPreview from '../assets/weapon-glock-oni-preview.png';
import weaponGlockPrismPreview from '../assets/weapon-glock-prism-preview.png';
import weaponGlockXenoPreview from '../assets/weapon-glock-xeno-preview.png';
import weaponSniperGlacierPreview from '../assets/weapon-sniper-glacier-preview.png';
import weaponSniperVoidPreview from '../assets/weapon-sniper-void-preview.png';
import weaponSniperPhoenixPreview from '../assets/weapon-sniper-phoenix-preview.png';
import weaponSniperStormPreview from '../assets/weapon-sniper-storm-preview.png';
import weaponSniperCrownPreview from '../assets/weapon-sniper-crown-preview.png';

// Vignettes des cartes de sélection d'arme (Réglages → Modèle d'arme) —
// 'default' est géré séparément (toujours présent), le reste couvre les
// clés de WEAPON_MODELS au fur et à mesure qu'elles sont ajoutées.
const WEAPON_PREVIEWS = {
  vandal: weaponVandalPreview,
  glock: weaponGlockPreview,
  sniper: weaponSniperPreview,
};

const SKIN_PREVIEWS = {
  vandal: { standard: weaponVandalPreview, dune: weaponVandalDunePreview, cobalt: weaponVandalCobaltPreview, tidal: weaponVandalTidalPreview, redline: weaponVandalRedlinePreview, magma: weaponVandalMagmaPreview, circuit: weaponVandalCircuitPreview, celeste: weaponVandalCelestePreview, jade: weaponVandalJadePreview, clockwork: weaponVandalClockworkPreview, aurora: weaponVandalAuroraPreview, sakura: weaponVandalSakuraPreview, radiation: weaponVandalRadiationPreview, pharaoh: weaponVandalPharaohPreview, hologram: weaponVandalHologramPreview, titan: weaponVandalTitanPreview, arcane: weaponVandalArcanePreview, mercury: weaponVandalMercuryPreview, sylvan: weaponVandalSylvanPreview, spectre: weaponVandalSpectrePreview, lithosphere: weaponVandalLithospherePreview, symbiote: weaponVandalSymbiotePreview, heliopause: weaponVandalHeliopausePreview, reliquary: weaponVandalReliquaryPreview, nullbyte: weaponVandalNullbytePreview, patchbay: weaponVandalPatchbayPreview, downforce: weaponVandalDownforcePreview, singularity: weaponVandalSingularityPreview, origami: weaponVandalOrigamiPreview, hive: weaponVandalHivePreview, voxel: weaponVandalVoxelPreview, maelstrom: weaponVandalMaelstromPreview, sumi: weaponVandalSumiPreview },
  glock: {
    standard: weaponGlockPreview,
    olive: weaponGlockOlivePreview,
    ivory: weaponGlockIvoryPreview,
    sunset: weaponGlockSunsetPreview,
    volt: weaponGlockVoltPreview,
    futuristic: weaponGlockFuturisticPreview,
    banana: weaponGlockBananaPreview,
    synthwave: weaponGlockSynthwavePreview,
    kraken: weaponGlockKrakenPreview,
    oni: weaponGlockOniPreview,
    prism: weaponGlockPrismPreview,
    xeno: weaponGlockXenoPreview,
    chronos: weaponGlockChronosPreview,
    monarch: weaponGlockMonarchPreview,
    scorpion: weaponGlockScorpionPreview,
    quantum: weaponGlockQuantumPreview,
    harlequin: weaponGlockHarlequinPreview,
    metamorph: weaponGlockMetamorphPreview,
    arcade: weaponGlockArcadePreview,
    hanabi: weaponGlockHanabiPreview,
    mirage: weaponGlockMiragePreview,
    candy: weaponGlockCandyPreview,
    kintsugi: weaponGlockKintsugiPreview,
  },
  sniper: {
    standard: weaponSniperPreview,
    urban: weaponSniperUrbanPreview,
    forest: weaponSniperForestPreview,
    amethyst: weaponSniperAmethystPreview,
    cryo: weaponSniperCryoPreview,
    glacier: weaponSniperGlacierPreview,
    void: weaponSniperVoidPreview,
    phoenix: weaponSniperPhoenixPreview,
    storm: weaponSniperStormPreview,
    crown: weaponSniperCrownPreview,
    orbital: weaponSniperOrbitalPreview,
    ossuary: weaponSniperOssuaryPreview,
    stained: weaponSniperStainedPreview,
    abyssal: weaponSniperAbyssalPreview,
    supernova: weaponSniperSupernovaPreview,
    rift: weaponSniperRiftPreview,
    locomotive: weaponSniperLocomotivePreview,
    kaleidoscope: weaponSniperKaleidoscopePreview,
    marble: weaponSniperMarblePreview,
    weaver: weaponSniperWeaverPreview,
    corsair: weaponSniperCorsairPreview,
  },
};
import { useAgentsData } from './agentIcons.js';
import { useMapsData } from './mapImages.js';
import { usePlayerCardArt, useRankTiers } from './rankData.js';
import {
  loadPersonalBests,
  loadGlobalBests,
  loadHistory,
  loadDailyLeaderboard,
  loadFriendsLeaderboard,
  computeStreak,
  todayKey,
} from './aimScores.js';
import { buildDailyChallenge } from './aimChallenge.js';
import CustomModeConfig, { loadPresets, presetValues } from './CustomModeConfig.jsx';
import { arenaLaunchConfig, loadArenas } from './arenaEditor/arenaStore.js';
import { AIM_MODE, sanitizeControllerConfig } from './input/controllerProfiles.js';
import { useGamepadMenuNav } from './input/useGamepadMenuNav.js';
import PlaylistManager, { loadPlaylists } from './PlaylistManager.jsx';
import AimLeaderboardRow from './AimLeaderboardRow.jsx';
import { supabase } from './supabaseClient.js';
import {
  loadHubAudioPrefs,
  saveHubAudioPrefs,
  stopHubMusic,
  playHoverSfx,
  playClickSfx,
  playConfirmSfx,
  playBackSfx,
} from './aimHubAudio.js';

// Le moteur 3D (three.js, modèles, textures) n'est chargé qu'au lancement
// d'une session, puis préchargé en tâche de fond une fois le hub affiché :
// l'ouverture de l'Aim Trainer n'attend plus ce gros morceau de code.
const loadGame = () => import('./AimTrainerGame.jsx');
const AimTrainerGame = lazy(loadGame);
// Vestiaire 3D : charge three.js seulement à l'ouverture.
const SkinViewer = lazy(() => import('./SkinViewer.jsx'));
const BattlePassScreen = lazy(() => import('./battlePass/BattlePassScreen.jsx'));
const ShopScreen = lazy(() => import('./shop/ShopScreen.jsx'));
const DailyRewardScreen = lazy(() => import('./shop/DailyRewardScreen.jsx'));
// Éditeur d'arène : three.js et ses poignées, chargés à l'ouverture seulement.
const ArenaEditor = lazy(() => import('./arenaEditor/ArenaEditor.jsx'));
// Aperçu du site A d'Ascent (futur mode d'entrées sur site), même principe.
const MapExplorer = lazy(() => import('./MapExplorer.jsx'));

// Accueil « lobby » (HubLobby.jsx) ou accueil d'origine (plus bas dans ce
// fichier, conservé tel quel) : passer à false pour revenir à l'ancien.
const USE_LOBBY = true;

const SETTINGS_STORAGE_KEY = 'mvptracker-aim-trainer-settings';
const TIP_KEYS = ['hubTip1', 'hubTip2', 'hubTip3', 'hubTip4', 'hubTip5', 'hubTip6', 'hubTip7'];
const TARGET_COLORS = ['#ff4655', '#4ec9f5', '#3ddc84', '#ffc857', '#9b7bff', '#ffffff'];
const WARMUP_ROUTINE = ['flick', 'tracking', 'micro'];
const TRACKING_MODE_IDS = ['trackingBeginner', 'trackingIntermediate', 'tracking', 'trackingMulti'];
const PATROL_MODE_IDS = ['patrolSlow', 'patrol', 'patrolFast', 'patrolMulti'];
// Ordre des héros tirés au hasard (heroAgents), aligné sur les entrées du
// menu d'accueil — sert à savoir quel portrait afficher pour hoveredNav.
const NAV_KEYS = ['play', 'modes', 'battlepass', 'stats', 'settings', 'skin'];

function loadConfig() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const merged = raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
    // Relecture bornée (valeurs corrompues/hors bornes -> défauts) — mêmes
    // clés que celles écrites par set({ controller: ... }), voir
    // sanitizeControllerConfig. Aucun nouveau système de stockage : ce champ
    // vit dans le même objet `config` que le reste des réglages.
    merged.controller = sanitizeControllerConfig(merged.controller);
    // Migration depuis l'ancien réglage global (un seul skin équipé, tout
    // arme confondue) vers un skin par arme : si ce joueur avait déjà équipé
    // un skin avant cette version, on le retrouve sur la bonne arme plutôt
    // que de tout remettre à standard.
    if (raw) {
      const old = JSON.parse(raw);
      if (old.weaponModel && old.weaponSkin && old.weaponSkin !== 'standard' && !old.weaponSkins) {
        merged.weaponSkins = { ...DEFAULT_CONFIG.weaponSkins, [old.weaponModel]: old.weaponSkin };
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function cm360(dpi, sens) {
  if (!dpi || !sens) return null;
  return (2.54 * 360) / (dpi * sens * 0.07);
}

function ModeCard({ id, mode, active, personal, global, onSelect, onLaunch, t }) {
  const holdsRecord = personal !== undefined && global !== undefined && personal >= global;
  return (
    <button
      className={active ? 'aim-mode-card active' : 'aim-mode-card'}
      style={{ '--mode-accent': mode.accent }}
      onMouseEnter={playHoverSfx}
      onClick={() => {
        playClickSfx();
        onSelect(id);
      }}
      onDoubleClick={() => onLaunch(id)}
    >
      <span className="aim-mode-glow" aria-hidden="true" />
      <span className="aim-mode-head">
        <span className="aim-mode-icon"><Icon icon={mode.icon} /></span>
        {holdsRecord && <span className="aim-mode-crown" title={t('aimTrainer.holdsRecord')}><Icon icon={Crown} size={14} /></span>}
      </span>
      <span className="aim-mode-name">{t(mode.labelKey)}</span>
      <span className="aim-mode-desc">{t(mode.descKey)}</span>
      <span className="aim-mode-records">
        <span className="aim-mode-record">
          <span className="aim-mode-record-value">{personal ?? '—'}</span>
          <span className="aim-mode-record-label">{t('aimTrainer.yourBest')}</span>
        </span>
        <span className="aim-mode-record">
          <span className="aim-mode-record-value aim-mode-record-global">{global ?? '—'}</span>
          <span className="aim-mode-record-label">{t('aimTrainer.globalBest')}</span>
        </span>
      </span>
    </button>
  );
}

function ModeGroupPicker({ titleKey, descKey, modeIds, activeModeId, personalBests, globalBests, onSelect, onLaunch, onClose, t }) {
  return (
    <div className="custom-config-overlay" onClick={onClose}>
      <div className="custom-config-card tracking-picker-card" onClick={(e) => e.stopPropagation()}>
        <h2>{t(titleKey)}</h2>
        <p className="label">{t(descKey)}</p>
        <div className="aim-mode-grid">
          {modeIds.map((id) => (
            <ModeCard
              key={id}
              id={id}
              mode={MODES[id]}
              active={id === activeModeId}
              personal={personalBests[id]}
              global={globalBests[id]}
              onSelect={onSelect}
              onLaunch={onLaunch}
              t={t}
            />
          ))}
        </div>
        <div className="custom-config-actions">
          <button className="account-forgot-password" onClick={onClose}>
            {t('aimTrainer.customCancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Thème du MENU d'accueil (pas la salle d'entraînement) : soit un agent au
// hasard à chaque ouverture avec des couleurs qui varient (comportement par
// défaut), soit un agent fixe choisi une fois pour toutes — deux vues :
// 'choice' (le choix binaire) et 'pick' (la grille d'agents, seulement pour
// SVG minimal, même logique que ProgressionChart de l'ancien AimTrainer.jsx.
function ProgressionChart({ scores, accent }) {
  const width = 320;
  const height = 90;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = Math.max(max - min, 1);
  const points = scores.map((score, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = height - ((score - min) / range) * (height - 12) - 6;
    return { x, y };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="aim-progress-chart">
      <polygon points={area} fill={accent} opacity="0.14" />
      <polyline points={line} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5} fill={accent} />
      ))}
    </svg>
  );
}

// Petite puce d'identité en haut à droite — carte joueur + rang, format
// compact (pas le gros bandeau précédent) : inspiré du coin haut-droit d'un
// écran d'accueil de jeu (pseudo + monnaie/rang toujours visibles, jamais
// envahissants).
function HubProfileChip({ userId, avatarIcon, name, tag, currentTier, onClick, t }) {
  return (
    <button className="aim-hub-profile-chip" onClick={onClick}>
      <div className="aim-hub-profile-avatar">
        {avatarIcon ? <img src={avatarIcon} alt="" /> : <span>{(name || '?').charAt(0).toUpperCase()}</span>}
      </div>
      <div className="aim-hub-profile-info">
        <div className="aim-hub-profile-name">
          {name || t('aimTrainer.hubGuest')}
          {tag && <span className="profile-tag">#{tag}</span>}
        </div>
        <PlayerTitle userId={userId} />
        {currentTier ? (
          <div className="aim-hub-profile-rank">
            {currentTier.icon && <img src={currentTier.icon} alt="" />}
            <span>{currentTier.name}</span>
          </div>
        ) : (
          <div className="aim-hub-profile-rank label">{t('nav.rankUnavailable')}</div>
        )}
      </div>
    </button>
  );
}

// Ligne de navigation compacte (icône + intitulé + accroche) plutôt qu'une
// grosse carte — la variation vient du fond qui change de héros au survol
// (voir aim-hub-bg-portrait plus bas), pas de 4 blocs identiques répétés à
// l'écran : un seul point focal à la fois, comme un vrai menu de jeu
// (Overwatch, Apex...) où survoler une entrée prévisualise sa scène.
function NavListItem({ icon, label, hint, active, onHover, onClick, badge = 0 }) {
  return (
    <button
      className={active ? 'aim-hub-nav-item active' : 'aim-hub-nav-item'}
      onMouseEnter={() => {
        playHoverSfx();
        onHover();
      }}
      onFocus={onHover}
      onClick={() => {
        playClickSfx();
        onClick();
      }}
    >
      <span className="aim-hub-nav-item-bar" aria-hidden="true" />
      <span className="aim-hub-nav-item-icon"><Icon icon={icon} size={26} /></span>
      <span className="aim-hub-nav-item-text">
        <span className="aim-hub-nav-item-label">
          {label}
          {badge > 0 && <span className="aim-hub-nav-item-badge">{badge}</span>}
        </span>
        {hint && <span className="aim-hub-nav-item-hint">{hint}</span>}
      </span>
      <span className="aim-hub-nav-item-chevron" aria-hidden="true">
        <ChevronRight size={18} />
      </span>
    </button>
  );
}

// Carte "défi du jour" — même contenu que la version affichée dans l'écran
// Stats, mais posée dans le vide à droite de l'accueil : c'est ce genre de
// contenu vivant (une accroche qui change chaque jour, un mini classement)
// qui manquait pour que l'écran ne ressemble pas à une coquille vide.
function HomeChallengeCard({ challenge, dailyBoard, challengeDone, myId, apiKey, friendStatusByUser, onAddFriend, onPlay, t }) {
  return (
    <div className="aim-hub-side-card aim-hub-challenge-card">
      <span className="aim-hub-side-card-badge">{t('aimTrainer.dailyChallenge')}</span>
      <h3>
        <Icon icon={MODES[challenge.mode].icon} /> {t(MODES[challenge.mode].labelKey)}
      </h3>
      <p className="aim-hub-side-card-desc">
        {t('aimTrainer.challengeSetup', {
          seconds: challenge.duration,
          size: challenge.targetSize.toFixed(2),
          count: challenge.targetCount,
        })}
      </p>
      <button className="aim-hub-side-card-cta" onClick={onPlay}>
        {challengeDone ? t('aimTrainer.retryChallenge') : t('aimTrainer.playChallenge')}
      </button>
      {dailyBoard.length > 0 && (
        <div className="aim-board">
          {dailyBoard.slice(0, 5).map((row, i) => (
            <AimLeaderboardRow
              key={row.user_id}
              row={row}
              rank={i + 1}
              myId={myId}
              apiKey={apiKey}
              friendStatus={friendStatusByUser[row.user_id] ?? 'none'}
              onAddFriend={onAddFriend}
              highlight={row.user_id === myId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Bandeau de stats rapides — mêmes chiffres que dans HubProfileChip avant,
// mais assez grands pour occuper leur propre carte plutôt qu'une puce
// discrète dans la barre du haut.
function HomeStatsCard({ sessions, streak, records, onClick, t }) {
  return (
    <button className="aim-hub-side-card aim-hub-stats-card" onClick={onClick}>
      <div className="aim-hub-stats-card-item">
        <strong>{sessions}</strong>
        <span>{t('aimTrainer.hubStatSessions')}</span>
      </div>
      <div className="aim-hub-stats-card-item">
        <strong>{streak}</strong>
        <span>{t('aimTrainer.hubStatStreak')}</span>
      </div>
      <div className="aim-hub-stats-card-item">
        <strong>{records}</strong>
        <span>{t('aimTrainer.hubStatRecords')}</span>
      </div>
    </button>
  );
}

// Aperçu de progression — reprend la même courbe que l'écran Stats, posée
// dans le panneau latéral plutôt qu'isolée au milieu de l'écran : ça évite
// un second bloc flottant qui disparaissait dès que la fenêtre rétrécissait.
function HomeProgressCard({ modeLabel, accent, progression, t }) {
  return (
    <div className="aim-hub-side-card aim-hub-progress-card">
      <span className="aim-hub-side-card-badge">{t('aimTrainer.progressTitle', { mode: modeLabel })}</span>
      {progression.length < 2 ? (
        <p className="aim-hub-side-card-desc" style={{ marginTop: '0.6rem' }}>{t('aimTrainer.progressNotEnough')}</p>
      ) : (
        <>
          <ProgressionChart scores={progression} accent={accent} />
          <p className="aim-hub-side-card-desc">
            {t('aimTrainer.progressMeta.score', {
              count: progression.length,
              best: Math.max(...progression),
              last: progression[progression.length - 1],
            })}
          </p>
        </>
      )}
    </div>
  );
}

// Classement entre amis — dernière carte de la colonne, étirée (flex:1) pour
// que le panneau latéral aille bien jusqu'en bas plutôt que de s'arrêter en
// plein milieu de l'écran.
function HomeFriendsCard({ friendsBoard, myId, apiKey, friendStatusByUser, onAddFriend, t }) {
  return (
    <div className="aim-hub-side-card aim-hub-friends-card">
      <span className="aim-hub-side-card-badge">{t('aimTrainer.friendsTitle')}</span>
      {friendsBoard.length === 0 ? (
        <p className="aim-hub-side-card-desc" style={{ marginTop: '0.6rem' }}>{t('aimTrainer.friendsEmpty')}</p>
      ) : (
        <div className="aim-board">
          {friendsBoard.slice(0, 6).map((row, i) => (
            <AimLeaderboardRow
              key={row.user_id}
              row={row}
              rank={i + 1}
              myId={myId}
              apiKey={apiKey}
              friendStatus={friendStatusByUser[row.user_id] ?? 'none'}
              onAddFriend={onAddFriend}
              highlight={row.user_id === myId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Diaporama de maps Valorant en fond, très en arrière-plan (derrière la
// grille technique, le personnage et toute l'interface) — change de map
// toutes les 10s avec un fondu lent façon écran-titre cinématique. Assets
// publics valorant-api.com (splash art), même source que le reste de l'app.
// Les grandes images (fonds de maps de 2 à 3 Mo, portraits de ~700 Ko) étaient
// affichées dès les premiers octets reçus : un PNG se dessine de haut en bas au
// fur et à mesure du téléchargement, d'où l'image « qui se déroule ». Ici elle
// est d'abord téléchargée ET décodée hors écran, puis affichée d'un bloc avec
// un fondu. Le fichier reste dans le cache HTTP du navigateur (valable 14
// jours) : le <img> final n'a rien à retélécharger.
function DecodedImg({ src, className, priority = false, onReady }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const image = new Image();
    if (priority) image.fetchPriority = 'high';
    image.src = src;
    image
      .decode()
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        setReady(true);
        onReady?.();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, priority]);

  if (!ready) return null;
  return <img className={`${className} aim-hub-img-fresh`} src={src} alt="" decoding="async" />;
}

function MapSlideshow({ maps }) {
  const [index, setIndex] = useState(0);
  // La 1re map passe avant les autres : sinon les 13 fonds se partagent la
  // connexion et celui qu'on voit arrive en dernier.
  const [firstReady, setFirstReady] = useState(false);

  useEffect(() => {
    if (maps.length < 2) return undefined;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % maps.length);
    }, 10000);
    return () => clearInterval(id);
  }, [maps.length]);

  if (maps.length === 0) return null;

  return (
    <div className="aim-hub-map-slideshow" aria-hidden="true">
      {maps.map((map, i) =>
        i === 0 || firstReady ? (
          <DecodedImg
            key={map.uuid}
            className={i === index ? 'aim-hub-map-slide active' : 'aim-hub-map-slide'}
            src={map.splash}
            priority={i === 0}
            onReady={i === 0 ? () => setFirstReady(true) : undefined}
          />
        ) : null,
      )}
      <div className="aim-hub-map-slideshow-overlay" />
    </div>
  );
}

// Bandeau d'astuces qui tourne toutes les quelques secondes — comblait un
// grand vide sous la barre du haut ; contenu inventé pour l'occasion (aucune
// donnée à afficher là), mais utile (réglages Windows, routine, playlists...)
// plutôt que purement décoratif.
function TipBanner({ t }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % TIP_KEYS.length);
    }, 7000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="aim-hub-tip-banner">
      <span className="aim-hub-tip-icon"><Icon icon={Lightbulb} size={16} /></span>
      <span className="aim-hub-tip-label">{t('aimTrainer.hubTipLabel')}</span>
      <span key={index} className="aim-hub-tip-text">{t(`aimTrainer.${TIP_KEYS[index]}`)}</span>
    </div>
  );
}

function AimTrainerHub({ config: initialRawConfig }) {
  const { t, i18n } = useTranslation();
  const myId = initialRawConfig?.userId ?? null;
  const apiKey = initialRawConfig?.apiKey ?? null;
  const riotName = initialRawConfig?.name ?? null;
  const riotTag = initialRawConfig?.tag ?? null;
  const rankInfo = initialRawConfig?.rank ?? null;
  const bp = useBattlePass(myId);
  const shop = useShop(myId);
  // Fermer sans réclamer (croix) la fait réapparaître à la prochaine entrée
  // dans l'Aim Trainer : welcomeClaimed (serveur) ne change pas, seul ce flag
  // local empêche qu'elle reste ouverte pendant la session en cours.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const showWelcomeModal = shop.status === 'ready' && !shop.welcomeClaimed && !welcomeDismissed;
  const avatarCardUuid = initialRawConfig?.avatarCardUuid ?? null;
  const displayName = initialRawConfig?.displayName ?? riotName;

  // Habillage "vrai jeu" de l'écran d'accueil : carte joueur + rang (mêmes
  // visuels que le reste de MVP Tracker) et un héros différent par carte,
  // tiré au hasard parmi les rendus d'agent officiels (assets publics
  // valorant-api.com, déjà utilisés partout ailleurs dans l'app — icônes,
  // rangs, maps...).
  const agents = useAgentsData();
  const maps = useMapsData();
  const rankTiers = useRankTiers();
  const avatarArt = usePlayerCardArt(avatarCardUuid);
  const currentTier = rankInfo ? rankTiers.get(rankInfo.tierId) : null;
  const heroAgents = useMemo(() => {
    if (!agents.length) return [];
    const shuffled = [...agents].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, NAV_KEYS.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.length]);
  const [screen, setScreen] = useState('menu'); // menu | modes | stats | settings
  const [mapPreviewId, setMapPreviewId] = useState('ascentA'); // carte ouverte dans l'aperçu (voir playableMaps.js)
  // Quel héros (parmi heroAgents) sert de fond à l'accueil : change au survol
  // d'une entrée du menu plutôt que d'afficher les 4 en même temps — un seul
  // point focal à la fois, moins statique qu'une grille figée.
  const [hoveredNav, setHoveredNav] = useState('play');
  const activeHeroAgent = heroAgents[NAV_KEYS.indexOf(hoveredNav)] ?? null;
  // Portrait affiché d'abord, les 6 autres ensuite (voir DecodedImg).
  const [portraitReady, setPortraitReady] = useState(false);
  // La couleur d'accent suit l'agent AFFICHÉ (activeHeroAgent), pas un agent
  // fixe — sinon le fond change au survol mais le thème (bouton Jouer, barre
  // active du menu, badges...) reste figé sur la couleur du premier agent.
  const hubAccent = activeHeroAgent?.backgroundGradientColors?.[0]
    ? `#${activeHeroAgent.backgroundGradientColors[0].slice(0, 6)}`
    : null;
  const [playing, setPlaying] = useState(false);
  const [launchConfig, setLaunchConfig] = useState(null);
  const [exiting, setExiting] = useState(false);
  const [showSensitivityFinder, setShowSensitivityFinder] = useState(false);
  // Résultats accumulés étape par étape (voir onSessionComplete côté
  // AimTrainerGame) pendant une session Sensitivity Finder — vide sinon.
  const [finderResults, setFinderResults] = useState([]);

  const [config, setConfig] = useState(loadConfig);
  const [personalBests, setPersonalBests] = useState({});
  const [globalBests, setGlobalBests] = useState({});
  const [history, setHistory] = useState([]);
  const [dailyBoard, setDailyBoard] = useState([]);
  const [friendsBoard, setFriendsBoard] = useState([]);
  const [crosshairs, setCrosshairs] = useState([]);
  const [friendStatusByUser, setFriendStatusByUser] = useState({});
  const [showTrackingPicker, setShowTrackingPicker] = useState(false);
  const [showPatrolPicker, setShowPatrolPicker] = useState(false);
  const [showCustomConfig, setShowCustomConfig] = useState(false);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  const [modesCategory, setModesCategory] = useState(null); // null = les trois cartes
  const [showSkinPicker, setShowSkinPicker] = useState(false);
  // Conteneur pour la navigation au D-pad/stick gauche dans les menus (voir
  // useGamepadMenuNav) — jamais actif pendant une session (AimTrainerGame
  // gère alors la manette elle-même : viser, tirer, pause).
  const hubRootRef = useRef(null);

  const [audioPrefs, setAudioPrefs] = useState(loadHubAudioPrefs);

  const challenge = useMemo(() => buildDailyChallenge(todayKey()), []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const refresh = useCallback(() => {
    loadGlobalBests().then(setGlobalBests);
    loadDailyLeaderboard(challenge.dateKey).then(setDailyBoard);
    if (myId) {
      loadPersonalBests(myId).then(setPersonalBests);
      loadHistory(myId).then(setHistory);
    }
  }, [myId, challenge.dateKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.electronAPI.listCrosshairs().then(setCrosshairs);
  }, []);

  useEffect(() => {
    if (myId) loadFriendsLeaderboard(myId, config.mode).then(setFriendsBoard);
  }, [myId, config.mode, history]);

  const loadFriendStatuses = useCallback(async () => {
    if (!myId) return;
    const { data, error } = await supabase
      .from('friendships')
      .select('status, requester_id, addressee_id')
      .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
    if (error) {
      console.error('[friendships] échec du chargement des statuts :', error.message);
      return;
    }
    const map = {};
    (data ?? []).forEach((f) => {
      const otherId = f.requester_id === myId ? f.addressee_id : f.requester_id;
      if (f.status === 'accepted') map[otherId] = 'accepted';
      else if (f.status === 'pending') map[otherId] = f.requester_id === myId ? 'pending-out' : 'pending-in';
    });
    setFriendStatusByUser(map);
  }, [myId]);

  useEffect(() => {
    loadFriendStatuses();
  }, [loadFriendStatuses]);

  const addFriendFromLeaderboard = async (targetUserId) => {
    if (!myId) return;
    setFriendStatusByUser((prev) => ({ ...prev, [targetUserId]: 'pending-out' }));
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: myId, addressee_id: targetUserId, status: 'pending' });
    if (error) {
      console.error("[friendships] échec de l'ajout depuis le classement :", error.message);
      loadFriendStatuses();
    }
  };

  // --- Musique d'ambiance : DÉSACTIVÉE pour l'instant (demandé — la nappe
  // synthétisée ne plaisait pas). Reviendra avec un vrai fichier audio fourni
  // par l'utilisateur ; le module aimHubAudio.js et les boutons/préférences
  // volume/mute restent en place pour la rebrancher facilement plus tard.
  useEffect(() => {
    stopHubMusic();
  }, [playing]);

  useEffect(() => {
    saveHubAudioPrefs(audioPrefs);
  }, [audioPrefs]);

  const toggleMute = () => setAudioPrefs((p) => ({ ...p, muted: !p.muted }));

  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }));
  // Arme active pour les modes NON sniper — jamais 'sniper' ici : le Sniper
  // n'est utilisable qu'en mode sniper (voir launch() plus bas), réglage
  // 'default'/inconnu lu comme Vandal.
  const activeWeapon = ['vandal', 'glock'].includes(config.weaponModel) ? config.weaponModel : 'vandal';
  const selectMode = (id) => setConfig((prev) => ({ ...prev, mode: id, ...MODES[id].preset }));

  const launch = useCallback(
    (extra = {}) => {
      playConfirmSfx();
      const modeId = extra.mode ?? config.mode;
      const isSniperMode = !!MODES[modeId]?.sniper;
      // L'arme et le skin RÉELLEMENT lancés : le Sniper seulement en mode
      // sniper, sinon l'arme active (Vandal/Glock) — jamais l'inverse, sinon
      // un skin Sniper équipé resterait affiché dans un mode normal. Chaque
      // arme a son propre skin équipé (voir weaponSkins).
      const weaponModel = isSniperMode ? 'sniper' : activeWeapon;
      const weaponSkin = config.weaponSkins?.[weaponModel] ?? 'standard';
      const overrides = { weaponModel, weaponSkin, ...(isSniperMode ? { showWeapon: true } : {}) };
      setLaunchConfig({ ...config, ...extra, ...overrides, userId: myId });
      // Léger délai pour laisser le bruitage de confirmation se faire
      // entendre et le fondu de sortie du menu s'amorcer avant de basculer.
      setTimeout(() => setPlaying(true), 120);
    },
    [config, myId, activeWeapon],
  );

  // Ouvert depuis un "point à travailler" (voir WeaknessTab → AimTrainerTab) :
  // le mode conseillé arrive dans le config de lancement de la fenêtre — on
  // saute directement en jeu dessus, sans repasser par le menu/la sélection
  // de mode.
  useEffect(() => {
    // Routine demandée (ex. échauffement d'un modèle de Session guidée) : les
    // modes s'enchaînent comme la routine d'échauffement du hub.
    const requestedPlaylist = initialRawConfig?.playlist;
    if (Array.isArray(requestedPlaylist) && requestedPlaylist.length > 0 && requestedPlaylist.every((id) => MODES[id])) {
      launch({ playlist: requestedPlaylist });
      return;
    }
    const requestedMode = initialRawConfig?.mode;
    if (!requestedMode || !MODES[requestedMode]) return;
    launch({ mode: requestedMode, ...MODES[requestedMode].preset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exitGame = useCallback(() => {
    setPlaying(false);
    // Une session Sensitivity Finder dont au moins une étape a répondu montre
    // son propre écran de comparaison plutôt que le menu normal — voir
    // handleFinderSessionComplete et l'écran 'finder-results' plus bas.
    const wasFinderRun = launchConfig?.isFinderRun && finderResults.length > 0;
    setLaunchConfig(null);
    setScreen(wasFinderRun ? 'finder-results' : 'menu');
    refresh();
    // Le pass d'abord (il attribue l'XP), puis la boutique (qui la convertit).
    bp.refresh().then(() => shop.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, launchConfig, finderResults, bp.refresh, shop.refresh]);

  // Ne capture que les étapes d'une session Sensitivity Finder — un run
  // classé normal (ou une routine PlaylistManager classique) n'a pas besoin
  // que le hub retienne quoi que ce soit ici, il gère déjà son propre
  // affichage/enregistrement de score.
  const handleFinderSessionComplete = useCallback(
    (result) => {
      if (!launchConfig?.isFinderRun) return;
      setFinderResults((prev) => [...prev, result]);
    },
    [launchConfig],
  );

  // Une récompense réclamée dans le pass peut être des MVP Points : la boutique
  // les crédite (shop_award). On ne relance pas au premier rendu (useShop charge déjà).
  const claimsSeen = useRef(null);
  useEffect(() => {
    const size = bp.ownedRewardIds.size;
    if (claimsSeen.current !== null && size > claimsSeen.current) shop.refresh();
    claimsSeen.current = size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bp.ownedRewardIds]);

  // Tout ce que le joueur possède, gagné (pass) ou acheté (boutique).
  const ownedAll = useMemo(() => new Set([...bp.ownedRewardIds, ...shop.ownedIds]), [bp.ownedRewardIds, shop.ownedIds]);
  // Un système absent (migration non appliquée) ou sans compte ne verrouille
  // rien : ses objets restent libres, comme avant son arrivée.
  const lockScope = {
    pass: bp.status !== 'unavailable' && bp.status !== 'signed-out',
    shop: shop.status !== 'unavailable' && shop.status !== 'signed-out',
  };
  // Comptes admin (profiles.role, comme dans App.jsx) : tous les skins et gants
  // visibles et équipables, pour tester. Le verrou n'est de toute façon que
  // cosmétique côté client (voir battlePass/ownership.js).
  // null = pas encore su : on ne déséquipe rien d'ici là (voir l'effet suivant).
  const [isAdmin, setIsAdmin] = useState(myId ? null : false);
  useEffect(() => {
    if (!myId) return undefined;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('role')
      .eq('id', myId)
      .maybeSingle()
      .then(
        ({ data }) => !cancelled && setIsAdmin(data?.role === 'admin'),
        () => !cancelled && setIsAdmin(false),
      );
    return () => {
      cancelled = true;
    };
  }, [myId]);
  const isSkinLockedForMe = (weapon, skin) => isAdmin !== true && isSkinLocked(ownedAll, weapon, skin, lockScope);

  // Un objet verrouillé (cache local d'un autre compte, objet retiré...) ne doit
  // pas rester équipé. Pas pendant le chargement : un cache encore vide
  // déséquiperait à tort.
  useEffect(() => {
    const bpSettled = ['ready', 'no-season', 'outdated', 'unavailable', 'signed-out'].includes(bp.status);
    const shopSettled = ['ready', 'unavailable', 'signed-out'].includes(shop.status);
    if (!bpSettled || !shopSettled || isAdmin !== false) return;
    // Chaque arme a son propre skin équipé désormais : on vérifie les trois.
    const skins = config.weaponSkins ?? {};
    const nextSkins = {};
    Object.keys(WEAPON_MODELS).forEach((weapon) => {
      const skin = skins[weapon] ?? 'standard';
      if (skin !== 'standard' && isSkinLocked(ownedAll, weapon, skin, lockScope)) nextSkins[weapon] = 'standard';
    });
    if (Object.keys(nextSkins).length > 0) set({ weaponSkins: { ...skins, ...nextSkins } });
    const gloves = config.handSkin ?? 'standard';
    if (gloves !== 'standard' && isHandLocked(ownedAll, gloves, lockScope)) set({ handSkin: 'standard' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bp.status, shop.status, ownedAll, config.weaponSkins, config.handSkin, isAdmin]);

  const navigate = (next) => {
    playClickSfx();
    if (next === 'modes') setModesCategory(null);
    setScreen(next);
  };

  // Dans une catégorie de la page Modes, « Retour » remonte aux trois cartes.
  const goBack = () => {
    playBackSfx();
    if (screen === 'modes' && modesCategory) {
      setModesCategory(null);
      return;
    }
    setScreen('menu');
  };

  const requestExit = () => {
    playBackSfx();
    setExiting(true);
    setTimeout(() => window.electronAPI.closeAimTrainer(), 260);
  };

  const distance = cm360(config.dpi, config.sens);
  const edpi = config.dpi * config.sens;
  const streak = useMemo(() => computeStreak(history), [history]);
  const recentModes = useMemo(() => {
    const seen = [];
    for (const row of history) {
      if (MODES[row.mode] && row.mode !== config.mode && !seen.includes(row.mode)) seen.push(row.mode);
      if (seen.length === 3) break;
    }
    return seen;
  }, [history, config.mode]);
  const challengeDone = dailyBoard.some((row) => row.user_id === myId);
  const activeModeLabel = MODES[config.mode] ? t(MODES[config.mode].labelKey) : t('aimTrainer.customTitle');
  const activeModeAccent = MODES[config.mode]?.accent ?? '#8a8f9c';
  // Trois courbes de progression possibles (voir ProgressionChart) : score
  // (comme avant), temps de réaction moyen, et taux de ratés — les deux
  // dernières demandées sur Discord, déjà enregistrées en base
  // (avg_reaction/accuracy) mais jamais exploitées ici. Le mode affiché est
  // choisi séparément du mode actif (progressionMode, sélecteur dans la
  // carte) — sinon impossible de consulter sa progression sur un mode qu'on
  // ne s'apprête pas à relancer.
  const [progressionMetric, setProgressionMetric] = useState('score');
  const [progressionMode, setProgressionMode] = useState(config.mode);
  const progressionModeLabel = MODES[progressionMode] ? t(MODES[progressionMode].labelKey) : progressionMode;
  const progressionModeAccent = MODES[progressionMode]?.accent ?? '#8a8f9c';
  const progressionRows = useMemo(
    () => history.filter((row) => row.mode === progressionMode).slice(0, 20).reverse(),
    [history, progressionMode],
  );
  const progression = useMemo(() => {
    if (progressionMetric === 'reaction') {
      return progressionRows.filter((row) => row.avg_reaction != null).map((row) => row.avg_reaction);
    }
    if (progressionMetric === 'missRate') {
      return progressionRows
        .filter((row) => row.accuracy != null)
        .map((row) => Math.round((100 - row.accuracy) * 10) / 10);
    }
    return progressionRows.map((row) => row.score);
  }, [progressionRows, progressionMetric]);
  // Toujours le score (jamais réaction/ratés) : utilisé par l'aperçu compact
  // de l'accueil (HomeProgressCard), indépendant de l'onglet choisi dans
  // l'écran Stats.
  const scoreProgression = useMemo(() => progressionRows.map((row) => row.score), [progressionRows]);
  // Score : plus haut = mieux (record). Réaction/ratés : plus bas = mieux.
  const progressionBest = progression.length
    ? progressionMetric === 'score'
      ? Math.max(...progression)
      : Math.min(...progression)
    : null;
  const progressionLast = progression.length ? progression[progression.length - 1] : null;
  // Page Modes : Classique = modes sans arène (Tracking et Patrouille regroupés
  // dans leurs propres cartes), Valorant = modes liés à une arène.
  const classicModeEntries = useMemo(
    () =>
      Object.entries(MODES).filter(
        ([id]) => !VALORANT_MODE_IDS.includes(id) && !TRACKING_MODE_IDS.includes(id) && !PATROL_MODE_IDS.includes(id),
      ),
    [],
  );
  const valorantModeEntries = useMemo(() => VALORANT_MODE_IDS.map((id) => [id, MODES[id]]), []);
  // Relu à chaque fermeture des fenêtres qui les modifient.
  const customPresets = useMemo(() => loadPresets(), [showCustomConfig, showPlaylistManager, modesCategory]);
  // `screen` en plus : les arènes se créent dans l'éditeur (un écran, pas une
  // fenêtre), il faut relire au retour vers 'modes' pour voir les changements.
  const customArenas = useMemo(() => loadArenas(), [showCustomConfig, modesCategory, screen]);
  // Visuels de la carte « Valorant » : la carte Ascent (arène Belvédère) et Jett.
  const valorantModeImages = useMemo(
    () => {
      const jett = agents.find((a) => a.displayName === 'Jett');
      const [colorA, colorB] = (jett?.backgroundGradientColors ?? []).map((c) => `#${c.slice(0, 6)}`);
      return {
        map: maps.find((m) => m.displayName === 'Ascent')?.splash ?? null,
        agent: jett?.fullPortrait ?? null,
        agentBackground: jett?.background ?? null,
        colorA: colorA ?? '#25607a',
        colorB: colorB ?? '#0f1923',
      };
    },
    [maps, agents],
  );
  const modeCategoryStats = useMemo(() => {
    const ids = Object.keys(MODES);
    const records = (list) => list.filter((id) => globalBests[id] !== undefined && personalBests[id] >= globalBests[id]).length;
    const valorantIds = VALORANT_MODE_IDS;
    const classicIds = ids.filter((id) => !valorantIds.includes(id));
    return {
      classic: [
        { key: 'modes', value: classicIds.length },
        { key: 'records', value: records(classicIds), icon: Crown },
      ],
      valorant: [
        { key: 'arenas', value: new Set(valorantIds.map((id) => MODES[id].arena).filter(Boolean)).size },
        { key: 'modes', value: valorantIds.length },
        { key: 'records', value: records(valorantIds), icon: Crown },
      ],
      custom: [
        { key: 'presets', value: customPresets.length },
        { key: 'playlists', value: loadPlaylists().length },
      ],
    };
  }, [personalBests, globalBests, customPresets]);
  const isTrackingActive = TRACKING_MODE_IDS.includes(config.mode);
  const isPatrolActive = PATROL_MODE_IDS.includes(config.mode);
  const recordsCount = useMemo(
    () => Object.keys(personalBests).filter((id) => globalBests[id] !== undefined && personalBests[id] >= globalBests[id]).length,
    [personalBests, globalBests],
  );

  // Préchargement du moteur quand le navigateur est inactif : le clic sur
  // « Jouer » n'a alors plus rien à télécharger ni à analyser.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1500));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    const id = idle(() => {
      loadGame();
    });
    return () => cancel(id);
  }, []);

  // Navigation manette (D-pad/stick gauche + A valide, B revient en
  // arrière) dans tous les menus du hub — jamais pendant une session (voir
  // `active`, coupé quand `playing`). B ferme la fenêtre modale ouverte la
  // plus "au-dessus" s'il y en a une, sinon revient à l'accueil.
  const gamepadBack = () => {
    if (showSensitivityFinder) return setShowSensitivityFinder(false);
    if (showTrackingPicker) return setShowTrackingPicker(false);
    if (showPatrolPicker) return setShowPatrolPicker(false);
    if (showCustomConfig) return setShowCustomConfig(false);
    if (showPlaylistManager) return setShowPlaylistManager(false);
    if (showSkinPicker) return setShowSkinPicker(false);
    if (screen === 'calibration') return setScreen('settings');
    if (screen !== 'menu') return setScreen('menu');
    return undefined;
  };
  useGamepadMenuNav({ containerRef: hubRootRef, active: !playing, onBack: gamepadBack });

  if (playing && launchConfig) {
    return (
      <Suspense fallback={<div className="aim-game" />}>
        <AimTrainerGame config={launchConfig} onExit={exitGame} onSessionComplete={handleFinderSessionComplete} />
      </Suspense>
    );
  }

  return (
    <div
      ref={hubRootRef}
      className={exiting ? 'aim-hub-root aim-hub-exiting' : 'aim-hub-root'}
      style={hubAccent && !USE_LOBBY ? { '--hub-accent': hubAccent } : undefined}
    >
      <div className="aim-hub-fade-veil" aria-hidden="true" />

      {showWelcomeModal && (
        <WelcomeBonusModal
          t={t}
          claiming={shop.claimingWelcome}
          onClaim={async () => {
            await shop.claimWelcome();
          }}
          onClose={() => setWelcomeDismissed(true)}
        />
      )}

      {screen !== 'menu' && (
        <>
          <button className="aim-hub-mute aim-hub-mute-floating" onClick={toggleMute} title={audioPrefs.muted ? t('aimTrainer.hubMuteOff') : t('aimTrainer.hubMuteOn')}>
            <Icon icon={audioPrefs.muted ? VolumeX : Volume2} size={18} />
          </button>
          <button className="aim-hub-back" onClick={goBack}>
            <Icon icon={ArrowLeft} size={16} /> {t('aimTrainer.hubBack')}
          </button>
        </>
      )}

      <div key={screen} className="aim-hub-screen">
        {screen === 'menu' && !USE_LOBBY && (
          <div className="aim-hub-home">
            <MapSlideshow maps={maps} />

            <div className="aim-hub-home-bg" aria-hidden="true">
              {heroAgents.map((agent, i) =>
                NAV_KEYS[i] === hoveredNav || portraitReady ? (
                  <DecodedImg
                    key={agent.uuid}
                    className={NAV_KEYS[i] === hoveredNav ? 'aim-hub-bg-portrait active' : 'aim-hub-bg-portrait'}
                    src={agent.fullPortrait}
                    priority={NAV_KEYS[i] === hoveredNav}
                    onReady={NAV_KEYS[i] === hoveredNav ? () => setPortraitReady(true) : undefined}
                  />
                ) : null,
              )}
              <div className="aim-hub-home-bg-fade" />
            </div>

            {activeHeroAgent && (
              <div className="aim-hub-hero-watermark" aria-hidden="true">
                {activeHeroAgent.role?.displayIcon && <img src={activeHeroAgent.role.displayIcon} alt="" />}
                <span>{activeHeroAgent.displayName}</span>
              </div>
            )}

            <div className="aim-hub-topbar">
              <div className="aim-hub-brand">
                <Icon icon={Crosshair} size={22} />
                <span>{t('aimTrainer.title')}</span>
              </div>
              <div className="aim-hub-mvp-brand">
                <img src={mvpTrackerLogo} alt="" />
                <span>MVP Tracker</span>
              </div>
              <div className="aim-hub-topbar-right">
                <button className="aim-hub-mute" onClick={toggleMute} title={audioPrefs.muted ? t('aimTrainer.hubMuteOff') : t('aimTrainer.hubMuteOn')}>
                  <Icon icon={audioPrefs.muted ? VolumeX : Volume2} size={16} />
                </button>
                <button className="aim-hub-topbar-exit" onClick={requestExit}>
                  <Icon icon={LogOut} size={15} /> {t('aimTrainer.hubExit')}
                </button>
                <HubProfileChip
                  userId={myId}
                  avatarIcon={avatarArt.icon}
                  name={displayName}
                  tag={riotTag}
                  currentTier={currentTier}
                  onClick={() => navigate('stats')}
                  t={t}
                />
              </div>
            </div>

            <TipBanner t={t} />

            <div className="aim-hub-nav-panel">
              <div className="aim-hub-nav-title">
                <h1>{t('aimTrainer.title')}</h1>
                <p>{t('aimTrainer.hubTagline')}</p>
              </div>

              <button
                className="aim-hub-play-btn"
                onMouseEnter={() => {
                  playHoverSfx();
                  setHoveredNav('play');
                }}
                onClick={() => launch()}
              >
                <Icon icon={Play} size={28} /> {t('aimTrainer.hubPlay')}
              </button>
              <p className="aim-hub-play-hint">{t('aimTrainer.hubPlayHint', { mode: activeModeLabel })}</p>

              <nav className="aim-hub-nav-list">
                <NavListItem
                  icon={Crosshair}
                  label={t('aimTrainer.hubModes')}
                  hint={t('aimTrainer.modeSection')}
                  active={hoveredNav === 'modes'}
                  onHover={() => setHoveredNav('modes')}
                  onClick={() => navigate('modes')}
                />
                {bp.status !== 'unavailable' && (
                  <NavListItem
                    icon={Trophy}
                    label={t('aimTrainer.hubBattlePass')}
                    hint={bp.levelState ? t('battlePass.nav.hint', { level: bp.levelState.level }) : t('battlePass.nav.hintIdle')}
                    badge={bp.claimableCount}
                    active={hoveredNav === 'battlepass'}
                    onHover={() => setHoveredNav('battlepass')}
                    onClick={() => navigate('battlepass')}
                  />
                )}
                <NavListItem
                  icon={BarChart3}
                  label={t('aimTrainer.hubStats')}
                  hint={t('aimTrainer.streakLabel', { count: streak })}
                  active={hoveredNav === 'stats'}
                  onHover={() => setHoveredNav('stats')}
                  onClick={() => navigate('stats')}
                />
                <NavListItem
                  icon={SettingsIcon}
                  label={t('aimTrainer.hubSettings')}
                  hint={t('aimTrainer.sensSection')}
                  active={hoveredNav === 'settings'}
                  onHover={() => setHoveredNav('settings')}
                  onClick={() => navigate('settings')}
                />
                <NavListItem
                  icon={Gauge}
                  label={t('aimTrainer.finderTitle')}
                  hint={t('aimTrainer.finderHint')}
                  active={hoveredNav === 'finder'}
                  onHover={() => setHoveredNav('finder')}
                  onClick={() => setShowSensitivityFinder(true)}
                />
                <NavListItem
                  icon={Palette}
                  label={t('aimTrainer.skinSection')}
                  hint={`${t(WEAPON_MODELS[activeWeapon]?.labelKey)} · ${t(WEAPON_MODELS[activeWeapon]?.skins?.[config.weaponSkins?.[activeWeapon] ?? 'standard']?.labelKey ?? 'aimTrainer.skinStandard')}`}
                  active={hoveredNav === 'skin'}
                  onHover={() => setHoveredNav('skin')}
                  onClick={() => setShowSkinPicker(true)}
                />
              </nav>
            </div>

            <div className="aim-hub-side-panel">
              <HomeChallengeCard
                challenge={challenge}
                dailyBoard={dailyBoard}
                challengeDone={challengeDone}
                myId={myId}
                apiKey={apiKey}
                friendStatusByUser={friendStatusByUser}
                onAddFriend={addFriendFromLeaderboard}
                onPlay={() =>
                  launch({
                    ...challenge,
                    challengeDate: challenge.dateKey,
                    dpi: config.dpi,
                    sens: config.sens,
                    fov: config.fov,
                  })
                }
                t={t}
              />
              <HomeStatsCard sessions={history.length} streak={streak} records={recordsCount} onClick={() => navigate('stats')} t={t} />
              <HomeProgressCard modeLabel={activeModeLabel} accent={activeModeAccent} progression={scoreProgression} t={t} />
              <HomeFriendsCard
                friendsBoard={friendsBoard}
                myId={myId}
                apiKey={apiKey}
                friendStatusByUser={friendStatusByUser}
                onAddFriend={addFriendFromLeaderboard}
                t={t}
              />
            </div>
          </div>
        )}

        {screen === 'menu' && USE_LOBBY && (
          <HubLobby
            t={t}
            sfx={{ hover: playHoverSfx, click: playClickSfx }}
            profile={{ userId: myId, name: displayName, tag: riotTag, avatar: avatarArt.icon, tier: currentTier, logo: mvpTrackerLogo }}
            bp={bp}
            shopBalance={shop.status === 'ready' ? shop.balance : null}
            dailyClaimed={shop.status === 'ready' ? shop.dailyDays.has(utcDayKey(Date.now())) : null}
            config={config}
            previews={SKIN_PREVIEWS}
            activeModeId={config.mode}
            personalBest={personalBests[config.mode]}
            globalBest={globalBests[config.mode]}
            recentModes={recentModes}
            stats={{ sessions: history.length, streak, records: recordsCount }}
            muted={audioPrefs.muted}
            onToggleMute={toggleMute}
            onExit={requestExit}
            onPlay={() => launch()}
            onLaunchMode={(modeId) => {
              selectMode(modeId);
              launch({ mode: modeId, ...MODES[modeId].preset });
            }}
            onNavigate={navigate}
            onOpenSkin={() => setShowSkinPicker(true)}
            onOpenEditor={() => setScreen('editor')}
            onOpenFinder={() => setShowSensitivityFinder(true)}
            onWarmup={() => launch({ playlist: WARMUP_ROUTINE })}
            background={<MapSlideshow maps={maps} />}
            modeImages={valorantModeImages}
            challenge={challenge}
            challengeDone={challengeDone}
            onPlayChallenge={() =>
              launch({
                ...challenge,
                challengeDate: challenge.dateKey,
                dpi: config.dpi,
                sens: config.sens,
                fov: config.fov,
              })
            }
            challengeBoard={
              dailyBoard.length > 0 ? (
                <div className="aim-board">
                  {dailyBoard.slice(0, 5).map((row, i) => (
                    <AimLeaderboardRow
                      key={row.user_id}
                      row={row}
                      rank={i + 1}
                      myId={myId}
                      apiKey={apiKey}
                      friendStatus={friendStatusByUser[row.user_id] ?? 'none'}
                      onAddFriend={addFriendFromLeaderboard}
                      highlight={row.user_id === myId}
                    />
                  ))}
                </div>
              ) : null
            }
            onOpenModeCategory={(category) => {
              setModesCategory(category);
              setScreen('modes');
            }}
            friendsCard={
              <HomeFriendsCard
                friendsBoard={friendsBoard}
                myId={myId}
                apiKey={apiKey}
                friendStatusByUser={friendStatusByUser}
                onAddFriend={addFriendFromLeaderboard}
                t={t}
              />
            }
          />
        )}

        {screen === 'modes' && (
          <ModesScreen
            category={modesCategory}
            stats={modeCategoryStats}
            images={valorantModeImages}
            onPick={(category) => {
              playClickSfx();
              setModesCategory(category);
            }}
            onHover={playHoverSfx}
            t={t}
          >
            {modesCategory === 'classic' && (
              <>
              <div className="aim-mode-grid">
                {classicModeEntries.map(([id, mode]) => (
                  <ModeCard
                    key={id}
                    id={id}
                    mode={mode}
                    active={id === config.mode}
                    personal={personalBests[id]}
                    global={globalBests[id]}
                    onSelect={selectMode}
                    onLaunch={(modeId) => {
                      selectMode(modeId);
                      launch({ mode: modeId, ...MODES[modeId].preset });
                    }}
                    t={t}
                  />
                ))}

                <button
                  className={isTrackingActive ? 'aim-mode-card active' : 'aim-mode-card'}
                  style={{ '--mode-accent': MODES.tracking.accent }}
                  onMouseEnter={playHoverSfx}
                  onClick={() => {
                    playClickSfx();
                    setShowTrackingPicker(true);
                  }}
                >
                  <span className="aim-mode-glow" aria-hidden="true" />
                  <span className="aim-mode-head">
                    <span className="aim-mode-icon"><Icon icon={MODES.tracking.icon} /></span>
                  </span>
                  <span className="aim-mode-name">{t('aimTrainer.modes.trackingGroup')}</span>
                  <span className="aim-mode-desc">{t('aimTrainer.modes.trackingGroupDesc')}</span>
                </button>

                <button
                  className={isPatrolActive ? 'aim-mode-card active' : 'aim-mode-card'}
                  style={{ '--mode-accent': MODES.patrol.accent }}
                  onMouseEnter={playHoverSfx}
                  onClick={() => {
                    playClickSfx();
                    setShowPatrolPicker(true);
                  }}
                >
                  <span className="aim-mode-glow" aria-hidden="true" />
                  <span className="aim-mode-head">
                    <span className="aim-mode-icon"><Icon icon={MODES.patrol.icon} /></span>
                  </span>
                  <span className="aim-mode-name">{t('aimTrainer.modes.patrolGroup')}</span>
                  <span className="aim-mode-desc">{t('aimTrainer.modes.patrolGroupDesc')}</span>
                </button>
              </div>

              <div className="aim-hub-launch-row">
                <button className="refresh aim-launch-btn" onMouseEnter={playHoverSfx} onClick={() => launch()}>
                  {t('aimTrainer.launch')}
                </button>
              </div>
              </>
            )}

            {modesCategory === 'valorant' && (
              <>
              <div className="aim-mode-grid">
                {valorantModeEntries.map(([id, mode]) => (
                  <ModeCard
                    key={id}
                    id={id}
                    mode={mode}
                    active={id === config.mode}
                    personal={personalBests[id]}
                    global={globalBests[id]}
                    onSelect={selectMode}
                    onLaunch={(modeId) => {
                      selectMode(modeId);
                      launch({ mode: modeId, ...MODES[modeId].preset });
                    }}
                    t={t}
                  />
                ))}
              </div>

              <div className="aim-hub-launch-row">
                <button className="refresh aim-launch-btn" onMouseEnter={playHoverSfx} onClick={() => launch()}>
                  {t('aimTrainer.launch')}
                </button>
              </div>
              </>
            )}

            {modesCategory === 'custom' && (
              <>
                <div className="mc-actions">
                  <button type="button" className="mc-action" onMouseEnter={playHoverSfx} onClick={() => setShowCustomConfig(true)}>
                    <span className="mc-icon"><Icon icon={Wrench} size={18} /></span>
                    <strong>{t('aimTrainer.modesHub.createTitle')}</strong>
                    <span>{t('aimTrainer.customDesc')}</span>
                  </button>
                  <button type="button" className="mc-action" onMouseEnter={playHoverSfx} onClick={() => setShowPlaylistManager(true)}>
                    <span className="mc-icon"><Icon icon={ListMusic} size={18} /></span>
                    <strong>{t('aimTrainer.playlistsTitle')}</strong>
                    <span>{t('aimTrainer.playlistsIntro')}</span>
                  </button>
                  <button type="button" className="mc-action" onMouseEnter={playHoverSfx} onClick={() => launch({ playlist: WARMUP_ROUTINE })}>
                    <span className="mc-icon"><Icon icon={Flame} size={18} /></span>
                    <strong>{t('aimTrainer.modesHub.warmupTitle')}</strong>
                    <span>{t('aimTrainer.modesHub.warmupDesc')}</span>
                  </button>
                  <button type="button" className="mc-action" onMouseEnter={playHoverSfx} onClick={() => setScreen('editor')}>
                    <span className="mc-icon"><Icon icon={Hammer} size={18} /></span>
                    <strong>{t('aimTrainer.modesHub.arenaEditorTitle')}</strong>
                    <span>{t('aimTrainer.modesHub.arenaEditorDesc')}</span>
                  </button>
                  {PLAYABLE_MAP_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="mc-action"
                      onMouseEnter={playHoverSfx}
                      onClick={() => {
                        setMapPreviewId(id);
                        setScreen('map-preview');
                      }}
                    >
                      <span className="mc-icon"><Icon icon={MapIcon} size={18} /></span>
                      <strong>{t(`aimTrainer.mapPreview.maps.${id}.button`)}</strong>
                      <span>{t(`aimTrainer.mapPreview.maps.${id}.buttonDesc`)}</span>
                    </button>
                  ))}
                </div>

                <h3 className="mc-section-title">{t('aimTrainer.modesHub.presetsTitle')}</h3>
                {customPresets.length === 0 ? (
                  <p className="mc-empty">{t('aimTrainer.modesHub.noPresets')}</p>
                ) : (
                  <div className="mc-presets">
                    {customPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="mc-preset"
                        onMouseEnter={playHoverSfx}
                        onClick={() => launch({ mode: 'custom', ...presetValues(preset) })}
                      >
                        <Icon icon={MODES[preset.baseMode]?.icon ?? Wrench} size={18} />
                        <span>
                          <strong>{preset.name}</strong>
                          <small>
                            {preset.customArenaId
                              ? (customArenas.find((a) => a.id === preset.customArenaId)?.name ?? t('aimTrainer.arenaDeleted'))
                              : t(MODES[preset.baseMode]?.labelKey ?? 'aimTrainer.customTitle')}{' '}
                            · {preset.duration}s
                          </small>
                        </span>
                        <Icon icon={Play} size={16} />
                      </button>
                    ))}
                  </div>
                )}

                <h3 className="mc-section-title">{t('aimTrainer.modesHub.arenasTitle')}</h3>
                {customArenas.length === 0 ? (
                  <p className="mc-empty">{t('aimTrainer.modesHub.noArenas')}</p>
                ) : (
                  <div className="mc-presets">
                    {customArenas.map((arena) => (
                      <button
                        key={arena.id}
                        type="button"
                        className="mc-preset"
                        onMouseEnter={playHoverSfx}
                        onClick={() => launch({ mode: 'custom', ...arenaLaunchConfig(arena) })}
                      >
                        <Icon icon={Hammer} size={18} />
                        <span>
                          <strong>{arena.name}</strong>
                          <small>{t('aimTrainer.modesHub.arenaSummary', { count: arena.enemies.length })}</small>
                        </span>
                        <Icon icon={Play} size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </ModesScreen>
        )}

        {screen === 'battlepass' && (
          <Suspense fallback={null}>
              <BattlePassScreen
                bp={bp}
                previews={SKIN_PREVIEWS}
                config={config}
                profile={{ name: displayName, avatar: avatarArt.icon }}
                onEquipSkin={(weapon, skin) =>
                  set({
                    weaponSkins: { ...(config.weaponSkins ?? {}), [weapon]: skin },
                    // Le Sniper ne devient jamais l'arme "active" des modes
                    // normaux (voir launch()) — seuls Vandal/Glock le sont.
                    ...(weapon !== 'sniper' ? { weaponModel: weapon } : {}),
                  })
                }
                onEquipHands={(key) => set({ handSkin: key })}
              />
            </Suspense>
        )}

        {screen === 'stats' && (
          <StatsScreen
            t={t}
            lang={i18n.language}
            history={history}
            streak={streak}
            records={recordsCount}
            personalBests={personalBests}
            globalBests={globalBests}
            progressionMode={progressionMode}
            onSelectMode={setProgressionMode}
            onLaunchMode={(modeId) => {
              selectMode(modeId);
              launch({ mode: modeId, ...MODES[modeId].preset });
            }}
            progressionPanel={
              <>
                <div className="aim-progress-header">
                  <h4 className="account-subsection-title">{t('aimTrainer.progressTitle', { mode: progressionModeLabel })}</h4>
                  <select
                    className="aim-progress-mode-select"
                    value={progressionMode}
                    onChange={(e) => setProgressionMode(e.target.value)}
                  >
                    {Object.entries(MODES).map(([id, mode]) => (
                      <option key={id} value={id}>{t(mode.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div className="aim-progress-metric-tabs">
                  {['score', 'reaction', 'missRate'].map((metric) => (
                    <button
                      key={metric}
                      type="button"
                      className={progressionMetric === metric ? 'aim-progress-metric-tab active' : 'aim-progress-metric-tab'}
                      onClick={() => setProgressionMetric(metric)}
                    >
                      {t(`aimTrainer.progressMetric.${metric}`)}
                    </button>
                  ))}
                </div>
                {progression.length < 2 ? (
                  <p className="label">{t('aimTrainer.progressNotEnough')}</p>
                ) : (
                  <>
                    <ProgressionChart scores={progression} accent={progressionModeAccent} />
                    <p className="label">
                      {t(`aimTrainer.progressMeta.${progressionMetric}`, {
                        count: progression.length,
                        best: progressionBest,
                        last: progressionLast,
                      })}
                    </p>
                  </>
                )}
              </>
            }
            challengeRanking={
              <>
                <h4 className="account-subsection-title">
                  {t('aimTrainer.todayRanking')} · {t(MODES[challenge.mode].labelKey)}
                </h4>
                {dailyBoard.length === 0 ? (
                  <p className="label">{t('aimTrainer.statsPage.noRanking')}</p>
                ) : (
                  <div className="aim-board">
                    {dailyBoard.slice(0, 5).map((row, i) => (
                      <AimLeaderboardRow
                        key={row.user_id}
                        row={row}
                        rank={i + 1}
                        myId={myId}
                        apiKey={apiKey}
                        friendStatus={friendStatusByUser[row.user_id] ?? 'none'}
                        onAddFriend={addFriendFromLeaderboard}
                        highlight={row.user_id === myId}
                      />
                    ))}
                  </div>
                )}
              </>
            }
            friendsRanking={
              <>
                <h4 className="account-subsection-title">{t('aimTrainer.friendsTitle')}</h4>
                {friendsBoard.length === 0 ? (
                  <p className="label">{t('aimTrainer.friendsEmpty')}</p>
                ) : (
                  <div className="aim-board">
                    {friendsBoard.map((row, i) => (
                      <AimLeaderboardRow
                        key={row.user_id}
                        row={row}
                        rank={i + 1}
                        myId={myId}
                        apiKey={apiKey}
                        friendStatus={friendStatusByUser[row.user_id] ?? 'none'}
                        onAddFriend={addFriendFromLeaderboard}
                        highlight={row.user_id === myId}
                      />
                    ))}
                  </div>
                )}
              </>
            }
          />
        )}

        {screen === 'locker' && (
          <LockerScreen
            owned={ownedAll}
            shopActive={lockScope.shop}
            t={t}
            bp={bp}
            profile={{ name: displayName, avatar: avatarArt.icon }}
            config={config}
            previews={SKIN_PREVIEWS}
            onOpenSkins={() => setShowSkinPicker(true)}
            onEquipHands={(key) => set({ handSkin: key })}
            isAdmin={isAdmin === true}
          />
        )}

        {screen === 'editor' && (
          <Suspense fallback={null}>
            <ArenaEditor
              t={t}
              settings={{ sens: config.sens, fov: config.fov, theme: config.theme, controller: config.controller }}
              onPlay={(customArena) => launch({ mode: 'custom', ...arenaLaunchConfig(customArena) })}
            />
          </Suspense>
        )}

        {screen === 'map-preview' && (
          <Suspense fallback={null}>
            <MapExplorer key={mapPreviewId} t={t} mapId={mapPreviewId} settings={{ sens: config.sens, fov: config.fov, theme: config.theme }} />
          </Suspense>
        )}

        {screen === 'shop' && (
          <Suspense fallback={null}>
            <ShopScreen t={t} shop={shop} previews={SKIN_PREVIEWS} weapon={activeWeapon} weaponSkin={config.weaponSkins?.[activeWeapon] ?? 'standard'} />
          </Suspense>
        )}

        {screen === 'daily' && (
          <Suspense fallback={null}>
            <DailyRewardScreen t={t} shop={shop} locale={i18n.language} />
          </Suspense>
        )}

        {screen === 'leaderboard' && (
          <LeaderboardScreen t={t} myId={myId} apiKey={apiKey} friendStatusByUser={friendStatusByUser} onAddFriend={addFriendFromLeaderboard} />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            t={t}
            config={config}
            set={set}
            onReset={() => setConfig({ ...DEFAULT_CONFIG })}
            crosshairs={crosshairs}
            targetColors={TARGET_COLORS}
            edpi={edpi}
            cm360={distance}
            onOpenFinder={() => setShowSensitivityFinder(true)}
            onOpenCalibration={() => setScreen('calibration')}
          />
        )}

        {screen === 'calibration' && (
          <ControllerCalibration t={t} config={config} set={set} onClose={() => setScreen('settings')} />
        )}

        {screen === 'finder-results' && (
          <div className="aim-hub-panel">
            <h2>
              <Icon icon={Gauge} size={20} /> {t('aimTrainer.finderResultsTitle')}
            </h2>
            {(() => {
              // Score = touches × précision (voir sensitivityFit.js) : la
              // précision seule plafonne à 100 % pour tous les essais, ou
              // récompense une sensibilité si basse qu'on ne touche que 2
              // cibles. Régression sur la courbe complète plutôt que "la
              // meilleure des valeurs testées" — le vrai optimum tombe
              // rarement pile sur l'une des sensibilités essayées.
              // Manette : le repère "sens actuelle" pour la régression et le
              // point "meilleur essai le plus proche" doit être la sensibilité
              // BASE de la manette, pas la sensibilité souris — sinon
              // bestPoint() comparerait des valeurs de nature différente.
              const isControllerRun = launchConfig?.finderInputMode === 'controller';
              const referenceSens = isControllerRun ? config.controller.profile.modes[AIM_MODE.BASE].sensX : config.sens;
              const { suggested, indistinct, edge, best, scored } = analyzeFinderResults(finderResults, referenceSens);
              const maxEffective = Math.max(1, ...scored.map((r) => r.effective));
              return (
                <>
                  <p className="label">{t('aimTrainer.finderResultsIntro')}</p>

                  {suggested !== null && (
                    <div className="card aim-finder-suggestion">
                      <span className="aim-finder-suggestion-label">{t('aimTrainer.finderSuggestedLabel')}</span>
                      <span className="aim-finder-suggestion-value">{suggested}</span>
                      <p className="label">
                        {indistinct
                          ? t('aimTrainer.finderIndistinctHint')
                          : edge
                            ? t(edge === 'up' ? 'aimTrainer.finderEdgeHintUp' : 'aimTrainer.finderEdgeHintDown', { sens: suggested })
                            : t('aimTrainer.finderSuggestedHint')}
                      </p>
                    </div>
                  )}

                  <div className="aim-finder-results-list">
                    {/* Les essais sont joués dans un ordre aléatoire : affichés
                        du plus bas au plus haut pour que la courbe se lise. */}
                    {[...finderResults].sort((a, b) => a.sens - b.sens).map((r, i) => {
                      const scoredRow = scored.find((s) => s.sens === r.sens);
                      const isBest = best && r.sens === best.sens;
                      return (
                        <div key={i} className={isBest ? 'aim-finder-result-row best' : 'aim-finder-result-row'}>
                          <span className="aim-finder-result-sens">{r.sens}</span>
                          <div className="aim-finder-result-bar-track">
                            <div
                              className="aim-finder-result-bar-fill"
                              style={{ width: scoredRow ? `${Math.max(4, (scoredRow.effective / maxEffective) * 100)}%` : '0%' }}
                            />
                          </div>
                          <span className="aim-finder-result-value">
                            {scoredRow
                              ? t('aimTrainer.finderRowDetail', { hits: r.hits, accuracy: r.accuracy.toFixed(0), score: scoredRow.effective.toFixed(1) })
                              : '—'}
                          </span>
                          {isBest && !indistinct && (
                            <span className="aim-finder-result-badge">{t('aimTrainer.finderBestTested')}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="account-settings-actions">
                    <button className="sidebar-signout account-signout" onClick={goBack}>
                      {t('aimTrainer.hubBack')}
                    </button>
                    {suggested !== null && (
                      <button
                        className="refresh aim-game-cta"
                        onClick={() => {
                          if (isControllerRun) {
                            setConfig((prev) => {
                              const base = prev.controller.profile.modes[AIM_MODE.BASE];
                              // Les essais font varier horizontal ET vertical
                              // par le MÊME multiplicateur (voir
                              // buildControllerFinderSteps) : on réapplique ce
                              // même rapport aux deux axes plutôt que d'écraser
                              // sensY avec la valeur horizontale suggérée, au
                              // cas où les deux étaient différents au départ.
                              const ratio = base.sensX > 0 ? suggested / base.sensX : 1;
                              return {
                                ...prev,
                                controller: {
                                  ...prev.controller,
                                  profile: {
                                    ...prev.controller.profile,
                                    modes: {
                                      ...prev.controller.profile.modes,
                                      [AIM_MODE.BASE]: { ...base, sensX: suggested, sensY: Math.round(base.sensY * ratio * 1000) / 1000 },
                                    },
                                  },
                                },
                              };
                            });
                          } else {
                            setConfig((prev) => ({ ...prev, sens: suggested }));
                          }
                          setScreen('menu');
                        }}
                      >
                        {t('aimTrainer.finderApply', { sens: suggested })}
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {showTrackingPicker && (
        <ModeGroupPicker
          titleKey="aimTrainer.modes.trackingGroup"
          descKey="aimTrainer.modes.trackingGroupDesc"
          modeIds={TRACKING_MODE_IDS}
          activeModeId={config.mode}
          personalBests={personalBests}
          globalBests={globalBests}
          onSelect={(id) => {
            selectMode(id);
            setShowTrackingPicker(false);
          }}
          onLaunch={(id) => {
            selectMode(id);
            setShowTrackingPicker(false);
            launch({ mode: id, ...MODES[id].preset });
          }}
          onClose={() => setShowTrackingPicker(false)}
          t={t}
        />
      )}

      {showPatrolPicker && (
        <ModeGroupPicker
          titleKey="aimTrainer.modes.patrolGroup"
          descKey="aimTrainer.modes.patrolGroupDesc"
          modeIds={PATROL_MODE_IDS}
          activeModeId={config.mode}
          personalBests={personalBests}
          globalBests={globalBests}
          onSelect={(id) => {
            selectMode(id);
            setShowPatrolPicker(false);
          }}
          onLaunch={(id) => {
            selectMode(id);
            setShowPatrolPicker(false);
            launch({ mode: id, ...MODES[id].preset });
          }}
          onClose={() => setShowPatrolPicker(false)}
          t={t}
        />
      )}

      {showCustomConfig && (
        <CustomModeConfig
          onClose={() => setShowCustomConfig(false)}
          onSaved={() => {
            setShowCustomConfig(false);
            setConfig(loadConfig());
          }}
          onLaunch={(values) => {
            setShowCustomConfig(false);
            setConfig(loadConfig());
            launch(values);
          }}
          onOpenEditor={() => {
            setShowCustomConfig(false);
            setScreen('editor');
          }}
        />
      )}

      {showPlaylistManager && (
        <PlaylistManager
          onClose={() => setShowPlaylistManager(false)}
          onLaunch={(playlistSteps) => {
            setShowPlaylistManager(false);
            launch({ playlistSteps });
          }}
        />
      )}

      {showSensitivityFinder && (
        <SensitivityFinder
          dpi={config.dpi}
          sens={config.sens}
          controller={config.controller}
          onClose={() => setShowSensitivityFinder(false)}
          onLaunch={(playlistSteps, inputMode) => {
            setShowSensitivityFinder(false);
            setFinderResults([]);
            launch({ playlistSteps, practiceMode: true, isFinderRun: true, finderInputMode: inputMode });
          }}
        />
      )}

      {showSkinPicker && (
        <Suspense fallback={<div className="skin-viewer skin-viewer-loading" />}>
          <SkinViewer
            config={config}
            set={set}
            previews={SKIN_PREVIEWS}
            isLocked={isSkinLockedForMe}
            onClose={() => setShowSkinPicker(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default AimTrainerHub;
