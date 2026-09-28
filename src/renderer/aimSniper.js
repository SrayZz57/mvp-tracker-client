import * as THREE from 'three';
import { AGENT_HEIGHT, AGENT_HEAD_RADIUS, buildAgentModel, makeDamageTexture } from './aimBots.js';

// Modes sniper (arène Canyon) : ennemis qui sortent de couvert, se lèvent
// derrière un muret, apparaissent dans une embrasure ou attendent à découvert,
// selon le mode. Même rôle que createAgentSystem (aimBots.js) pour les duels :
// le moteur de jeu appelle reset / update / shoot, et reçoit les fuites
// (ennemi pas tué à temps) par onEscape.
//
// L'arme est l'Operator : une balle au corps ou à la tête tue (150 / 255 de
// dégâts), une balle dans les jambes non (127). La lunette, la culasse et
// l'imprécision sans lunette sont gérées par le moteur (voir OPERATOR).

export const OPERATOR = {
  zoom: 2.5, // premier niveau de zoom de l'Operator
  scopeInMs: 180,
  boltMs: 1333, // 0,75 tir/s
  hipSpreadDeg: 4, // tir sans lunette : très imprécis
  damage: { head: 255, body: 150, legs: 127 },
};

const STRAFE_SPEED = 6.75; // vitesse de course Valorant, m/s (sortie de couvert)
const DEATH_MS = 280;
const POPUP_MS = 750;
const MARKER_COLOR = 0x5fe8d8;

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Positions caché / exposé d'un angle de l'arène (voir buildRangeArena).
function anglePose(angle) {
  if (angle.kind === 'edge') {
    const { cover, side } = angle;
    const z = cover.min.z - 0.45; // juste derrière le couvert, vu du nid
    const out = side > 0 ? cover.max.x + 0.55 : cover.min.x - 0.55;
    const hid = side > 0 ? cover.max.x - 0.55 : cover.min.x + 0.55;
    return { hidden: new THREE.Vector3(hid, angle.floor, z), exposed: new THREE.Vector3(out, angle.floor, z) };
  }
  if (angle.kind === 'rise') {
    const { cover } = angle;
    const x = (cover.min.x + cover.max.x) / 2;
    const z = cover.min.z - 0.4;
    // Accroupi : le haut de la tête reste sous le haut du couvert.
    return {
      hidden: new THREE.Vector3(x, cover.max.y - AGENT_HEIGHT - 0.15, z),
      exposed: new THREE.Vector3(x, angle.floor, z),
    };
  }
  // Embrasure : il apparaît sur place.
  const p = new THREE.Vector3(angle.x, angle.floor, angle.z);
  return { hidden: p, exposed: p.clone(), instant: true };
}

// Déroulement d'un mode, choisi par MODES[...].sniper.behavior.
export const SNIPER_BEHAVIORS = {
  // Cible à découvert, brièvement : scoper et tirer d'un seul geste.
  quickscope: { source: 'open', count: 1, window: 1100, gap: [350, 800] },
  // De près, en mouvement : lunette interdite, tir à la volée plus serré.
  noscope: { source: 'close', count: 1, window: 1700, gap: [300, 650], strafe: true, noScope: true, hipSpreadDeg: 1.2 },
  // Un angle marqué à tenir : l'ennemi en sort sans prévenir.
  angleHold: { source: 'angles', count: 1, window: 700, gap: [900, 3200], hold: true, keepAngle: 3 },
  // Après chaque élimination, le suivant sort d'un AUTRE angle.
  repeek: { source: 'angles', count: 1, window: 950, gap: [350, 700], differentAngle: true },
  // Trois cibles à découvert : la cadence de la culasse est le défi.
  bolt: { source: 'open', count: 3, window: null, gap: [500, 900] },
  // Cible loin et déjà visible, lunette baissée à chaque apparition.
  scopeSpeed: { source: 'far', count: 1, window: 2400, gap: [700, 1100], forceUnscope: true },
};

export function createSniperSystem({ scene, arena, camera, behavior, onEscape, onAppear }) {
  const params = SNIPER_BEHAVIORS[behavior] ?? SNIPER_BEHAVIORS.quickscope;
  const colliders = arena?.colliders ?? [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xff2238, emissive: 0xff2238, emissiveIntensity: 0.5, roughness: 0.5 });
  const damageTextures = {
    head: makeDamageTexture(OPERATOR.damage.head, '#ffd23f'),
    body: makeDamageTexture(OPERATOR.damage.body, '#ffffff'),
    legs: makeDamageTexture(OPERATOR.damage.legs, '#9aa0ab'),
  };
  const eye = new THREE.Vector3();
  const ray = new THREE.Ray();
  const tmp = new THREE.Vector3();
  const popups = [];

  // Marqueur de l'angle à tenir (mode angleHold) : anneau lumineux à hauteur de tête.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.3, 40),
    new THREE.MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }),
  );
  marker.renderOrder = 9;
  marker.visible = false;
  scene.add(marker);

  // Sources de positions.
  const angles = (arena?.angles ?? []).map((a) => ({ angle: a, pose: anglePose(a) }));
  const openSpots = (arena?.open ?? []).map((o) => ({ pose: { hidden: new THREE.Vector3(o.x, o.floor, o.z), exposed: new THREE.Vector3(o.x, o.floor, o.z), instant: true } }));
  const farSpots = openSpots.filter((s) => s.pose.exposed.z < -40);
  const floor = arena?.floorY ?? -4;

  const closeSpot = () => {
    const p = new THREE.Vector3(rand(-7, 7), floor, rand(-16, -11));
    return { pose: { hidden: p, exposed: p.clone(), instant: true } };
  };

  const targets = Array.from({ length: params.count }, () => {
    const model = buildAgentModel(mat);
    model.group.visible = false;
    scene.add(model.group);
    const t = { model, state: 'idle', spot: null, nextAt: 0 };
    model.parts.forEach((mesh) => {
      mesh.userData.target = t;
    });
    return t;
  });

  let lastSpot = null;
  let heldSpot = null;
  let heldLeft = 0;

  const chooseSpot = (self) => {
    const busy = (s) => targets.some((o) => o !== self && o.state !== 'idle' && o.spot === s);
    if (params.source === 'close') return closeSpot();
    if (params.source === 'open') return pick(openSpots.filter((s) => !busy(s)));
    if (params.source === 'far') return pick(farSpots);
    // Angles.
    if (params.hold) {
      if (!heldSpot || heldLeft <= 0) {
        const pool = angles.filter((a) => a.angle.tier !== 'near' && a !== heldSpot);
        heldSpot = pick(pool);
        heldLeft = params.keepAngle;
      }
      return heldSpot;
    }
    const pool = angles.filter((a) => a !== lastSpot && !busy(a));
    return pick(pool);
  };

  const headWorld = (t, out) => out.set(t.model.group.position.x, t.model.group.position.y + AGENT_HEIGHT - AGENT_HEAD_RADIUS, t.model.group.position.z);

  const schedule = (t, now, [min, max]) => {
    t.state = 'idle';
    t.nextAt = now + rand(min, max);
    t.model.group.visible = false;
  };

  const appear = (t, now) => {
    const spot = chooseSpot(t);
    if (!spot) return schedule(t, now, [200, 400]);
    t.spot = spot;
    lastSpot = spot;
    const { hidden, exposed, instant } = spot.pose;
    const travel = hidden.distanceTo(exposed);
    t.from = hidden;
    t.to = exposed;
    t.moveMs = instant ? 0 : Math.max(150, (travel / STRAFE_SPEED) * 1000);
    t.startedAt = now;
    t.exposedAt = now + t.moveMs;
    t.expireAt = params.window ? t.exposedAt + params.window : Infinity;
    t.state = 'out';
    t.strafeDir = Math.random() < 0.5 ? -1 : 1;
    t.strafeUntil = now + rand(250, 700);
    t.offsetX = 0;
    t.model.group.visible = true;
    t.model.group.rotation.set(0, 0, 0);
    t.model.group.position.copy(instant ? exposed : hidden);
    onAppear?.();
  };

  const reset = (now) => {
    popups.forEach((p) => scene.remove(p.sprite));
    popups.length = 0;
    heldSpot = null;
    heldLeft = 0;
    lastSpot = null;
    targets.forEach((t, i) => schedule(t, now, [400 + i * 250, 900 + i * 250]));
  };

  const hideAll = () => {
    targets.forEach((t) => {
      t.state = 'idle';
      t.model.group.visible = false;
    });
    marker.visible = false;
  };

  const update = (now, dtMs, running) => {
    const dt = Math.min(dtMs, 50) / 1000;
    camera.getWorldPosition(eye);

    targets.forEach((t) => {
      const g = t.model.group;
      if (t.state === 'idle') {
        if (running && now >= t.nextAt) appear(t, now);
        return;
      }
      if (t.state === 'dead') {
        const k = Math.min(1, (now - t.diedAt) / DEATH_MS);
        g.rotation.x = (-Math.PI / 2) * k * k;
        if (k >= 1) schedule(t, now, params.gap);
        return;
      }
      if (t.state === 'back') {
        const k = Math.min(1, (now - t.startedAt) / Math.max(1, t.moveMs));
        g.position.lerpVectors(t.to, t.from, k);
        if (k >= 1 || t.moveMs === 0) schedule(t, now, params.gap);
        return;
      }
      // Sortie puis exposition.
      if (running) {
        const k = t.moveMs ? Math.min(1, (now - t.startedAt) / t.moveMs) : 1;
        g.position.lerpVectors(t.from, t.to, k * k * (3 - 2 * k));
        // Déplacement latéral en continu (mode no-scope) une fois sorti.
        if (params.strafe && k >= 1) {
          if (now >= t.strafeUntil) {
            t.strafeDir *= -1;
            t.strafeUntil = now + rand(250, 700);
          }
          t.offsetX = Math.max(-1.6, Math.min(1.6, t.offsetX + t.strafeDir * 3.8 * dt));
          g.position.x = t.to.x + t.offsetX;
        }
        // Fuite : pas tué à temps, il se remet à couvert (compté comme raté).
        if (now >= t.expireAt) {
          onEscape?.();
          if (params.hold) heldLeft -= 1;
          t.state = 'back';
          t.startedAt = now;
          t.to = g.position.clone();
        }
      }
      g.rotation.y = Math.atan2(g.position.x - eye.x, g.position.z - eye.z);
    });

    // Marqueur : sur la tête de la position exposée de l'angle à tenir, tant
    // que personne n'y est sorti.
    if (params.hold && heldSpot) {
      const waiting = targets.every((t) => t.state === 'idle' || t.state === 'dead');
      marker.visible = waiting;
      if (waiting) {
        marker.position.set(heldSpot.pose.exposed.x, heldSpot.pose.exposed.y + AGENT_HEIGHT - AGENT_HEAD_RADIUS, heldSpot.pose.exposed.z);
        marker.lookAt(eye);
        marker.material.opacity = 0.45 + 0.35 * Math.sin(now / 160);
      }
    } else {
      marker.visible = false;
    }

    for (let i = popups.length - 1; i >= 0; i -= 1) {
      const p = popups[i];
      const k = (now - p.bornAt) / POPUP_MS;
      if (k >= 1) {
        scene.remove(p.sprite);
        p.sprite.material.dispose();
        popups.splice(i, 1);
      } else {
        p.sprite.position.set(p.from.x, p.from.y + p.rise * k, p.from.z);
        p.sprite.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      }
    }
  };

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
    return best;
  };

  const popup = (point, part, now) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: damageTextures[part], transparent: true, depthTest: false }));
    camera.getWorldPosition(eye);
    const scale = Math.max(0.35, eye.distanceTo(point) * 0.03);
    sprite.scale.set(scale, scale / 2, 1);
    sprite.position.copy(point);
    sprite.renderOrder = 10;
    scene.add(sprite);
    popups.push({ sprite, bornAt: now, from: point.clone(), rise: scale * 0.9 });
  };

  // Tir : renvoie { kind: 'kill' | 'legs' | 'wall' | null, point, reactionMs }.
  const shoot = (raycaster, now) => {
    const meshes = [];
    targets.forEach((t) => {
      if (t.state === 'out') meshes.push(...t.model.parts);
    });
    const hits = raycaster.intersectObjects(meshes, false);
    const wall = firstColliderHit(raycaster.ray.origin, raycaster.ray.direction, hits[0]?.distance ?? 300);
    if (wall) return { kind: 'wall', point: wall };
    if (!hits.length) return { kind: null, point: null };
    const { object, point } = hits[0];
    const part = object.userData.part;
    const t = object.userData.target;
    popup(point, part, now);
    if (part === 'legs') return { kind: 'legs', point };
    t.state = 'dead';
    t.diedAt = now;
    if (params.hold) heldLeft -= 1;
    return { kind: 'kill', point, reactionMs: Math.max(0, now - t.exposedAt) };
  };

  // Point de visée « naturel » à l'instant présent (tête exposée la plus proche),
  // utile au HUD si besoin ; renvoie null s'il n'y en a pas.
  const activeHead = () => {
    const t = targets.find((o) => o.state === 'out');
    return t ? headWorld(t, new THREE.Vector3()) : null;
  };

  return { reset, update, shoot, hideAll, activeHead, params };
}
