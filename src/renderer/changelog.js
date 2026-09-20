// Historique affiché dans la fenêtre "Nouveautés" (bouton à droite de Discord,
// voir ChangelogModal.jsx). Le plus récent en premier — la première entrée
// sert aussi de repère pour le point "nouveau" : il reste affiché tant que
// l'utilisateur n'a pas ouvert la fenêtre depuis cette version.
// À compléter à chaque release, dans le même esprit que l'annonce Discord.
export const CHANGELOG = [
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
