import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Outils partagés par les armes modélisées en code (Vandal, sniper) : profils
// extrudés, textures dessinées au millimètre, effets de tir. Repère commun :
// millimètres, x vers la bouche du canon, y vers le haut, z vers le flanc droit.

export const MM = 0.001;

export function extrude(shape, depth, bevel = 1, { curveSegments = 18, bevelSegments = 4 } = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

// Profil dessiné dans le plan (z, y) puis extrudé le long de x (pièces vues de face).
export function extrudeAlongX(shape, length, bevel = 0.5) {
  const geometry = extrude(shape, length, bevel);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

// Polygone à coins arrondis : chaque sommet [x, y, rayon].
export function roundedPath(target, points) {
  const n = points.length;
  const at = (i) => points[(i + n) % n];
  points.forEach((p, i) => {
    const [x, y, r = 0] = p;
    const prev = at(i - 1);
    const next = at(i + 1);
    if (!r) {
      if (i === 0) target.moveTo(x, y);
      else target.lineTo(x, y);
      return;
    }
    const toPrev = new THREE.Vector2(prev[0] - x, prev[1] - y);
    const toNext = new THREE.Vector2(next[0] - x, next[1] - y);
    const rr = Math.min(r, toPrev.length() / 2, toNext.length() / 2);
    toPrev.setLength(rr);
    toNext.setLength(rr);
    if (i === 0) target.moveTo(x + toPrev.x, y + toPrev.y);
    else target.lineTo(x + toPrev.x, y + toPrev.y);
    target.quadraticCurveTo(x, y, x + toNext.x, y + toNext.y);
  });
  target.closePath();
  return target;
}

export function roundedShape(points, holes = []) {
  const shape = roundedPath(new THREE.Shape(), points);
  holes.forEach((hole) => shape.holes.push(roundedPath(new THREE.Path(), hole)));
  return shape;
}

// Environnement réfléchi par les métaux : sans lui, un métal sombre paraît mat.
export function studioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return envMap;
}

// Générateur pseudo-aléatoire reproductible : une texture redessinée garde le
// même grain d'une session à l'autre.
export function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Textures dessinées une seule fois pour toute la durée de l'app.
const canvasCache = new Map();

// Texture dessinée en millimètres sur les faces planes d'une extrusion (leurs UV
// valent (x, y) en mm). `draw` reçoit un contexte à l'échelle (1 unité = 1 mm,
// y vers le haut). `color` : texture de couleur (sRGB) plutôt que relief/rugosité.
export function drawnTexture(key, { minX, maxX, minY, maxY }, pxPerMm, draw, { background = '#ffffff', color = false } = {}) {
  if (!canvasCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((maxX - minX) * pxPerMm);
    canvas.height = Math.ceil((maxY - minY) * pxPerMm);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(pxPerMm, -pxPerMm);
    ctx.translate(-minX, -maxY);
    draw(ctx);
    ctx.restore();
    canvasCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvasCache.get(key));
  texture.repeat.set(1 / (maxX - minX), 1 / (maxY - minY));
  texture.offset.set(-minX / (maxX - minX), -minY / (maxY - minY));
  texture.anisotropy = 16;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Texture carrée répétée (grain, bruit) pour les faces dont les UV ne sont pas
// en millimètres : parois d'extrusion, cylindres.
export function tiledTexture(key, size, draw, { repeat = 1, color = false } = {}) {
  if (!canvasCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    draw(canvas.getContext('2d'), size);
    canvasCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvasCache.get(key));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Grain fin (poudre, sablage) : base de beaucoup de surfaces de l'arme.
export function speckle(ctx, { minX, maxX, minY, maxY }, count, colors, size, rand = Math.random) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(minX + rand() * (maxX - minX), minY + rand() * (maxY - minY), size, size);
  }
}

export const FLASH_PALETTES = {
  powder: ['rgba(255,255,240,1)', 'rgba(255,214,120,0.95)', 'rgba(255,140,40,0.35)', 'rgba(255,90,0,0)'],
  plasma: ['rgba(240,255,255,1)', 'rgba(120,245,255,0.95)', 'rgba(40,140,255,0.4)', 'rgba(20,60,255,0)'],
  ember: ['rgba(255,250,235,1)', 'rgba(255,170,90,0.95)', 'rgba(255,60,40,0.45)', 'rgba(180,0,20,0)'],
  venom: ['rgba(245,255,235,1)', 'rgba(170,255,90,0.95)', 'rgba(60,220,80,0.4)', 'rgba(0,120,40,0)'],
  void: ['rgba(255,240,255,1)', 'rgba(220,120,255,0.95)', 'rgba(120,40,255,0.45)', 'rgba(40,0,120,0)'],
  gold: ['rgba(255,255,245,1)', 'rgba(255,230,150,0.95)', 'rgba(255,190,60,0.4)', 'rgba(200,120,0,0)'],
  abyss: ['rgba(230,255,250,1)', 'rgba(90,255,220,0.95)', 'rgba(20,160,180,0.45)', 'rgba(0,60,90,0)'],
  jade: ['rgba(240,255,245,1)', 'rgba(120,255,190,0.95)', 'rgba(30,200,120,0.45)', 'rgba(0,110,60,0)'],
  frost: ['rgba(255,255,255,1)', 'rgba(200,240,255,0.95)', 'rgba(120,200,255,0.4)', 'rgba(60,140,255,0)'],
};

export function flashTexture(palette = 'powder', spikes = 7) {
  const key = `flash-${palette}-${spikes}`;
  if (!canvasCache.has(key)) {
    const stops = FLASH_PALETTES[palette] ?? FLASH_PALETTES.powder;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, stops[0]);
    glow.addColorStop(0.18, stops[1]);
    glow.addColorStop(0.45, stops[2]);
    glow.addColorStop(1, stops[3]);
    ctx.fillStyle = glow;
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i += 1) {
      const angle = (i / (spikes * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? c * (0.75 + Math.random() * 0.25) : c * 0.22;
      ctx.lineTo(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius);
    }
    ctx.fill();
    canvasCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvasCache.get(key));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function softDotTexture(key = 'soft-dot', inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return tiledTexture(
    `dot-${key}`,
    128,
    (ctx, size) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    },
    { color: true },
  );
}

// Échantillonne une courbe 2D en polygone fermé d'épaisseur variable (chargeur
// courbé, lunette galbée...). `width(t)` donne l'épaisseur à t ∈ [0, 1].
export function ribbonShape(curve, width, samples = 40) {
  const left = [];
  const right = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    const w = width(t) / 2;
    left.push(new THREE.Vector2(p.x + normal.x * w, p.y + normal.y * w));
    right.push(new THREE.Vector2(p.x - normal.x * w, p.y - normal.y * w));
  }
  return new THREE.Shape([...left, ...right.reverse()]);
}

// Ressort critique (amorti sans rebond) : recul et retours d'animation.
export function springStep(state, target, stiffness, dt) {
  const damping = 2 * Math.sqrt(stiffness);
  state.v += (-stiffness * (state.x - target) - damping * state.v) * dt;
  state.x += state.v * dt;
}

// Uniformes partagés par tous les matériaux animés d'une arme : temps écoulé et
// sursaut de lumière du dernier tir (1 → 0).
export function weaponUniforms() {
  return { uTime: { value: 0 }, uFlare: { value: 0 } };
}

// Anime la carte de lumière d'un matériau directement dans le shader (coulée de
// lave, impulsions qui parcourent des circuits...) : `glsl` modifie
// `totalEmissiveRadiance`, avec `vEmissiveMapUv` (coordonnées de la texture),
// `uTime` et `uFlare` à disposition. Aucun redessin de texture à chaque image.
export function animateEmissive(material, uniforms, glsl) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlare = uniforms.uFlare;
    shader.fragmentShader = `uniform float uTime;\nuniform float uFlare;\n${shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n${glsl}`,
    )}`;
  };
  material.customProgramCacheKey = () => glsl;
  return material;
}

// Particules additives (braises, étincelles, poussière lumineuse) gérées en
// espace monde : elles restent en place quand l'arme bouge, comme de vraies
// particules.
export function particleSystem(scene, texture, { color = 0xffffff, max = 160 } = {}) {
  const particles = [];
  const spawn = (position, velocity, { life = 900, size = 0.006, grow = 0, drag = 0.6, gravity = 0, tint = color, additive = true, peak = 1 } = {}) => {
    if (particles.length >= max) {
      const old = particles.shift();
      scene.remove(old.sprite);
      old.sprite.material.dispose();
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, color: tint, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
    );
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    scene.add(sprite);
    particles.push({ sprite, velocity: velocity.clone(), born: performance.now(), life, size, grow, drag, gravity, peak });
  };
  const update = (dt) => {
    const now = performance.now();
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      const t = (now - p.born) / p.life;
      if (t >= 1) {
        scene.remove(p.sprite);
        p.sprite.material.dispose();
        particles.splice(i, 1);
        continue;
      }
      p.velocity.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.velocity.y += p.gravity * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.sprite.scale.setScalar(p.size * (1 + p.grow * t));
      // Fondu d'entrée très court puis extinction progressive.
      p.sprite.material.opacity = p.peak * Math.min(1, t * 12) * (1 - t) ** 1.4;
    }
  };
  return { spawn, update };
}

// Déforme la géométrie dans le shader (métal liquide, plasma qui bouillonne) :
// `vertex` modifie `transformed` (position locale, en mm) avec `objectNormal`,
// `uTime` et `uFlare`. `fragment`, optionnel, agit comme animateEmissive.
export function patchShader(material, uniforms, { vertex = '', fragment = '' }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlare = uniforms.uFlare;
    const header = 'uniform float uTime;\nuniform float uFlare;\n';
    if (vertex) {
      shader.vertexShader = header + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertex}`);
    }
    if (fragment) {
      shader.fragmentShader = header + shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fragment}`);
    }
  };
  material.customProgramCacheKey = () => vertex + fragment;
  return material;
}

// Tube dont l'épaisseur varie le long du chemin (`taper(t)`, t ∈ [0, 1]).
export function taperedTube(curve, segments, radius, radialSegments, taper) {
  const geometry = new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= segments; i += 1) {
    curve.getPointAt(i / segments, c);
    const s = taper(i / segments);
    for (let j = 0; j <= radialSegments; j += 1) {
      const k = i * (radialSegments + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(s).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function anchorAt(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

// Petits objets 3D lancés dans la scène (gouttes de chrome, papillons, cartes) :
// comme particleSystem, mais avec de vrais volumes qui tournoient et retombent.
export function meshBurst(scene, { max = 60 } = {}) {
  const items = [];
  const spawn = (mesh, position, velocity, { life = 900, spin = 8, gravity = -6, drag = 1, shrink = true, onUpdate = null } = {}) => {
    if (items.length >= max) scene.remove(items.shift().mesh);
    mesh.position.copy(position);
    scene.add(mesh);
    items.push({ mesh, velocity: velocity.clone(), born: performance.now(), life, spin: new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin), gravity, drag, shrink, base: mesh.scale.x, onUpdate });
  };
  const update = (dt) => {
    const now = performance.now();
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const p = items[i];
      const t = (now - p.born) / p.life;
      if (t >= 1) {
        scene.remove(p.mesh);
        items.splice(i, 1);
        continue;
      }
      p.velocity.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.velocity.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      if (p.shrink) p.mesh.scale.setScalar(p.base * (1 - t * t));
      p.onUpdate?.(p, t, dt);
    }
  };
  return { spawn, update };
}

// Cercle magique / cadran dessiné (anneaux concentriques, glyphes, polygramme).
export function sigilTexture(key, { color = '#c890ff', glyphs = 24, star = 6, seed = 1 } = {}) {
  return tiledTexture(key, 512, (ctx, size) => {
    const c = size / 2;
    const rand = seeded(seed);
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    [0.48, 0.44, 0.33, 0.29, 0.12].forEach((r, i) => {
      ctx.lineWidth = i % 2 ? 2 : 5;
      ctx.beginPath();
      ctx.arc(c, c, size * r, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Glyphes entre les deux anneaux extérieurs.
    ctx.lineWidth = 3;
    for (let i = 0; i < glyphs; i += 1) {
      const a = (i / glyphs) * Math.PI * 2;
      ctx.save();
      ctx.translate(c + Math.cos(a) * size * 0.385, c + Math.sin(a) * size * 0.385);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      const k = Math.floor(rand() * 4);
      if (k === 0) {
        ctx.moveTo(-8, 8);
        ctx.lineTo(0, -10);
        ctx.lineTo(8, 8);
      } else if (k === 1) {
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.moveTo(-8, -2);
        ctx.lineTo(8, 4);
      } else if (k === 2) {
        ctx.arc(0, 0, 7, 0, Math.PI * 1.5);
      } else {
        ctx.rect(-6, -8, 12, 16);
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
      }
      ctx.stroke();
      ctx.restore();
    }
    // Polygramme étoilé au centre.
    ctx.lineWidth = 3;
    const pts = star;
    const step = pts % 2 ? 2 : 1;
    const layers = pts % 2 ? 1 : 2;
    for (let layer = 0; layer < layers; layer += 1) {
      ctx.beginPath();
      for (let i = 0; i <= pts / layers; i += 1) {
        const a = ((i * step * layers + layer) / pts) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * size * 0.29;
        const y = c + Math.sin(a) * size * 0.29;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }, { color: true });
}
