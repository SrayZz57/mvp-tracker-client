import * as THREE from 'three';
import { animateEmissive, drawnTexture } from './weaponKit.js';

// Skins « de base » du Battle Pass (raretés Commun et Rare) : pas de pièces ni
// de livrée dessinée à la main comme les skins premium, juste la finition
// standard de l'arme repeinte (Commun), plus au besoin un effet simple — dégradé
// de couleur, reflet lumineux qui parcourt l'arme, lueur qui pulse (Rare).
// Un skin se décrit donc en quelques lignes de données plutôt qu'en un fichier.
//
// Rôles : chaque arme range ses pièces en quatre familles repeintes ensemble.
//   primary   : carcasse principale (métal)
//   secondary : crosse, poignée, garde-main (polymère clair du modèle d'origine)
//   tertiary  : pièces noires (chargeur, lunette...)
//   metal / barrel / sight : petites pièces, canon, organes de visée

// Profil complet de chaque arme en mm (voir `drawnTexture`) : une seule texture
// couvre toute l'arme, pour un dégradé ou un reflet qui la parcourt d'un bout à l'autre.
const BOUNDS = {
  vandal: { minX: -16, maxX: 906, minY: -222, maxY: 74 },
  glock: { minX: -20, maxX: 192, minY: -136, maxY: 34 },
  sniper: { minX: -20, maxX: 1200, minY: -130, maxY: 110 },
};

// Clés de la finition standard de chaque arme, par rôle. Le Glock n'a pas de
// finition standard exportable (ses matériaux sont créés dans glockModel.js) :
// ses skins de base fabriquent leurs propres matériaux, voir glockFinish.
const ROLES = {
  vandal: {
    primary: ['receiver', 'dustCover'],
    secondary: ['stock', 'grip', 'handguard'],
    tertiary: ['buttPad', 'upperGuard', 'magazine'],
    metal: ['metal'],
    barrel: ['barrel'],
    sight: ['sight'],
  },
  sniper: {
    primary: ['chassis', 'forend', 'muzzle'],
    secondary: ['stock', 'grip', 'buttPad'],
    tertiary: ['scope', 'receiver'],
    metal: ['metal'],
    barrel: ['barrel'],
    sight: ['lens'],
  },
  // Le Glock range faces et parois sous deux clés distinctes : paire [faces, parois].
  glock: {
    primary: [['slide', 'slideWall']],
    secondary: [['frame', 'frameWall']],
    tertiary: [],
    metal: ['steel'],
    barrel: ['barrel'],
    sight: ['sight', 'dot'],
  },
};

// --- Définitions -------------------------------------------------------------------
// Une teinte = { color, metalness?, roughness? }, ou juste une couleur.
// effect :
//   fade  { roles, from, to }          dégradé le long de l'arme (du talon à la bouche)
//   sweep { roles, color, speed }      reflet lumineux qui parcourt l'arme
//   pulse { roles, color, strength }   lueur qui respire (et s'avive au tir)

export const BASIC_SKINS = {
  vandal: {
    dune: {
      labelKey: 'aimTrainer.skinDune',
      palette: {
        primary: { color: 0x8a7658, metalness: 0.5, roughness: 0.6 },
        secondary: 0xc2a878,
        tertiary: 0x5e5140,
        metal: 0x6b5d49,
        barrel: 0x2d2822,
        sight: 0xf3e6c8,
      },
    },
    cobalt: {
      labelKey: 'aimTrainer.skinCobalt',
      palette: {
        primary: { color: 0x234a92, metalness: 0.85, roughness: 0.32 },
        secondary: 0x2a2f3a,
        tertiary: 0x14171d,
        metal: { color: 0x9db4d6, metalness: 0.95, roughness: 0.25 },
        barrel: 0x1a1d24,
        sight: 0xcfe3ff,
      },
    },
    tidal: {
      labelKey: 'aimTrainer.skinTidal',
      palette: {
        primary: { color: 0xffffff, metalness: 0.6, roughness: 0.4 },
        secondary: 0xffffff,
        tertiary: 0x10151c,
        metal: { color: 0xc0c8d0, metalness: 0.95, roughness: 0.22 },
        barrel: 0x151a22,
        sight: 0x9ff6ff,
      },
      effect: [
        { kind: 'fade', roles: ['primary', 'secondary'], from: 0x162a5c, to: 0x13a3a8 },
        { kind: 'sweep', roles: ['primary', 'secondary'], color: 0x6ff6ff, speed: 0.35 },
      ],
    },
    redline: {
      labelKey: 'aimTrainer.skinRedline',
      palette: {
        primary: { color: 0x141518, metalness: 0.75, roughness: 0.4 },
        secondary: 0x1d1e22,
        tertiary: 0x4a0a10,
        metal: 0x2a2b30,
        barrel: 0x101114,
        sight: 0xff4655,
      },
      effect: [{ kind: 'pulse', roles: ['tertiary'], color: 0xff2238, strength: 1.4 }],
    },
  },
  glock: {
    olive: {
      labelKey: 'aimTrainer.skinOlive',
      palette: {
        primary: { color: 0x2a2d27, metalness: 0.6, roughness: 0.45 },
        secondary: 0x56613b,
        metal: 0x3c3f36,
        barrel: { color: 0x7a7c70, metalness: 0.95, roughness: 0.25 },
        sight: 0xf4f4ee,
      },
    },
    ivory: {
      labelKey: 'aimTrainer.skinIvory',
      palette: {
        primary: { color: 0xb9bec6, metalness: 0.92, roughness: 0.26 },
        secondary: 0xe3dccb,
        metal: { color: 0x9aa0a8, metalness: 0.95, roughness: 0.25 },
        barrel: { color: 0xc8ccd2, metalness: 1, roughness: 0.18 },
        sight: 0x1b1b1d,
      },
      dot: 0xff7a1a,
    },
    sunset: {
      labelKey: 'aimTrainer.skinSunset',
      palette: {
        primary: { color: 0xffffff, metalness: 0.55, roughness: 0.38 },
        secondary: 0x1f1a26,
        metal: 0x3a2e3f,
        barrel: { color: 0xd9a86c, metalness: 1, roughness: 0.22 },
        sight: 0xffe2b0,
      },
      effect: [
        { kind: 'fade', roles: ['primary'], from: 0xffb13d, to: 0x7a2fd1 },
        { kind: 'sweep', roles: ['primary'], color: 0xffd08a, speed: 0.5 },
      ],
    },
    volt: {
      labelKey: 'aimTrainer.skinVolt',
      palette: {
        primary: { color: 0x151619, metalness: 0.65, roughness: 0.4 },
        secondary: 0x1c1d20,
        metal: 0x9dff1f,
        barrel: 0x2b2d30,
        sight: 0xd6ff5a,
      },
      effect: [{ kind: 'pulse', roles: ['metal'], color: 0xb8ff2a, strength: 1.6 }],
    },
  },
  sniper: {
    urban: {
      labelKey: 'aimTrainer.skinUrban',
      palette: {
        primary: { color: 0x5b6068, metalness: 0.7, roughness: 0.45 },
        secondary: 0x8d9096,
        tertiary: 0x2b2e33,
        metal: 0x9ea3aa,
        barrel: 0x25282d,
      },
    },
    forest: {
      labelKey: 'aimTrainer.skinForest',
      palette: {
        primary: { color: 0x2f3a2a, metalness: 0.6, roughness: 0.5 },
        secondary: 0x4d5e3a,
        tertiary: 0x1e241b,
        metal: 0x5c6452,
        barrel: 0x1b1f18,
        sight: 0x2d5a3a,
      },
    },
    amethyst: {
      labelKey: 'aimTrainer.skinAmethyst',
      palette: {
        primary: { color: 0xffffff, metalness: 0.6, roughness: 0.35 },
        secondary: 0xffffff,
        tertiary: 0x1a1224,
        metal: { color: 0xc9b6e8, metalness: 0.95, roughness: 0.22 },
        barrel: 0x17121e,
        sight: 0x6a2bb8,
      },
      effect: [
        { kind: 'fade', roles: ['primary', 'secondary'], from: 0x2a1250, to: 0x8a4cf0 },
        { kind: 'sweep', roles: ['primary'], color: 0xd9b0ff, speed: 0.28 },
      ],
    },
    cryo: {
      labelKey: 'aimTrainer.skinCryo',
      palette: {
        primary: { color: 0xd8e6f0, metalness: 0.7, roughness: 0.3 },
        secondary: 0x9fb8c8,
        tertiary: 0x2a3440,
        metal: 0xe8f4ff,
        barrel: 0x3a4a58,
        sight: 0x6fd8ff,
      },
      effect: [{ kind: 'pulse', roles: ['primary'], color: 0x4fc8ff, strength: 0.55 }],
    },
  },
};

// --- Application -------------------------------------------------------------------

const asTint = (tint) => (typeof tint === 'number' ? { color: tint } : tint);

// Matériaux d'un rôle, dédoublonnés : une finition réutilise souvent la même
// instance pour plusieurs pièces. `faces` : la première entrée d'une paire
// [faces, parois] (UV en mm, voir drawnTexture) ; `walls` : tout le reste.
function collect(finish, keys) {
  const faces = new Set();
  const walls = new Set();
  keys.forEach((key) => {
    if (Array.isArray(key)) {
      const [faceKey, wallKey] = key;
      if (finish[faceKey]) faces.add(finish[faceKey]);
      if (finish[wallKey]) walls.add(finish[wallKey]);
      return;
    }
    const value = finish[key];
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((m, i) => (i === 0 ? faces : walls).add(m));
    } else {
      // Pièce d'un seul matériau (métal, canon...) : ses UV ne sont pas en mm.
      walls.add(value);
    }
  });
  walls.forEach((m) => faces.has(m) && walls.delete(m));
  return { faces, walls, all: new Set([...faces, ...walls]) };
}

function paint(material, tint) {
  if (!material || !tint) return;
  const { color, metalness, roughness } = asTint(tint);
  if (color !== undefined && material.color) material.color.setHex(color);
  if (metalness !== undefined) material.metalness = metalness;
  if (roughness !== undefined && material.roughnessMap == null) material.roughness = roughness;
}

const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

// Dégradé le long de l'arme : carte de couleur sur les faces (UV en mm), teinte
// intermédiaire sur les parois (leurs UV ne suivent pas l'arme).
function applyFade(weapon, id, index, sets, { from, to }) {
  const bounds = BOUNDS[weapon];
  const map = drawnTexture(
    `basic-${weapon}-${id}-fade-${index}`,
    bounds,
    0.5,
    (ctx) => {
      const g = ctx.createLinearGradient(bounds.minX, 0, bounds.maxX, 0);
      g.addColorStop(0, `#${new THREE.Color(from).getHexString()}`);
      g.addColorStop(1, `#${new THREE.Color(to).getHexString()}`);
      ctx.fillStyle = g;
      ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    },
    { color: true },
  );
  sets.faces.forEach((m) => {
    m.map = map;
    m.color.setHex(0xffffff);
    m.needsUpdate = true;
  });
  sets.walls.forEach((m) => m.color.setHex(mix(from, to, 0.5)));
}

// Reflet : une bande lumineuse qui parcourt l'arme du talon vers la bouche.
// Il lui faut une carte d'émission (les UV en mm n'existent que sur les faces),
// d'où une texture blanche qui couvre l'arme : elle ne sert qu'à porter les UV.
function applySweep(weapon, sets, { color, speed = 0.35 }, uniforms) {
  const carrier = drawnTexture(`basic-${weapon}-uv-carrier`, BOUNDS[weapon], 0.05, () => {});
  const glsl = `
    float sweepPhase = fract(vEmissiveMapUv.x - uTime * ${speed.toFixed(3)});
    float sweepBand = smoothstep(0.86, 0.95, sweepPhase) * (1.0 - smoothstep(0.95, 1.0, sweepPhase));
    totalEmissiveRadiance *= sweepBand * 1.6 + uFlare * 0.5;
  `;
  sets.faces.forEach((m) => {
    m.emissive = new THREE.Color(color);
    m.emissiveMap = carrier;
    m.emissiveIntensity = 1;
    animateEmissive(m, uniforms, glsl);
  });
}

// Lueur qui respire : pas besoin d'UV, s'applique aussi aux parois et aux
// petites pièces.
function applyPulse(sets, { color, strength = 1 }, uniforms) {
  const glsl = 'totalEmissiveRadiance *= 0.55 + 0.45 * sin(uTime * 2.2) + uFlare * 1.2;';
  sets.all.forEach((m) => {
    m.emissive = new THREE.Color(color);
    m.emissiveIntensity = strength;
    animateEmissive(m, uniforms, glsl);
  });
}

function applyDefinition(weapon, id, def, finish, uniforms) {
  const roles = ROLES[weapon];
  Object.entries(def.palette).forEach(([role, tint]) => {
    collect(finish, roles[role] ?? []).all.forEach((m) => paint(m, tint));
  });
  (def.effect ?? []).forEach((effect, index) => {
    const sets = collect(
      finish,
      effect.roles.flatMap((role) => roles[role] ?? []),
    );
    if (effect.kind === 'fade') applyFade(weapon, id, index, sets, effect);
    else if (effect.kind === 'sweep') applySweep(weapon, sets, effect, uniforms);
    else if (effect.kind === 'pulse') applyPulse(sets, effect, uniforms);
  });
  return finish;
}

// --- Glock ---------------------------------------------------------------------------
// Mêmes réglages que la finition standard de glockModel.js (reliefs compris,
// transmis par le modèle) ; les teintes et effets viennent ensuite par-dessus.
function glockFinish(env, { slideBump, frameBump }) {
  const common = { envMap: env, envMapIntensity: 1 };
  return {
    slide: new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.55, color: 0x1c1e21, metalness: 0.6, roughness: 0.42, bumpMap: slideBump, bumpScale: 1.5 }),
    slideWall: new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.55, color: 0x1c1e21, metalness: 0.6, roughness: 0.38 }),
    frame: new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.25, color: 0x151618, metalness: 0.05, roughness: 0.78, bumpMap: frameBump, bumpScale: 0.9 }),
    frameWall: new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.25, color: 0x151618, metalness: 0.05, roughness: 0.66 }),
    barrel: new THREE.MeshStandardMaterial({ ...common, color: 0x6a6c70, metalness: 0.95, roughness: 0.22 }),
    steel: new THREE.MeshStandardMaterial({ ...common, color: 0x3a3c40, metalness: 0.9, roughness: 0.3 }),
    sight: new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.4, emissive: 0x333333 }),
    dot: new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.4, emissive: 0x333333 }),
  };
}

// Constructeurs au format de chaque modèle : `standardBuild` = la finition
// standard de l'arme (Vandal, sniper) ; le Glock passe null (voir glockFinish).
export function makeBasicSkins(weapon, standardBuild) {
  return Object.fromEntries(
    Object.entries(BASIC_SKINS[weapon]).map(([id, def]) => [
      id,
      {
        labelKey: def.labelKey,
        build: (env, ctx = {}) => {
          const finish = applyDefinition(weapon, id, def, standardBuild ? standardBuild(env, ctx) : glockFinish(env, ctx), ctx.uniforms);
          // Point de visée d'une autre couleur que le reste des organes de visée
          // (après la palette, qui repeint `sight` et `dot` ensemble).
          if (def.dot !== undefined) finish.dot = new THREE.MeshStandardMaterial({ color: def.dot, roughness: 0.4, emissive: def.dot, emissiveIntensity: 0.4 });
          return finish;
        },
      },
    ]),
  );
}
