# Avancement — mis à jour le 2026-09-24

Version publiée : **1.10.14**. La **1.10.15** est préparée (version dans `package.json`, entrée fr + en dans `changelog.js`, commit « v1.10.15 ») mais **pas encore publiée** : il reste à pousser `master` sur GitHub puis à lancer `npm run publish` (jeton GitHub requis). Elle regroupe la branche `ui-ux-refonte` (fusionnée dans `master` le 2026-09-24) et le travail qui a suivi. Le mobile n'en fait pas partie.

## Fait

### Desktop (`master`)

- Connexion Google et Discord : boutons et `handleOAuthSignIn(provider)` dans `AccountAuth.jsx`. Écran de connexion et page « Ma collection » redessinés.
- Écran d'accueil (« Salut … ») : nouveau logo (`logo-text.png`, classe `.greeting-logo`), puce de série de victoires ou défaites, cartes revenues à la disposition de master (centrées, même hauteur).
- **Suppression de compte** : Paramètres → Zone dangereuse → `DeleteAccountModal.jsx` (raisons à cocher enregistrées dans `account_deletion_feedback`, puis confirmation, puis Edge Function `delete-account`). Testé de bout en bout.
- **E-mails Resend** : bienvenue à l'inscription (trigger → `swift-api`) et confirmation à la suppression (dans `delete-account`), en texte + HTML.
- Barre du haut : réduite à 66 % (Windows 150 %) ou 80 % (125 %) pour tenir sur une ligne. Fin de `index.css`.
- Modes à plus de deux équipes (Gauntlet: Glitched, patch 13.06) : exclus des stats globales, et détail du match avec équipes classées (`rankedTeamGroups`).
- **Sensitivity Finder** (`sensitivityFit.js`, `analyzeFinderResults`) : score = touches × précision (la précision seule plafonnait à 100 % et faisait toujours conseiller la sensibilité la plus basse). La conseillée vient toujours de la courbe sur les 9 essais, jamais du « meilleur essai ». Essais joués dans un ordre aléatoire, résultats affichés triés. Messages « trop proches pour départager » (écart < 1 touche effective) et « optimum hors plage » (`edge`).
- Liaison du compte Riot : message clair quand HenrikDev répond « Error while fetching needed match data ». Cas `geekplay#geek` : reproduit sur toutes les routes par pseudo, cause côté HenrikDev non identifiée.

### Mobile (`main`)

- Boutons Google et Discord, pull-to-refresh (Mon compte et les 6 écrans Performance, avec délai de 60 s), Wrapped au design desktop, bouton de fermeture des fiches sous l'encoche, build natif Android fonctionnel.
- **Non commité** : bouton Discord et exclusion/affichage des matchs multi-équipes (`login-screen.tsx`, `match-detail-modal.tsx`, `valorantStats.ts`).

## À vérifier

1. **Discord** : l'écran Discord répond « Invalid OAuth2 redirect_uri ». Vérifier que `https://<projet>.supabase.co/auth/v1/callback` est dans OAuth2 → Redirects du portail Discord (et enregistré), et que le provider Discord est activé dans Supabase avec le bon Client ID et Secret.
2. **Edge Functions** : redéployer `delete-account` et `swift-api` avec les dernières versions du dépôt (texte + HTML, sans mention d'un e-mail de confirmation à venir).
3. **Spam** : les e-mails arrivent dans les indésirables. Vérifier SPF, DKIM et DMARC de `mvptracker.fr` dans Resend (domaine « Verified »).
4. **Gauntlet** : jouer une partie et vérifier historique, détail et stats. Si HenrikDev regroupe les équipes en deux, ajouter son `mode_id` à `NON_STANDARD_MODE_IDS` (desktop et mobile).
5. **Barre du haut à 150 %** : valider le rendu réel sur le portable.
6. **Sensitivity Finder** : à essayer avec de vraies séries. Le seuil « trop proches » (1 touche effective) a été choisi sans données réelles, et les cas ont été testés sur des résultats fabriqués.
7. **Sécurité** : le jeton GitHub du dépôt mobile et le `WEBHOOK_SECRET` ont transité dans une conversation, les régénérer. Le remote git du dépôt mobile contient encore le jeton dans son URL : `git remote set-url origin https://github.com/SrayZz57/mvp-tracker-mobile.git`.

## Reste à faire

- **Publier la 1.10.15** : `git push origin master ui-ux-refonte`, puis `npm run publish`.
- **Retours Discord sur le Sensitivity Finder, pas encore faits** : menu de récap par essai (réactivité moyenne, la plus courte, ratés), ignorer les clics ~1 s après la fin d'un essai (le bouton « Suivant » se retrouve sous le curseur), compte à rebours 3-2-1 avant chaque exercice (aujourd'hui `nextStep` verrouille la souris et lance le chrono au clic). Améliorations discutées : afficher une plage plutôt qu'un chiffre, ajuster la courbe sur le logarithme de la sensibilité, tracer la courbe sur l'écran de résultats.
- **Guess My Rank** (idée discutée, non lancée) : réutiliser les clips. La bonne réponse doit vivre dans une table à part, lisible seulement par l'auteur et par ceux qui ont déjà deviné (RLS), sinon n'importe qui la lit dans la requête du clip.
- **Apple Sign-In** : obligatoire sur iOS dès qu'un autre login social est proposé. Demande un compte Apple Developer et un build iOS via EAS (pas de Mac).
- Afficher « MVP Tracker » au lieu du domaine Supabase sur l'écran de consentement Google : domaine personnalisé Supabase (payant) et vérification côté Google.
- `WelcomeScreen`, `LinkRiotAccount` et `AimTrainerHub` utilisent encore l'ancien `logo.png`.
- Warden (arme du patch 13.06) : icônes et prix arrivent seuls via valorant-api.com, mais l'Aim Trainer a sa propre liste d'armes.
- Stats dédiées au Gauntlet (classement final moyen) : proposées, non demandées.
- Export du Wrapped en image sur mobile (`react-native-view-shot`).
