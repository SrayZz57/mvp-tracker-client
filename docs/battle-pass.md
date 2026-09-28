# Battle Pass MVP Tracker — conception

Branche : `feature/battle-pass`. Ce document est la référence du chantier : il
fixe les décisions d'architecture (avec ce qu'elles coûtent) et l'ordre de
livraison. À mettre à jour à chaque phase terminée.

## Objectif

Un système saisonnier dans l'Aim Trainer : des défis (jour / semaine / saison)
donnent de l'XP, l'XP fait monter un niveau, chaque niveau débloque une
récompense cosmétique. Trois autres chantiers viennent avec : la page « Modes »
en trois cartes, un classement global (top 10), et des cosmétiques visibles par
les autres joueurs. **Uniquement du cosmétique** : aucun avantage de jeu, sinon
le classement perd son sens.

## Ce qui existe déjà et qu'on réutilise

| Besoin | Existant |
|---|---|
| Scores | Supabase `aim_trainer_scores` (écriture client, RLS), `aimScores.js` |
| Défi du jour | `aimChallenge.js` : dérivé de la date, pas d'aléa, pas de synchro |
| Classements | `loadDailyLeaderboard`, amis, vue `aim_trainer_global_bests` |
| Profil public | `profiles` (`PROFILE_FIELDS` : avatar, display_name, rôle…) |
| Skins d'armes | ~65 skins (`WEAPON_MODELS`), aperçus, Vestiaire, sons |
| Mains | `viewmodelHands.js` : matériaux centralisés (`handMaterials`) |
| Ennemis | `aimBots.js` (bonshommes des modes Headshot) |
| Arènes | `aimArenas.js` (Monastère), `aimArenaAscent.js` (Belvédère) |
| Navigation du hub | `NAV_KEYS` + `screen` dans `AimTrainerHub.jsx` |
| Mesure | PostHog déjà branché → sert à régler les courbes d'XP |

Point d'attention : le SQL de `aim_trainer_scores` **n'est pas dans `sql/`**.
Première tâche technique : exporter le schéma actuel dans un fichier versionné,
sinon on empile des migrations sur une base qu'on ne peut pas reconstruire.

## Décisions d'architecture

### 1. Le catalogue est dans le code ; le serveur en reçoit une copie générée

`src/renderer/battlePass/catalog.js` décrit saison, courbe de niveaux et
récompenses. C'est la **seule source de vérité**. Le serveur, lui, a besoin de
connaître le calendrier et le niveau requis de chaque récompense (pour refuser
une réclamation trop tôt et une horloge falsifiée) : le script
`node scripts/generate-battle-pass-sql.mjs` en tire `sql/battle_pass_season_N.sql`, et
un test échoue si ce fichier n'est pas à jour. Client et serveur ne peuvent donc
pas diverger sans que ça se voie.

- Pour : versionné dans git, relu comme du code, aucun outil d'admin à
  construire. Un cosmétique est de toute façon du code (skins procéduraux), donc
  une nouvelle saison demande une mise à jour de l'app dans tous les cas.
- Contre : changer une récompense en plein milieu de saison = release + rejouer
  le semis. Accepté : l'auto-update existe et le semis est rejouable.
- Règle d'or : on ne retire jamais l'id d'une récompense d'une saison publiée
  (la base l'interdit d'ailleurs par clé étrangère dès qu'elle est réclamée).

### 2. XP dérivée côté serveur, jamais envoyée par le client

Le client peut écrire ce qu'il veut dans Supabase (clé anon). Si l'app envoyait
« +500 XP », n'importe qui pourrait se donner le niveau 50.

Choix : une fonction SQL `award_xp(...)` (RPC) calcule l'XP **à partir des
lignes de `aim_trainer_scores`**, avec :
- unicité `(user_id, source, ref)` → impossible de toucher deux fois le même défi ;
- plafond d'XP par jour ;
- plausibilité minimale (durée, score max par mode/durée).

Limite assumée : les scores eux-mêmes sont écrits par le client, donc un
tricheur motivé peut fabriquer un score. Les plafonds bornent les dégâts, ils
ne rendent pas la triche impossible. Suffisant pour du cosmétique ; une
simulation serveur complète serait disproportionnée.

### 3. Les défis sont calculés, pas stockés

Quotidien = fonction de la date, hebdo = fonction de la semaine ISO, saisonnier
= liste fixe du catalogue (même principe que `buildDailyChallenge`). La
progression d'un défi se **recalcule depuis l'historique des scores** de la
période, au lieu de tenir des compteurs.

- Pour : une seule source de vérité, pas de dérive entre compteur et scores,
  rien à réparer si un compteur se désynchronise, aucun aléa à synchroniser.
- Contre : une requête d'historique à l'ouverture de l'écran. Bornée à la
  période en cours (≤ 1 saison) et mise en cache mémoire → négligeable.

### 4. Niveau = fonction pure de l'XP totale

`levelFromXp(total)` vit dans le catalogue, testable sans réseau. En base on ne
stocke que des **événements d'XP** (`bp_xp_events`), jamais un « niveau ». Le
niveau ne peut donc pas diverger des événements.

### 5. Horloge de référence : UTC

L'existant (`todayKey`) utilise la date **locale**. Pour le battle pass, le
plafond quotidien et les resets doivent avoir une seule horloge côté serveur :
UTC, avec compte à rebours affiché. Le défi du jour existant garde sa date
locale (sinon on casse ses classements) ; on documente l'écart plutôt que de le
laisser surprendre.

### 6. Où vit chaque cosmétique équipé

- **Visible des autres** (titre, carte, icône) : colonnes sur `profiles`,
  lisibles publiquement — c'est ce qui permet de les afficher dans le
  classement et chez les amis.
- **Visible de soi seul** (skin d'arme, mains, ennemis, arène) : `electron-store`
  comme `weaponSkin` aujourd'hui. Inutile de payer un aller-retour réseau
  pour ce que personne d'autre ne voit.

### 7. Les récompenses réutilisent le travail fait

- **Skins d'armes** : les ~65 existants sont répartis sur les paliers par
  rareté (Base → Transcendant). Zéro modélisation en plus. Le début du pass
  est rempli de skins **de base** (`basicSkins.js`) : la finition standard
  repeinte (Commun), plus au besoin un effet simple — dégradé, reflet qui
  parcourt l'arme, lueur qui pulse (Rare). Quelques lignes de données chacun.
- **Skins de mains** : paramètres de `handMaterials` (couleur du gant, motif,
  liseré). Faisable, peu coûteux. Décision : **oui**.
- **Skins d'ennemis** : variantes de matériaux/accessoires sur `aimBots.js`.
- **Maps personnalisées** : *variantes* des deux arènes existantes (heure du
  jour, palette, ciel, éclairage), pas de nouvelle géométrie. Le coût d'une
  vraie nouvelle carte est celui de Belvédère ; une variante coûte un dixième
  et reste dans le budget de performance.
- **Icônes, titres, cartes de joueur** : données + rendu CSS/SVG, sans 3D.

### 8. Un seul parcours gratuit pour l'instant

Le schéma prévoit une colonne `track` (`free` | `premium`), mais seul `free`
existe. La monétisation (version payante, pubs) est prévue à terme : ne pas la
coder maintenant, ne pas la rendre impossible non plus.

## Modèle de données (livré en phase 1 — `sql/battle_pass.sql`)

```
bp_seasons     id, number, starts_at, ends_at, max_level, level_base, level_step
bp_rewards     season_id, track, reward_id, level, type      (semé depuis le catalogue)
bp_xp_events   user_id, season_id, source, ref, xp           unique (user, saison, source, ref)
bp_claims      user_id, season_id, track, reward_id          FK -> bp_rewards (jamais supprimable)
profiles       + title_id, card_id, icon_id                  (équipés, publics)

fonctions      bp_level_from_xp(saison, xp)   miroir SQL de levelFromXp (JS), vérifié identique
               bp_my_xp(saison)               XP du joueur connecté
               bp_current_season()            selon l'horloge du serveur
               bp_claim_reward(saison, id)    recalcule le niveau depuis les événements d'XP
               bp_equip(kind, id)             exige d'avoir réclamé la récompense
               bp_award_xp(saison)            seule porte d'entrée de l'XP (phase 2)
               bp_my_challenges(saison)       défis en cours + progression (phase 2)

phase 2        bp_mode_caps       plafond de score par mode
               bp_challenges      200 défis datés, générés depuis challenges.js
               bp_seasons         + session_xp, session_daily_cap, min_duration, min_hits
               aim_trainer_scores + trigger (heure serveur) + index (user_id, created_at)

sécurité       aucune écriture directe sur les tables bp_* (droits retirés, pas
               de policy). Lecture : soi-même, sauf calendrier et catalogue.
               Un trigger empêche un client d'écrire title_id/card_id/icon_id
               dans son propre profil : seul bp_equip le peut.
```

## XP : chiffres actuels (à régler avec PostHog)

Valeurs de départ, **isolées dans `xpRules.js`** et copiées vers le serveur par
le script de génération : on les retouche sans toucher au reste.

| Source | XP | Limite |
|---|---|---|
| Session valide | 20 | 300 / jour UTC (≈ 15 sessions de 60 s) |
| Défis quotidiens (3) | 100 / 150 / 200 | 1 jeu par jour |
| Défis hebdomadaires (3) | 400 / 600 / 800 | 1 jeu par semaine |
| Défis de saison (8) | 1 000 à 2 500 | une fois chacun, 13 000 au total |

Niveau 50 = 43 120 XP (courbe 400 + 20 × niveau, 50 niveaux). XP maximale
gagnable sur 8 semaines : 69 400, soit **1,61 × le nécessaire**. Un test impose
un ratio entre 1,2 (sinon il faudrait une saison parfaite) et 2 (sinon le pass
se finit en deux semaines) : si on retouche les chiffres et qu'on sort de la
fourchette, il échoue.

Cible visée : un joueur régulier (défis ~4 jours sur 7) finit vers le niveau
30-35 ; un joueur très actif atteint 50 vers la 5ᵉ-6ᵉ semaine. **Non mesuré** :
c'est une estimation. Les seuils de score (fractions du 99ᵉ centile) sont aussi
des estimations, car je n'avais que le maximum et le 99ᵉ centile par mode, pas
la médiane. Pour les valider, lancer dans Supabase :

```sql
select mode, count(*) as parties,
       percentile_cont(0.5)  within group (order by score) as p50,
       percentile_cont(0.75) within group (order by score) as p75,
       percentile_cont(0.9)  within group (order by score) as p90
  from aim_trainer_scores
 where mode <> 'custom'
 group by mode order by parties desc;
```

Un défi « 50 % du 99ᵉ centile » doit tomber vers le p50-p75 de joueurs
réguliers ; « 80 % », vers le p90.

## Comment un défi est évalué (phase 2)

1. **Tirage** : `challenges.js`, déterministe (saison + date → mêmes défis),
   écrit dans `bp_challenges` par le script de génération. Le serveur ne tire
   jamais au hasard, il **évalue**.
2. **Scores plausibles** : `bp_valid_scores` retient une session si son mode a
   un plafond et qu'elle le respecte, si sa durée configurée ≥ 30 s et si elle a
   ≥ 10 touches. Le plafond vient des vrais scores (`modeCaps.js`) × 1,6, × 3 pour
   un mode peu joué. Un mode sans plafond ne rapporte rien : ajouter un mode au
   jeu sans plafond fait **échouer un test** exprès.
3. **Métrique** : la précision est recalculée depuis touches et ratés (la
   colonne `accuracy` est remplie par le client). Le mode `custom` (réglages
   libres, score non comparable) donne de l'XP de session mais ne compte ni
   dans « modes différents » ni dans un classement.
4. **Attribution** : `bp_award_xp()` crée les événements d'XP. Idempotent
   (unicité), verrou par joueur (deux appels simultanés ne passent pas le
   plafond). Sessions éligibles : celles des 36 dernières heures. Défis
   éligibles : en cours, ou terminés depuis moins de 24 h (un appel manqué ne
   fait pas perdre la journée).
5. **Heure du serveur** : un déclencheur impose `created_at = now()` aux
   clients. Sans lui, on pourrait insérer des scores datés des jours précédents
   pour toucher plusieurs plafonds quotidiens d'un coup.

**Ce que ça ne garantit pas** : un score plausible mais faux passe. Le plafond
quotidien borne le gain à celui d'un joueur très assidu : c'est le bon niveau de
protection pour un pass cosmétique.

## Page « Modes » en trois cartes

Aujourd'hui : liste plate de modes. Cible : trois cartes d'entrée.

- **Classique** : modes génériques (`!mode.arena`, c'est déjà `GENERIC_MODE_IDS`).
- **Valorant** : modes avec arène ou agents (`arena` défini : Monastère,
  Belvédère, Headshot…).
- **Personnalisé** : `CustomModeConfig` + playlists.

La catégorie se **dérive des champs existants**, pas d'une seconde liste à
maintenir à la main. Un mode « Classé » est prévu pour plus tard, hors périmètre.

## Classements : jour, saison, global

Trois classements, trois questions différentes :

| Classement | Question | Métrique | Existe ? |
|---|---|---|---|
| Du jour | Qui a fait le meilleur score sur le défi du jour ? | score du défi | oui (`loadDailyLeaderboard`) |
| De saison | Qui est le meilleur depuis le début de la saison ? | Aim Rating, scores de la saison seulement | phase 6 |
| Global | Qui est le meilleur, tout confondu ? (top 10) | Aim Rating, tous les scores | phase 6 |

Classer par **niveau/XP** récompenserait le temps passé ; classer par **niveau
de visée** récompense la compétence. Choix : **Aim Rating**, avec le niveau du
pass affiché à côté, à titre d'information. Chaque ligne montre carte, icône et
titre : c'est la vitrine des cosmétiques.

Le classement de saison repart de zéro à chaque saison : c'est ce qui donne
envie de rejouer, alors qu'un classement global se fige vite autour des mêmes
noms. Les deux sont **la même fonction SQL** appliquée à une fenêtre de dates
différente (saison / tout).

### Aim Rating (calcul)

Pour un joueur et une fenêtre de dates :
1. pour chaque mode joué, son meilleur score dans la fenêtre ;
2. divisé par le **90ᵉ centile** des meilleurs scores de tous les joueurs sur ce
   mode, dans la même fenêtre ;
3. plafonné à 1,5 ; puis moyenne sur les modes joués ; ×100.
4. Il faut au moins 3 modes joués pour apparaître : sinon un seul score
   exceptionnel sur un mode suffirait à monter.

Pourquoi le 90ᵉ centile et pas le meilleur score : avec « meilleur / record »,
**un seul score truqué** écrase tout le monde (le record devient énorme, les
ratios s'effondrent). Avec un centile et un plafond, un tricheur ne gagne au
plus que le plafond sur chaque mode et ne fausse pas les scores des autres.

Encore à faire quand on l'implémentera : regarder la vraie distribution des
scores par mode (maximum, 99ᵉ centile) pour poser des **plafonds de
plausibilité** par mode — je ne les invente pas sans les données. Index sur
`aim_trainer_scores (mode, created_at)` à ajouter si la mesure le justifie.

## Skins : passer de « tous offerts » à « à débloquer »

Aujourd'hui le Vestiaire donne tous les skins. Les skins n'ont jamais été
publiés (la 1.11.0 est sortie sans), donc rien à retirer à personne. À la
phase 3, seul `standard` reste acquis ; les autres se débloquent via le pass.
La saison 1 en distribue 12 sur 62 : les autres restent pour les saisons
suivantes. Le Vestiaire affichera les skins verrouillés avec leur condition.

## Ordre de livraison (un module à la fois, chacun testable)

1. ✅ **Fondations** *(fait, testé)* : schéma `aim_trainer_scores` documenté,
   catalogue de la saison 1, `levelFromXp`, migration `bp_*` + RLS, génération
   du semis SQL. *Aucune UI.* Vérifié : 13 tests JS (`npm test`) et 29
   vérifications SQL sur une vraie base PostgreSQL, dont la parité des niveaux
   JS/SQL, les droits, et le fait qu'un joueur ne peut ni s'octroyer d'XP ni
   se donner un titre.
2. ✅ **Moteur d'XP et de défis** *(fait, testé)* : tirage des défis, plafonds de
   mode, `bp_award_xp`, `bp_my_challenges`, couche d'appel `battlePass/api.js`.
   *Toujours sans UI, et pas encore branché sur la fin de session.* Vérifié :
   29 tests JS et 51 vérifications SQL (22 nouvelles : antidatage bloqué, plafond
   quotidien, scores impossibles écartés, fenêtres de 36 h / 24 h, droits).

   **Ordre d'exécution SQL** quand on déploiera (rien à lancer avant la phase 3) :
   `aim_trainer_scores.sql` (sans effet, table existante) → `battle_pass.sql` →
   `battle_pass_xp.sql` → `battle_pass_mode_caps.sql` → `battle_pass_season_1.sql`.
3. **Écran Battle Pass** : entrée de menu, piste de récompenses, réclamation,
   équipement des skins d'armes déjà existants. *Premier livrable visible.*
4. **Titres, icônes, cartes de joueur** : colonnes profil, rendu, affichage
   chez les amis.
5. **Page Modes en trois cartes.**
6. **Classements de saison et global (top 10)** : fonction Aim Rating, vitrine des cartes et titres.
7. **Nouveaux types de récompenses** : mains, ennemis, variantes d'arène.
8. **Finitions** : i18n FR/EN, changement de saison, équilibrage XP, perf, QA.

Chaque phase se merge seule : le battle pass n'apparaît pour les joueurs qu'à la
phase 3, et rien n'est cassé avant.

## Risques

| Risque | Parade |
|---|---|
| XP forgée par le client | XP calculée en SQL depuis les scores, plafonds, unicité |
| Dérive entre horloges | Reset en UTC, compte à rebours affiché |
| Schéma non versionné | Phase 1 : export avant toute migration |
| Charge du menu (déjà 1500 lignes) | Écran Battle Pass chargé à la demande (`React.lazy`) |
| Coût de production des cosmétiques | Réutiliser l'existant, variantes plutôt que créations |
| Courbe d'XP mal réglée | Chiffres dans le catalogue, mesure PostHog, ajustement sans release de code |
| Saison qui change un cosmétique déjà obtenu | Un cosmétique réclamé reste au joueur ; le catalogue ne supprime jamais un id |
