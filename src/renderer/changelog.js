// Historique affiché dans la fenêtre "Nouveautés" (bouton à droite de Discord,
// voir ChangelogModal.jsx). Le plus récent en premier — la première entrée
// sert aussi de repère pour le point "nouveau" : il reste affiché tant que
// l'utilisateur n'a pas ouvert la fenêtre depuis cette version.
// À compléter à chaque release, dans le même esprit que l'annonce Discord.
export const CHANGELOG = [
  {
    version: '1.11.0',
    date: '2026-09-25',
    items: {
      fr: [
        'Stats : nouveau design pour Stats globales (avec ton agent phare et la répartition de tes tirs), Stats par arme, par agent, par map, par rôle et par mode, ainsi que pour la Progression.',
        'Détail d’un match repensé : résultat et score en rounds en haut, joueurs classés par score, kills par arme, et détail round par round qu’on déplie à la demande.',
        'Profil ADN : chaque score a maintenant une infobulle qui explique son calcul. Agressivité (fréquence des premiers duels), Résilience (tes perfs après une défaite) et Polyvalence (les agents que tu maîtrises vraiment) sont recalculées, et les archétypes réécrits en conséquence.',
        'Aim Trainer : deux armes au choix, le Vandal (par défaut) et le Glock. L’arme « Défaut » est retirée.',
        'Overlay de session : le réactiver pendant que Valorant est ouvert l’affiche maintenant tout de suite, sans passer par le mode déplacement.',
        'Onglet Analyse : le bloc d’auto-évaluation post-match est retiré et le tutoriel mis à jour.',
      ],
      en: [
        'Stats: new design for Global stats (with your top agent and shot distribution), Weapon, Agent, Map, Role and Mode stats, and for Progression.',
        'Match details redesigned: result and round score at the top, players ranked by score, kills by weapon, and a round-by-round breakdown you can expand on demand.',
        'DNA Profile: each score now has a tooltip explaining how it is calculated. Aggression (how often you take opening duels), Resilience (your performance after a loss) and Versatility (agents you truly master) are recalculated, and the archetypes rewritten accordingly.',
        'Aim Trainer: two weapons to choose from, the Vandal (default) and the Glock. The “Default” weapon is removed.',
        'Session overlay: turning it back on while Valorant is open now shows it right away, without going through move mode.',
        'Analysis tab: the post-match self-assessment block is removed and the tutorial updated.',
      ],
    },
  },
  {
    version: '1.10.16',
    date: '2026-09-24',
    items: {
      fr: [
        'Stats : nouveau graphique de ton RR sur 20 jours, à côté du Profil ADN, avec les rangs traversés, les montées/descentes et le RR gagné ou perdu à chaque partie. Un bouton permet de le recharger seul.',
        'L’app ne lit plus aucun fichier de Riot : la détection de Valorant se fait uniquement par le nom du processus, comme le Gestionnaire des tâches.',
      ],
      en: [
        'Stats: new 20-day RR chart next to the DNA Profile, showing ranks crossed, promotions/demotions and the RR gained or lost each game. A button reloads just this block.',
        'The app no longer reads any Riot file: Valorant detection relies only on the process name, like the Task Manager.',
      ],
    },
  },
  {
    version: '1.10.15',
    date: '2026-09-24',
    items: {
      fr: [
        'Connexion avec Google ou avec Discord, en plus de l’e-mail, et écran de connexion redessiné.',
        'Réglages : nouveau bouton Supprimer mon compte (zone dangereuse). Une fenêtre te demande d’abord pourquoi tu pars (optionnel), puis confirme la suppression, et un e-mail te confirme que c’est fait. Un e-mail de bienvenue est aussi envoyé à l’inscription.',
        'Ma collection : la valeur totale est mise en avant, avec ton skin le plus cher et la répartition par rareté.',
        'Accueil : nouveau logo, et ta série de victoires ou de défaites en cours s’affiche à côté de tes 5 dernières parties.',
        'Barre du haut : elle tient de nouveau sur une seule ligne quand Windows est réglé à 125 % ou 150 %.',
        'Gauntlet: Glitched (patch 13.06) : ces parties de 8 duos ne comptent plus dans tes statistiques (winrate, K/D…), et le détail d’un match affiche les équipes classées.',
        'Sensitivity Finder : les 9 essais sont joués dans un ordre aléatoire et notés sur touches × précision. La sensibilité conseillée est calculée sur l’ensemble des essais (fini le « toujours la plus basse » quand tout est à 100 %), et l’écran te dit quand les résultats sont trop proches ou que l’optimum est hors de la plage testée.',
        'Lier ton compte Riot : quand HenrikDev n’arrive pas à lire un compte, un message clair remplace l’erreur brute en anglais.',
      ],
      en: [
        'Sign in with Google or Discord, in addition to email, and a redesigned sign-in screen.',
        'Settings: new Delete my account button (danger zone). A window first asks why you’re leaving (optional), then confirms the deletion, and an email confirms it’s done. A welcome email is also sent when you sign up.',
        'My collection: the total value is front and center, with your most expensive skin and a breakdown by rarity.',
        'Home: new logo, and your current win or loss streak is shown next to your last 5 games.',
        'Top bar: it fits on a single line again when Windows is set to 125% or 150%.',
        'Gauntlet: Glitched (patch 13.06): these 8-duo games no longer count in your stats (winrate, K/D…), and the match detail shows the teams ranked.',
        'Sensitivity Finder: the 9 tests are played in random order and scored on hits × accuracy. The suggested sensitivity is computed from all the tests (no more “always the lowest” when everything is at 100%), and the screen tells you when results are too close or the optimum is outside the tested range.',
        'Linking your Riot account: when HenrikDev can’t read an account, a clear message replaces the raw English error.',
      ],
    },
  },
  {
    version: '1.10.14',
    date: '2026-09-21',
    items: {
      fr: [
        'Premier lancement : le tutoriel ne se superpose plus aux conditions d’utilisation ni à la fenêtre de l’overlay de session. Il démarre une fois ces deux étapes terminées.',
      ],
      en: [
        'First launch: the tutorial no longer overlaps the terms of use or the session overlay window. It starts once both are done.',
      ],
    },
  },
  {
    version: '1.10.13',
    date: '2026-09-21',
    items: {
      fr: [
        'Aim Trainer : un preset personnalisé garde maintenant le comportement du mode de base choisi (Tracking, Orbit...), et chaque étape d’une playlist reprend les réglages de son preset, nombre de cibles compris. Les anciens presets restent en Flick : il faut les recréer.',
        'Détection de tilt : elle ne tourne plus que lorsque le jeu est lancé (plus quand seul le lanceur Riot est ouvert), et repart de zéro à chaque fermeture de Valorant.',
        'Moins d’appels à l’API HenrikDev : les données déjà récupérées sont partagées entre le bouton Rafraîchir, l’overlay de session et la détection de tilt, et la vérification toutes les 2 minutes ne télécharge plus que le dernier match. Ton quota dure plus longtemps.',
      ],
      en: [
        'Aim Trainer: a custom preset now keeps the behavior of the base mode you picked (Tracking, Orbit...), and each playlist step uses its preset’s settings, including the number of targets. Older presets stay Flick: you need to recreate them.',
        'Tilt detection: it now only runs while the game is running (no longer when only the Riot launcher is open), and starts from scratch each time Valorant is closed.',
        'Fewer HenrikDev API calls: data already fetched is shared between the Refresh button, the session overlay and tilt detection, and the check every 2 minutes only downloads the latest match. Your quota lasts longer.',
      ],
    },
  },
  {
    version: '1.10.11',
    date: '2026-09-20',
    items: {
      fr: [
        'Clips et Lineups : les vidéos YouTube s’affichaient en noir dans l’app installée, elles se lisent de nouveau.',
      ],
      en: [
        'Clips and Lineups: YouTube videos showed a black screen in the installed app, they play again.',
      ],
    },
  },
  {
    version: '1.10.10',
    date: '2026-09-20',
    items: {
      fr: [
        'Nouveau logo : icône de l’app (barre de titre, barre des tâches) et logo du menu de gauche.',
        'Bouton cloche pour les annonces de l’équipe MVP Tracker, et bouton Nouveautés à droite de Discord.',
        'Historique de matchs : tu peux maintenant filtrer par map et par agent.',
        'Tournois de la communauté : tout le monde peut créer un tournoi, avec recherche et filtre par rang. La page indique aussi pourquoi les inscriptions sont closes.',
        'App plus légère sur les PC modestes : nouveau Mode économique (Réglages), moins de processeur et de mémoire utilisés.',
        'L’overlay de session s’affiche et se déplace même sans Valorant ouvert.',
        'Aim Trainer : option pour couper le son quand une cible est touchée, et l’objectif du jour n’est plus lié à une map précise.',
        'Corrections d’affichage du menu de gauche (indicateur de l’onglet actif, double cadre au survol).',
      ],
      en: [
        'New logo: app icon (title bar, taskbar) and the logo in the left menu.',
        'Bell button for announcements from the MVP Tracker team, and a What’s new button next to Discord.',
        'Match history: you can now filter by map and by agent.',
        'Community tournaments: anyone can create a tournament, with search and rank filter. The page also tells you why registrations are closed.',
        'Lighter app on low-end PCs: new Power-saving mode (Settings), less CPU and memory used.',
        'The session overlay shows up and can be moved even without Valorant running.',
        'Aim Trainer: option to mute the sound when a target is hit, and the daily objective is no longer tied to a specific map.',
        'Left menu display fixes (active tab indicator, double frame on hover).',
      ],
    },
  },
  {
    version: '1.10.9',
    date: '2026-09-20',
    items: {
      fr: [
        'Démarrage beaucoup plus rapide, surtout si tu utilises l’app depuis longtemps.',
        'Nouvelle page Réglages (bouton engrenage en haut à droite), avec l’option pour couper les notifications de tilt.',
        'Sensitivity Finder dans l’Aim Trainer : 9 tests à des sensibilités différentes, puis une sensibilité suggérée. Ces tests ne comptent pas dans les classements.',
        'Overlay de session : il ne revient plus à sa place pendant qu’on le déplace, et il se déplace aussi sans Valorant ouvert.',
        'Le bouton Rafraîchir a un chrono de 60 secondes.',
        'MVP Tracker devient une app personnelle : la recherche d’autres joueurs est retirée, tu ne vois que tes propres stats.',
        'Le détail round par round (Heatmap, détail d’un match) est conservé sur tes 100 derniers matchs. Tes stats globales restent complètes.',
        'Les conditions d’utilisation s’affichent une fois à la première ouverture.',
      ],
      en: [
        'Much faster startup, especially if you have used the app for a long time.',
        'New Settings page (gear button at the top right), with an option to turn off tilt notifications.',
        'Sensitivity Finder in the Aim Trainer: 9 tests at different sensitivities, then a suggested sensitivity. These tests do not count toward leaderboards.',
        'Session overlay: it no longer snaps back while you move it, and you can also move it without Valorant running.',
        'The Refresh button now has a 60-second cooldown.',
        'MVP Tracker is now a personal app: searching other players is removed, you only see your own stats.',
        'Round-by-round detail (Heatmap, match detail) is kept for your last 100 matches. Your overall stats stay complete.',
        'The terms of use are shown once on first launch.',
      ],
    },
  },
  {
    version: '1.10.8',
    date: '2026-09-17',
    items: {
      fr: [
        'Overlay de session corrigé : il ne se déclenche plus dès que le Riot Client est ouvert, mais uniquement quand tu es réellement en jeu.',
        'Nouvelles options pour l’overlay : taille réglable et déplacement à la souris.',
        'Démarrage plus rapide : le menu principal s’affiche plus vite.',
      ],
      en: [
        'Session overlay fixed: it no longer starts as soon as the Riot Client is open, only when you are actually in game.',
        'New overlay options: adjustable size and moving it with the mouse.',
        'Faster startup: the main menu shows up sooner.',
      ],
    },
  },
  {
    version: '1.10.7',
    date: '2026-09-16',
    items: {
      fr: [
        'Nouvel overlay de session en haut à droite de l’écran pendant que tu joues : victoires/défaites, % de headshots et K/D du jour, mis à jour toutes les 5 minutes.',
      ],
      en: [
        'New session overlay at the top right of the screen while you play: wins/losses, headshot % and today’s K/D, refreshed every 5 minutes.',
      ],
    },
  },
];

export const LATEST_CHANGELOG_VERSION = CHANGELOG[0].version;
