import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { tiledTexture, seeded, speckle, springStep } from './weaponKit.js';
import { HAND_SKINS } from './handSkins.js';

// Mains gantées et avant-bras du viewmodel, modélisés en code (aucun fichier ni
// licence). La prise est décrite par un repère autour de la pièce tenue (axe de
// la poignée ou du garde-main) et par la demi-largeur/demi-profondeur réelles de
// cette pièce : la paume est une surface bombée qui l'épouse, et les doigts
// partent de la ligne des jointures en suivant sa surface, sans la traverser.
// Repère = celui de l'arme (millimètres, x vers la bouche, y vers le haut,
// z vers le flanc droit) ; la caméra est derrière, en haut à gauche.
//
// Animations : attente hors champ puis saisie de l'arme à la fin des
// apparitions des skins, respiration des doigts, index qui presse la détente,
// tapotement de la main gauche, main droite qui manœuvre la culasse du sniper.

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

const materialCache = new Map();
function handMaterials(skinId = 'standard') {
  const key = HAND_SKINS[skinId] ? skinId : 'standard';
  if (materialCache.has(key)) return materialCache.get(key);
  const p = HAND_SKINS[key];
  const knit = tiledTexture('hand-knit', 128, (ctx, size) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        ctx.fillStyle = (x + y) % 8 ? '#9a9a9a' : '#606060';
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }, { repeat: 1 / 5 });
  const cloth = tiledTexture(`hand-cloth-v2-${key}`, 256, (ctx, size) => {
    ctx.fillStyle = p.cloth;
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, 9000, ['rgba(0,0,0,0.22)', 'rgba(255,255,255,0.05)'], 1, seeded(7702));
    // Trame diagonale du tissu technique.
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    for (let k = -size; k < size; k += 6) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + size, size);
      ctx.stroke();
    }
  }, { color: true });
  cloth.repeat.set(4, 3);
  const mats = {
    glove: new THREE.MeshPhysicalMaterial({ color: p.glove, roughness: 0.72, bumpMap: knit, bumpScale: 0.35, sheen: 0.4, sheenColor: new THREE.Color(p.sheen), side: THREE.DoubleSide }),
    tip: new THREE.MeshStandardMaterial({ color: p.tip, roughness: 0.6 }),
    plate: new THREE.MeshPhysicalMaterial({
      color: p.plate,
      roughness: p.plateMetal ? 0.25 : 0.35,
      metalness: p.plateMetal ?? 0,
      clearcoat: 0.6,
      emissive: p.plateGlow ?? 0x000000,
      emissiveIntensity: p.plateGlow ? 0.6 : 0,
      side: THREE.DoubleSide,
    }),
    sleeve: new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.92, side: THREE.DoubleSide }),
    cuff: new THREE.MeshStandardMaterial({ color: p.cuff, roughness: 0.55 }),
    accent: new THREE.MeshStandardMaterial({ color: p.accent, roughness: 0.45, emissive: p.glow, emissiveIntensity: p.glowIntensity ?? 0.35 }),
  };
  materialCache.set(key, mats);
  return mats;
}

// --- Primitives -------------------------------------------------------------------

// Capsule de 1 mm de partie droite, étirée entre deux points à chaque image.
function segment(r, material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 6, 16), material);
  m.userData.r = r;
  return m;
}
const dirTmp = new THREE.Vector3();
function place(m, a, b, widen = 1) {
  dirTmp.copy(b).sub(a);
  const len = Math.max(0.5, dirTmp.length());
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(UP, dirTmp.normalize());
  const r = m.userData.r;
  m.scale.set(widen, (len + 2 * r) / (1 + 2 * r), widen);
}

// Surface paramétrique (u, v ∈ [0, 1]) → maillage.
function patch(fn, nu = 20, nv = 20) {
  const pos = [];
  const idx = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= nu; i += 1) {
    for (let j = 0; j <= nv; j += 1) {
      fn(i / nu, j / nv, p);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Repère de prise : O (origine sur l'axe), a (axe), p (côté paume), q (sens
// d'enroulement), sp/sq (demi-extensions de la pièce le long de p et q).
function frame(spec) {
  const a = spec.axis.clone().normalize();
  const p = spec.palmSide.clone().sub(a.clone().multiplyScalar(spec.palmSide.dot(a))).normalize();
  const q = new THREE.Vector3().crossVectors(a, p).normalize();
  if (spec.flip) q.negate();
  const at = (h, deg, off = 0, out = new THREE.Vector3()) => {
    const t = (deg * Math.PI) / 180;
    return out.copy(spec.origin)
      .addScaledVector(a, h)
      .addScaledVector(p, Math.cos(t) * (spec.sp + off))
      .addScaledVector(q, Math.sin(t) * (spec.sq + off));
  };
  // Normale sortante (approchée) de la surface à l'angle θ.
  const normal = (deg, out = new THREE.Vector3()) => {
    const t = (deg * Math.PI) / 180;
    return out.copy(p).multiplyScalar(Math.cos(t) / spec.sp).addScaledVector(q, Math.sin(t) / spec.sq).normalize();
  };
  return { a, p, q, at, normal };
}

// --- Doigt souple ------------------------------------------------------------------

// Tube continu qui suit une courbe, rayon variable, bout arrondi : un doigt
// d'un seul tenant (pas de perles). La topologie est fixe ; seules les
// positions sont recalculées quand la main bouge.
function flexTube(material, tipMaterial, samples = 18, radial = 14) {
  const rings = samples + 1;
  const pos = new Float32Array(rings * (radial + 1) * 3);
  const idx = [];
  for (let i = 0; i < samples; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), tipMaterial);
  // Racine arrondie aussi : sans elle, le tube ouvert laissait une coupe nette
  // là où le doigt sort de la paume.
  const root = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), material);
  const c = new THREE.Vector3();
  const t = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const update = (points, radius, ref) => {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    for (let i = 0; i < rings; i += 1) {
      const u = i / samples;
      curve.getPointAt(u, c);
      curve.getTangentAt(u, t);
      n.copy(ref).addScaledVector(t, -ref.dot(t)).normalize();
      b.crossVectors(t, n);
      const r = radius(u);
      for (let j = 0; j <= radial; j += 1) {
        const ang = (j / radial) * Math.PI * 2;
        const k = (i * (radial + 1) + j) * 3;
        const cs = Math.cos(ang) * r;
        const sn = Math.sin(ang) * r;
        pos[k] = c.x + n.x * cs + b.x * sn;
        pos[k + 1] = c.y + n.y * cs + b.y * sn;
        pos[k + 2] = c.z + n.z * cs + b.z * sn;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    tip.position.copy(c);
    tip.scale.setScalar(radius(1) * 1.02);
    curve.getPointAt(0, root.position);
    root.scale.setScalar(radius(0) * 1.02);
  };
  return { mesh, tip, root, update };
}

// Profil d'un doigt : fin vers le bout, léger renflement aux articulations.
function fingerRadius(root) {
  return (u) => root * (1 - 0.26 * u) * (1 + 0.07 * Math.exp(-((u - 0.36) ** 2) / 0.004) + 0.05 * Math.exp(-((u - 0.7) ** 2) / 0.004));
}

// --- Main --------------------------------------------------------------------------

// spec : origin, axis, palmSide, flip, sp, sq,
//  fingers: [{ h, r, reach }] (doigts enroulés, de haut en bas),
//  knuckle (angle de la ligne des jointures), palm { h0, h1, from, to },
//  index (points [x,y,z] jusqu'à la détente), thumb (points), heel, wrist, elbow.
function buildHand(spec) {
  const mats = handMaterials(spec.skin);
  const group = new THREE.Group();
  const f = frame(spec);
  const K = spec.knuckle ?? 20;
  const tmp = new THREE.Vector3();
  const visible = spec.visibleSide ?? new THREE.Vector3(0, 0, -1);

  // Paume : volume bombé qui épouse la pièce. Son épaisseur tombe à zéro sur
  // tous ses bords, qui rejoignent donc la surface tenue (aucun bord ouvert
  // visible). Côté jointures, elle déborde au-delà de la naissance des doigts :
  // ceux-ci en sortent sans raccord visible.
  const P = spec.palm;
  const T = P.thickness ?? 14;
  const palmOffset = (h, deg) => {
    const u = (h - P.h0) / (P.h1 - P.h0);
    const v = (deg - P.from) / (P.to - P.from);
    if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0.8;
    // Profil en dôme arrondi : plein au centre, bord doux (pas de marche).
    const e = Math.sin(Math.PI * u) ** 0.45 * Math.sin(Math.PI * v) ** 0.55;
    return 0.8 + T * e;
  };
  group.add(new THREE.Mesh(patch((u, v, out) => {
    const h = P.h0 + (P.h1 - P.h0) * u;
    const deg = P.from + (P.to - P.from) * v;
    return f.at(h, deg, palmOffset(h, deg), out);
  }, 30, 36), mats.glove));
  if (P.plate) {
    // Plaque rembourrée sur le dos de la main, épousant le dôme de la paume.
    group.add(new THREE.Mesh(patch((u, v, out) => {
      const h = P.plate.h0 + (P.plate.h1 - P.plate.h0) * u;
      const deg = P.plate.from + (P.plate.to - P.plate.from) * v;
      // Contour ovale : hors de l'ellipse, la surface passe sous la paume (cachée),
      // ce qui évite un panneau rectangulaire à angles vifs.
      const d = (2 * u - 1) ** 2 + (2 * v - 1) ** 2;
      const e = d < 1 ? Math.sqrt(1 - d) : 0;
      return f.at(h, deg, palmOffset(h, deg) + (d < 1 ? 0.2 + 2.6 * e : -1.5), out);
    }, 48, 48), mats.plate));
  }

  // Doigts enroulés : tube continu posé sur la surface de la pièce.
  const wrapped = spec.fingers.map((fg) => {
    const tube = flexTube(mats.glove, mats.glove);
    group.add(tube.mesh, tube.tip, tube.root);
    const radius = fingerRadius(fg.r);
    const reach = fg.reach ?? 185;
    const pts = Array.from({ length: 7 }, () => new THREE.Vector3());
    let last = -1;
    return (curl) => {
      if (Math.abs(curl - last) < 0.002) return;
      last = curl;
      // Ouverte : les doigts se déroulent et s'écartent de la surface.
      const span = (reach - K) * (0.12 + 0.88 * curl);
      pts.forEach((p, i) => {
        const k = i / (pts.length - 1);
        f.at(fg.h + k * 3, K - 8 + (span + 8) * k, radius(k) + (1 - curl) * 40 * k * k, p);
      });
      tube.update(pts, radius, f.a);
    };
  });

  // Index et pouce : tubes le long de points explicites ; le premier point
  // part de la paume.
  const explicit = (points, root, openDir, squeezeDir) => {
    const base = points.map((v) => new THREE.Vector3(...v));
    const tube = flexTube(mats.glove, mats.glove);
    group.add(tube.mesh, tube.tip, tube.root);
    const radius = fingerRadius(root);
    const open = new THREE.Vector3(...openDir);
    const sq = squeezeDir ? new THREE.Vector3(...squeezeDir) : null;
    const pts = base.map((v) => v.clone());
    let key = '';
    return (curl, squeeze = 0) => {
      const k = `${curl.toFixed(3)}|${squeeze.toFixed(3)}`;
      if (k === key) return;
      key = k;
      base.forEach((v, i) => {
        pts[i].copy(v).addScaledVector(open, (1 - curl) * i);
        if (sq && i >= 2) pts[i].addScaledVector(sq, squeeze * (i - 1));
      });
      tube.update(pts, radius, f.a);
    };
  };
  const index = spec.index ? explicit(spec.index, 8.2, spec.indexOpen ?? [0, -4, 6], [-3.2, -0.6, 0]) : null;
  const thumb = spec.thumb ? explicit(spec.thumb, 9.6, spec.thumbOpen ?? [0, 5, -6], null) : null;

  // Talon de la main vers le poignet.
  const heel = segment(21, mats.glove);
  place(heel, spec.heel, spec.wrist);
  group.add(heel);

  // Manchette à sangle et liseré rouge, manche avec plis de tissu.
  const wrist = spec.wrist.clone();
  const dir = spec.elbow.clone().normalize();
  const orient = (m, along) => m.quaternion.setFromUnitVectors(UP, along);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(25, 23.5, 38, 32), mats.cuff);
  cuff.position.copy(wrist).addScaledVector(dir, 15);
  orient(cuff, dir);
  group.add(cuff);
  // Rayon de la manchette à cet endroit (elle s'affine de 25 à 23,5) + 0,3 mm.
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(24.9, 24.7, 4, 32), mats.accent);
  stripe.position.copy(wrist).addScaledVector(dir, 22);
  orient(stripe, dir);
  group.add(stripe);
  const len = spec.forearm ?? 520;
  const sleeveGeo = new THREE.CylinderGeometry(34, 29, len, 40, 24, true);
  // Plis : ondulations irrégulières autour et le long de la manche.
  const sp = sleeveGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < sp.count; i += 1) {
    v.fromBufferAttribute(sp, i);
    const ang = Math.atan2(v.z, v.x);
    const fold = 1 + 0.045 * Math.sin(ang * 5 + v.y * 0.03) * Math.sin(v.y * 0.045 + ang * 2) + 0.025 * Math.sin(v.y * 0.11 + ang * 3);
    sp.setXYZ(i, v.x * fold, v.y, v.z * fold);
  }
  sleeveGeo.computeVertexNormals();
  const sleeve = new THREE.Mesh(sleeveGeo, mats.sleeve);
  sleeve.position.copy(wrist).addScaledVector(dir, 34 + len / 2);
  orient(sleeve, dir);
  group.add(sleeve);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(28.5, 5.5, 12, 40), mats.sleeve);
  hem.position.copy(wrist).addScaledVector(dir, 36);
  hem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  group.add(hem);

  const pose = (curls, squeeze = 0) => {
    wrapped.forEach((fn, i) => fn(curls[i] ?? curls[0]));
    index?.(curls.index ?? curls[0], squeeze);
    thumb?.(curls.thumb ?? curls[0]);
  };
  pose([1]);
  return { group, pose, anchor: spec.heel.clone(), fingerCount: wrapped.length, frame: f };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Poignée pistolet : paume sur le flanc droit et le dos, doigts qui passent
// devant et reviennent sur le flanc gauche (celui que voit le joueur).
function pistolGrip({ skin, top, bottom, sp, sq, fingerHs, fingerR = 8.4, index, thumb, palm, wrist, elbow, forearm }) {
  const f = frame({ origin: top, axis: bottom.clone().sub(top), palmSide: V(0, 0, 1), flip: true, sp, sq });
  const h0 = fingerHs[0] - 22;
  const h1 = fingerHs[fingerHs.length - 1] + 22;
  const heel = f.at(h1 - 6, -60, 6);
  return buildHand({
    skin,
    origin: top,
    axis: bottom.clone().sub(top),
    palmSide: V(0, 0, 1),
    flip: true,
    sp,
    sq,
    knuckle: 22,
    fingers: fingerHs.map((h, i) => ({ h, r: i === fingerHs.length - 1 ? fingerR * 0.86 : fingerR, reach: 184 - i * 4 })),
    palm: { h0, h1, from: -118, to: 36, thickness: 15, plate: { h0: h0 + 12, h1: h1 - 14, from: -52, to: -6 }, ...palm },
    index: [[...f.at(h0 + 8, 24, 8).toArray()], ...index],
    thumb: [[...f.at(h0 + 6, -108, 10).toArray()], ...thumb],
    heel,
    wrist,
    elbow,
    forearm,
  });
}

// Main d'appui sous un garde-main : paume dessous, doigts qui remontent le
// flanc droit, pouce le long du flanc gauche vers l'avant.
function supportGrip({ skin, origin, sp, sq, xs, thumb, wrist, elbow, forearm }) {
  const f = frame({ origin, axis: V(1, 0, 0), palmSide: V(0, -1, 0), flip: true, sp, sq });
  const x0 = Math.min(...xs) - 22;
  const x1 = Math.max(...xs) + 14;
  return buildHand({
    skin,
    origin,
    axis: V(1, 0, 0),
    palmSide: V(0, -1, 0),
    flip: true,
    sp,
    sq,
    knuckle: 18,
    fingers: xs.map((x, i) => ({ h: x, r: i === xs.length - 1 ? 7.2 : 8.2, reach: 158 - i * 5 })),
    palm: { h0: x0, h1: x1, from: -105, to: 32, thickness: 15, plate: { h0: x0 + 12, h1: x1 - 10, from: -44, to: 0 } },
    thumb: [[...f.at(x0 + 14, -92, 9).toArray()], ...thumb],
    thumbOpen: [0, -4, -6],
    heel: f.at(x0 + 4, -30, 6),
    wrist,
    elbow,
    forearm,
  });
}

// --- Chorégraphie commune -------------------------------------------------------

// entries : [{ hand, away, awayRot }] — `away` = décalage (mm) de la main en
// attente, hors champ, pendant l'apparition d'un skin.
function rig(entries, { tapHand = null } = {}) {
  const group = new THREE.Group();
  // Repère pour les aperçus (WeaponStage) : cadrer sur l'arme, pas sur les bras.
  group.userData.isHands = true;
  entries.forEach((e) => {
    e.holder = new THREE.Group();
    e.holder.add(e.hand.group);
    group.add(e.holder);
    e.curls = new Array(e.hand.fingerCount).fill(1);
  });
  const squeeze = { x: 0, v: 0 };
  const tighten = { x: 0, v: 0 };
  const offset = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  let introT = -1;
  let introDur = 1.6;
  let time = 0;
  let nextTap = 4 + Math.random() * 3;
  let tapT = -1;

  return {
    group,
    startIntro: (duration = 1.6) => {
      introT = 0;
      introDur = duration;
    },
    fire: () => {
      squeeze.v += 38;
      tighten.v += 14;
    },
    // `work` : { hand, target (mm), weight 0..1, curl } — une main quitte sa
    // prise pour faire autre chose (culasse du sniper).
    update: (dt, work = null) => {
      time += dt;
      springStep(squeeze, 0, 420, dt);
      springStep(tighten, 0, 200, dt);
      let reach = 1;
      let grab = 1;
      if (introT >= 0) {
        introT += dt;
        // Mains baissées pendant l'apparition ; elles montent saisir l'arme
        // juste avant qu'elle soit complète, puis referment les doigts.
        reach = smooth((introT - (introDur - 0.6)) / 0.45);
        grab = smooth((introT - (introDur - 0.2)) / 0.25);
        if (introT > introDur + 0.1) introT = -1;
      }
      if (tapT < 0) {
        nextTap -= dt;
        if (nextTap <= 0) {
          tapT = 0;
          nextTap = 5 + Math.random() * 4;
        }
      } else {
        tapT += dt / 0.9;
        if (tapT >= 1) tapT = -1;
      }
      // Respiration : léger mouvement de la main entière (sans redéformer les doigts).
      const breathe = Math.sin(time * 1.4);
      entries.forEach((e, k) => {
        const back = 1 - reach;
        offset.copy(e.away).multiplyScalar(back);
        let curl = Math.min(1, 0.25 + 0.75 * grab + Math.max(0, tighten.x) * 0.02);
        const curls = e.curls;
        curls.fill(curl);
        // Tapotement : le doigt de devant se lève et retombe deux fois.
        if (e.hand === tapHand && tapT >= 0) curls[0] = curl * (1 - 0.5 * Math.abs(Math.sin(tapT * Math.PI * 2)));
        if (work && work.hand === e.hand && work.weight > 0) {
          offset.addScaledVector(toTarget.copy(work.target).sub(e.hand.anchor), work.weight);
          curl = curl * (1 - work.weight) + work.curl * work.weight;
          curls.fill(curl);
        }
        curls.index = curl;
        curls.thumb = curl;
        e.holder.position.copy(offset);
        const r = e.awayRot;
        e.holder.rotation.set(back * (r?.x ?? 0) + breathe * 0.004, back * (r?.y ?? 0), back * (r?.z ?? 0) + breathe * 0.003 * (k ? -1 : 1));
        e.hand.pose(curls, k === 0 ? Math.max(0, squeeze.x) : 0);
      });
    },
  };
}

// --- Prises par arme ----------------------------------------------------------------
// sp = demi-largeur de la pièce tenue (le long de p), sq = demi-profondeur (q).

export function vandalHands(skin = 'standard') {
  const right = pistolGrip({
    skin,
    top: V(348, -38, 0),
    bottom: V(322, -128, 0),
    sp: 18,
    sq: 25,
    fingerHs: [36, 55, 73],
    index: [[378, -44, 20], [394, -46, 9], [398, -51, 0]],
    thumb: [[334, -30, -21], [360, -23, -24], [384, -21, -21]],
    wrist: V(290, -140, 12),
    elbow: V(-0.72, -0.48, 0.5),
  });
  const left = supportGrip({
    skin,
    origin: V(0, -5, 0),
    sp: 23,
    sq: 25,
    xs: [654, 636, 618, 601],
    thumb: [[612, -20, -31], [638, -12, -32], [660, -8, -30]],
    wrist: V(566, -76, -22),
    elbow: V(-0.55, -0.55, -0.63),
  });
  return rig([
    { hand: right, away: V(-240, -440, 170), awayRot: V(0.3, 0, -0.2) },
    { hand: left, away: V(-280, -540, -210), awayRot: V(-0.3, 0, 0.3) },
  ], { tapHand: left });
}

export function sniperHands(skin = 'standard') {
  const right = pistolGrip({
    skin,
    top: V(326, -34, 0),
    bottom: V(306, -118, 0),
    sp: 18,
    sq: 23,
    fingerHs: [38, 57, 75],
    index: [[358, -39, 21], [374, -41, 10], [381, -45, 0]],
    thumb: [[314, -24, -24], [342, -18, -27], [368, -16, -26]],
    wrist: V(270, -130, 12),
    elbow: V(-0.72, -0.48, 0.5),
  });
  const left = supportGrip({
    skin,
    origin: V(0, -9, 0),
    sp: 21,
    sq: 29,
    xs: [844, 826, 808, 791],
    thumb: [[802, -24, -35], [828, -15, -35], [850, -11, -33]],
    wrist: V(756, -80, -24),
    elbow: V(-0.55, -0.55, -0.63),
  });
  const api = rig([
    { hand: right, away: V(-240, -440, 170), awayRot: V(0.3, 0, -0.2) },
    { hand: left, away: V(-280, -540, -210), awayRot: V(-0.3, 0, 0.3) },
  ], { tapHand: left });
  api.rightHand = right;
  return api;
}

export function glockHands(skin = 'standard') {
  const right = pistolGrip({
    skin,
    top: V(33, -42, 0),
    bottom: V(12, -98, 0),
    sp: 14.5,
    sq: 30,
    fingerHs: [19, 36, 52],
    fingerR: 8.2,
    index: [[64, -31, 19], [80, -32, 9], [86, -36, 0]],
    thumb: [[20, -24, -23], [46, -19, -24], [70, -15, -22.5]],
    wrist: V(-30, -118, 10),
    elbow: V(-0.74, -0.46, 0.5),
    forearm: 480,
  });
  return rig([{ hand: right, away: V(-220, -400, 150), awayRot: V(0.3, 0, -0.2) }]);
}
