# Avancement — mis à jour le 2026-09-24

Version publiée : **1.10.14**. `master` contient en plus tout le travail de la branche `ui-ux-refonte` (fusionnée le 2026-09-24), qui n'a pas encore été publié : il faudra une version 1.10.15 avec son entrée de changelog.

## Fait

### Desktop (`master`)

- Connexion Google et Discord : boutons et `handleOAuthSignIn(provider)` dans `AccountAuth.jsx`. Écran de connexion et page « Ma collection » redessinés.
- Écran d'accueil (« Salut … ») : nouveau logo (`logo-text.png`, classe `.greeting-logo`), puce de série de victoires ou défaites, cartes revenues à la disposition de master (centrées, même hauteur).
- **Suppression de compte** : Paramètres → Zone dangereuse → `DeleteAccountModal.jsx` (raisons à cocher enregistrées dans `account_deletion_feedback`, puis confirmation, puis Edge Function `delete-account`). Testé de bout en bout.
- **E-mails Resend** : bienvenue à l'inscription (trigger → `swift-api`) et confirmation à la suppression (dans `delete-account`), en texte + HTML.
- Barre du haut : réduite à 66 % (Windows 150 %) ou 80 % (125 %) pour tenir sur une ligne. Fin de `index.css`.
- Modes à plus de deux équipes (Gauntlet: Glitched, patch 13.06) : exclus des stats globales, et détail du match avec équipes classées (`rankedTeamGroups`).

### Mobile (`main`)

- Boutons Google et Discord, pull-to-refresh (Mon compte et les 6 écrans Performance, avec délai de 60 s), Wrapped au design desktop, bouton de fermeture des fiches sous l'encoche, build natif Android fonctionnel.
- **Non commité** : bouton Discord et exclusion/affichage des matchs multi-équipes (`login-screen.tsx`, `match-detail-modal.tsx`, `valorantStats.ts`).

## À vérifier

1. **Discord** : l'écran Discord répond « Invalid OAuth2 redirect_uri ». Vérifier que `https://<projet>.supabase.co/auth/v1/callback` est dans OAuth2 → Redirects du portail Discord (et enregistré), et que le provider Discord est activé dans Supabase avec le bon Client ID et Secret.
2. **Edge Functions** : redéployer `delete-account` et `swift-api` avec les dernières versions du dépôt (texte + HTML, sans mention d'un e-mail de confirmation à venir).
3. **Spam** : les e-mails arrivent dans les indésirables. Vérifier SPF, DKIM et DMARC de `mvptracker.fr` dans Resend (domaine « Verified »).
4. **Gauntlet** : jouer une partie et vérifier historique, détail et stats. Si HenrikDev regroupe les équipes en deux, ajouter son `mode_id` à `NON_STANDARD_MODE_IDS` (desktop et mobile).
5. **Barre du haut à 150 %** : valider le rendu réel sur le portable.
6. **Sécurité** : le jeton GitHub du dépôt mobile et le `WEBHOOK_SECRET` ont transité dans une conversation, les régénérer. Le remote git du dépôt mobile contient encore le jeton dans son URL : `git remote set-url origin https://github.com/SrayZz57/mvp-tracker-mobile.git`.

## Reste à faire

- **Release 1.10.15** : `package.json`, `changelog.js` (fr + en), commit « v1.10.15 : … », `npm run publish`.
- **Apple Sign-In** : obligatoire sur iOS dès qu'un autre login social est proposé. Demande un compte Apple Developer et un build iOS via EAS (pas de Mac).
- Afficher « MVP Tracker » au lieu du domaine Supabase sur l'écran de consentement Google : domaine personnalisé Supabase (payant) et vérification côté Google.
- `WelcomeScreen`, `LinkRiotAccount` et `AimTrainerHub` utilisent encore l'ancien `logo.png`.
- Warden (arme du patch 13.06) : icônes et prix arrivent seuls via valorant-api.com, mais l'Aim Trainer a sa propre liste d'armes.
- Stats dédiées au Gauntlet (classement final moyen) : proposées, non demandées.
- Export du Wrapped en image sur mobile (`react-native-view-shot`).
