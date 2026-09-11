// Écran d'accueil autonome de l'Aim Trainer — tourne dans la fenêtre plein
// écran dédiée (voir aim-trainer:open dans main.js), pas dans un onglet de la
// fenêtre principale. Rôle de ce fichier : uniquement l'habillage (menu,
// sélection de mode, stats, réglages, transitions, son d'ambiance) — la
// mécanique de jeu elle-même reste entièrement dans AimTrainerGame.jsx,
// inchangée, simplement montée ici au lieu d'être ouverte dans une nouvelle
// fenêtre séparée.
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Snowflake,
  Volume2,
  VolumeX,
  ArrowLeft,
  ChevronRight,
  Lightbulb,
  Palette,
  UserRound,
  Check,
} from 'lucide-react';
import AimTrainerGame, { DEFAULT_CONFIG, MODES } from './AimTrainerGame.jsx';
import Icon from './Icon.jsx';
import mvpTrackerLogo from '../assets/logo.png';
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
import CustomModeConfig from './CustomModeConfig.jsx';
import PlaylistManager from './PlaylistManager.jsx';
import AimLeaderboardRow from './AimLeaderboardRow.jsx';
import CrosshairPreview from './CrosshairPreview.jsx';
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

const SETTINGS_STORAGE_KEY = 'mvptracker-aim-trainer-settings';
const HUB_THEME_STORAGE_KEY = 'mvptracker-aim-hub-theme';
const TIP_KEYS = ['hubTip1', 'hubTip2', 'hubTip3', 'hubTip4', 'hubTip5', 'hubTip6', 'hubTip7'];
const TARGET_COLORS = ['#ff4655', '#4ec9f5', '#3ddc84', '#ffc857', '#9b7bff', '#ffffff'];
const WARMUP_ROUTINE = ['flick', 'tracking', 'micro'];
const TRACKING_MODE_IDS = ['trackingBeginner', 'trackingIntermediate', 'tracking', 'trackingMulti'];
const PATROL_MODE_IDS = ['patrolSlow', 'patrol', 'patrolFast', 'patrolMulti'];
// Ordre des héros tirés au hasard (heroAgents), aligné sur les entrées du
// menu d'accueil — sert à savoir quel portrait afficher pour hoveredNav.
const NAV_KEYS = ['play', 'modes', 'stats', 'settings', 'custom', 'playlists', 'theme'];

function loadConfig() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// Préférence de thème du MENU (pas la config de jeu) : agent au hasard
// (défaut) ou agent fixe choisi une fois pour toutes — persistée pour rester
// stable d'une ouverture à l'autre.
function loadHubThemePref() {
  try {
    const raw = localStorage.getItem(HUB_THEME_STORAGE_KEY);
    if (!raw) return { mode: 'random', agentUuid: null };
    const parsed = JSON.parse(raw);
    return { mode: parsed.mode === 'fixed' ? 'fixed' : 'random', agentUuid: parsed.agentUuid ?? null };
  } catch {
    return { mode: 'random', agentUuid: null };
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
// "Agent fixe").
function HubThemePicker({ pref, agents, onSelectRandom, onSelectFixed, onClose, t }) {
  const [view, setView] = useState(pref.mode === 'fixed' ? 'pick' : 'choice');

  return (
    <div className="custom-config-overlay" onClick={onClose}>
      <div className="custom-config-card tracking-picker-card" onClick={(e) => e.stopPropagation()}>
        <h2>{t('aimTrainer.hubTheme')}</h2>

        {view === 'choice' ? (
          <>
            <p className="label">{t('aimTrainer.themeIntro')}</p>
            <div className="aim-mode-grid">
              <button
                className={pref.mode === 'random' ? 'aim-mode-card active' : 'aim-mode-card'}
                style={{ '--mode-accent': '#4ec9f5' }}
                onMouseEnter={playHoverSfx}
                onClick={() => {
                  playClickSfx();
                  onSelectRandom();
                }}
              >
                <span className="aim-mode-glow" aria-hidden="true" />
                <span className="aim-mode-head">
                  <span className="aim-mode-icon"><Icon icon={Palette} /></span>
                  {pref.mode === 'random' && <span className="aim-mode-crown"><Icon icon={Check} size={14} /></span>}
                </span>
                <span className="aim-mode-name">{t('aimTrainer.themeRandomTitle')}</span>
                <span className="aim-mode-desc">{t('aimTrainer.themeRandomDesc')}</span>
              </button>
              <button
                className={pref.mode === 'fixed' ? 'aim-mode-card active' : 'aim-mode-card'}
                style={{ '--mode-accent': '#ff4655' }}
                onMouseEnter={playHoverSfx}
                onClick={() => {
                  playClickSfx();
                  setView('pick');
                }}
              >
                <span className="aim-mode-glow" aria-hidden="true" />
                <span className="aim-mode-head">
                  <span className="aim-mode-icon"><Icon icon={UserRound} /></span>
                  {pref.mode === 'fixed' && <span className="aim-mode-crown"><Icon icon={Check} size={14} /></span>}
                </span>
                <span className="aim-mode-name">{t('aimTrainer.themeFixedTitle')}</span>
                <span className="aim-mode-desc">{t('aimTrainer.themeFixedDesc')}</span>
              </button>
            </div>
            <div className="custom-config-actions">
              <button className="account-forgot-password" onClick={onClose}>
                {t('aimTrainer.customCancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="label">{t('aimTrainer.themeFixedPickIntro')}</p>
            <div className="aim-mode-grid">
              {agents.map((agent) => (
                <button
                  key={agent.uuid}
                  className={pref.agentUuid === agent.uuid ? 'aim-mode-card active' : 'aim-mode-card'}
                  style={{
                    '--mode-accent': agent.backgroundGradientColors?.[0]
                      ? `#${agent.backgroundGradientColors[0].slice(0, 6)}`
                      : '#8a8f9c',
                  }}
                  onMouseEnter={playHoverSfx}
                  onClick={() => {
                    playClickSfx();
                    onSelectFixed(agent.uuid);
                  }}
                >
                  <span className="aim-mode-glow" aria-hidden="true" />
                  <span className="aim-mode-head">
                    <span className="aim-mode-icon"><img src={agent.displayIcon} alt="" className="aim-theme-agent-icon" /></span>
                    {pref.agentUuid === agent.uuid && <span className="aim-mode-crown"><Icon icon={Check} size={14} /></span>}
                  </span>
                  <span className="aim-mode-name">{agent.displayName}</span>
                </button>
              ))}
            </div>
            <div className="custom-config-actions">
              <button className="account-forgot-password" onClick={() => setView('choice')}>
                {t('aimTrainer.customCancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
function HubProfileChip({ avatarIcon, name, tag, currentTier, onClick, t }) {
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
function NavListItem({ icon, label, hint, active, onHover, onClick }) {
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
        <span className="aim-hub-nav-item-label">{label}</span>
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
          {dailyBoard.slice(0, 3).map((row, i) => (
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
            {t('aimTrainer.progressMeta', {
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
function MapSlideshow({ maps }) {
  const [index, setIndex] = useState(0);

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
      {maps.map((map, i) => (
        <img
          key={map.uuid}
          className={i === index ? 'aim-hub-map-slide active' : 'aim-hub-map-slide'}
          src={map.splash}
          alt=""
        />
      ))}
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
  const { t } = useTranslation();
  const myId = initialRawConfig?.userId ?? null;
  const apiKey = initialRawConfig?.apiKey ?? null;
  const riotName = initialRawConfig?.name ?? null;
  const riotTag = initialRawConfig?.tag ?? null;
  const rankInfo = initialRawConfig?.rank ?? null;
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
  const [hubThemePref, setHubThemePref] = useState(loadHubThemePref);
  const heroAgents = useMemo(() => {
    if (!agents.length) return [];
    if (hubThemePref.mode === 'fixed') {
      const fixed = agents.find((a) => a.uuid === hubThemePref.agentUuid);
      // Agent fixe pas encore choisi (ou plus dans le catalogue) : on retombe
      // sur le premier agent de la liste plutôt que de casser l'affichage.
      const picked = fixed ?? agents[0];
      return NAV_KEYS.map(() => picked);
    }
    const shuffled = [...agents].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, NAV_KEYS.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.length, hubThemePref.mode, hubThemePref.agentUuid]);
  const [screen, setScreen] = useState('menu'); // menu | modes | stats | settings
  // Quel héros (parmi heroAgents) sert de fond à l'accueil : change au survol
  // d'une entrée du menu plutôt que d'afficher les 4 en même temps — un seul
  // point focal à la fois, moins statique qu'une grille figée.
  const [hoveredNav, setHoveredNav] = useState('play');
  const activeHeroAgent = heroAgents[NAV_KEYS.indexOf(hoveredNav)] ?? null;
  // La couleur d'accent suit l'agent AFFICHÉ (activeHeroAgent), pas un agent
  // fixe — sinon le fond change au survol mais le thème (bouton Jouer, barre
  // active du menu, badges...) reste figé sur la couleur du premier agent.
  const hubAccent = activeHeroAgent?.backgroundGradientColors?.[0]
    ? `#${activeHeroAgent.backgroundGradientColors[0].slice(0, 6)}`
    : null;
  const [playing, setPlaying] = useState(false);
  const [launchConfig, setLaunchConfig] = useState(null);
  const [exiting, setExiting] = useState(false);

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
  const [showThemePicker, setShowThemePicker] = useState(false);

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
  const selectMode = (id) => setConfig((prev) => ({ ...prev, mode: id, ...MODES[id].preset }));

  const launch = useCallback(
    (extra = {}) => {
      playConfirmSfx();
      setLaunchConfig({ ...config, ...extra, userId: myId });
      // Léger délai pour laisser le bruitage de confirmation se faire
      // entendre et le fondu de sortie du menu s'amorcer avant de basculer.
      setTimeout(() => setPlaying(true), 120);
    },
    [config, myId],
  );

  const exitGame = useCallback(() => {
    setPlaying(false);
    setLaunchConfig(null);
    setScreen('menu');
    refresh();
  }, [refresh]);

  const navigate = (next) => {
    playClickSfx();
    setScreen(next);
  };

  const goBack = () => {
    playBackSfx();
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
  const challengeDone = dailyBoard.some((row) => row.user_id === myId);
  const activeModeLabel = MODES[config.mode] ? t(MODES[config.mode].labelKey) : t('aimTrainer.customTitle');
  const activeModeAccent = MODES[config.mode]?.accent ?? '#8a8f9c';
  const progression = useMemo(() => {
    const rows = history.filter((row) => row.mode === config.mode).slice(0, 20).reverse();
    return rows.map((row) => row.score);
  }, [history, config.mode]);
  const allModeEntries = useMemo(
    () => Object.entries(MODES).filter(([id]) => !TRACKING_MODE_IDS.includes(id) && !PATROL_MODE_IDS.includes(id)),
    [],
  );
  const isTrackingActive = TRACKING_MODE_IDS.includes(config.mode);
  const isPatrolActive = PATROL_MODE_IDS.includes(config.mode);
  const recordsCount = useMemo(
    () => Object.keys(personalBests).filter((id) => globalBests[id] !== undefined && personalBests[id] >= globalBests[id]).length,
    [personalBests, globalBests],
  );

  if (playing && launchConfig) {
    return <AimTrainerGame config={launchConfig} onExit={exitGame} />;
  }

  return (
    <div
      className={exiting ? 'aim-hub-root aim-hub-exiting' : 'aim-hub-root'}
      style={hubAccent ? { '--hub-accent': hubAccent } : undefined}
    >
      <div className="aim-hub-fade-veil" aria-hidden="true" />

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
        {screen === 'menu' && (
          <div className="aim-hub-home">
            <MapSlideshow maps={maps} />

            <div className="aim-hub-home-bg" aria-hidden="true">
              {heroAgents.map((agent, i) => (
                <img
                  key={agent.uuid}
                  className={NAV_KEYS[i] === hoveredNav ? 'aim-hub-bg-portrait active' : 'aim-hub-bg-portrait'}
                  src={agent.fullPortrait}
                  alt=""
                />
              ))}
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
                  icon={Wrench}
                  label={t('aimTrainer.customTitle')}
                  hint={t('aimTrainer.customDesc')}
                  active={hoveredNav === 'custom'}
                  onHover={() => setHoveredNav('custom')}
                  onClick={() => setShowCustomConfig(true)}
                />
                <NavListItem
                  icon={ListMusic}
                  label={t('aimTrainer.playlistsTitle')}
                  hint={t('aimTrainer.playlistsIntro')}
                  active={hoveredNav === 'playlists'}
                  onHover={() => setHoveredNav('playlists')}
                  onClick={() => setShowPlaylistManager(true)}
                />
                <NavListItem
                  icon={Palette}
                  label={t('aimTrainer.hubTheme')}
                  hint={t(hubThemePref.mode === 'fixed' ? 'aimTrainer.themeFixedTitle' : 'aimTrainer.themeRandomTitle')}
                  active={hoveredNav === 'theme'}
                  onHover={() => setHoveredNav('theme')}
                  onClick={() => setShowThemePicker(true)}
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
              <HomeProgressCard modeLabel={activeModeLabel} accent={activeModeAccent} progression={progression} t={t} />
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

        {screen === 'modes' && (
          <div className="aim-hub-panel">
            <h2>{t('aimTrainer.modeSection')}</h2>
            <div className="aim-mode-grid">
              {allModeEntries.map(([id, mode]) => (
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
              <button className="account-forgot-password" onClick={() => launch({ playlist: WARMUP_ROUTINE })}>
                {t('aimTrainer.warmupRoutine')}
              </button>
            </div>
          </div>
        )}

        {screen === 'stats' && (
          <div className="aim-hub-panel">
            <h2>{t('aimTrainer.hubStats')}</h2>

            <div className="aim-top-row">
              <div className="card aim-challenge-card">
                <span className="aim-challenge-badge">{t('aimTrainer.dailyChallenge')}</span>
                <h3>
                  <Icon icon={MODES[challenge.mode].icon} /> {t(MODES[challenge.mode].labelKey)}
                </h3>
                <p className="label">
                  {t('aimTrainer.challengeSetup', {
                    seconds: challenge.duration,
                    size: challenge.targetSize.toFixed(2),
                    count: challenge.targetCount,
                  })}
                </p>
                <button
                  className="refresh aim-challenge-btn"
                  onClick={() =>
                    launch({
                      ...challenge,
                      challengeDate: challenge.dateKey,
                      dpi: config.dpi,
                      sens: config.sens,
                      fov: config.fov,
                    })
                  }
                >
                  {challengeDone ? t('aimTrainer.retryChallenge') : t('aimTrainer.playChallenge')}
                </button>
                {dailyBoard.length > 0 && (
                  <div className="aim-board">
                    <h4 className="account-subsection-title">{t('aimTrainer.todayRanking')}</h4>
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
              </div>

              <div className="card aim-streak-card">
                <span className="aim-streak-flame"><Icon icon={streak > 0 ? Flame : Snowflake} /></span>
                <span className="aim-streak-value">{streak}</span>
                <span className="aim-streak-label">{t('aimTrainer.streakLabel', { count: streak })}</span>
                <p className="label aim-streak-hint">
                  {streak > 0 ? t('aimTrainer.streakKeep') : t('aimTrainer.streakStart')}
                </p>
              </div>
            </div>

            <div className="aim-bottom-row">
              <div className="card">
                <h4 className="account-subsection-title">{t('aimTrainer.progressTitle', { mode: activeModeLabel })}</h4>
                {progression.length < 2 ? (
                  <p className="label">{t('aimTrainer.progressNotEnough')}</p>
                ) : (
                  <>
                    <ProgressionChart scores={progression} accent={activeModeAccent} />
                    <p className="label">
                      {t('aimTrainer.progressMeta', {
                        count: progression.length,
                        best: Math.max(...progression),
                        last: progression[progression.length - 1],
                      })}
                    </p>
                  </>
                )}
              </div>

              <div className="card">
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
              </div>
            </div>
          </div>
        )}

        {screen === 'settings' && (
          <div className="aim-hub-panel">
            <h2>{t('aimTrainer.hubSettings')}</h2>
            <div className="aim-config-grid">
              <div className="aim-config-block">
                <h4 className="account-subsection-title">{t('aimTrainer.sensSection')}</h4>
                <label className="aim-trainer-setting">
                  <span className="label">{t('aimTrainer.dpiLabel')}</span>
                  <input type="number" value={config.dpi} onChange={(e) => set({ dpi: Number(e.target.value) || 0 })} />
                </label>
                <label className="aim-trainer-setting">
                  <span className="label">{t('aimTrainer.sensLabel')}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={config.sens}
                    onChange={(e) => set({ sens: Number(e.target.value) || 0 })}
                  />
                </label>
                <p className="label aim-config-readout">
                  {t('aimTrainer.edpiReadout', {
                    edpi: edpi.toFixed(0),
                    cm: distance === null ? '—' : distance.toFixed(1),
                  })}
                </p>
              </div>

              <div className="aim-config-block">
                <h4 className="account-subsection-title">{t('aimTrainer.targetsSection')}</h4>
                <div className="aim-config-colors">
                  <span className="label">{t('aimTrainer.targetColorLabel')}</span>
                  <div className="aim-color-swatches">
                    {TARGET_COLORS.map((color) => (
                      <button
                        key={color}
                        className={color === config.targetColor ? 'aim-color-swatch active' : 'aim-color-swatch'}
                        style={{ background: color }}
                        onClick={() => set({ targetColor: color })}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="aim-config-block">
                <h4 className="account-subsection-title">{t('aimTrainer.displaySection')}</h4>
                <label className="aim-config-range">
                  <span className="label">{t('aimTrainer.fovLabel', { fov: config.fov })}</span>
                  <input
                    type="range"
                    min="70"
                    max="120"
                    value={config.fov}
                    onChange={(e) => set({ fov: Number(e.target.value) })}
                  />
                </label>
                <label className="aim-config-check">
                  <input type="checkbox" checked={config.showWeapon} onChange={(e) => set({ showWeapon: e.target.checked })} />
                  <span>{t('aimTrainer.showWeaponLabel')}</span>
                </label>
                <label className="aim-config-check">
                  <input
                    type="checkbox"
                    checked={config.theme === 'dark'}
                    onChange={(e) => set({ theme: e.target.checked ? 'dark' : 'day' })}
                  />
                  <span>{t('aimTrainer.darkThemeLabel')}</span>
                </label>
                <button className="account-forgot-password" onClick={() => setConfig({ ...DEFAULT_CONFIG })}>
                  {t('aimTrainer.resetDefaults')}
                </button>
              </div>

              <div className="aim-config-block">
                <h4 className="account-subsection-title">{t('aimTrainer.crosshairSection')}</h4>
                {crosshairs.length === 0 ? (
                  <p className="label">{t('aimTrainer.crosshairEmpty')}</p>
                ) : (
                  <div className="aim-crosshair-picker">
                    <button
                      className={config.crosshairCode ? 'aim-crosshair-option' : 'aim-crosshair-option active'}
                      onClick={() => set({ crosshairCode: null })}
                      title={t('aimTrainer.crosshairDefault')}
                    >
                      <div className="aim-trainer-crosshair-static-preview" />
                    </button>
                    {crosshairs.map((ch) => (
                      <button
                        key={ch.id}
                        className={config.crosshairCode === ch.code ? 'aim-crosshair-option active' : 'aim-crosshair-option'}
                        onClick={() => set({ crosshairCode: ch.code })}
                        title={ch.name}
                      >
                        <CrosshairPreview code={ch.code} bare size={40} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="label" style={{ marginTop: '0.75rem' }}>{t('aimTrainer.accuracyNote')}</p>
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

      {showThemePicker && (
        <HubThemePicker
          pref={hubThemePref}
          agents={agents}
          onSelectRandom={() => {
            const next = { mode: 'random', agentUuid: null };
            setHubThemePref(next);
            localStorage.setItem(HUB_THEME_STORAGE_KEY, JSON.stringify(next));
            setShowThemePicker(false);
          }}
          onSelectFixed={(agentUuid) => {
            const next = { mode: 'fixed', agentUuid };
            setHubThemePref(next);
            localStorage.setItem(HUB_THEME_STORAGE_KEY, JSON.stringify(next));
            setShowThemePicker(false);
          }}
          onClose={() => setShowThemePicker(false)}
          t={t}
        />
      )}
    </div>
  );
}

export default AimTrainerHub;
