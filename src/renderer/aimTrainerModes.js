// Données de l'Aim Trainer (modes, réglages par défaut, armes), sans aucune
// dépendance au moteur 3D : le hub, les modes personnalisés, le défi du jour
// et le Sensitivity Finder n'ont besoin que de ces listes. Le moteur
// (AimTrainerGame.jsx, three.js) n'est ainsi chargé qu'au lancement d'une
// session, ce qui allège nettement l'ouverture de l'Aim Trainer.
import {
  Target,
  Grid3x3,
  Waves,
  Zap,
  Microscope,
  Orbit,
  Package,
  MoveHorizontal,
  Shuffle,
  Bomb,
  Crosshair,
  Popcorn,
  Hourglass,
  Footprints,
  EyeOff,
  Flame,
  Skull,
} from 'lucide-react';
import vandalArmsUrl from '../assets/models/vandal-arms.glb';

// Hitbox commune à tous les agents de Valorant (1,96 m) et rayon de tête des
// agents du mode Headshot — voir aimBots.js.
export const AGENT_HEIGHT = 1.96;
export const AGENT_HEAD_RADIUS = 0.145;

// Arme alternative (CC-BY 4.0, voir src/assets/models/CREDITS.md) — mains +
// arme avec un vrai jeu d'animations (tir, rechargement, sprint...), choix
// exposé dans Réglages → Modèle d'arme.
export const WEAPON_MODELS = {
  vandal: { labelKey: 'aimTrainer.weaponVandal', url: vandalArmsUrl },
  // Modélisé en code (voir glockModel.js), sans fichier ni licence externe.
  glock: {
    labelKey: 'aimTrainer.weaponGlock',
    procedural: true,
  },
};

// Modes d'entraînement. Chacun n'est qu'un préréglage + un comportement de
// cible : le moteur reste le même, ce qui évite de dupliquer la logique de
// tir/score pour chaque mode.
//   movement : 'none' (statique) | 'drift' (translation continue) | 'orbit'
//   lifetime : durée de vie d'une cible en ms (null = illimitée)
export const MODES = {
  flick: {
    icon: Target,
    accent: '#ff4655',
    labelKey: 'aimTrainer.modes.flick',
    descKey: 'aimTrainer.modes.flickDesc',
    movement: 'none',
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.28, spread: 28, duration: 60 },
  },
  gridshot: {
    icon: Grid3x3,
    accent: '#ffc857',
    labelKey: 'aimTrainer.modes.gridshot',
    descKey: 'aimTrainer.modes.gridshotDesc',
    movement: 'none',
    lifetime: null,
    preset: { targetCount: 4, targetSize: 0.26, spread: 26, duration: 60 },
  },
  // Trois paliers de difficulté demandés par les testeurs plutôt qu'un seul
  // Tracking figé : vitesse de dérive et fréquence de changement de cap sont
  // les deux leviers qui rendent une cible en mouvement plus ou moins dure à
  // suivre (voir `driftSpeed`/`driftChangeInterval`, lus par randomDrift()
  // et le rebranchement de cap dans la boucle d'animation). "tracking" reste
  // la clé historique (déjà utilisée par des scores enregistrés) — c'est
  // volontairement le palier "Pro", inchangé.
  trackingBeginner: {
    icon: Waves,
    accent: '#4ec9f5',
    labelKey: 'aimTrainer.modes.trackingBeginner',
    descKey: 'aimTrainer.modes.trackingBeginnerDesc',
    movement: 'drift',
    lifetime: null,
    driftSpeed: [1, 1.8],
    driftChangeInterval: [700, 1400],
    preset: { targetCount: 1, targetSize: 0.42, spread: 26, duration: 60 },
  },
  trackingIntermediate: {
    icon: Waves,
    accent: '#4ec9f5',
    labelKey: 'aimTrainer.modes.trackingIntermediate',
    descKey: 'aimTrainer.modes.trackingIntermediateDesc',
    movement: 'drift',
    lifetime: null,
    driftSpeed: [1.6, 2.8],
    driftChangeInterval: [500, 1000],
    preset: { targetCount: 1, targetSize: 0.36, spread: 28, duration: 60 },
  },
  tracking: {
    icon: Waves,
    accent: '#4ec9f5',
    labelKey: 'aimTrainer.modes.tracking',
    descKey: 'aimTrainer.modes.trackingDesc',
    movement: 'drift',
    // Clic maintenu + précision échantillonnée en continu, plutôt que des
    // tirs discrets — voir le bloc dédié dans la boucle d'animation et
    // handleClick. Réservé à "Pro" et à Multi (ci-dessous) : Débutant et
    // Intermédiaire restent en tir classique sur cible mobile, et le
    // resteraient même si on l'ajoutait plus tard (des scores existants sont
    // déjà enregistrés sur leur mécanique actuelle).
    holdTracking: true,
    lifetime: null,
    driftSpeed: [2, 4],
    driftChangeInterval: [350, 850],
    preset: { targetCount: 1, targetSize: 0.32, spread: 30, duration: 60 },
  },
  trackingMulti: {
    icon: Waves,
    accent: '#4ec9f5',
    labelKey: 'aimTrainer.modes.trackingMulti',
    descKey: 'aimTrainer.modes.trackingMultiDesc',
    movement: 'drift',
    holdTracking: true,
    lifetime: null,
    driftSpeed: [1.8, 3],
    driftChangeInterval: [500, 1100],
    preset: { targetCount: 2, targetSize: 0.34, spread: 28, duration: 60 },
  },
  reflex: {
    icon: Zap,
    accent: '#9b7bff',
    labelKey: 'aimTrainer.modes.reflex',
    descKey: 'aimTrainer.modes.reflexDesc',
    movement: 'none',
    lifetime: 1100,
    preset: { targetCount: 1, targetSize: 0.3, spread: 34, duration: 60 },
  },
  micro: {
    icon: Microscope,
    accent: '#3ddc84',
    labelKey: 'aimTrainer.modes.micro',
    descKey: 'aimTrainer.modes.microDesc',
    movement: 'none',
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.12, spread: 12, duration: 60 },
  },
  orbit: {
    icon: Orbit,
    accent: '#ff8fab',
    labelKey: 'aimTrainer.modes.orbit',
    descKey: 'aimTrainer.modes.orbitDesc',
    movement: 'orbit',
    lifetime: null,
    preset: { targetCount: 2, targetSize: 0.26, spread: 30, duration: 60 },
  },
  peek: {
    icon: Package,
    accent: '#4ec9f5',
    labelKey: 'aimTrainer.modes.peek',
    descKey: 'aimTrainer.modes.peekDesc',
    movement: 'peek',
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.16, spread: 20, duration: 60 },
  },
  strafe: {
    icon: MoveHorizontal,
    accent: '#4ec9f5',
    labelKey: 'aimTrainer.modes.strafe',
    descKey: 'aimTrainer.modes.strafeDesc',
    movement: 'drift',
    // Cap verrouillé + intervalle de changement quasi infini : la cible
    // traverse tout droit à vitesse constante, ne rebondissant que sur les
    // bords — un vrai strafe, pas un Tracking un peu plus rapide.
    driftLockY: true,
    driftSpeed: [3, 5],
    driftChangeInterval: [999999, 999999],
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.3, spread: 30, duration: 60 },
  },
  // Suggéré sur Discord : une cible qui simule une personne qui marche
  // (traversée horizontale à vitesse constante, comme Strafe ci-dessus —
  // mêmes mécaniques de mouvement, réutilisées telles quelles) mais SANS
  // tir : le score vient du temps passé viseur-sur-cible, comme le mode
  // Tracking (`passiveTrack` réutilise le même échantillonnage continu que
  // `holdTracking`, simplement sans exiger de clic maintenu — voir la
  // boucle d'animation). Vitesse unique pour cette première version
  // (marche/course à choisir viendront après validation).
  // Quatre paliers de vitesse, même principe que les 4 paliers de Tracking
  // (demandé sur Discord après le mode Patrol de base) : "patrol" garde sa
  // clé d'origine (déjà utilisée pour d'éventuels scores enregistrés) et
  // devient le palier "Moyen". "patrolMulti" ne fait pas suivre 2 cibles à
  // la fois (contrairement à trackingMulti) — "alterne" fait plutôt varier
  // la vitesse en cours de manche : driftChangeInterval réactivé (au lieu
  // du quasi-infini des 3 autres paliers, à vitesse fixe) pour piocher une
  // nouvelle vitesse dans la plage régulièrement, réutilisant tel quel le
  // mécanisme déjà en place pour les modes Tracking/Drift.
  patrolSlow: {
    icon: Footprints,
    accent: '#3ddc84',
    labelKey: 'aimTrainer.modes.patrolSlow',
    descKey: 'aimTrainer.modes.patrolSlowDesc',
    movement: 'drift',
    driftLockY: true,
    driftSpeed: [1.0, 1.0],
    driftChangeInterval: [999999, 999999],
    passiveTrack: true,
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.34, spread: 30, duration: 60 },
  },
  patrol: {
    icon: Footprints,
    accent: '#3ddc84',
    labelKey: 'aimTrainer.modes.patrol',
    descKey: 'aimTrainer.modes.patrolDesc',
    movement: 'drift',
    driftLockY: true,
    driftSpeed: [1.6, 1.6],
    driftChangeInterval: [999999, 999999],
    passiveTrack: true,
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.34, spread: 30, duration: 60 },
  },
  patrolFast: {
    icon: Footprints,
    accent: '#3ddc84',
    labelKey: 'aimTrainer.modes.patrolFast',
    descKey: 'aimTrainer.modes.patrolFastDesc',
    movement: 'drift',
    driftLockY: true,
    driftSpeed: [2.4, 2.4],
    driftChangeInterval: [999999, 999999],
    passiveTrack: true,
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.34, spread: 30, duration: 60 },
  },
  patrolMulti: {
    icon: Footprints,
    accent: '#3ddc84',
    labelKey: 'aimTrainer.modes.patrolMulti',
    descKey: 'aimTrainer.modes.patrolMultiDesc',
    movement: 'drift',
    driftLockY: true,
    driftSpeed: [1.0, 2.4],
    driftChangeInterval: [2500, 4500],
    passiveTrack: true,
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.34, spread: 30, duration: 60 },
  },
  switch: {
    icon: Shuffle,
    accent: '#ffc857',
    labelKey: 'aimTrainer.modes.switchMode',
    descKey: 'aimTrainer.modes.switchModeDesc',
    // Cibles statiques numérotées à toucher dans l'ordre affiché — voir
    // state.reshuffleSwitch/state.switchNext (créés dans l'effet principal)
    // et la branche dédiée de handleClick.
    movement: 'switch',
    lifetime: null,
    preset: { targetCount: 4, targetSize: 0.26, spread: 26, duration: 60 },
  },
  strafeTap: {
    icon: Bomb,
    accent: '#ff8fab',
    labelKey: 'aimTrainer.modes.strafeTap',
    descKey: 'aimTrainer.modes.strafeTapDesc',
    movement: 'drift',
    // Plusieurs touches nécessaires avant que la cible ne se replace pour de
    // bon — voir `entry.hitsRemaining` dans handleClick.
    hitsRequired: 3,
    driftSpeed: [1.5, 2.5],
    driftChangeInterval: [600, 1200],
    lifetime: null,
    preset: { targetCount: 1, targetSize: 0.3, spread: 26, duration: 60 },
  },
  precision: {
    icon: Crosshair,
    accent: '#3ddc84',
    labelKey: 'aimTrainer.modes.precision',
    descKey: 'aimTrainer.modes.precisionDesc',
    movement: 'none',
    lifetime: 1500,
    preset: { targetCount: 1, targetSize: 0.08, spread: 16, duration: 60 },
  },
  popcorn: {
    icon: Popcorn,
    accent: '#ffb84d',
    labelKey: 'aimTrainer.modes.popcorn',
    descKey: 'aimTrainer.modes.popcornDesc',
    movement: 'none',
    lifetime: 1300,
    preset: { targetCount: 3, targetSize: 0.22, spread: 32, duration: 60 },
  },
  snapHold: {
    icon: Hourglass,
    accent: '#9b7bff',
    labelKey: 'aimTrainer.modes.snapHold',
    descKey: 'aimTrainer.modes.snapHoldDesc',
    // Un clic arme la cible mais ne suffit pas : il faut y rester `holdMs` —
    // voir la branche dédiée de handleClick et le bloc de maintien dans la
    // boucle d'animation.
    movement: 'snap',
    holdMs: 350,
    lifetime: 2200,
    preset: { targetCount: 1, targetSize: 0.24, spread: 30, duration: 60 },
  },
  flashDodge: {
    icon: EyeOff,
    accent: '#ffb454',
    labelKey: 'aimTrainer.modes.flashDodge',
    descKey: 'aimTrainer.modes.flashDodgeDesc',
    movement: 'none',
    lifetime: null,
    // Tir classique sur cible statique (comme Flick), avec en plus un flash
    // qui arrive d'une direction aléatoire à intervalle irrégulier — voir la
    // gestion dédiée dans la boucle d'animation et handleClick.
    flashDodge: true,
    preset: { targetCount: 1, targetSize: 0.28, spread: 28, duration: 60 },
  },
  spray: {
    icon: Flame,
    accent: '#ff6b35',
    labelKey: 'aimTrainer.modes.spray',
    descKey: 'aimTrainer.modes.sprayDesc',
    // Apparition positionnée EXACTEMENT comme Flick (même
    // pickNonOverlappingPosition/randomTargetPosition, même cône ancré sur
    // l'axe -Z du monde — la barre rouge du décor), pas de repositionnement
    // relatif à la caméra : ancrer la cible sur la direction actuelle du
    // joueur (mouvante, imprévisible pendant un spray) s'est révélé plus
    // fragile qu'un repère fixe et familier que le joueur retrouve à chaque
    // nouvelle cible. Une fois apparue, léger déplacement (comme Tracking)
    // DANS ce même cône — pas verrouillé sur l'axe horizontal (driftLockY),
    // sinon la trajectoire ne fait qu'un aller-retour gauche-droite parfaitement
    // lisible. Changements de cap plus fréquents pour une trajectoire moins
    // prévisible (le cône reste celui de Flick, donc la hauteur reste
    // raisonnable même sans verrou).
    movement: 'drift',
    driftSpeed: [1.4, 2.2],
    driftChangeInterval: [700, 1400],
    lifetime: null,
    // Contrôle de recul : clic MAINTENU déclenche un tir automatique en
    // rafale (voir SPRAY_PATTERN/fireSprayShot dans la boucle principale) —
    // il faut compenser le recul à la souris pour rester dessus. La cible a
    // des PV (200) et chaque tir fait des dégâts fixes (40, soit 5 tirs pour
    // la casser) : une fois détruite, elle réapparaît à un nouvel endroit
    // aléatoire — voir entry.hp dans fireSprayShot.
    recoilControl: true,
    maxHp: 200,
    damagePerHit: 40,
    preset: { targetCount: 1, targetSize: 0.34, spread: 28, duration: 40 },
  },
  // Premier mode réservé à l'arène Monastère (`arena`) : des agents à
  // l'échelle et à la vitesse de Valorant se déplacent sur le site A, seul un
  // tir dans la tête les tue (160 dégâts, comme au Vandal). Tout le
  // comportement est dans aimBots.js ; les sphères habituelles restent
  // cachées. Un tir au corps ou aux jambes affiche ses dégâts mais compte
  // comme raté : la précision affichée est le taux de headshots.
  headshotDuel: {
    icon: Skull,
    accent: '#ff4655',
    labelKey: 'aimTrainer.modes.headshotDuel',
    descKey: 'aimTrainer.modes.headshotDuelDesc',
    movement: 'agents',
    arena: 'monastery',
    lifetime: null,
    preset: { targetCount: 2, targetSize: AGENT_HEAD_RADIUS, spread: 45, duration: 60 },
  },
};

// Modes utilisables partout (routines, modes personnalisés, défi du jour) :
// ceux liés à une arène précise en sont exclus.
export const GENERIC_MODE_IDS = Object.keys(MODES).filter((id) => !MODES[id].arena);

// Le mode « Personnalisé » n'a pas de comportement à lui : un preset garde celui
// de son mode de base (Tracking = cible mobile + clic maintenu, Peek, Orbit...),
// seuls la durée, la taille, le nombre et l'écartement des cibles sont libres. La
// clé de score reste 'custom' (voir config.mode), pour que ces réglages libres ne
// se mélangent jamais aux records des modes standards. Sans mode de base connu
// (anciens presets), retombe sur le comportement de Flick, comme avant.
export function behaviorKey(cfg) {
  if (cfg?.mode === 'custom') return MODES[cfg.baseMode] ? cfg.baseMode : 'flick';
  return cfg?.mode;
}

export const DEFAULT_CONFIG = {
  mode: 'flick',
  dpi: 800,
  sens: 0.35,
  duration: 60,
  targetSize: 0.28,
  targetColor: '#ff4655',
  targetCount: 1,
  spread: 28,
  fov: 103,
  showWeapon: true,
  // Une clé de WEAPON_MODELS (mains + arme avec son propre jeu d'animations).
  // Les anciens réglages 'default' sont lus comme 'vandal' (voir AimTrainerGame).
  weaponModel: 'vandal',
  // 'day' (défaut, ciel + sol clair) ou 'dark' (suggéré sur Discord — salle
  // fermée, sans ciel bleu ni sol blanc). Version simple validée avec
  // l'utilisateur : teintes assombries + ciel remplacé par une couleur
  // unie, pas encore un vrai plafond en dur.
  theme: 'day',
  // Code de la bibliothèque de crosshairs à afficher pendant la session ;
  // null = croix blanche par défaut (voir .aim-trainer-crosshair).
  crosshairCode: null,
  // Petit "pop" joué quand une cible est touchée (demandé sur Discord :
  // pouvoir le couper). Le bruit du tir lui-même reste actif.
  hitSound: true,
};
