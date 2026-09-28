import * as THREE from 'three';

// Outils des skins « Transcendants » (palier au-dessus d'Ultime) : animation
// d'apparition pièce par pièce, particules soumises à un attracteur, portails
// en espace écran.

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => t * t * (3 - 2 * t);
// Léger dépassement puis retour : verrouillage « mécanique » d'une pièce.
export const easeOutBack = (t) => {
  const c = 1.9;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
export const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Photographie les pièces d'une arme (enfants directs de `roots`) pour pouvoir
// les déplacer pendant l'apparition puis les remettre exactement en place.
// `center` : centre de chaque pièce dans le repère de son parent.
export function captureParts(roots, exclude = []) {
  const skip = new Set(exclude);
  const parts = [];
  const box = new THREE.Box3();
  const tmpBox = new THREE.Box3();
  const inv = new THREE.Matrix4();
  const rel = new THREE.Matrix4();
  roots.forEach((root) => {
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    root.children.forEach((o) => {
      if (skip.has(o)) return;
      box.makeEmpty();
      o.traverse((n) => {
        if (!n.isMesh || !n.geometry) return;
        if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
        rel.multiplyMatrices(inv, n.matrixWorld);
        tmpBox.copy(n.geometry.boundingBox).applyMatrix4(rel);
        box.union(tmpBox);
      });
      if (box.isEmpty()) return;
      parts.push({
        object: o,
        position: o.position.clone(),
        quaternion: o.quaternion.clone(),
        scale: o.scale.clone(),
        center: box.getCenter(new THREE.Vector3()),
        size: box.getSize(new THREE.Vector3()).length(),
      });
    });
  });
  return parts;
}

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

// Place une pièce : mise à l'échelle `k` et rotation `extra` autour de son
// propre centre, puis décalage `delta` (repère du parent).
export function placePart(part, k, delta, extra = null) {
  tmpV.copy(part.position).sub(part.center).multiplyScalar(k);
  if (extra) tmpV.applyQuaternion(extra);
  part.object.position.copy(part.center).add(tmpV).add(delta);
  if (extra) part.object.quaternion.copy(tmpQ.copy(extra).multiply(part.quaternion));
  else part.object.quaternion.copy(part.quaternion);
  part.object.scale.copy(part.scale).multiplyScalar(Math.max(0.0001, k));
}

export function restorePart(part) {
  part.object.position.copy(part.position);
  part.object.quaternion.copy(part.quaternion);
  part.object.scale.copy(part.scale);
}

// Particules additives attirées vers un point (qui peut bouger) : elles partent,
// ralentissent, puis retombent en spirale vers l'attracteur.
export function attractedParticles(scene, texture, { max = 120 } = {}) {
  const items = [];
  const target = new THREE.Vector3();
  const spawn = (position, velocity, { life = 700, size = 0.004, tint = 0xffffff, pull = 30, anchor = null, fade = 1 } = {}) => {
    if (items.length >= max) {
      const old = items.shift();
      scene.remove(old.sprite);
      old.sprite.material.dispose();
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: tint, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    scene.add(sprite);
    items.push({ sprite, velocity: velocity.clone(), born: performance.now(), life, size, pull, anchor, fade });
  };
  const update = (dt) => {
    const now = performance.now();
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const p = items[i];
      const t = (now - p.born) / p.life;
      if (t >= 1) {
        scene.remove(p.sprite);
        p.sprite.material.dispose();
        items.splice(i, 1);
        continue;
      }
      if (p.anchor) {
        p.anchor.getWorldPosition(target);
        tmpV.copy(target).sub(p.sprite.position);
        p.velocity.addScaledVector(tmpV, p.pull * dt);
        p.velocity.multiplyScalar(Math.max(0, 1 - 2.2 * dt));
      }
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.sprite.scale.setScalar(p.size * (1 - t * 0.6));
      p.sprite.material.opacity = p.fade * Math.min(1, t * 10) * (1 - t);
    }
  };
  return { spawn, update };
}

// Fond « autre dimension » calculé en espace écran : il ne suit pas l'arme, ce
// qui donne l'impression de regarder à travers elle. Renvoie une fonction GLSL
// `vec3 riftSpace(vec2 fragCoord, float time)`.
export const RIFT_GLSL = `
  float rkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float rkNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(rkHash(i), rkHash(i + vec2(1.0, 0.0)), f.x), mix(rkHash(i + vec2(0.0, 1.0)), rkHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float rkFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * rkNoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
  vec3 riftSpace(vec2 fragCoord, float time, vec3 tintA, vec3 tintB) {
    vec2 p = fragCoord / 240.0;
    float n = rkFbm(p * 2.0 + vec2(time * 0.05, -time * 0.03) + rkFbm(p * 3.0 - time * 0.04));
    vec3 col = mix(tintA * 0.15, tintA, smoothstep(0.35, 0.75, n));
    col = mix(col, tintB, smoothstep(0.62, 0.9, n));
    vec2 sp = floor(fragCoord / 3.0);
    float star = step(0.996, rkHash(sp)) * (0.5 + 0.5 * sin(time * 3.0 + rkHash(sp + 7.0) * 40.0));
    return col + vec3(star);
  }
`;

// Oriente un maillage plan vers la caméra à chaque rendu (face +z vers l'œil),
// quel que soit le parent : portails, fentes, halos non ronds.
export function faceCamera(mesh) {
  const parentQ = new THREE.Quaternion();
  const camQ = new THREE.Quaternion();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.parent.getWorldQuaternion(parentQ);
    camera.getWorldQuaternion(camQ);
    mesh.quaternion.copy(parentQ.invert().multiply(camQ));
    mesh.updateMatrix();
    mesh.matrixWorld.multiplyMatrices(mesh.parent.matrixWorld, mesh.matrix);
    mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix);
  };
}

// Anneau plat (tore) projeté dans la scène, qui s'élargit et s'éteint : onde de
// choc. Réserve de maillages réutilisés, pas d'allocation par tir.
export function shockRings(scene, { color = 0xffffff, count = 8, thickness = 0.03, additive = true } = {}) {
  const geo = new THREE.TorusGeometry(1, thickness, 6, 64).rotateY(Math.PI / 2);
  const rings = Array.from({ length: count }, () => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, born: -1, delay: 0, reach: 0.1, life: 200, from: 0.005, peak: 0.8 };
  });
  let cursor = 0;
  const spawn = (position, quaternion, { delay = 0, reach = 0.1, life = 200, from = 0.005, peak = 0.8, tint = null } = {}) => {
    const r = rings[cursor];
    cursor = (cursor + 1) % rings.length;
    Object.assign(r, { born: performance.now(), delay, reach, life, from, peak });
    if (tint !== null) r.mesh.material.color.set(tint);
    r.mesh.position.copy(position);
    r.mesh.quaternion.copy(quaternion);
  };
  const update = () => {
    const now = performance.now();
    rings.forEach((r) => {
      if (r.born < 0) return;
      const t = (now - r.born - r.delay) / r.life;
      if (t < 0) return;
      if (t >= 1) {
        r.born = -1;
        r.mesh.visible = false;
        return;
      }
      r.mesh.visible = true;
      r.mesh.scale.setScalar(r.from + easeOutCubic(t) * r.reach);
      r.mesh.material.opacity = (1 - t) * r.peak;
    });
  };
  return { spawn, update };
}

export const easeOutBounce = (t) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
// Rebond élastique amorti autour de 1 (gelée, ressort).
export const easeOutElastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

// Place une pièce avec une échelle par axe (repère du parent), autour de son
// centre : aplatissement « écran CRT », dépliage de papier...
const tmpS = new THREE.Vector3();
export function placePartScaled(part, scale, delta, extra = null) {
  tmpS.copy(part.position).sub(part.center).multiply(scale);
  if (extra) tmpS.applyQuaternion(extra);
  part.object.position.copy(part.center).add(tmpS).add(delta);
  if (extra) part.object.quaternion.copy(new THREE.Quaternion().copy(extra).multiply(part.quaternion));
  else part.object.quaternion.copy(part.quaternion);
  part.object.scale.set(part.scale.x * Math.max(0.0001, scale.x), part.scale.y * Math.max(0.0001, scale.y), part.scale.z * Math.max(0.0001, scale.z));
}

// Déroulé commun des apparitions : `place(piece, t)` positionne chaque pièce
// (t = secondes depuis le début), `frame(t)` anime le décor de l'apparition ;
// à la fin tout est remis exactement en place et `end()` est appelé.
export function introRunner(pieces, { duration, place, frame = null, start = null, end = null, hidden = [] }) {
  let t = -1;
  const finish = () => {
    t = -1;
    pieces.forEach((p) => {
      restorePart(p);
      p.object.visible = true;
    });
    hidden.forEach((o) => (o.visible = true));
    end?.();
  };
  const step = (dt) => {
    if (t < 0) return;
    t += dt;
    hidden.forEach((o) => (o.visible = t > duration * 0.85));
    frame?.(t);
    pieces.forEach((p) => place(p, t));
    if (t >= duration) finish();
  };
  return {
    start: () => {
      t = 0;
      start?.();
      step(0);
    },
    update: step,
    running: () => t >= 0,
    duration,
  };
}

// Ordre d'apparition normalisé (0 → 1) selon une clé calculée par pièce.
export function orderBy(pieces, key) {
  const values = pieces.map(key);
  const min = Math.min(...values);
  const max = Math.max(...values);
  pieces.forEach((p, i) => (p.order = max > min ? (values[i] - min) / (max - min) : 0));
}

// Texture de canevas redessinée à la volée (écrans, compteurs).
export function liveCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}
