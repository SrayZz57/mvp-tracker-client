import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, Snowflake, Crown, Wrench, ListMusic, HelpCircle } from 'lucide-react';
import { DEFAULT_CONFIG, MODES } from './AimTrainerGame.jsx';
import Icon from './Icon.jsx';
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
import { computeTrainingImpact } from './aimCorrelation.js';
import PlatformFilterToggle from './PlatformFilterToggle.jsx';
import usePlatformFilter from './usePlatformFilter.js';
import CustomModeConfig from './CustomModeConfig.jsx';
import PlaylistManager from './PlaylistManager.jsx';
import AimLeaderboardRow from './AimLeaderboardRow.jsx';
import CollapsibleCard from './CollapsibleCard.jsx';
import CrosshairPreview from './CrosshairPreview.jsx';
import { supabase } from './supabaseClient.js';

const SETTINGS_STORAGE_KEY = 'mvptracker-aim-trainer-settings';
const TUTORIAL_SEEN_KEY = 'mvptracker-aim-trainer-tutorial-seen';

const TARGET_COLORS = ['#ff4655', '#4ec9f5', '#3ddc84', '#ffc857', '#9b7bff', '#ffffff'];

// Le nombre de colonnes de la grille dépend de la largeur de fenêtre (grid
// auto-fill) : une pagination à taille fixe laissait une dernière ligne
// très clairsemée en plein écran large (ex. 3 cartes + bouton sur une ligne
// qui en contient 9). Tous les modes tiennent sans problème en une ou deux
// lignes complètes selon la largeur — plus besoin de les cacher.

// Routine d'échauffement : trois modes complémentaires enchaînés, à lancer
// avant une session de jeu (visée sèche, suivi, puis précision fine).
const WARMUP_ROUTINE = ['flick', 'tracking', 'micro'];

function loadConfig() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// cm/360 : la distance physique à parcourir avec la souris pour faire un tour
// complet. C'est la vraie référence entre joueurs (l'eDPI seul ne dit rien
// sans le yaw du jeu). Formule officielle Valorant.
function cm360(dpi, sens) {
  if (!dpi || !sens) return null;
  return (2.54 * 360) / (dpi * sens * 0.07);
}

// Fenêtre de choix pour un groupe de modes consolidés en une seule tuile
// (Tracking, Patrol...) — reprend exactement les mêmes cartes que la grille
// principale, juste côte à côte dans une fenêtre à part plutôt que 4
// emplacements dans la grille (demandé sur Discord).
function ModeGroupPicker({ titleKey, descKey, modeIds, activeModeId, personalBests, globalBests, onSelect, onLaunch, onClose, t }) {
  return (
    <div className="custom-config-overlay" onClick={onClose}>
      <div className="custom-config-card tracking-picker-card" onClick={(e) => e.stopPropagation()}>
        <h2>{t(titleKey)}</h2>
        <p className="label">{t(descKey)}</p>
        <div className="aim-mode-grid">
          {modeIds.map((id) => {
            const mode = MODES[id];
            const personal = personalBests[id];
            const global = globalBests[id];
            const holdsRecord = personal !== undefined && global !== undefined && personal >= global;
            return (
              <button
                key={id}
                className={id === activeModeId ? 'aim-mode-card active' : 'aim-mode-card'}
                style={{ '--mode-accent': mode.accent }}
                onClick={() => onSelect(id)}
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
          })}
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

// Demandé après plusieurs retours Discord : beaucoup d'utilisateurs
// n'ouvraient jamais la carte "Comment ça marche" (repliable, en haut de
// l'onglet) et ne savaient donc pas comment lancer une session ni régler
// leur sensibilité pour qu'elle corresponde à Valorant. Un vrai popup à la
// première visite de l'onglet force ces deux points à être vus au moins une
// fois, plutôt que de compter sur une carte qu'on peut ignorer.
function AimTrainerTutorialModal({ onClose, t }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('detail.close')}</button>
        <h3>{t('aimTrainer.tutorialTitle')}</h3>
        <p className="label">{t('aimTrainer.tutorialIntro')}</p>

        <div className="aim-howto-steps">
          <div className="aim-howto-step">
            <span className="aim-howto-num">1</span>
            <div>
              <strong>{t('aimTrainer.tutorialSensTitle')}</strong>
              <span className="label">{t('aimTrainer.tutorialSensText')}</span>
            </div>
          </div>
          <div className="aim-howto-step">
            <span className="aim-howto-num">2</span>
            <div>
              <strong>{t('aimTrainer.tutorialLaunchTitle')}</strong>
              <span className="label">{t('aimTrainer.tutorialLaunchText')}</span>
            </div>
          </div>
        </div>

        <button className="refresh" onClick={onClose} style={{ marginTop: '1rem' }}>
          {t('aimTrainer.tutorialGotIt')}
        </button>
      </div>
    </div>
  );
}

function AimTrainer({ myId, matches, settings, apiKey }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState(loadConfig);
  const [personalBests, setPersonalBests] = useState({});
  const [globalBests, setGlobalBests] = useState({});
  const [history, setHistory] = useState([]);
  const [dailyBoard, setDailyBoard] = useState([]);
  const [friendsBoard, setFriendsBoard] = useState([]);
  const [showCustomConfig, setShowCustomConfig] = useState(false);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  const [crosshairs, setCrosshairs] = useState([]);
  // Statut d'amitié envers chaque joueur croisé dans les classements —
  // chargé une fois (pas par ligne survolée) pour savoir quel bouton
  // proposer dans la carte au survol (voir AimLeaderboardRow.jsx).
  const [friendStatusByUser, setFriendStatusByUser] = useState({});
  const [showTutorial, setShowTutorial] = useState(false);

  const challenge = useMemo(() => buildDailyChallenge(todayKey()), []);

  // Affiché une seule fois par compte, à la toute première ouverture de
  // l'onglet — voir le commentaire sur AimTrainerTutorialModal ci-dessus.
  useEffect(() => {
    if (!myId) return;
    const storageKey = `${TUTORIAL_SEEN_KEY}:${myId}`;
    if (!localStorage.getItem(storageKey)) {
      setShowTutorial(true);
      localStorage.setItem(storageKey, '1');
    }
  }, [myId]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // Données rechargées à l'ouverture de l'onglet ET à la fermeture de la
  // fenêtre de jeu : une session qui vient d'être jouée doit se voir ici
  // immédiatement, sans redémarrer l'app ni changer d'onglet.
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
    return window.electronAPI.onAimTrainerClosed(refresh);
  }, [refresh]);

  // Bibliothèque de crosshairs (compte lié) : sert au sélecteur dans les
  // réglages d'affichage, pour viser avec sa vraie croix Valorant plutôt que
  // la croix par défaut de l'Aim Trainer.
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
      loadFriendStatuses(); // remet le vrai statut si l'insertion a échoué
    }
  };

  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }));

  // Choisir un mode applique ses valeurs recommandées (nombre/taille des
  // cibles, dispersion) — elles restent modifiables ensuite à la main.
  const selectMode = (id) => setConfig((prev) => ({ ...prev, mode: id, ...MODES[id].preset }));

  const launch = (extra = {}) => window.electronAPI.openAimTrainer({ ...config, ...extra, userId: myId });

  const distance = cm360(config.dpi, config.sens);
  const edpi = config.dpi * config.sens;
  const streak = useMemo(() => computeStreak(history), [history]);
  const challengeDone = dailyBoard.some((row) => row.user_id === myId);

  // L'Aim Trainer ne se joue que sur PC (mini-jeu 3D dans l'app) — corréler
  // ses sessions à des matchs Valorant joués sur console n'aurait aucun sens.
  // Filtre par défaut sur "pc" quand les deux plateformes sont détectées.
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches, 'pc');
  const impact = useMemo(
    () => (settings?.name ? computeTrainingImpact(history, filteredMatches, settings.name, settings.tag) : null),
    [history, filteredMatches, settings?.name, settings?.tag],
  );

  // Courbe de progression : scores du mode sélectionné, du plus ancien au
  // plus récent, plafonnée aux 20 dernières séances pour rester lisible.
  const progression = useMemo(() => {
    const rows = history.filter((row) => row.mode === config.mode).slice(0, 20).reverse();
    return rows.map((row) => row.score);
  }, [history, config.mode]);

  // Le mode Personnalisé n'existe pas dans MODES (volontairement — jamais
  // proposé en défi du jour ni comparé dans les records), donc pas d'icône
  // ni de nom à y récupérer.
  const activeModeLabel = MODES[config.mode] ? t(MODES[config.mode].labelKey) : t('aimTrainer.customTitle');
  const activeModeAccent = MODES[config.mode]?.accent ?? '#8a8f9c';

  // Demandé sur Discord : une seule tuile "Tracking" plutôt que 4 séparées
  // (Débutant/Intermédiaire/Pro/Multi) — cliquer dessus ouvre un choix de
  // palier au lieu d'encombrer la grille de 4 cartes quasi identiques.
  const TRACKING_MODE_IDS = ['trackingBeginner', 'trackingIntermediate', 'tracking', 'trackingMulti'];
  // Même principe pour Patrol, demandé sur Discord juste après le mode de
  // base : 4 paliers (Lent/Moyen/Rapide/Multi) consolidés en une tuile.
  const PATROL_MODE_IDS = ['patrolSlow', 'patrol', 'patrolFast', 'patrolMulti'];
  const [showTrackingPicker, setShowTrackingPicker] = useState(false);
  const [showPatrolPicker, setShowPatrolPicker] = useState(false);
  const allModeEntries = useMemo(
    () => Object.entries(MODES).filter(([id]) => !TRACKING_MODE_IDS.includes(id) && !PATROL_MODE_IDS.includes(id)),
    [],
  );
  const isTrackingActive = TRACKING_MODE_IDS.includes(config.mode);
  const isPatrolActive = PATROL_MODE_IDS.includes(config.mode);

  return (
    <div>
      {/* --- Comment ça marche --------------------------------------------- */}
      <CollapsibleCard
        id="aimTrainer.howto"
        title={t('aimTrainer.howtoTitle')}
        className="aim-howto-card"
        headerExtra={
          <button type="button" className="hof-suggest-button" onClick={() => setShowTutorial(true)}>
            <Icon icon={HelpCircle} size={14} /> {t('aimTrainer.tutorialReplay')}
          </button>
        }
      >
        <p className="label">{t('aimTrainer.howtoIntro')}</p>

        <div className="aim-howto-steps">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="aim-howto-step">
              <span className="aim-howto-num">{n}</span>
              <div>
                <strong>{t(`aimTrainer.howtoStep${n}Title`)}</strong>
                <span className="label">{t(`aimTrainer.howtoStep${n}Text`)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="aim-controls">
          <span className="aim-control">
            <kbd>{t('aimTrainer.controlMouse')}</kbd> {t('aimTrainer.controlAim')}
          </span>
          <span className="aim-control">
            <kbd>{t('aimTrainer.controlClick')}</kbd> {t('aimTrainer.controlShoot')}
          </span>
          <span className="aim-control">
            <kbd>Échap</kbd> {t('aimTrainer.controlPause')}
          </span>
        </div>
      </CollapsibleCard>

      {/* --- Défi du jour + série ------------------------------------------ */}
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
                // La sensibilité reste celle du joueur : le défi porte sur la
                // difficulté des cibles, pas sur une config souris imposée.
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
          <button className="account-forgot-password" onClick={() => launch({ playlist: WARMUP_ROUTINE })}>
            {t('aimTrainer.warmupRoutine')}
          </button>
        </div>
      </div>

      {/* --- Aim Trainer : mode, réglages, lancement ------------------------- */}
      <div className="card">
        <h3>{t('aimTrainer.title')}</h3>
        <p className="label">{t('aimTrainer.hint')}</p>

        <h4 className="account-subsection-title">{t('aimTrainer.modeSection')}</h4>
        <div className="aim-mode-grid">
          {allModeEntries.map(([id, mode]) => {
            const personal = personalBests[id];
            const global = globalBests[id];
            const holdsRecord = personal !== undefined && global !== undefined && personal >= global;
            return (
              <button
                key={id}
                className={id === config.mode ? 'aim-mode-card active' : 'aim-mode-card'}
                style={{ '--mode-accent': mode.accent }}
                onClick={() => selectMode(id)}
                // Double-clic : lance directement, sans passer par le bouton
                // "Lancer" — utilise le preset du mode explicitement plutôt
                // que `config` (mis à jour par selectMode juste avant, mais
                // setState est asynchrone : `config` ne serait pas encore à
                // jour si on lisait juste l'état ici).
                onDoubleClick={() => {
                  selectMode(id);
                  launch({ mode: id, ...mode.preset });
                }}
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
          })}

          {/* Tuile unique pour les 4 paliers de Tracking — cliquer ouvre un
              choix plutôt que d'occuper 4 emplacements dans la grille. */}
          <button
            className={isTrackingActive ? 'aim-mode-card active' : 'aim-mode-card'}
            style={{ '--mode-accent': MODES.tracking.accent }}
            onClick={() => setShowTrackingPicker(true)}
          >
            <span className="aim-mode-glow" aria-hidden="true" />
            <span className="aim-mode-head">
              <span className="aim-mode-icon"><Icon icon={MODES.tracking.icon} /></span>
            </span>
            <span className="aim-mode-name">{t('aimTrainer.modes.trackingGroup')}</span>
            <span className="aim-mode-desc">{t('aimTrainer.modes.trackingGroupDesc')}</span>
          </button>

          {/* Tuile unique pour les 4 paliers de Patrol — même principe. */}
          <button
            className={isPatrolActive ? 'aim-mode-card active' : 'aim-mode-card'}
            style={{ '--mode-accent': MODES.patrol.accent }}
            onClick={() => setShowPatrolPicker(true)}
          >
            <span className="aim-mode-glow" aria-hidden="true" />
            <span className="aim-mode-head">
              <span className="aim-mode-icon"><Icon icon={MODES.patrol.icon} /></span>
            </span>
            <span className="aim-mode-name">{t('aimTrainer.modes.patrolGroup')}</span>
            <span className="aim-mode-desc">{t('aimTrainer.modes.patrolGroupDesc')}</span>
          </button>

          {/* Seul mode aux réglages libres — volontairement à part des 6
              autres : ceux-là doivent rester identiques pour tout le monde,
              sinon comparer les records n'a aucun sens. */}
          <button
            className={config.mode === 'custom' ? 'aim-mode-card active' : 'aim-mode-card'}
            style={{ '--mode-accent': '#8a8f9c' }}
            onClick={() => setShowCustomConfig(true)}
          >
            <span className="aim-mode-glow" aria-hidden="true" />
            <span className="aim-mode-head">
              <span className="aim-mode-icon"><Icon icon={Wrench} /></span>
            </span>
            <span className="aim-mode-name">{t('aimTrainer.customTitle')}</span>
            <span className="aim-mode-desc">{t('aimTrainer.customDesc')}</span>
          </button>

          {/* Lance directement une SESSION (pas juste un réglage) : contrairement
              aux autres tuiles, cliquer ici ne change pas config.mode — la
              playlist choisie pilote toute la session dès l'ouverture de la
              fenêtre de jeu (voir launchPlaylist ci-dessous). */}
          <button
            className="aim-mode-card"
            style={{ '--mode-accent': '#4ec9f5' }}
            onClick={() => setShowPlaylistManager(true)}
          >
            <span className="aim-mode-glow" aria-hidden="true" />
            <span className="aim-mode-head">
              <span className="aim-mode-icon"><Icon icon={ListMusic} /></span>
            </span>
            <span className="aim-mode-name">{t('aimTrainer.playlistsTitle')}</span>
            <span className="aim-mode-desc">{t('aimTrainer.playlistsIntro')}</span>
          </button>
        </div>

        {/* Résumé en lecture seule : les 6 modes standards sont figés (mêmes
            réglages pour tout le monde), et même le mode Personnalisé ne se
            règle que dans sa fenêtre dédiée, pas ici. */}
        <div className="aim-mode-summary">
          <span className="aim-mode-summary-item">{t('aimTrainer.summaryDuration', { seconds: config.duration })}</span>
          <span className="aim-mode-summary-item">{t('aimTrainer.summaryCount', { count: config.targetCount })}</span>
          <span className="aim-mode-summary-item">{t('aimTrainer.summarySize', { size: config.targetSize.toFixed(2) })}</span>
          <span className="aim-mode-summary-item">{t('aimTrainer.summarySpread', { deg: config.spread })}</span>
          {config.mode === 'custom' && (
            <button className="account-forgot-password" onClick={() => setShowCustomConfig(true)}>
              {t('aimTrainer.customEdit')}
            </button>
          )}
        </div>

        <div className="aim-config-grid">
          <div className="aim-config-block">
            <h4 className="account-subsection-title">{t('aimTrainer.sensSection')}</h4>
            <label className="aim-trainer-setting">
              <span className="label">{t('aimTrainer.dpiLabel')}</span>
              <input
                type="number"
                value={config.dpi}
                onChange={(e) => set({ dpi: Number(e.target.value) || 0 })}
              />
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
              <input
                type="checkbox"
                checked={config.showWeapon}
                onChange={(e) => set({ showWeapon: e.target.checked })}
              />
              <span>{t('aimTrainer.showWeaponLabel')}</span>
            </label>
            {/* Suggéré sur Discord : une salle sombre plutôt que le ciel
                bleu/sol clair par défaut, pour s'entraîner sans distraction
                visuelle. Version simple pour l'instant (teintes assombries,
                pas encore un vrai plafond) — voir DEFAULT_CONFIG.theme. */}
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

        <div className="aim-launch-row">
          <button className="refresh aim-launch-btn" onClick={() => launch()}>
            {t('aimTrainer.launch')}
          </button>
          <p className="label">{t('aimTrainer.launchHint')}</p>
        </div>

        <p className="label" style={{ marginTop: '0.75rem' }}>{t('aimTrainer.accuracyNote')}</p>
      </div>

      {/* --- Impact sur les vraies parties ---------------------------------- */}
      {impact && (
        <CollapsibleCard id="aimTrainer.impact" title={t('aimTrainer.impactTitle')}>
          <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />
          {!impact.ready ? (
            <p className="label">
              {t('aimTrainer.impactNotReady', {
                trained: impact.trainedGames,
                untrained: impact.untrainedGames,
                needed: impact.needed,
              })}
            </p>
          ) : (
            <>
              <p className="label">{t('aimTrainer.impactHint')}</p>
              <div className="aim-impact-grid">
                {[
                  { key: 'hsPercent', label: t('aimTrainer.impactHs'), suffix: '%', decimals: 1 },
                  { key: 'kd', label: t('aimTrainer.impactKd'), suffix: '', decimals: 2 },
                  { key: 'winrate', label: t('aimTrainer.impactWinrate'), suffix: '%', decimals: 0 },
                ].map(({ key, label, suffix, decimals }) => {
                  const delta = impact.deltas[key];
                  if (delta === null) return null;
                  const positive = delta >= 0;
                  return (
                    <div key={key} className="aim-impact-tile">
                      <span className={positive ? 'aim-impact-delta up' : 'aim-impact-delta down'}>
                        {positive ? '+' : ''}
                        {delta.toFixed(decimals)}
                        {suffix}
                      </span>
                      <span className="aim-impact-label">{label}</span>
                      <span className="aim-impact-detail">
                        {impact.trained[key] === null ? '—' : impact.trained[key].toFixed(decimals)}
                        {suffix} vs {impact.untrained[key] === null ? '—' : impact.untrained[key].toFixed(decimals)}
                        {suffix}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="label aim-impact-footnote">
                {t('aimTrainer.impactFootnote', {
                  trained: impact.trained.games,
                  untrained: impact.untrained.games,
                })}
              </p>
            </>
          )}
        </CollapsibleCard>
      )}

      {/* --- Progression + classement amis, sur le mode sélectionné --------- */}
      <div className="aim-bottom-row">
        <CollapsibleCard id="aimTrainer.progression" title={t('aimTrainer.progressTitle', { mode: activeModeLabel })}>
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
        </CollapsibleCard>

        <CollapsibleCard id="aimTrainer.friendsBoard" title={t('aimTrainer.friendsTitle')}>
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
        </CollapsibleCard>
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

      {showTutorial && <AimTrainerTutorialModal t={t} onClose={() => setShowTutorial(false)} />}
    </div>
  );
}

// Courbe de progression : SVG minimal, pas de librairie de graphiques pour si
// peu (une polyligne et quelques points suffisent).
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

export default AimTrainer;
