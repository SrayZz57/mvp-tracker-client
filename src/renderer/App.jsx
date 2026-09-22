import { useEffect, useLayoutEffect, useRef, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  AlarmClock,
  Flame,
  Brain,
  Handshake,
  TrendingUp,
  Trophy,
  Gem,
  Angry,
  Signal,
  Clapperboard,
  Target,
  Map,
  Puzzle as PuzzleIcon,
  Wallet,
  BookOpen,
  Shield,
  User,
  MessageCircle,
  Users,
  LogOut,
  ChevronDown,
  History,
  Search,
  Compass,
  Video,
  Film,
  Swords,
  Settings,
  FileCheck,
  Sparkles,
  Bell,
  Send,
} from 'lucide-react';
import Icon from './Icon.jsx';
import useValorantData from './useValorantData.js';
import { useCollapsedBlocks } from './CollapsedBlocksContext.jsx';
import { useE2EE } from './E2EEContext.jsx';
// Onglets chargés à la demande (React.lazy) plutôt qu'au démarrage — tous
// réunis derrière un seul Suspense autour de renderValorantTab() plus bas.
// L'app entière tenait auparavant dans un seul bloc de ~2,1 Mo évalué au
// lancement (Aim Trainer/three.js, éditeur de stratégie/fabric.js compris,
// même si l'utilisateur ne les ouvre jamais dans la session) — signalé comme
// lent au démarrage, y compris dans l'app packagée, pas juste en dev.
const StatsTab = lazy(() => import('./tabs/StatsTab.jsx'));
const WeaknessTab = lazy(() => import('./tabs/WeaknessTab.jsx'));
const FormTab = lazy(() => import('./tabs/FormTab.jsx'));
const NetworkTab = lazy(() => import('./tabs/NetworkTab.jsx'));
const TiltTab = lazy(() => import('./tabs/TiltTab.jsx'));
const CrosshairsTab = lazy(() => import('./tabs/CrosshairsTab.jsx'));
const StrategyTab = lazy(() => import('./tabs/StrategyTab.jsx'));
const SkinsTab = lazy(() => import('./tabs/SkinsTab.jsx'));
const MySkinsCollectionTab = lazy(() => import('./tabs/MySkinsCollectionTab.jsx'));
const HeatmapTab = lazy(() => import('./tabs/HeatmapTab.jsx'));
const AnalyseTab = lazy(() => import('./tabs/AnalyseTab.jsx'));
const CompositionTab = lazy(() => import('./tabs/CompositionTab.jsx'));
const HallOfFameTab = lazy(() => import('./tabs/HallOfFameTab.jsx'));
const PerformanceChartsTab = lazy(() => import('./tabs/PerformanceChartsTab.jsx'));
const TeammatesRivalsTab = lazy(() => import('./tabs/TeammatesRivalsTab.jsx'));
const BuySimulatorTab = lazy(() => import('./tabs/BuySimulatorTab.jsx'));
const PlaySessionsTab = lazy(() => import('./tabs/PlaySessionsTab.jsx'));
const SessionGuideTab = lazy(() => import('./tabs/SessionGuideTab.jsx'));
const AimTrainerTab = lazy(() => import('./tabs/AimTrainerTab.jsx'));
const WikiTab = lazy(() => import('./tabs/WikiTab.jsx'));
const LineupsTab = lazy(() => import('./tabs/LineupsTab.jsx'));
const TeamListingsTab = lazy(() => import('./tabs/TeamListingsTab.jsx'));
const ClipsTab = lazy(() => import('./tabs/ClipsTab.jsx'));
const AccountPage = lazy(() => import('./AccountPage.jsx'));
const SettingsPage = lazy(() => import('./SettingsPage.jsx'));
const AdminPage = lazy(() => import('./AdminPage.jsx'));
const TermsAcceptancesPanel = lazy(() => import('./TermsAcceptancesPanel.jsx'));
const AdminNotificationComposer = lazy(() => import('./AdminNotificationComposer.jsx'));
const TournamentsTab = lazy(() => import('./tabs/TournamentsTab.jsx'));
const MessagesTab = lazy(() => import('./tabs/MessagesTab.jsx'));
const FriendsTab = lazy(() => import('./tabs/FriendsTab.jsx'));

import GoalsWidget from './GoalsWidget.jsx';
import WeeklyRecapCard from './WeeklyRecapCard.jsx';
import PostMortemModal from './PostMortemModal.jsx';
import WelcomeScreen from './WelcomeScreen.jsx';
import LinkRiotAccount from './LinkRiotAccount.jsx';
import AccountGreeting from './AccountGreeting.jsx';
import AccountAuth from './AccountAuth.jsx';
import SetNewPasswordScreen from './SetNewPasswordScreen.jsx';
import OnboardingTour from './OnboardingTour.jsx';
import TermsModal, { TERMS_VERSION } from './TermsModal.jsx';
import ChangelogModal from './ChangelogModal.jsx';
import AnnouncementsModal from './AnnouncementsModal.jsx';
import { LATEST_CHANGELOG_VERSION } from './changelog.js';
import LoadingState from './LoadingState.jsx';
import DailyOverlaySettings from './DailyOverlaySettings.jsx';
import { supabase } from './supabaseClient.js';
import { useOnlinePresence } from './presence.js';
import { useRankTiers, usePlayerCardArt } from './rankData.js';
import { normalizeRiotIdPart } from './valorantStats.js';
import logoText from '../assets/logo-text.png';

// `labelKey` plutôt que du texte en dur — cette structure est au niveau
// module (hors composant), donc pas d'accès à `t()` ici ; la traduction se
// fait au rendu, dans App().
const NAV_SECTIONS = [
  {
    sectionKey: 'nav.sections.performance',
    tabs: [
      { id: 'stats', labelKey: 'nav.tabs.stats', icon: BarChart3 },
      { id: 'forme', labelKey: 'nav.tabs.form', icon: AlarmClock },
      { id: 'heatmap', labelKey: 'nav.tabs.heatmap', icon: Flame },
      { id: 'analyse', labelKey: 'nav.tabs.analyse', icon: Brain },
      { id: 'social', labelKey: 'nav.tabs.social', icon: Handshake },
      { id: 'graphiques', labelKey: 'nav.tabs.graphiques', icon: TrendingUp },
    ],
  },
  {
    sectionKey: 'nav.sections.myAccount',
    tabs: [
      { id: 'my-hall-of-fame', labelKey: 'nav.tabs.myHallOfFame', icon: Trophy },
      { id: 'my-weakness', labelKey: 'nav.tabs.myWeakness', icon: Compass },
      { id: 'my-skins-collection', labelKey: 'nav.tabs.myCollection', icon: Gem },
      { id: 'tilt', labelKey: 'nav.tabs.tilt', icon: Angry },
      { id: 'reseau', labelKey: 'nav.tabs.network', icon: Signal },
    ],
  },
  {
    sectionKey: 'nav.sections.tournaments',
    tabs: [{ id: 'tournaments', labelKey: 'nav.tabs.tournaments', icon: Trophy }],
  },
  {
    sectionKey: 'nav.sections.training',
    tabs: [
      { id: 'session', labelKey: 'nav.tabs.session', icon: Clapperboard },
      { id: 'aim-trainer', labelKey: 'nav.tabs.aimTrainer', icon: Target },
    ],
  },
  {
    sectionKey: 'nav.sections.tools',
    // Sous-titres purement visuels : la recherche d'onglet (navQuery) continue
    // de filtrer `tabs` à plat, sans jamais regarder ce champ — seul l'affichage
    // normal (liste complète, pas de recherche en cours) les insère. La clé
    // de l'objet est l'id du premier onglet du groupe qu'elle introduit ;
    // avant, ces 10 onglets se suivaient sans aucun repère intermédiaire.
    subheadings: {
      crosshairs: 'nav.subsections.toolsPrep',
      lineups: 'nav.subsections.toolsCommunity',
      skins: 'nav.subsections.toolsResources',
    },
    tabs: [
      { id: 'crosshairs', labelKey: 'nav.tabs.crosshairs', icon: Target },
      { id: 'strategie', labelKey: 'nav.tabs.strategy', icon: Map },
      { id: 'composition', labelKey: 'nav.tabs.composition', icon: PuzzleIcon },
      { id: 'buy-simulator', labelKey: 'nav.tabs.buySimulator', icon: Wallet },
      { id: 'lineups', labelKey: 'nav.tabs.lineups', icon: Video },
      { id: 'clips', labelKey: 'nav.tabs.clips', icon: Film },
      { id: 'team-listings', labelKey: 'nav.tabs.teamListings', icon: Users },
      { id: 'skins', labelKey: 'nav.tabs.skins', icon: Gem },
      { id: 'wiki', labelKey: 'nav.tabs.wiki', icon: BookOpen },
      { id: 'play-sessions', labelKey: 'nav.tabs.playSessions', icon: History },
    ],
  },
];

// Section à part, ajoutée dynamiquement — jamais présente dans NAV_SECTIONS,
// donc jamais dans le DOM ni dans ALL_TABS pour un compte non-admin. La vraie
// sécurité vient des policies RLS côté Supabase (voir is_admin() en base) :
// ceci n'est qu'un confort d'affichage, pas une barrière de sécurité.
const ADMIN_SECTION = {
  sectionKey: 'nav.sections.admin',
  tabs: [
    { id: 'admin', labelKey: 'nav.tabs.admin', icon: Shield },
    { id: 'admin-terms', labelKey: 'nav.tabs.adminTerms', icon: FileCheck },
    { id: 'admin-notify', labelKey: 'nav.tabs.adminNotify', icon: Send },
  ],
};

const ALL_TABS = NAV_SECTIONS.flatMap((s) => s.tabs);

function SidebarProfile({ settings, rank, onClick }) {
  const { t } = useTranslation();
  const rankTiers = useRankTiers();
  const playerCardArt = usePlayerCardArt(rank?.cardUuid);
  const currentTier = rank ? rankTiers.get(rank.tierId) : null;

  return (
    <button className="sidebar-profile" onClick={onClick}>
      <div className="sidebar-profile-avatar">
        {playerCardArt.icon ? <img src={playerCardArt.icon} alt="" /> : <span>{settings.name.charAt(0)}</span>}
      </div>
      <div className="sidebar-profile-info">
        <div className="sidebar-profile-name">
          {settings.name}
          <span className="profile-tag">#{settings.tag}</span>
        </div>
        {rank ? (
          <div className="sidebar-profile-rank">
            {currentTier?.icon && <img src={currentTier.icon} alt="" />}
            <span>{rank.tierName}</span>
          </div>
        ) : (
          <div className="sidebar-profile-rank label">{t('nav.rankUnavailable')}</div>
        )}
      </div>
    </button>
  );
}

// `badge` (rouge) = quelque chose qui demande une action (message non lu,
// demande d'ami en attente). `dot` (vert) = simple statut informatif (un ami
// est en ligne) — jamais rouge, pour ne pas le confondre avec une demande.
function TopbarIconButton({ icon, label, badge, dot, active, onClick, title }) {
  const className = [
    'topbar-icon-button',
    label && 'topbar-icon-button-labeled',
    active && 'active',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={className} onClick={onClick} title={title}>
      <span><Icon icon={icon} /></span>
      {label && <span className="topbar-icon-label">{label}</span>}
      {badge > 0 && <span className="topbar-icon-badge">{badge}</span>}
      {!badge && dot && <span className="topbar-icon-dot" />}
    </button>
  );
}

function TopbarAccountButton({ profile, myRank, active, onClick }) {
  const { t } = useTranslation();
  const avatarCardUuid = profile?.avatar_card_uuid ?? myRank?.cardUuid;
  const avatarArt = usePlayerCardArt(avatarCardUuid);

  return (
    <button
      className={active ? 'topbar-account-button active' : 'topbar-account-button'}
      onClick={onClick}
      title={t('nav.myAccountTitle')}
    >
      {avatarArt.icon ? (
        <img src={avatarArt.icon} alt="" />
      ) : (
        <span>{(profile?.display_name || profile?.riot_name || '?').charAt(0)}</span>
      )}
    </button>
  );
}

// Bouton "Rafraîchir" avec son chrono : le décompte à la seconde est un état
// LOCAL à ce bouton, pour ne pas refaire le rendu de toute l'app chaque seconde.
function RefreshButton({ loading, cooldownUntil, onClick }) {
  const { t } = useTranslation();
  // Le tick ne sert qu'à relancer un rendu chaque seconde ; la valeur affichée
  // est toujours calculée avec l'heure courante (pas de valeur périmée juste
  // après le clic).
  const [, setTick] = useState(0);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return undefined;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      if (Date.now() >= cooldownUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  return (
    <button onClick={onClick} disabled={loading || seconds > 0} className="refresh">
      {loading ? t('nav.loading') : seconds > 0 ? t('nav.refreshCooldown', { seconds }) : t('nav.refresh')}
    </button>
  );
}

// Bascule FR/EN — persistée via electron-store, indépendante de tout le
// reste (compte, profil consulté). Le drapeau affiché est celui de la
// langue ACTUELLE ; cliquer bascule vers l'autre.
function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === 'fr' ? 'en' : 'fr';
  const currentLabel = i18n.language === 'fr' ? 'FR' : 'EN';

  const switchLanguage = () => {
    i18n.changeLanguage(next);
    window.electronAPI.saveLanguage(next);
  };

  return (
    <button className="topbar-icon-button" onClick={switchLanguage} title={i18n.language === 'fr' ? 'English' : 'Français'}>
      <span className="topbar-lang-label">{currentLabel}</span>
    </button>
  );
}

function App() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState(undefined);
  const [activeTab, setActiveTab] = useState('stats');
  // Mode Aim Trainer à lancer automatiquement au prochain passage sur l'onglet
  // (voir WeaknessTab → "Ouvrir l'Aim Trainer" sur un point à travailler) —
  // consommé puis remis à null par AimTrainerTab une fois le lancement fait.
  const [pendingAimTrainerMode, setPendingAimTrainerMode] = useState(null);
  const handleWeaknessNavigate = (tab, mode) => {
    if (mode) setPendingAimTrainerMode(mode);
    setActiveTab(tab);
  };
  // Boutons latéraux de la souris (précédent/suivant) : demandé en vrai —
  // navigue dans l'historique des ONGLETS visités, comme précédent/suivant
  // dans un navigateur. Pas un state React (un historique n'a pas besoin de
  // redéclencher de rendu pour lui-même, seul `activeTab` en a besoin) —
  // juste des refs mises à jour par l'effet ci-dessous à chaque changement
  // d'onglet, sauf quand CE changement vient lui-même d'un clic précédent/
  // suivant (sinon on écraserait l'avenir qu'on vient de rouvrir).
  const tabHistoryRef = useRef([activeTab]);
  const tabHistoryIndexRef = useRef(0);
  const navigatingHistoryRef = useRef(false);
  const tabHistoryMountedRef = useRef(false);

  useEffect(() => {
    if (!tabHistoryMountedRef.current) {
      tabHistoryMountedRef.current = true;
      return;
    }
    if (navigatingHistoryRef.current) {
      navigatingHistoryRef.current = false;
      return;
    }
    // Nouvelle navigation "normale" : tronque l'historique après la position
    // courante (comme un navigateur — revenir en arrière puis cliquer
    // ailleurs abandonne l'ancien "suivant") et empile le nouvel onglet.
    tabHistoryIndexRef.current += 1;
    tabHistoryRef.current = [...tabHistoryRef.current.slice(0, tabHistoryIndexRef.current), activeTab];
  }, [activeTab]);

  useEffect(() => {
    // `button` 3/4 = boutons latéraux précédent/suivant, valeurs standard de
    // l'API MouseEvent (pas spécifiques à Electron) — `auxclick` plutôt que
    // `mouseup`/`click` : c'est l'événement dédié aux boutons non-primaires,
    // il ne se déclenche jamais pour le clic gauche normal d'un bouton/lien.
    const handleAuxClick = (event) => {
      if (event.button === 3) {
        event.preventDefault();
        const index = tabHistoryIndexRef.current;
        if (index > 0) {
          navigatingHistoryRef.current = true;
          tabHistoryIndexRef.current = index - 1;
          setActiveTab(tabHistoryRef.current[index - 1]);
        }
      } else if (event.button === 4) {
        event.preventDefault();
        const index = tabHistoryIndexRef.current;
        if (index < tabHistoryRef.current.length - 1) {
          navigatingHistoryRef.current = true;
          tabHistoryIndexRef.current = index + 1;
          setActiveTab(tabHistoryRef.current[index + 1]);
        }
      }
    };
    window.addEventListener('auxclick', handleAuxClick);
    return () => window.removeEventListener('auxclick', handleAuxClick);
  }, []);

  const data = useValorantData(settings);
  // Les catégories du menu (Performance, Mon compte...) partagent le même
  // magasin persistant que les blocs réduits (CollapsibleCard) — un identifiant
  // de catégorie ("nav.sections.performance") n'est jamais qu'un ID de bloc
  // de plus, aucune collision possible avec ceux des cartes.
  const {
    collapsed: collapsedSections,
    toggle: toggleSection,
    refresh: refreshCollapsedBlocks,
  } = useCollapsedBlocks();
  const { lock: lockMessagingKey, tryAutoUnlock: tryAutoUnlockMessagingKey } = useE2EE();
  const sidebarNavRef = useRef(null);
  const [indicator, setIndicator] = useState({ top: 0, height: 0, ready: false });
  // Recherche d'onglet dans la barre latérale — demandé sur Discord. Pendant
  // une recherche, chaque section ignore son état replié (sinon un onglet
  // qui correspond resterait invisible si sa section était repliée) et ne
  // garde que ses onglets qui matchent, section masquée si aucun ne matche.
  const [navSearch, setNavSearch] = useState('');
  const navQuery = normalizeRiotIdPart(navSearch);
  // Ami à ouvrir en conversation dès l'arrivée sur l'onglet Messages, posé
  // par le bouton "💬" de la page Amis — one-shot, consommé au montage.
  const [pendingOpenFriendId, setPendingOpenFriendId] = useState(null);
  const [session, setSession] = useState(undefined); // undefined = chargement, null = déconnecté
  const [profile, setProfile] = useState(undefined); // undefined = chargement, null = pas encore lié
  // Signalé en vrai : un compte fraîchement créé restait sur un écran tout
  // noir, sans rien à l'écran ni message d'erreur — `profile` bloqué à
  // `undefined` pour de bon (voir loadProfile ci-dessous) si les 3 tentatives
  // de lecture du profil échouent toutes, sans aucun retour visuel. `true`
  // uniquement quand ce cas précis se produit, pour distinguer "en cours de
  // chargement" (écran vide normal, bref) de "ça a vraiment échoué" (écran
  // vide permanent, jamais normal).
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  // Incrémenté par le bouton "Réessayer" de l'écran d'échec ci-dessous —
  // relance l'effet de chargement du profil (qui ne dépend sinon que de
  // `session`, inchangée à ce moment-là).
  const [profileRetryNonce, setProfileRetryNonce] = useState(0);
  // true dès que le lien "mot de passe oublié" a rouvert l'app avec une
  // session de récupération active — force l'écran de nouveau mot de passe
  // avant tout le reste, peu importe l'état de connexion en cours.
  const [recoveryPending, setRecoveryPending] = useState(false);
  // Mise à jour prête à installer — signalée dans l'app plutôt que par une
  // popup Windows qui vole le focus (voir main.js, notifyUser: false).
  const [pendingUpdate, setPendingUpdate] = useState(null);

  useEffect(() => {
    window.electronAPI.getUpdateStatus().then(setPendingUpdate);
    return window.electronAPI.onUpdateReady(setPendingUpdate);
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onRecoveryDeepLink(async ({ accessToken, refreshToken }) => {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) {
        console.error('[auth] échec de la session de récupération :', error.message);
        return;
      }
      setRecoveryPending(true);
    });
    return unsubscribe;
  }, []);

  // Retour de la connexion Google ouverte dans le navigateur système (voir
  // AccountAuth.jsx) : Supabase a redirigé vers mvptracker://auth/callback
  // avec les tokens dans le fragment d'URL, main.js les a extraits et
  // renvoyés ici — il ne reste qu'à activer la session, onAuthStateChange
  // (plus bas) bascule alors automatiquement vers l'app.
  useEffect(() => {
    const unsubscribe = window.electronAPI.onOAuthDeepLink(async ({ accessToken, refreshToken }) => {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) console.error('[auth] échec de la session Google :', error.message);
    });
    return unsubscribe;
  }, []);

  const myUserId = session?.user?.id ?? null;
  const onlineFriendIds = useOnlinePresence(myUserId);

  // Usage par feature (Stats, Tournois, Aim Trainer...) pour PostHog — un
  // event léger par changement d'onglet plutôt que d'instrumenter chaque
  // écran séparément.
  useEffect(() => {
    window.electronAPI?.captureEvent(myUserId, 'tab_viewed', { tab: activeTab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Tente de récupérer la clé de messagerie déjà mise en cache localement
  // sur CET appareil (voir E2EEContext.jsx) dès que la session est connue —
  // couvre le cas normal (redémarrage de l'app, session Supabase déjà
  // persistée) sans jamais redemander le mot de passe. Si rien n'est en
  // cache (premier lancement sur cet appareil), MessagesPage affichera son
  // propre écran de déverrouillage le moment venu.
  useEffect(() => {
    if (myUserId) tryAutoUnlockMessagingKey(myUserId);
  }, [myUserId, tryAutoUnlockMessagingKey]);

  // Notifications "sociales" (badge sur l'onglet Messages + notif Windows) —
  // volontairement séparées de la logique interne de MessagesPage : ça doit
  // rester visible même quand on est sur un tout autre onglet de l'app.
  const [unreadFriendIds, setUnreadFriendIds] = useState(new Set());
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (activeTab === 'messages') setUnreadFriendIds(new Set());
  }, [activeTab]);

  // Alertes push vers le téléphone (fin de match, tilt) : le process principal
  // demande l'envoi, on lit ici les jetons du joueur (table push_tokens, voir
  // sql/push_tokens.sql) car lui n'a pas la session Supabase. Aucun jeton =
  // aucun téléphone relié = rien à envoyer.
  useEffect(() => {
    if (!myUserId || !window.electronAPI?.onMobilePushEvent) return undefined;
    return window.electronAPI.onMobilePushEvent(async ({ title, body }) => {
      const { data } = await supabase.from('push_tokens').select('token').eq('user_id', myUserId);
      if (!data?.length) return;
      const result = await window.electronAPI.sendMobilePush({ tokens: data.map((row) => row.token), title, body });
      if (result?.invalid?.length) {
        await supabase.from('push_tokens').delete().eq('user_id', myUserId).in('token', result.invalid);
      }
    });
  }, [myUserId]);

  // Publie les stats de l'overlay de session vers Supabase (table live_session,
  // voir sql/live_session.sql) pour l'app mobile. Si la table n'existe pas
  // encore, l'erreur est simplement ignorée.
  useEffect(() => {
    if (!myUserId || !window.electronAPI?.onDailyOverlayStats) return undefined;
    return window.electronAPI.onDailyOverlayStats((stats) => {
      if (!stats?.dayKey) return;
      supabase
        .from('live_session')
        .upsert({ user_id: myUserId, stats, updated_at: new Date().toISOString() })
        .then(() => {});
    });
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId) return undefined;
    const channel = supabase
      .channel(`app-messages-${myUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${myUserId}` },
        async (payload) => {
          const msg = payload.new;
          if (activeTabRef.current === 'messages') return; // déjà géré/visible dans MessagesPage
          setUnreadFriendIds((prev) => new Set(prev).add(msg.sender_id));
          if (typeof Notification === 'undefined' || Notification.permission === 'denied') return;
          const { data: sender } = await supabase
            .from('profiles')
            .select('display_name, riot_name, riot_tag')
            .eq('id', msg.sender_id)
            .maybeSingle();
          const senderLabel = sender ? sender.display_name || `${sender.riot_name}#${sender.riot_tag}` : 'Nouveau message';
          new Notification(senderLabel, { body: msg.content });
        },
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId) return undefined;
    const loadPendingCount = async () => {
      const { count } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', myUserId)
        .eq('status', 'pending');
      setPendingRequestCount(count ?? 0);
    };
    loadPendingCount();
    const channel = supabase
      .channel(`app-friendships-${myUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${myUserId}` },
        loadPendingCount,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [myUserId]);

  const socialNotificationCount = unreadFriendIds.size + pendingRequestCount;

  // Badge sur l'onglet Tournois : nombre de tournois ouverts aux
  // inscriptions ou en cours — la feature est facile à rater dans une
  // sidebar où tout se ressemble sinon. Un simple comptage à l'ouverture
  // suffit, pas besoin de temps réel pour un badge de découverte.
  const [activeTournamentsCount, setActiveTournamentsCount] = useState(0);
  useEffect(() => {
    if (!session) return;
    supabase
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['registration', 'ongoing'])
      .then(({ count }) => setActiveTournamentsCount(count ?? 0));
  }, [session]);

  // true uniquement après un vrai passage par l'écran de recherche Riot ID
  // *pendant cette session* — jamais déduit des réglages déjà en cache, pour
  // qu'un compte sans lien Supabase ne se relie pas silencieusement avec un
  // ancien puuid local laissé par un autre compte.
  const [linkingRiot, setLinkingRiot] = useState(false);
  const [linkError, setLinkError] = useState(null);
  // Écran d'accueil léger (aperçu + choix) affiché à chaque lancement une
  // fois le compte lié, avant d'entrer dans l'app proprement dite.
  const [enteredApp, setEnteredApp] = useState(false);

  // Le halo d'ambiance (aurora-drift, voir index.css) ne tourne que sur les
  // écrans d'avant-app (bienvenue, connexion, liaison de compte) — une fois
  // dans l'app, il tournait en continu derrière la topbar/sidebar en
  // backdrop-filter, forçant un repaint permanent pour un effet qu'on ne
  // voit plus vraiment une fois noyé sous l'interface.
  useEffect(() => {
    document.body.classList.toggle('in-app', enteredApp);
    return () => document.body.classList.remove('in-app');
  }, [enteredApp]);

  // Conditions générales d'utilisation : acceptées une seule fois PAR COMPTE
  // (pas par installation — deux comptes sur le même PC doivent chacun
  // accepter), pour la version TERMS_VERSION du texte. Bloque l'onboarding et
  // la modale d'overlay ci-dessous tant qu'elles ne sont pas acceptées, pour
  // ne jamais empiler plusieurs fenêtres au premier passage dans l'app.
  // L'acceptation est aussi enregistrée dans Supabase (table
  // terms_acceptances, voir sql/terms_acceptances.sql) pour que l'admin voie
  // qui a accepté ; le localStorage sert de cache pour ne pas redemander.
  const termsUserId = session?.user?.id ?? null;
  const termsKey = termsUserId ? `mvptracker-terms-accepted-${TERMS_VERSION}:${termsUserId}` : null;
  const termsSyncedKey = termsUserId ? `mvptracker-terms-synced-${TERMS_VERSION}:${termsUserId}` : null;
  const [acceptedTermsFor, setAcceptedTermsFor] = useState(null);
  const termsAccepted = !!termsUserId && acceptedTermsFor === termsUserId;

  useEffect(() => {
    if (!termsKey) {
      setAcceptedTermsFor(null);
      return;
    }
    try {
      setAcceptedTermsFor(localStorage.getItem(termsKey) ? termsUserId : null);
    } catch {
      setAcceptedTermsFor(null);
    }
  }, [termsKey, termsUserId]);

  const acceptTerms = () => {
    if (!termsKey) return;
    try {
      localStorage.setItem(termsKey, new Date().toISOString());
    } catch {
      // stockage indisponible : la modale reviendra au prochain lancement, sans bloquer la session en cours
    }
    setAcceptedTermsFor(termsUserId);
  };

  // Enregistre l'acceptation côté Supabase, avec la date réelle du clic. Si ça
  // échoue (hors ligne, table pas encore créée...), rien n'est marqué comme
  // synchronisé : on réessaie simplement au prochain lancement.
  useEffect(() => {
    if (!termsAccepted || !termsKey) return;
    try {
      if (localStorage.getItem(termsSyncedKey)) return;
    } catch {
      // stockage illisible : on tente quand même l'envoi (idempotent côté base)
    }
    let acceptedAt = null;
    try {
      acceptedAt = localStorage.getItem(termsKey);
    } catch {
      // date locale illisible : la valeur par défaut de la base (now()) fera l'affaire
    }
    supabase
      .from('terms_acceptances')
      .upsert(
        { user_id: termsUserId, version: TERMS_VERSION, ...(acceptedAt ? { accepted_at: acceptedAt } : {}) },
        { onConflict: 'user_id,version', ignoreDuplicates: true },
      )
      .then(({ error }) => {
        if (error) {
          console.error("[terms] échec de l'enregistrement de l'acceptation :", error.message);
          return;
        }
        try {
          localStorage.setItem(termsSyncedKey, '1');
        } catch {
          // pas grave : ré-envoi idempotent au prochain lancement
        }
      });
  }, [termsAccepted, termsKey, termsSyncedKey, termsUserId]);

  // Fenêtre "Nouveautés" (bouton à droite de Discord) : le point "nouveau"
  // reste affiché tant que la dernière version du changelog n'a pas été ouverte.
  const CHANGELOG_SEEN_KEY = 'mvptracker-changelog-seen';
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogSeenVersion, setChangelogSeenVersion] = useState(() => {
    try {
      return localStorage.getItem(CHANGELOG_SEEN_KEY);
    } catch {
      return null;
    }
  });

  const openChangelog = () => {
    setShowChangelog(true);
    setChangelogSeenVersion(LATEST_CHANGELOG_VERSION);
    try {
      localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_VERSION);
    } catch {
      // stockage indisponible : le point reviendra au prochain lancement, sans conséquence
    }
  };

  // Annonces admin (table announcements) : chargées dès qu'on est connecté
  // (l'écran d'accueil les affiche aussi), puis revérifiées toutes les 10 min
  // une fois dans l'app pour alimenter la cloche de la barre du haut.
  const announcementsUserId = session?.user?.id ?? null;
  const [announcements, setAnnouncements] = useState([]);
  useEffect(() => {
    if (!announcementsUserId) {
      setAnnouncements([]);
      return undefined;
    }
    let cancelled = false;
    // recipient_id : messages ciblés (voir sql/announcements_recipient.sql). Si la
    // migration n'a pas encore été passée, la colonne n'existe pas et la requête
    // échoue — on retente sans elle pour ne jamais perdre les annonces générales.
    const AUTHOR = 'author:profiles(display_name, riot_name, riot_tag, avatar_card_uuid)';
    const query = (columns) =>
      supabase.from('announcements').select(columns).eq('is_active', true).order('created_at', { ascending: false });
    const load = async () => {
      let { data, error } = await query(`id, title, body, image_url, created_at, recipient_id, ${AUTHOR}`);
      if (error) ({ data } = await query(`id, title, body, image_url, created_at, ${AUTHOR}`));
      if (!cancelled) setAnnouncements(data ?? []);
    };
    load();
    if (!enteredApp) {
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [announcementsUserId, enteredApp]);

  // Annonces déjà vues, par compte (localStorage) : la cloche n'affiche un
  // compteur que pour les nouvelles. Celles montrées sur l'écran d'accueil
  // juste avant d'entrer dans l'app comptent comme vues.
  const announcementsSeenKey = announcementsUserId ? `mvptracker-announcements-seen:${announcementsUserId}` : null;
  const [seenAnnouncementIds, setSeenAnnouncementIds] = useState(() => new Set());
  const greetingAnnouncementIdsRef = useRef([]);

  const markAnnouncementsSeen = (ids) => {
    if (!announcementsSeenKey || ids.length === 0) return;
    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem(announcementsSeenKey) || '[]');
    } catch {
      // valeur illisible : on repart d'une liste vide
    }
    const merged = new Set([...stored, ...ids]);
    try {
      localStorage.setItem(announcementsSeenKey, JSON.stringify([...merged]));
    } catch {
      // stockage indisponible : les annonces seront de nouveau comptées comme nouvelles au prochain lancement
    }
    setSeenAnnouncementIds(merged);
  };

  useEffect(() => {
    if (!announcementsSeenKey) {
      setSeenAnnouncementIds(new Set());
      return;
    }
    try {
      setSeenAnnouncementIds(new Set(JSON.parse(localStorage.getItem(announcementsSeenKey) || '[]')));
    } catch {
      setSeenAnnouncementIds(new Set());
    }
  }, [announcementsSeenKey]);

  useEffect(() => {
    if (!enteredApp) greetingAnnouncementIdsRef.current = announcements.map((a) => a.id);
  }, [announcements, enteredApp]);

  useEffect(() => {
    if (enteredApp) markAnnouncementsSeen(greetingAnnouncementIdsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enteredApp, announcementsSeenKey]);

  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const unreadAnnouncementCount = announcements.filter((a) => !seenAnnouncementIds.has(a.id)).length;
  const openAnnouncements = () => {
    setShowAnnouncements(true);
    markAnnouncementsSeen(announcements.map((a) => a.id));
  };

  // Tour guidé (demandé sur Discord) : affiché une seule fois, au premier
  // vrai passage dans l'app — jamais revu ensuite sauf via le bouton dédié
  // dans Mon compte. Petit délai avant de le montrer pour laisser la sidebar
  // finir de se peindre (sinon les mesures de position des sections seraient
  // prises avant que leur layout final ne soit stable).
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Ordre au premier passage : CGU, puis la fenêtre de l'overlay de session (modes
  // à exclure), puis ce tour — jamais deux fenêtres en même temps. Sans ça, dès
  // l'acceptation des CGU le tour et la fenêtre d'overlay s'ouvraient ensemble et
  // se chevauchaient. `overlaySettingsSeen` passe à vrai quand cette fenêtre a déjà
  // été vue (ou vient d'être fermée) ; si le stockage est illisible on ne bloque pas le tour.
  const [overlaySettingsSeen, setOverlaySettingsSeen] = useState(() => {
    try {
      return !!localStorage.getItem('mvptracker-daily-overlay-settings-shown');
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!enteredApp || !termsAccepted || !overlaySettingsSeen) return undefined;
    if (localStorage.getItem('mvptracker-onboarding-done')) return undefined;
    const id = setTimeout(() => setShowOnboarding(true), 300);
    return () => clearTimeout(id);
  }, [enteredApp, termsAccepted, overlaySettingsSeen]);

  const closeOnboarding = () => {
    localStorage.setItem('mvptracker-onboarding-done', '1');
    setShowOnboarding(false);
  };

  // Même principe que l'onboarding ci-dessus, pour présenter l'overlay de
  // session une seule fois — modale DANS l'app (pas une fenêtre séparée,
  // demandé explicitement) plutôt qu'un flag stocké côté main.js.
  const [showDailyOverlaySettings, setShowDailyOverlaySettings] = useState(false);
  useEffect(() => {
    if (!enteredApp || !termsAccepted) return undefined;
    if (localStorage.getItem('mvptracker-daily-overlay-settings-shown')) return undefined;
    const id = setTimeout(() => setShowDailyOverlaySettings(true), 300);
    return () => clearTimeout(id);
  }, [enteredApp, termsAccepted]);

  const closeDailyOverlaySettings = () => {
    try {
      localStorage.setItem('mvptracker-daily-overlay-settings-shown', '1');
    } catch {
      // stockage indisponible : la fenêtre reviendra au prochain lancement
    }
    setOverlaySettingsSeen(true);
    setShowDailyOverlaySettings(false);
  };

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
    window.electronAPI.getLanguage().then((lang) => {
      if (lang && lang !== i18n.language) i18n.changeLanguage(lang);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Matchs du compte LIÉ, indépendants de qui est actuellement affiché — le
  // wrapped (et tout widget "personnel" à venir) doit toujours parler de toi,
  // même en train de consulter le tracker de quelqu'un d'autre. Quand tu
  // regardes ton propre profil, `data.matches` est déjà à jour, donc on le
  // réutilise directement plutôt que de refaire un aller-retour inutile.
  const [myMatches, setMyMatches] = useState([]);
  useEffect(() => {
    if (!profile?.riot_puuid) return;
    if (settings?.puuid === profile.riot_puuid) {
      setMyMatches(data.matches);
      return;
    }
    window.electronAPI.getCachedMatchesFor(profile.riot_puuid).then(setMyMatches);
  }, [profile?.riot_puuid, settings?.puuid, data.matches]);

  // Même piège que pour myMatches : le puuid lié passe par un état vide
  // juste après le lancement avant de se rétablir (voir le commentaire sur
  // setLinkedPuuid plus bas) — les échantillons de ping (Réseau) restaient
  // bloqués sur "vide" si leur toute première requête, dans useValorantData,
  // tombait dans cette fenêtre. Corrigé une première fois en rechargeant sur
  // profile.riot_puuid (comme myMatches), MAIS ça ne suffisait pas : cet
  // appel et celui qui enregistre linkedAccountPuuid (setLinkedPuuid,
  // ci-dessous) partent tous les deux au même moment, et celui-ci pouvait
  // arriver côté serveur AVANT que le puuid n'y soit encore écrit — vérifié
  // en conditions réelles (0 échantillon reçu malgré ~47 000 en base). Le
  // puuid est donc passé explicitement à getPingSamples() maintenant,
  // au lieu de compter sur une valeur déjà enregistrée côté serveur.
  const [myPingSamples, setMyPingSamples] = useState([]);
  useEffect(() => {
    if (!profile?.riot_puuid) return;
    window.electronAPI.getPingSamples(profile.riot_puuid).then(setMyPingSamples);
  }, [profile?.riot_puuid]);
  const isViewingSelf = !!profile && settings?.puuid === profile.riot_puuid;
  const mySettings = profile ? { name: profile.riot_name, tag: profile.riot_tag } : settings;
  // Confort d'affichage uniquement — voir le commentaire sur ADMIN_SECTION.
  const isAdmin = profile?.role === 'admin';

  // Synchro vers Supabase (résumés + détail des 50 plus récents, voir
  // matchSync.js) COUPÉE le 2 septembre 2026 : la table match_summaries
  // spammait le dashboard Postgres d'erreurs "permission denied" pour tous
  // les comptes (GRANT + policy UPDATE corrigés côté SQL, mais l'erreur
  // persistait encore sur certaines requêtes — cause exacte pas encore
  // confirmée). Rien dans l'app actuelle ne LIT cette table (préparée pour
  // un futur client mobile qui n'existe pas encore), donc couper l'appel ne
  // change rien pour les utilisateurs — à réactiver une fois la vraie cause
  // trouvée.

  // Même principe que pour les matchs : le rang stocké localement ne l'était
  // que pour "le dernier profil consulté", pas par compte — on le relit
  // explicitement pour le puuid du compte lié, peu importe qui est affiché.
  const [myRank, setMyRank] = useState(null);
  useEffect(() => {
    if (!profile?.riot_puuid) return;
    if (isViewingSelf) {
      setMyRank(data.rank);
      return;
    }
    window.electronAPI.getRankFor(profile.riot_puuid).then(setMyRank);
  }, [profile?.riot_puuid, isViewingSelf, data.rank]);

  // Garde main.js informé du puuid du compte réellement lié — c'est cette
  // valeur (pas les réglages "vue courante") qui scope crosshairs, stratégies,
  // paris, wrapped, objectifs, skins et blocs réduits côté disque.
  useEffect(() => {
    window.electronAPI.setLinkedPuuid(profile?.riot_puuid ?? null).then(() => {
      // Au tout premier rendu, `profile` part de `null` le temps que la
      // session Supabase se recharge — cet effet tourne donc une première
      // fois avec un puuid vide, qui vide `linkedAccountPuuid` côté disque
      // avant que le vrai profil ne le rétablisse juste après. Un chargement
      // des blocs réduits fait une seule fois au montage du Provider pouvait
      // tomber dans cette fenêtre et rater les données déjà persistées —
      // on force donc un rechargement à chaque fois que le puuid lié change
      // réellement (y compris ce tout premier passage à sa vraie valeur).
      refreshCollapsedBlocks();
    });
  }, [profile?.riot_puuid, refreshCollapsedBlocks]);

  // Compte MVP Tracker (Supabase) — étape à part du Riot ID : se connecter au
  // compte de l'app ne veut pas dire avoir déjà lié un pseudo Valo.
  // Supabase revalide automatiquement la session (et redéclenche cet
  // écouteur) chaque fois que la fenêtre revient au premier plan après avoir
  // été en arrière-plan — pas seulement lors d'une vraie connexion/déconnexion.
  // Sans ce garde-fou, chaque retour au premier plan réinitialisait `profile`,
  // ce qui démontait puis remontait les composants qui en dépendent (dont le
  // popup de bilan de match) et pouvait le faire réapparaître comme non
  // répondu à cause d'une brève fenêtre où le puuid lié n'était plus à jour
  // côté process principal.
  const lastUserIdRef = useRef(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: current } }) => {
      lastUserIdRef.current = current?.user?.id ?? null;
      setSession(current);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      const nextUserId = next?.user?.id ?? null;
      if (nextUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = nextUserId;
        setProfile(undefined); // reforce la vérification du lien Riot ID seulement si le compte a réellement changé
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Le Riot ID lié à CE compte fait foi, pas les réglages locaux — sinon un
  // deuxième compte sur la même machine hériterait silencieusement du Riot ID
  // du précédent utilisateur connecté.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setProfileLoadFailed(false);

    // Au tout premier lancement de l'app, le service réseau de Chromium peut
    // mettre un instant à se stabiliser (voir le commentaire plus haut dans
    // main.js) — une requête échouée à ce moment-là ne veut pas dire que le
    // compte n'est pas lié. On réessaie avant de conclure, plutôt que de
    // renvoyer l'utilisateur à tort vers l'écran de liaison Riot.
    async function loadProfile(attempt = 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('riot_name, riot_tag, riot_puuid, display_name, avatar_card_uuid, main_role, main_agent, created_at, henrikdev_api_key, role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('[profiles] échec de la lecture du profil :', error.message);
        if (attempt < 3) {
          setTimeout(() => loadProfile(attempt + 1), 1000 * (attempt + 1));
        } else {
          // Les 3 tentatives ont échoué : `profile` resterait bloqué à
          // `undefined` pour de bon sans ça, et l'app entière n'affiche
          // rien (voir le rendu plus bas) — jamais montré à l'utilisateur,
          // juste un écran noir, signalé en vrai par un testeur qui venait
          // de créer son compte.
          setProfileLoadFailed(true);
          // Remonté dans PostHog : sans ça, la vraie cause (réseau ? RLS ?
          // autre chose ?) ne serait jamais visible que dans la console
          // DevTools de la personne concernée, qu'on ne voit jamais.
          window.electronAPI?.captureException(session.user.id, new Error(error.message), {
            context: 'profile-load-exhausted-retries',
          });
        }
        return;
      }
      setProfile(data ?? null);
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [session, profileRetryNonce]);

  // Lie le compte au Riot ID uniquement suite à un passage volontaire par
  // l'écran de recherche (linkingRiot), une fois le puuid résolu — jamais à
  // partir d'un puuid déjà en cache sans action explicite de l'utilisateur.
  useEffect(() => {
    if (!session || !linkingRiot || !settings?.puuid) return;
    supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        riot_name: settings.name,
        riot_tag: settings.tag,
        riot_puuid: settings.puuid,
        henrikdev_api_key: settings.apiKey,
      })
      .then(({ error }) => {
        if (error) {
          console.error('[profiles] échec de la liaison Riot ID :', error.message);
          // Code Postgres 23505 = violation de contrainte unique — ici la
          // contrainte sur riot_puuid, qui empêche qu'un même compte Riot
          // soit lié à deux comptes MVP Tracker différents.
          setLinkError(error.code === '23505' ? 'duplicate' : 'generic');
          setLinkingRiot(false);
          return;
        }
        setProfile({
          riot_name: settings.name,
          riot_tag: settings.tag,
          riot_puuid: settings.puuid,
          henrikdev_api_key: settings.apiKey,
          created_at: new Date().toISOString(),
        });
        setLinkingRiot(false);
      });
  }, [session, linkingRiot, settings?.puuid, settings?.name, settings?.tag]);

  // Modifie le pseudo d'affichage / l'avatar du compte MVP Tracker — utilisé
  // par la page "Mon compte" (pas lié au compte Riot, propre à cette app).
  const updateProfile = async (patch) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
    if (error) {
      console.error('[profiles] échec de la mise à jour du profil :', error.message);
      return;
    }
    setProfile((prev) => ({ ...prev, ...patch }));
  };

  // Change la clé API HenrikDev — déplacé depuis la barre de recherche (trop
  // exposée) vers "Mon compte" : met à jour Supabase (source durable) ET le
  // cache local (`settings`/electron-store) pour que le reste de l'app
  // utilise la nouvelle clé immédiatement, sans redémarrage.
  const updateApiKey = async (newKey) => {
    const trimmed = newKey.trim();
    await updateProfile({ henrikdev_api_key: trimmed || null });
    const updatedSettings = { ...settings, apiKey: trimmed };
    setSettings(updatedSettings);
    window.electronAPI.saveSettings(updatedSettings);
  };

  // Resynchronise le pseudo/tag Riot lié — nécessaire quand un joueur change
  // de pseudo EN JEU après avoir lié son compte : le puuid ne change jamais,
  // mais les requêtes HenrikDev (par nom#tag, pas par puuid) échouent tant
  // que le nom enregistré ici ne suit pas. On revérifie via previewAccount
  // que le nouveau nom#tag résout bien VERS LE MÊME puuid déjà lié, pour ne
  // jamais laisser quelqu'un relier accidentellement (ou volontairement) le
  // Riot ID de quelqu'un d'autre à la place du sien.
  const updateRiotId = async (newName, newTag) => {
    const name = newName.trim();
    const tag = newTag.trim();
    const preview = await window.electronAPI.previewRiotAccount({ name, tag, apiKey: settings.apiKey });
    if (preview.puuid !== profile.riot_puuid) {
      throw new Error(t('account.riotIdMismatch'));
    }
    await updateProfile({ riot_name: preview.name, riot_tag: preview.tag });
    const updatedSettings = { ...settings, name: preview.name, tag: preview.tag };
    setSettings(updatedSettings);
    window.electronAPI.saveSettings(updatedSettings);
  };

  // Sur une machine neuve (pas encore de réglages locaux), reconstruit
  // automatiquement `settings` à partir du compte lié plutôt que de forcer
  // un nouveau passage par l'écran de liaison — le Riot ID et la clé API
  // HenrikDev sont déjà connus via Supabase, pas besoin de les redemander.
  useEffect(() => {
    if (settings !== null || !profile?.riot_puuid || !profile?.henrikdev_api_key) return;
    const hydrated = {
      name: profile.riot_name,
      tag: profile.riot_tag,
      puuid: profile.riot_puuid,
      apiKey: profile.henrikdev_api_key,
    };
    window.electronAPI.saveSettings(hydrated);
    setSettings(hydrated);
  }, [settings, profile]);

  // Fait glisser un repère lumineux vers le lien actif au lieu de le faire
  // juste réapparaître à une nouvelle position — mesuré dynamiquement car les
  // sections du sidebar n'ont pas toutes la même hauteur.
  useLayoutEffect(() => {
    const container = sidebarNavRef.current;
    const activeEl = container?.querySelector('.sidebar-link.active');
    if (!container || !activeEl) {
      // L'onglet actif est dans une section repliée, ou masqué par la recherche
      // d'onglet — pas de repère orphelin.
      setIndicator((prev) => ({ ...prev, ready: false }));
      return;
    }
    setIndicator({
      top: activeEl.offsetTop,
      height: activeEl.offsetHeight,
      ready: true,
    });
    // navQuery : la recherche d'onglet filtre la liste (l'onglet actif peut
    // disparaître ou changer de position) — sans elle dans les dépendances, le
    // repère restait figé à son ancienne position, dans le vide.
  }, [activeTab, settings, collapsedSections, navQuery]);

  if (recoveryPending) {
    return <SetNewPasswordScreen onDone={() => setRecoveryPending(false)} />;
  }

  if (session === undefined || settings === undefined) {
    // Avant, rien ne s'affichait ici (juste le fond sombre de la fenêtre) le
    // temps que supabase.auth.getSession() réponde — un aller-retour réseau
    // qui peut prendre un moment, laissant l'app paraître figée au
    // lancement. Un retour visuel immédiat ne raccourcit pas ce délai, mais
    // évite l'impression de blocage (signalé par plusieurs utilisateurs).
    return (
      <div className="app-boot-loading">
        <LoadingState label={t('nav.loading')} />
      </div>
    );
  }

  if (!session) {
    return <AccountAuth />;
  }

  if (profile === undefined) {
    if (profileLoadFailed) {
      return (
        <div className="welcome-screen">
          <div className="welcome-bg" aria-hidden="true">
            <span className="welcome-orb welcome-orb-1" />
            <span className="welcome-orb welcome-orb-2" />
            <span className="welcome-orb welcome-orb-3" />
            <span className="welcome-orb welcome-orb-4" />
          </div>
          <p className="label">{t('nav.profileLoadFailed')}</p>
          <div className="account-settings-actions">
            <button className="refresh" onClick={() => setProfileRetryNonce((n) => n + 1)}>
              {t('nav.retry')}
            </button>
            <button className="sidebar-signout account-signout" onClick={() => supabase.auth.signOut().then(lockMessagingKey)}>
              {t('account.signOut')}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="app-boot-loading">
        <LoadingState label={t('nav.loading')} />
      </div>
    );
  }

  if (profile === null) {
    if (linkingRiot) {
      // Le puuid est déjà connu à ce stade (issu de l'aperçu confirmé) —
      // l'écriture du lien est quasi instantanée, ce n'est qu'un court passage.
      return (
        <div className="welcome-screen">
          <div className="welcome-bg" aria-hidden="true">
            <span className="welcome-orb welcome-orb-1" />
            <span className="welcome-orb welcome-orb-2" />
            <span className="welcome-orb welcome-orb-3" />
            <span className="welcome-orb welcome-orb-4" />
          </div>
          <p className="label">{t('nav.linkingInProgress')}</p>
        </div>
      );
    }
    return (
      <LinkRiotAccount
        linkError={linkError}
        onConfirmed={(confirmedSettings) => {
          setLinkError(null);
          window.electronAPI.saveSettings(confirmedSettings);
          setSettings(confirmedSettings);
          setLinkingRiot(true);
        }}
        onSignOut={() => supabase.auth.signOut().then(lockMessagingKey)}
      />
    );
  }

  // À partir d'ici, le compte est bien lié (profile existe).
  if (!settings) {
    return <WelcomeScreen onSaved={setSettings} />;
  }

  if (!enteredApp) {
    return (
      <AccountGreeting
        settings={mySettings}
        rank={myRank}
        matches={myMatches}
        announcements={announcements}
        onOpenAimTrainer={() => {
          setActiveTab('aim-trainer');
          setEnteredApp(true);
        }}
        onEnter={() => {
          // L'app est personnelle (plus de recherche d'autres joueurs), mais
          // des réglages locaux hérités d'une ancienne version peuvent encore
          // pointer sur un autre profil : on repasse sur le compte lié avant
          // d'entrer — la clé API reste celle déjà en cache (elle n'est pas
          // propre à un Riot ID précis).
          if (settings?.puuid !== profile.riot_puuid) {
            const ownSettings = {
              name: profile.riot_name,
              tag: profile.riot_tag,
              puuid: profile.riot_puuid,
              apiKey: settings?.apiKey,
            };
            window.electronAPI.saveSettings(ownSettings);
            setSettings(ownSettings);
          }
          setEnteredApp(true);
        }}
      />
    );
  }

  const renderValorantTab = () => {
    switch (activeTab) {
      case 'stats':
        return (
          <StatsTab
            settings={settings}
            matches={data.matches}
            rank={data.rank}
            loading={data.loading}
          />
        );
      case 'forme':
        return <FormTab settings={settings} matches={data.matches} loading={data.loading} />;
      case 'reseau':
        return <NetworkTab settings={mySettings} matches={myMatches} pingSamples={myPingSamples} myId={session.user.id} />;
      case 'tournaments':
        return <TournamentsTab myId={session.user.id} isAdmin={isAdmin} />;
      case 'tilt':
        return <TiltTab settings={mySettings} matches={myMatches} loading={isViewingSelf && data.loading} />;
      case 'crosshairs':
        return <CrosshairsTab />;
      case 'strategie':
        return <StrategyTab />;
      case 'skins':
        return <SkinsTab myId={session.user.id} />;
      case 'heatmap':
        return <HeatmapTab settings={settings} matches={data.matches} />;
      case 'analyse':
        return <AnalyseTab settings={settings} matches={data.matches} loading={data.loading} />;
      case 'composition':
        return (
          <CompositionTab
            settings={settings}
            matches={data.matches}
            mySettings={mySettings}
            myMatches={myMatches}
            myId={session.user.id}
            isAdmin={isAdmin}
          />
        );
      case 'graphiques':
        return <PerformanceChartsTab settings={settings} matches={data.matches} loading={data.loading} />;
      case 'social':
        return (
          <TeammatesRivalsTab
            settings={settings}
            matches={data.matches}
            loading={data.loading}
            myPuuid={profile?.riot_puuid}
          />
        );
      case 'my-hall-of-fame':
        return (
          <HallOfFameTab
            settings={mySettings}
            matches={myMatches}
            loading={isViewingSelf && data.loading}
            puuid={profile?.riot_puuid}
          />
        );
      case 'my-weakness':
        return <WeaknessTab settings={mySettings} matches={myMatches} onNavigate={handleWeaknessNavigate} />;
      case 'my-skins-collection':
        return <MySkinsCollectionTab myId={session.user.id} />;
      case 'buy-simulator':
        return <BuySimulatorTab settings={settings} matches={data.matches} loading={data.loading} />;
      case 'play-sessions':
        return <PlaySessionsTab settings={mySettings} matches={myMatches} apiKey={settings?.apiKey} />;
      case 'session':
        return <SessionGuideTab settings={mySettings} matches={myMatches} loading={isViewingSelf && data.loading} />;
      case 'aim-trainer':
        return (
          <AimTrainerTab
            myId={session.user.id}
            matches={myMatches}
            settings={mySettings}
            apiKey={settings?.apiKey}
            rank={myRank}
            profile={profile}
            requestedMode={pendingAimTrainerMode}
            onRequestedModeConsumed={() => setPendingAimTrainerMode(null)}
          />
        );
      case 'wiki':
        return <WikiTab />;
      case 'lineups':
        return <LineupsTab myId={session.user.id} isAdmin={isAdmin} />;
      case 'clips':
        return <ClipsTab myId={session.user.id} isAdmin={isAdmin} />;
      case 'team-listings':
        return (
          <TeamListingsTab
            myId={session.user.id}
            isAdmin={isAdmin}
            myRank={myRank}
            profile={profile}
            apiKey={settings?.apiKey}
          />
        );
      case 'admin':
        // Re-vérifié ici, pas seulement dans la nav : même si quelqu'un
        // forçait activeTab à 'admin' sans passer par le bouton (jamais
        // affiché pour un non-admin), rien de sensible ne s'affiche —
        // et de toute façon, la vraie porte fermée est côté serveur (RLS).
        return isAdmin ? <AdminPage myId={session.user.id} /> : null;
      case 'admin-terms':
        return isAdmin ? <TermsAcceptancesPanel /> : null;
      case 'admin-notify':
        return isAdmin ? <AdminNotificationComposer myId={session.user.id} /> : null;
      case 'messages':
        return (
          <MessagesTab
            myId={session.user.id}
            onlineFriendIds={onlineFriendIds}
            initialFriendId={pendingOpenFriendId}
            onConsumedInitialFriendId={() => setPendingOpenFriendId(null)}
            apiKey={settings?.apiKey}
          />
        );
      case 'friends':
        return (
          <FriendsTab
            myId={session.user.id}
            onlineFriendIds={onlineFriendIds}
            onOpenConversation={(friendId) => {
              setPendingOpenFriendId(friendId);
              setActiveTab('messages');
            }}
            apiKey={settings?.apiKey}
          />
        );
      case 'account':
        return (
          <AccountPage
            profile={profile}
            mySettings={mySettings}
            myMatches={myMatches}
            myRank={myRank}
            email={session.user.email}
            onUpdate={updateProfile}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            mySettings={mySettings}
            email={session.user.email}
            apiKey={settings?.apiKey}
            onUpdateApiKey={updateApiKey}
            onUpdateRiotId={updateRiotId}
            onSignOut={() => supabase.auth.signOut().then(lockMessagingKey)}
            onReplayOnboarding={() => setShowOnboarding(true)}
            onOpenDailyOverlaySettings={() => setShowDailyOverlaySettings(true)}
          />
        );
      default:
        return null;
    }
  };

  const currentTabMeta =
    activeTab === 'account'
      ? { icon: User, labelKey: 'nav.tabs.account' }
      : activeTab === 'settings'
        ? { icon: Settings, labelKey: 'nav.tabs.settings' }
        : activeTab === 'messages'
          ? { icon: MessageCircle, labelKey: 'nav.tabs.messages' }
          : activeTab === 'friends'
            ? { icon: Users, labelKey: 'nav.tabs.friends' }
            : [...ALL_TABS, ...(isAdmin ? ADMIN_SECTION.tabs : [])].find((tab) => tab.id === activeTab);

  return (
    <div className="app app-with-sidebar">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <img src={logoText} alt="MVP Tracker" className="logo" />
        </div>

        <div className="sidebar-search" data-tour="sidebar-search">
          <Icon icon={Search} size={15} />
          <input
            type="text"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder={t('nav.searchPlaceholder')}
          />
        </div>

        <div className="sidebar-nav" ref={sidebarNavRef}>
          <div
            className="sidebar-active-indicator"
            style={{
              transform: `translateY(${indicator.top}px)`,
              height: indicator.height,
              opacity: indicator.ready ? 1 : 0,
            }}
          />
          {(isAdmin ? [...NAV_SECTIONS, ADMIN_SECTION] : NAV_SECTIONS).map((section) => {
            const matchingTabs = navQuery
              ? section.tabs.filter((tab) => normalizeRiotIdPart(t(tab.labelKey)).includes(navQuery))
              : section.tabs;
            if (navQuery && matchingTabs.length === 0) return null;
            const collapsed = !navQuery && collapsedSections.has(section.sectionKey);
            return (
              <div key={section.sectionKey} className="sidebar-section" data-tour-section={section.sectionKey}>
                <button
                  className={collapsed ? 'sidebar-section-label collapsed' : 'sidebar-section-label'}
                  onClick={() => toggleSection(section.sectionKey)}
                >
                  {t(section.sectionKey)}
                  <span className="sidebar-section-chevron"><Icon icon={ChevronDown} size={14} /></span>
                </button>
                {!collapsed &&
                  matchingTabs.map((tab) => {
                    // Ignorés dès qu'une recherche filtre la liste : le repère
                    // n'a plus de sens une fois les onglets d'un même groupe
                    // dispersés par le filtre.
                    const subheadingKey = !navQuery ? section.subheadings?.[tab.id] : null;
                    return (
                      <div key={tab.id} className="sidebar-link-group">
                        {subheadingKey && <p className="sidebar-subheading">{t(subheadingKey)}</p>}
                        <button
                          className={tab.id === activeTab ? 'sidebar-link active' : 'sidebar-link'}
                          onClick={() => {
                            setActiveTab(tab.id);
                            setNavSearch('');
                          }}
                          style={{ '--tab-color': tab.color }}
                        >
                          <span className="sidebar-link-icon">
                            <Icon icon={tab.icon} />
                          </span>
                          {t(tab.labelKey)}
                          {tab.id === 'messages' && socialNotificationCount > 0 && (
                            <span className="sidebar-link-badge">{socialNotificationCount}</span>
                          )}
                          {tab.id === 'tournaments' && activeTournamentsCount > 0 && (
                            <span className="sidebar-link-badge glow">{activeTournamentsCount}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <SidebarProfile
            settings={mySettings}
            rank={myRank}
            onClick={() => {
              // Recliquer sur ta carte de profil te ramène sur TON compte,
              // même si tu étais en train de consulter quelqu'un d'autre.
              if (settings?.puuid !== profile.riot_puuid) {
                const ownSettings = {
                  name: profile.riot_name,
                  tag: profile.riot_tag,
                  puuid: profile.riot_puuid,
                  apiKey: settings?.apiKey,
                };
                window.electronAPI.saveSettings(ownSettings);
                setSettings(ownSettings);
              }
              setActiveTab('stats');
            }}
          />
          <button
            className="sidebar-signout"
            title={t('nav.signOut')}
            onClick={() => supabase.auth.signOut().then(lockMessagingKey)}
          >
            <Icon icon={LogOut} size={16} />
          </button>
        </div>
      </nav>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-title-icon"><Icon icon={currentTabMeta?.icon} /></span>
            <h2>{currentTabMeta?.labelKey ? t(currentTabMeta.labelKey) : ''}</h2>
          </div>
          {mySettings?.name && (
            <span className="topbar-account-name" title={t('nav.myAccountTitle')}>
              {mySettings.name}
              <span className="topbar-account-tag">#{mySettings.tag}</span>
            </span>
          )}
          {/* Raccourci toujours visible : l'Aim Trainer était perdu au fond du
              menu de gauche alors que c'est une fonctionnalité à lancer
              souvent, idéalement avant chaque session de jeu. */}
          <button
            className={activeTab === 'aim-trainer' ? 'aim-topbar-button active' : 'aim-topbar-button'}
            title={t('aimTrainer.topbarTitle')}
            onClick={() => setActiveTab('aim-trainer')}
          >
            <span className="aim-topbar-icon"><Icon icon={Target} size={16} /></span>
            <span>{t('nav.tabs.aimTrainer')}</span>
          </button>
          <RefreshButton loading={data.loading} cooldownUntil={data.refreshCooldownUntil} onClick={data.refresh} />
          {pendingUpdate && (
            <button
              className="update-ready-button"
              title={pendingUpdate.releaseName || ''}
              onClick={() => window.electronAPI.installUpdate()}
            >
              {t('nav.updateReady')}
            </button>
          )}
          <button
            className="discord-button"
            title={t('nav.discordTitle')}
            onClick={() => window.electronAPI.openExternal('https://discord.gg/NyZbTsM7D2')}
          >
            <svg viewBox="0 0 127.14 96.36" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
              />
            </svg>
            <span>Discord</span>
          </button>
          <TopbarIconButton
            icon={Sparkles}
            label={t('nav.changelog')}
            title={t('nav.changelogTitle')}
            dot={changelogSeenVersion !== LATEST_CHANGELOG_VERSION}
            active={showChangelog}
            onClick={openChangelog}
          />
          <LanguageToggle />
          <TopbarIconButton
            icon={Bell}
            title={t('nav.announcementsTitle')}
            badge={unreadAnnouncementCount}
            active={showAnnouncements}
            onClick={openAnnouncements}
          />
          <TopbarIconButton
            icon={MessageCircle}
            title={t('nav.unreadMessages')}
            badge={unreadFriendIds.size}
            active={activeTab === 'messages'}
            onClick={() => setActiveTab('messages')}
          />
          <TopbarIconButton
            icon={Users}
            title={t('nav.friendsTitle')}
            badge={pendingRequestCount}
            dot={onlineFriendIds.size > 0}
            active={activeTab === 'friends'}
            onClick={() => setActiveTab('friends')}
          />
          <TopbarIconButton
            icon={Swords}
            label={t('nav.tabs.teamListings')}
            title={t('nav.tabs.teamListings')}
            active={activeTab === 'team-listings'}
            onClick={() => setActiveTab('team-listings')}
          />
          <TopbarIconButton
            icon={Settings}
            title={t('nav.tabs.settings')}
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          />
          <TopbarAccountButton
            profile={profile}
            myRank={myRank}
            active={activeTab === 'account'}
            onClick={() => setActiveTab('account')}
          />
        </header>

        {data.error &&
          (/rate limit/i.test(data.error) ? (
            <p className="error-banner">{t('nav.rateLimited')}</p>
          ) : /account not found/i.test(data.error) && settings?.puuid === profile?.riot_puuid ? (
            // Le compte lié (pas une recherche d'un autre joueur) ne répond
            // plus par nom#tag — signe typique d'un changement de pseudo EN
            // JEU après la liaison (HenrikDev interroge par nom#tag, pas par
            // puuid). On pointe directement vers le champ prévu pour ça
            // plutôt que de laisser un message d'erreur brut sans solution.
            <p className="error-banner">
              {t('nav.riotIdOutdated')}{' '}
              <button className="error-banner-link" onClick={() => setActiveTab('settings')}>
                {t('nav.riotIdOutdatedLink')}
              </button>
            </p>
          ) : (
            <p className="warning">{t('nav.error', { message: data.error })}</p>
          ))}

        <main className="content" key={activeTab}>
          <Suspense fallback={<div className="app-boot-loading"><LoadingState label={t('nav.loading')} /></div>}>
            {renderValorantTab()}
          </Suspense>
        </main>
      </div>

      <GoalsWidget matches={myMatches} settings={mySettings} myId={session.user.id} />
      <WeeklyRecapCard matches={myMatches} settings={mySettings} rank={myRank} />
      {isViewingSelf && <PostMortemModal matches={myMatches} settings={mySettings} />}
      {showAnnouncements && <AnnouncementsModal announcements={announcements} onClose={() => setShowAnnouncements(false)} />}
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
      {!termsAccepted && (
        <TermsModal
          onAccept={acceptTerms}
          onDecline={() => {
            setEnteredApp(false);
            supabase.auth.signOut().then(lockMessagingKey);
          }}
        />
      )}
      {showOnboarding && termsAccepted && <OnboardingTour onClose={closeOnboarding} />}
      {showDailyOverlaySettings && (
        <DailyOverlaySettings matches={myMatches} onClose={closeDailyOverlaySettings} />
      )}
    </div>
  );
}

export default App;
