import * as THREE from 'three';
import { BOX_STYLES } from './boxStyles.js';

// Construit l'arène jouée à partir d'une arène de l'éditeur.
//
// Pas de recentrage : les box, les ennemis ET la salle utilisent tous les
// mêmes coordonnées qu'en construction (l'éditeur ET le jeu placent tous les
// deux la salle « classique » au même endroit fixe, voir buildClassicRoom).
// Seule la CAMÉRA est positionnée au point de départ choisi (n'importe où
// dans la salle, dans n'importe quelle direction) — voir son réglage juste
// après l'appel à cette fonction dans AimTrainerGame.jsx.
//
// (Une première version recentrait tout sur le point de départ avec une
// rotation par quarts de tour : la salle, elle, restait fixe autour de
// l'origine du moteur — tout ce qui avait été construit loin du point de
// départ se retrouvait donc derrière son vrai mur, invisible. Inutile : la
// salle est la même des deux côtés, il suffit de ne rien déplacer.)
export function buildCustomArena(group, arenaData, { floorY, isDark }) {
  const tint = (hex) => (isDark ? new THREE.Color(hex).multiplyScalar(0.55) : new THREE.Color(hex));
  const materials = Object.fromEntries(
    Object.entries(BOX_STYLES).map(([id, s]) => [
      id,
      new THREE.MeshStandardMaterial({
        color: tint(s.color),
        roughness: s.roughness,
        metalness: s.metalness,
        transparent: s.opacity !== undefined,
        opacity: s.opacity ?? 1,
        depthWrite: s.opacity === undefined,
      }),
    ]),
  );
  const fallbackMaterial = materials[Object.keys(materials)[0]];
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  const colliders = arenaData.boxes.map((box) => {
    const mesh = new THREE.Mesh(unitBox, materials[box.style] ?? fallbackMaterial);
    mesh.position.set(box.x, floorY + box.y, box.z);
    mesh.scale.set(box.w, box.h, box.d);
    group.add(mesh);
    return new THREE.Box3(
      new THREE.Vector3(box.x - box.w / 2, floorY + box.y, box.z - box.d / 2),
      new THREE.Vector3(box.x + box.w / 2, floorY + box.y + box.h, box.z + box.d / 2),
    );
  });

  return {
    colliders,
    floorY,
    botZones: botZonesFor(arenaData.enemies),
    bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
    spawn: arenaData.spawn,
  };
}

// Petite zone de patrouille autour du point posé — PAS un point exact (min =
// max) : l'apparition initiale ET tout déplacement ensuite (marche, jiggle,
// strafe...) restent bornés à la zone de l'ennemi (voir aimBots.js), donc un
// point sans largeur le figeait purement et simplement, quel que soit le
// style choisi. 1,5 m de rayon : assez pour qu'un style de déplacement se
// voie, assez peu pour rester « à cet endroit-là », pas dans toute la salle.
// Visible pendant la construction (voir ArenaEditor.jsx), pas en jouant.
// `exactSpawns` (passé à createAgentSystem) fait le reste : il retire le
// filtre distance/angle-au-centre-du-monde, sans objet ici (voir son usage).
//
// style/speed/scale : repris de l'ennemi s'il a les siens (sinon absents de
// la zone, et aimBots.js retombe sur le réglage de session — voir
// settingsFor dans aimBots.js).
export const PATROL_RADIUS = 1.5;
export function botZonesFor(enemies) {
  if (!enemies.length) return [{ minX: -3, maxX: 3, minZ: -10, maxZ: -6, y: 0 }];
  return enemies.map((e) => ({
    minX: e.x - PATROL_RADIUS,
    maxX: e.x + PATROL_RADIUS,
    minZ: e.z - PATROL_RADIUS,
    maxZ: e.z + PATROL_RADIUS,
    y: e.y,
    ...(e.style != null ? { style: e.style } : {}),
    ...(e.speed != null ? { speed: e.speed } : {}),
    ...(e.scale != null ? { scale: e.scale } : {}),
  }));
}
