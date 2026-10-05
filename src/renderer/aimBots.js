import * as THREE from 'three';

// Personnages ennemis des modes « à la Valorant » (arène Monastère).
//
// Échelle et vitesses reprises du jeu :
// - hauteur de hitbox commune à tous les agents : 1,96 m ;
// - course arme sortie : 6,75 m/s ; marche (Maj) : environ 3,8 m/s — valeurs
//   de la documentation communautaire du modèle de mouvement, Riot n'en
//   publie pas de fiche officielle ;
// - dégâts du Vandal : 160 à la tête (tue en une balle), 40 au corps, 34 aux
//   jambes.
// La caméra (y = 0) est à hauteur des yeux : le sol de l'arène est placé pour
// que la tête d'un agent debout soit pile au niveau du viseur, comme un bon
// placement de viseur en jeu.
import { AGENT_HEIGHT, AGENT_HEAD_RADIUS } from './aimTrainerModes.js';

export { AGENT_HEIGHT, AGENT_HEAD_RADIUS };
export const AGENT_FLOOR_Y = -(AGENT_HEIGHT - AGENT_HEAD_RADIUS);
export const AGENT_RUN_SPEED = 6.75;
export const AGENT_WALK_SPEED = 3.8;
export const DAMAGE = { head: 160, body: 40, legs: 34 };

const BODY_RADIUS = 0.3; // empreinte au sol pour les collisions avec le décor
// Démarrage un peu plus progressif que l'arrêt : un contre-strafe coupe la
// vitesse net, alors qu'on met un court instant à reprendre sa course.
const ACCELERATION = 26; // m/s² : ~0,26 s pour atteindre la vitesse de course
const DECELERATION = 48; // m/s² : ~0,14 s pour s'arrêter
const MIN_SPAWN_DISTANCE = 8;
const MAX_SPAWN_AZIMUTH_DEG = 52;
const HIDDEN_RESPAWN_MS = 1500; // un agent resté caché derrière un décor trop longtemps repart ailleurs
const DEATH_ANIM_MS = 280;
const RESPAWN_DELAY_MS = [450, 900];
const DAMAGE_POPUP_MS = 750;

const rand = (min, max) => min + Math.random() * (max - min);

export function makeDamageTexture(value, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 84px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(String(value), 128, 64);
  ctx.fillStyle = color;
  ctx.fillText(String(value), 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Bonhomme rouge vif, volontairement simple : jambes articulées aux hanches,
// torse, bras le long du corps, tête sphérique (la hitbox de la tête).
// Légèrement émissif pour rester bien visible sur le décor clair comme sombre.
export function buildAgentModel(material) {
  const group = new THREE.Group();
  const parts = [];
  const add = (parent, geometry, [x, y, z], part) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.userData.part = part;
    parent.add(mesh);
    parts.push(mesh);
    return mesh;
  };

  const hipY = 0.9;
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, hipY, 0);
    group.add(pivot);
    add(pivot, new THREE.CapsuleGeometry(0.09, hipY - 0.18, 4, 10), [0, -hipY / 2, 0], 'legs');
    return pivot;
  });
  add(group, new THREE.CapsuleGeometry(0.21, 0.42, 6, 14), [0, 1.26, 0], 'body');
  [-1, 1].forEach((side) => {
    const arm = add(group, new THREE.CapsuleGeometry(0.07, 0.5, 4, 10), [side * 0.29, 1.24, 0], 'body');
    arm.rotation.z = side * 0.12;
  });
  add(group, new THREE.SphereGeometry(AGENT_HEAD_RADIUS, 20, 16), [0, AGENT_HEIGHT - AGENT_HEAD_RADIUS, 0], 'head');
  return { group, legs, parts };
}

// Styles de déplacement proposés dans le mode Personnalisé (voir chooseAction).
export const AGENT_STYLES = ['mixed', 'strafe', 'jiggle', 'walk', 'static'];

// Système complet : pool d'agents, apparitions, déplacements, tirs et
// chiffres de dégâts. `arena` vient de buildMonasteryArena (colliders et
// zones d'apparition).
// Options du mode Personnalisé (1 / 1 / 'mixed' = comportement des modes
// officiels) : `speed` multiplie course, marche et accélérations, `scale` la
// taille du personnage (hitbox comprise), `style` restreint le répertoire de
// mouvements de chooseAction.
// `exactSpawns` (arènes de l'éditeur) : les zones sont les points EXACTS
// choisis par le joueur, pas une zone à échantillonner façon carte réelle —
// on saute donc le filtre distance/azimut pensé pour Monastère/Belvédère
// (sinon un ennemi posé délibérément à 3 m ou sur le côté serait rejeté).
export function createAgentSystem({ scene, arena, camera, speed = 1, scale = 1, style = 'mixed', exactSpawns = false }) {
  const agentMat = new THREE.MeshStandardMaterial({ color: 0xff2238, emissive: 0xff2238, emissiveIntensity: 0.45, roughness: 0.5 });
  const colliders = arena?.colliders ?? [];
  const zones = arena?.botZones ?? [];
  const floorY = arena?.floorY ?? AGENT_FLOOR_Y;
  const agents = [];
  const popups = [];
  const damageTextures = {
    head: makeDamageTexture(DAMAGE.head, '#ffd23f'),
    body: makeDamageTexture(DAMAGE.body, '#ffffff'),
    legs: makeDamageTexture(DAMAGE.legs, '#ffffff'),
  };
  const ray = new THREE.Ray();
  const tmp = new THREE.Vector3();
  const eye = new THREE.Vector3();

  // Réglages EFFECTIFS d'une zone : reprend vitesse/taille/style de l'ennemi
  // s'il en a un à lui (arène de l'éditeur, voir botZonesFor dans
  // buildCustomArena.js), sinon ceux de la session (identiques pour tous,
  // comme sur les vraies cartes). Calculés une fois à l'apparition, pas à
  // chaque image — un ennemi ne change pas de gabarit en cours de course.
  const settingsFor = (zone) => {
    const zSpeed = zone?.speed ?? speed;
    const zScale = zone?.scale ?? scale;
    return {
      style: zone?.style ?? style,
      runSpeed: AGENT_RUN_SPEED * zSpeed,
      walkSpeed: AGENT_WALK_SPEED * zSpeed,
      acceleration: ACCELERATION * zSpeed,
      deceleration: DECELERATION * zSpeed,
      height: AGENT_HEIGHT * zScale,
      bodyRadius: BODY_RADIUS * zScale,
      scale: zScale,
    };
  };

  const bodyBlocked = (x, z, baseY, bodyRadius, height) =>
    colliders.some(
      (c) =>
        c.max.y > baseY + 0.15 &&
        c.min.y < baseY + height - 0.1 &&
        x + bodyRadius > c.min.x &&
        x - bodyRadius < c.max.x &&
        z + bodyRadius > c.min.z &&
        z - bodyRadius < c.max.z,
    );

  // Premier décor touché le long d'un rayon, avant `maxDist`.
  const firstColliderHit = (origin, direction, maxDist) => {
    ray.set(origin, direction);
    let best = null;
    let bestDist = maxDist;
    colliders.forEach((c) => {
      const hit = ray.intersectBox(c, tmp);
      if (!hit) return;
      const d = origin.distanceTo(hit);
      if (d < bestDist) {
        bestDist = d;
        best = hit.clone();
      }
    });
    return best ? { point: best, distance: bestDist } : null;
  };

  const headPosition = (agent, target = new THREE.Vector3()) =>
    target.set(agent.x, agent.baseY + (AGENT_HEIGHT - AGENT_HEAD_RADIUS) * (agent.scale ?? scale), agent.z);

  const headVisible = (agent) => {
    camera.getWorldPosition(eye);
    const head = headPosition(agent);
    const dir = head.clone().sub(eye);
    const dist = dir.length();
    return !firstColliderHit(eye, dir.normalize(), dist - 0.05);
  };

  // La zone est tirée une fois par apparition (pas à chaque essai) : sinon
  // la zone où les essais échouent le moins finirait sur-représentée.
  const pickSpawn = () => {
    // Arènes de l'éditeur : chaque zone est un ennemi posé exprès. Si la zone
    // tirée est déjà occupée (ou hors de vue), on essaie les autres plutôt que
    // de renvoyer l'ennemi au repli au milieu de la salle.
    const order = exactSpawns ? [...zones].sort(() => Math.random() - 0.5) : [zones[Math.floor(Math.random() * zones.length)]];
    for (const zone of order) {
      const found = trySpawnIn(zone);
      if (found) return found;
    }
    const zone0 = exactSpawns && order[0] ? order[0] : (zones[0] ?? { minX: -6, maxX: 6 });
    if (exactSpawns && order[0]) {
      const settings = settingsFor(zone0);
      return { x: (zone0.minX + zone0.maxX) / 2, z: (zone0.minZ + zone0.maxZ) / 2, baseY: floorY + zone0.y, zone: zone0, settings, scale: settings.scale };
    }
    return { x: 0, z: -14, baseY: floorY, zone: zone0, settings: settingsFor(zone0) };
  };

  const trySpawnIn = (zone) => {
    const settings = settingsFor(zone);
    // Un emplacement posé n'accueille qu'un seul ennemi à la fois.
    if (exactSpawns && zone && agents.some((a) => a.active && !a.dead && a.zone === zone)) return null;
    for (let attempt = 0; zone && attempt < (exactSpawns ? 25 : 60); attempt += 1) {
      const x = rand(zone.minX, zone.maxX);
      const z = rand(zone.minZ, zone.maxZ);
      const baseY = floorY + zone.y;
      if (!exactSpawns) {
        const distance = Math.hypot(x, z);
        const azimuth = (Math.atan2(Math.abs(x), -z) * 180) / Math.PI;
        if (distance < MIN_SPAWN_DISTANCE || azimuth > MAX_SPAWN_AZIMUTH_DEG) continue;
      }
      if (bodyBlocked(x, z, baseY, settings.bodyRadius, settings.height)) continue;
      if (agents.some((a) => a.active && !a.dead && Math.hypot(a.x - x, a.z - z) < 1.5)) continue;
      const candidate = { x, z, baseY, zone, settings, scale: settings.scale };
      // Arène de l'éditeur : un ennemi par emplacement posé, visible ou non du
      // point de départ (on peut s'y déplacer pour aller le chercher).
      if (!exactSpawns && !headVisible(candidate)) continue;
      return candidate;
    }
    return null;
  };

  // Répertoire de comportements tirés au hasard, pondérés, pour éviter un
  // simple va-et-vient mécanique :
  // - course : traversée franche, parfois en léger biais ;
  // - jiggle : petits pas gauche-droite très courts (ADAD) ;
  // - marche : déplacement lent et plus long (Maj) ;
  // - arrêt : le joueur s'immobilise pour tirer, durée variable.
  const chooseAction = (agent, now) => {
    const style = agent.style;
    if (style === 'static') {
      agent.action = 'stop';
      agent.targetSpeed = 0;
      agent.actionUntil = now + 1000;
      return;
    }
    if (style === 'jiggle') {
      agent.action = 'jiggle';
      agent.dir *= -1;
      agent.targetSpeed = agent.runSpeed;
      agent.heading = 0;
      agent.actionUntil = now + rand(110, 240);
      agent.jiggles = 1 + Math.floor(Math.random() * 3);
      return;
    }
    if (style === 'strafe' || style === 'walk') {
      agent.action = style === 'walk' ? 'walk' : 'run';
      if (Math.random() < 0.55) agent.dir *= -1;
      agent.targetSpeed = style === 'walk' ? agent.walkSpeed : agent.runSpeed;
      agent.heading = 0;
      agent.actionUntil = now + rand(400, 1100);
      return;
    }
    const wasMoving = agent.action !== 'stop';
    const roll = Math.random();
    if (wasMoving && roll < 0.4) {
      agent.action = 'stop';
      agent.targetSpeed = 0;
      agent.actionUntil = now + rand(180, 750);
      return;
    }
    const pick = Math.random();
    if (pick < 0.3) {
      agent.action = 'jiggle';
      agent.dir *= -1;
      agent.targetSpeed = agent.runSpeed;
      agent.heading = 0;
      agent.actionUntil = now + rand(110, 240);
      agent.jiggles = 1 + Math.floor(Math.random() * 3);
    } else if (pick < 0.8) {
      agent.action = 'run';
      if (Math.random() < 0.55) agent.dir *= -1;
      agent.targetSpeed = agent.runSpeed;
      agent.heading = Math.random() < 0.35 ? rand(-0.45, 0.45) : 0;
      agent.actionUntil = now + rand(350, 1000);
    } else {
      agent.action = 'walk';
      if (Math.random() < 0.5) agent.dir *= -1;
      agent.targetSpeed = agent.walkSpeed;
      agent.heading = rand(-0.3, 0.3);
      agent.actionUntil = now + rand(600, 1400);
    }
  };

  const spawn = (agent, now) => {
    const spot = pickSpawn();
    const { settings, ...place } = spot;
    Object.assign(agent, place, settings, {
      active: true,
      dead: false,
      diedAt: 0,
      respawnAt: 0,
      velocity: 0,
      vz: 0,
      heading: 0,
      lean: 0,
      jiggles: 0,
      dir: Math.random() < 0.5 ? -1 : 1,
      action: 'stop',
      actionUntil: now + rand(100, 350),
      targetSpeed: 0,
      stride: 0,
      spawnedAt: now,
      hiddenSince: null,
    });
    agent.model.group.visible = true;
    agent.model.group.scale.setScalar(agent.scale);
    agent.model.group.rotation.set(0, 0, 0);
    agent.model.group.position.set(agent.x, agent.baseY, agent.z);
  };

  const ensurePool = (count) => {
    while (agents.length < count) {
      const model = buildAgentModel(agentMat);
      model.group.visible = false;
      scene.add(model.group);
      const agent = { model, active: false };
      model.parts.forEach((mesh) => {
        mesh.userData.agent = agent;
      });
      agents.push(agent);
    }
  };

  const hideAll = () => {
    agents.forEach((agent) => {
      agent.active = false;
      agent.model.group.visible = false;
    });
    popups.forEach((p) => scene.remove(p.sprite));
    popups.length = 0;
  };

  const reset = (requested, now) => {
    // Arène de l'éditeur : jamais plus d'ennemis que d'emplacements posés,
    // sinon les surnuméraires s'empilent tous au même endroit.
    const count = exactSpawns && zones.length ? Math.min(requested, zones.length) : requested;
    hideAll();
    ensurePool(count);
    agents.slice(0, count).forEach((agent) => spawn(agent, now));
  };

  const showDamage = (point, part, now) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: damageTextures[part], transparent: true, depthTest: false }),
    );
    camera.getWorldPosition(eye);
    const scale = Math.max(0.35, eye.distanceTo(point) * 0.045);
    sprite.scale.set(scale, scale / 2, 1);
    sprite.position.copy(point);
    sprite.renderOrder = 10;
    scene.add(sprite);
    popups.push({ sprite, bornAt: now, from: point.clone(), rise: scale * 0.9 });
  };

  const update = (now, dtMs, running) => {
    const dt = Math.min(dtMs, 50) / 1000;
    camera.getWorldPosition(eye);

    agents.forEach((agent) => {
      if (!agent.active) return;
      const { group, legs } = agent.model;

      if (agent.dead) {
        const t = Math.min(1, (now - agent.diedAt) / DEATH_ANIM_MS);
        group.rotation.x = (-Math.PI / 2) * t * t;
        group.position.y = agent.baseY - 0.2 * t;
        if (t >= 1) group.visible = false;
        if (running && now >= agent.respawnAt) spawn(agent, now);
        return;
      }

      if (running) {
        if (now >= agent.actionUntil) {
          if (agent.action === 'jiggle' && agent.jiggles > 0) {
            // Enchaîne quelques petits pas dans l'autre sens avant de changer d'idée.
            agent.jiggles -= 1;
            agent.dir *= -1;
            agent.actionUntil = now + rand(110, 240);
          } else {
            chooseAction(agent, now);
          }
        }
        // Vitesse visée dans le plan du sol : surtout latérale, parfois en biais.
        const tx = agent.targetSpeed * agent.dir * Math.cos(agent.heading ?? 0);
        const tz = agent.targetSpeed * Math.sin(agent.heading ?? 0);
        const approach = (current, target) => {
          const delta = target - current;
          const rate = Math.abs(target) < Math.abs(current) ? agent.deceleration : agent.acceleration;
          const maxStep = rate * dt;
          return current + (Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep);
        };
        agent.velocity = approach(agent.velocity, tx);
        agent.vz = approach(agent.vz ?? 0, tz);

        const nx = agent.x + agent.velocity * dt;
        const nz = agent.z + agent.vz * dt;
        const zone = agent.zone;
        // Distance/angle par rapport à l'ORIGINE DU MONDE : sans objet pour une
        // arène de l'éditeur, où le joueur n'est pas forcément près de cette
        // origine (voir exactSpawns). Sans ce bypass, un ennemi qui marche ou
        // strafe se faisait arrêter dès le premier pas, quel que soit le style
        // choisi — sa zone (un point, voir botZonesFor) le figeait déjà de
        // toute façon, mais même une zone plus large aurait buté ici.
        let blocked =
          bodyBlocked(nx, nz, agent.baseY, agent.bodyRadius, agent.height) ||
          nx < zone.minX || nx > zone.maxX || nz < zone.minZ || nz > zone.maxZ;
        if (!blocked && !exactSpawns) {
          const azimuth = (Math.atan2(Math.abs(nx), -nz) * 180) / Math.PI;
          const distance = Math.hypot(nx, nz);
          blocked = distance < MIN_SPAWN_DISTANCE - 1 || azimuth > MAX_SPAWN_AZIMUTH_DEG + 4;
        }
        if (blocked) {
          agent.velocity = 0;
          agent.vz = 0;
          agent.heading = -(agent.heading ?? 0);
          agent.dir *= -1;
          agent.action = 'stop';
          agent.targetSpeed = 0;
          agent.actionUntil = now + rand(140, 380);
        } else {
          agent.x = nx;
          agent.z = nz;
        }

        // Caché derrière un décor trop longtemps : il repart ailleurs.
        if (headVisible(agent)) agent.hiddenSince = null;
        else if (agent.hiddenSince === null) agent.hiddenSince = now;
        else if (now - agent.hiddenSince > HIDDEN_RESPAWN_MS) spawn(agent, now);
      }

      // Foulée : balancement des jambes, léger rebond vertical et buste penché
      // dans le sens de la course, proportionnels à la vitesse.
      const moveSpeed = Math.hypot(agent.velocity, agent.vz ?? 0);
      const speedRatio = Math.min(1, moveSpeed / agent.runSpeed);
      agent.stride += moveSpeed * dt * 2.6;
      legs[0].rotation.x = Math.sin(agent.stride) * 0.55 * speedRatio;
      legs[1].rotation.x = -Math.sin(agent.stride) * 0.55 * speedRatio;
      const bob = Math.abs(Math.sin(agent.stride)) * 0.035 * speedRatio;
      const lean = (agent.lean ?? 0) + ((agent.velocity / agent.runSpeed) * 0.09 - (agent.lean ?? 0)) * Math.min(1, dt * 10);
      agent.lean = lean;

      group.position.set(agent.x, agent.baseY + bob, agent.z);
      group.rotation.z = lean;
      // Toujours face au joueur (le modèle regarde vers -Z).
      group.rotation.y = Math.atan2(agent.x - eye.x, agent.z - eye.z);
    });

    for (let i = popups.length - 1; i >= 0; i -= 1) {
      const popup = popups[i];
      const t = (now - popup.bornAt) / DAMAGE_POPUP_MS;
      if (t >= 1) {
        scene.remove(popup.sprite);
        popup.sprite.material.dispose();
        popups.splice(i, 1);
      } else {
        popup.sprite.position.set(popup.from.x, popup.from.y + popup.rise * t, popup.from.z);
        popup.sprite.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      }
    }
  };

  // Tir au centre de l'écran. Renvoie ce qui a été touché en premier :
  // une partie d'agent ('head' | 'body' | 'legs'), le décor ('wall') ou rien.
  const shoot = (raycaster, now) => {
    const meshes = [];
    agents.forEach((agent) => {
      if (agent.active && !agent.dead) meshes.push(...agent.model.parts);
    });
    const hits = raycaster.intersectObjects(meshes, false);
    const origin = raycaster.ray.origin;
    const wall = firstColliderHit(origin, raycaster.ray.direction, hits[0]?.distance ?? 200);
    if (wall) return { kind: 'wall', point: wall.point };
    if (!hits.length) return { kind: null, point: null };

    const { object, point } = hits[0];
    const part = object.userData.part;
    const agent = object.userData.agent;
    showDamage(point, part, now);
    if (part === 'head') {
      agent.dead = true;
      agent.diedAt = now;
      agent.respawnAt = now + DEATH_ANIM_MS + rand(...RESPAWN_DELAY_MS);
      return { kind: 'head', point, reactionMs: now - agent.spawnedAt };
    }
    return { kind: part, point };
  };

  return { reset, update, shoot, hideAll };
}
