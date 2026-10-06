# MVP Tracker — guide pour Claude

Application Windows de suivi de stats Valorant (Electron + React) et son application mobile compagnon (Expo). Ce fichier décrit les conventions et les pièges du projet. L'état d'avancement est dans `PROGRESS.md`.

## Les deux dépôts

- **Desktop** : ce dépôt, `github.com/SrayZz57/mvp-tracker-client` (public), en local `C:\Users\Administrator\mvp-tracker-client`. Branche de travail : `master`.
- **Mobile** : `github.com/SrayZz57/mvp-tracker-mobile` (privé), en local `C:\Users\Administrator\mvp-tracker-mobile`, branche `main`. Expo SDK 57, expo-router, TypeScript.
- **Backend commun** : un projet Supabase (auth, tables avec RLS, Edge Functions).
- **Données de match** : API HenrikDev, avec la clé personnelle de chaque joueur (quota limité).
- **Assets du jeu** (armes, agents, maps, rangs) : valorant-api.com, chargés en direct.

## Lancer

- **Desktop** : `npm start` (electron-forge + Vite). À lancer dans un terminal Windows normal, **pas** dans le terminal de l'extension VS Code : elle définit `ELECTRON_RUN_AS_NODE=1` et Electron ne s'ouvre pas. Sur le PC de dev, Smart App Control a dû être désactivé (`electron.exe` n'est pas signé). Pas de rechargement à chaud pour `main.js` : relancer.
- **Mobile** : `npm start` (Metro), puis un build natif avec `npx expo run:android`. Expo Go ne convient pas à la connexion OAuth (son schéma `exp://` change d'IP et n'est pas accepté par la liste de redirection Supabase). Prérequis Windows : Android Studio, `ANDROID_HOME`, et un **JDK 17** dans `JAVA_HOME` (le JDK 25 embarqué dans Android Studio fait échouer les tâches CMake). Écran noir au lancement : tuer l'ancien Metro sur le port 8081 et relancer `npx expo start --dev-client`.

## Structure du desktop

- `src/main.js` : process principal, IPC, deep links `mvptracker://`, overlay, cache des matchs (`services/matchesReader.js` + worker, base SQLite `matches.db` dans `%APPDATA%\MVP Tracker`).
- `src/preload.js` : pont IPC exposé en `window.electronAPI`.
- `src/renderer/` : React. `App.jsx` (barre du haut, navigation), `tabs/`, un composant ou une page par fichier.
- `src/services/` : `matchNormalizer.js` convertit les matchs HenrikDev v4 vers le format interne (proche de la v3), lecture du cache.
- `src/index.css` : une seule feuille de style (~12 000 lignes). Ajouter les règles près de la section concernée.
- `src/renderer/i18n/locales/{fr,en}.json` : toute chaîne visible existe dans les deux langues.
- `sql/` : scripts Supabase à exécuter une fois, à la main, dans le SQL Editor.
- `supabase/functions/` : Edge Functions, déployées à la main depuis le dashboard Supabase.

## Conventions

- Commentaires en français qui expliquent le pourquoi (contexte, bug rencontré), dans le style du code voisin.
- **Release** : commit « vX.Y.Z : résumé », version dans `package.json`, entrée dans `src/renderer/changelog.js` (fr + en, la plus récente en premier), puis `npm run publish` (electron-forge vers GitHub). Un push sur `master` ne publie rien : il n'y a pas de CI.
- Les fichiers sont en CRLF : les remplacements multi-lignes par script échouent, utiliser les outils d'édition.
- **Le mobile est un port** : `src/lib/valorantStats.ts` (mobile) doit rester aligné sur `src/renderer/valorantStats.js` (desktop). Toute correction de règle de stats va dans les deux.
- **Dépôt public** : jamais de secret dans un fichier (clé API, jeton GitHub, `WEBHOOK_SECRET`). La clé Supabase « anon » est publique par conception. La clé `service_role` n'existe que dans les Edge Functions.

## Pièges CSS

- La règle globale `button:hover:not(:disabled):not(.weekly-notch)…` a une spécificité plus haute que `.ma-classe:hover`. Un bouton qui a son propre style de survol doit être ajouté à la liste des `:not()` (voir `.account-auth-google-button`, `.danger-zone-button`).
- La barre du haut est réduite par `zoom` selon la résolution (Windows à 125 % / 150 %). Voir la fin de `index.css`.

## Statistiques et modes de jeu

- `excludeDeathmatch()` (`valorantStats.js`) retire des stats globales les modes sans vraie victoire ou défaite : une liste d'identifiants (`NON_STANDARD_MODE_IDS`) et tout match à plus de deux équipes. Ces modes restent visibles dans l'historique et dans les filtres, dont la liste est construite dynamiquement à partir des matchs.
- Chaque rafraîchissement coûte des appels HenrikDev : le mobile impose un délai de 60 s (`usePerformanceData`), à ne pas contourner.

## Authentification

- E-mail + mot de passe, Google et Discord (Supabase Auth). « Confirm email » est désactivé sur le projet : le compte est actif tout de suite.
- **Desktop** : `signInWithOAuth` avec `redirectTo: 'mvptracker://auth/callback'`, ouvert dans le navigateur système, retour par deep link (`handleDeepLink` dans `main.js`).
- **Mobile** : `WebBrowser.openAuthSessionAsync`. `mvptracker://auth/callback` doit figurer dans les Redirect URLs de Supabase.

## Supabase : pièges rencontrés

- **CORS** : une Edge Function appelée depuis l'app doit répondre aux requêtes `OPTIONS` et ajouter les en-têtes CORS à toutes ses réponses, sinon l'app affiche « Failed to send a request to the Edge Function ».
- **Verify JWT** : à désactiver pour une fonction appelée par un webhook (pas de JWT utilisateur). Cette option bloque aussi le préflight CORS.
- **Nom d'une fonction** : le nom tapé à la création n'est pas forcément son identifiant. Vérifier l'URL dans l'onglet Overview. La fonction d'e-mail de bienvenue s'appelle `swift-api`.
- **Trigger sur `auth.users`** : impossible depuis l'interface graphique, uniquement en SQL. `on_auth_user_created` appelle `supabase_functions.http_request` vers `.../functions/v1/swift-api` avec l'en-tête `x-webhook-secret`. Diagnostic : `select * from net._http_response order by created desc limit 5;`.
- **Suppression de compte** : Edge Function `delete-account` (`auth.admin.deleteUser`, clé `service_role`). La cascade nettoie les tables liées. `account_deletion_feedback` n'a volontairement aucune clé étrangère, pour survivre à la suppression.
- **E-mails** : Resend, expéditeur `noreply@mvptracker.fr`. Secrets attendus : `RESEND_API_KEY`, `WEBHOOK_SECRET`. La fonction `contact-notify` (formulaire de contact du site, déclenchée par un webhook sur `contact_messages`) utilise les mêmes secrets.
