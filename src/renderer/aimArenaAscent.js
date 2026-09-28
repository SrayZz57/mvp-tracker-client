import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Arène « Belvédère » : un site A inspiré d'Ascent. Place pavée entourée de
// façades vénitiennes (stuc chaud, volets, balcons fleuris, toits de tuiles),
// Heaven au fond avec son balcon et son escalier, Hell dessous, la grande porte
// mécanique sur la droite, un générateur, des caisses, un olivier, un clocher,
// et la cité flottante dans le ciel.
//
// Performances : toutes les pièces fixes qui partagent un matériau sont
// fusionnées en un seul objet (une vingtaine d'appels de dessin pour tout le
// décor), les textures sont dessinées une fois par lancement, et l'ombrage de
// contact est cuit dans les couleurs de sommets (pas d'ombres dynamiques).
//
// Repère : le joueur est à l'origine, les yeux à y = 0, face à -Z ; le sol est à
// floorY. Unités : mètres (échelle Valorant).

// --- Aléatoire reproductible et canvas mis en cache ---------------------------

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvases = new Map();
function paint(key, w, h, draw) {
  if (!canvases.has(key)) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    canvases.set(key, c);
  }
  return canvases.get(key);
}

function tex(canvas, { srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 8;
  return t;
}

// Dessin reproduit de l'autre côté des bords : la texture raccorde sans couture.
function tiled(w, h, x, y, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(x + dx, y + dy);
}

function blotches(ctx, w, h, rand, count, colors, minR, maxR) {
  for (let i = 0; i < count; i += 1) {
    const [r, g, b, a] = colors[Math.floor(rand() * colors.length)];
    const x = rand() * w;
    const y = rand() * h;
    const rad = minR + rand() * (maxR - minR);
    tiled(w, h, x, y, (px, py) => {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
}

function speckle(ctx, w, h, rand, count, colors, size) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(rand() * w, rand() * h, size * (0.5 + rand()), size * (0.5 + rand()));
  }
}

// Largeurs de pièces qui remplissent exactement `total` (rangée qui boucle).
function rowPieces(total, min, max, rand) {
  const out = [];
  let used = 0;
  while (total - used > max) {
    const w = min + rand() * (max - min);
    out.push(w);
    used += w;
  }
  const rest = total - used;
  if (rest < min && out.length) out[out.length - 1] += rest;
  else out.push(rest);
  return out;
}

// --- Textures ------------------------------------------------------------------

function stuccoCanvas(key, base) {
  return paint(`asc-stucco-${key}`, 1024, 1024, (ctx, s) => {
    const rand = rng([...key].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, s, rand, 110, [[255, 250, 238, 0.2], [120, 88, 60, 0.1], [196, 150, 110, 0.12], [90, 70, 55, 0.06]], 30, 170);
    // Traces de truelle.
    for (let i = 0; i < 700; i += 1) {
      ctx.strokeStyle = rand() < 0.5 ? `rgba(255,255,245,${0.015 + rand() * 0.02})` : `rgba(90,60,40,${0.012 + rand() * 0.015})`;
      ctx.lineWidth = 2 + rand() * 5;
      ctx.beginPath();
      const x = rand() * s;
      const y = rand() * s;
      ctx.arc(x, y, 30 + rand() * 60, rand() * 6, rand() * 6 + 0.4);
      ctx.stroke();
    }
    // Enduit tombé : la brique apparaît dessous.
    for (let p = 0; p < 1; p += 1) {
      const cx = 160 + rand() * (s - 320);
      const cy = 200 + rand() * (s - 400);
      const pts = [];
      for (let k = 0; k < 11; k += 1) {
        const a = (k / 11) * Math.PI * 2;
        const r = (26 + rand() * 40) * (k % 2 ? 0.7 : 1);
        pts.push([cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r]);
      }
      const path = () => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      ctx.save();
      path();
      ctx.clip();
      ctx.fillStyle = '#b8a48a';
      ctx.fillRect(cx - 200, cy - 200, 400, 400);
      for (let y = cy - 200, row = 0; y < cy + 200; y += 18, row += 1) {
        for (let x = cx - 220 + (row % 2) * 22; x < cx + 200; x += 44) {
          const tone = [[176, 90, 60], [160, 78, 52], [190, 104, 70], [150, 72, 48]][Math.floor(rand() * 4)];
          ctx.fillStyle = `rgb(${tone.join(',')})`;
          ctx.fillRect(x + 2, y + 2, 40, 14);
          ctx.fillStyle = 'rgba(255,220,190,0.12)';
          ctx.fillRect(x + 2, y + 2, 40, 3);
        }
      }
      ctx.restore();
      ctx.save();
      ctx.translate(0, 3);
      path();
      ctx.strokeStyle = 'rgba(40,25,15,0.35)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
      path();
      ctx.strokeStyle = 'rgba(255,248,232,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const damp = ctx.createLinearGradient(0, s * 0.8, 0, s);
    damp.addColorStop(0, 'rgba(90,70,50,0)');
    damp.addColorStop(1, 'rgba(90,70,50,0.18)');
    ctx.fillStyle = damp;
    ctx.fillRect(0, s * 0.8, s, s * 0.2);
    // Coulures d'eau depuis le haut.
    for (let i = 0; i < 26; i += 1) {
      const x = rand() * s;
      const len = 120 + rand() * 360;
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(70,55,40,${0.12 + rand() * 0.1})`);
      grad.addColorStop(1, 'rgba(70,55,40,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 2 + rand() * 7, len);
    }
    speckle(ctx, s, s, rand, 14000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.1)', 'rgba(120,90,60,0.08)'], 1.6);
  });
}

function ashlarCanvas() {
  return paint('asc-ashlar', 1024, 1024, (ctx, s) => {
    const rand = rng(41);
    ctx.fillStyle = '#7d715e';
    ctx.fillRect(0, 0, s, s);
    const rowH = s / 6;
    const palette = ['#dbcfb6', '#cfc2a5', '#ddd2ba', '#c8ba9d', '#d5c9ae', '#c2b394'];
    for (let r = 0; r < 6; r += 1) {
      let x = r % 2 ? -rand() * 120 : 0;
      rowPieces(s, 200, 330, rand).forEach((w) => {
        const y = r * rowH;
        const color = palette[Math.floor(rand() * palette.length)];
        tiled(s, s, x, y, (px, py) => {
          if (px > s || px + w < 0) return;
          ctx.fillStyle = color;
          ctx.fillRect(px + 4, py + 4, w - 8, rowH - 8);
          const g = ctx.createLinearGradient(0, py, 0, py + rowH);
          g.addColorStop(0, 'rgba(255,255,245,0.22)');
          g.addColorStop(0.15, 'rgba(255,255,245,0)');
          g.addColorStop(0.85, 'rgba(60,45,30,0)');
          g.addColorStop(1, 'rgba(60,45,30,0.25)');
          ctx.fillStyle = g;
          ctx.fillRect(px + 4, py + 4, w - 8, rowH - 8);
        });
        x += w;
      });
    }
    blotches(ctx, s, s, rand, 60, [[80, 70, 55, 0.12], [255, 250, 235, 0.12], [90, 110, 60, 0.08]], 20, 90);
    speckle(ctx, s, s, rand, 16000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.14)'], 1.8);
    // Éclats aux arêtes.
    for (let i = 0; i < 90; i += 1) {
      const x = rand() * s;
      const y = Math.floor(rand() * 6) * rowH + (rand() < 0.5 ? 6 : rowH - 14);
      ctx.fillStyle = 'rgba(110,95,75,0.5)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6 + rand() * 12, y + rand() * 6);
      ctx.lineTo(x + rand() * 8, y + 5 + rand() * 6);
      ctx.fill();
    }
  });
}

function pavingCanvas() {
  return paint('asc-paving', 1024, 1024, (ctx, s) => {
    const rand = rng(77);
    ctx.fillStyle = '#58504a';
    ctx.fillRect(0, 0, s, s);
    const rowH = 128;
    const palette = ['#b9aa8e', '#a99b81', '#b3a488', '#9f917a', '#bfb196', '#a89a84', '#c2a98a'];
    for (let r = 0; r < s / rowH; r += 1) {
      let x = rand() * 60;
      rowPieces(s, 150, 300, rand).forEach((w) => {
        const y = r * rowH;
        const color = palette[Math.floor(rand() * palette.length)];
        tiled(s, s, x, y, (px, py) => {
          if (px > s || px + w < 0) return;
          ctx.fillStyle = color;
          ctx.fillRect(px + 4, py + 4, w - 8, rowH - 8);
          const g = ctx.createRadialGradient(px + w / 2, py + rowH / 2, 5, px + w / 2, py + rowH / 2, w * 0.7);
          g.addColorStop(0, 'rgba(255,252,240,0.14)');
          g.addColorStop(1, 'rgba(70,60,48,0.16)');
          ctx.fillStyle = g;
          ctx.fillRect(px + 4, py + 4, w - 8, rowH - 8);
        });
        if (rand() < 0.18) {
          ctx.strokeStyle = 'rgba(55,48,40,0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          let cx = x + 10 + rand() * (w - 20);
          let cy = y + 6;
          ctx.moveTo(cx, cy);
          while (cy < y + rowH - 6) {
            cx += (rand() - 0.5) * 18;
            cy += 8 + rand() * 12;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
        x += w;
      });
    }
    // Mousse dans les joints.
    for (let i = 0; i < 2600; i += 1) {
      const onRow = rand() < 0.5;
      const x = onRow ? rand() * s : (Math.floor(rand() * 8) * 128 + rand() * 128) % s;
      const y = onRow ? Math.floor(rand() * 8) * rowH + (rand() < 0.5 ? 2 : -2) : rand() * s;
      ctx.fillStyle = `rgba(${70 + rand() * 30},${95 + rand() * 30},${45 + rand() * 20},${0.35 + rand() * 0.3})`;
      ctx.fillRect(x, y, 2 + rand() * 3, 2 + rand() * 3);
    }
    blotches(ctx, s, s, rand, 110, [[60, 50, 40, 0.16], [255, 250, 235, 0.07], [110, 80, 50, 0.12]], 40, 200);
    speckle(ctx, s, s, rand, 20000, ['rgba(0,0,0,0.1)', 'rgba(255,255,255,0.12)', 'rgba(120,100,70,0.1)'], 1.8);
  });
}

function roofCanvas() {
  return paint('asc-roof', 512, 512, (ctx, s) => {
    const rand = rng(91);
    ctx.fillStyle = '#5a2418';
    ctx.fillRect(0, 0, s, s);
    const rowH = 32;
    for (let r = 0; r < s / rowH + 1; r += 1) {
      for (let c = 0; c < s / 32; c += 1) {
        const x = c * 32 + (r % 2) * 16;
        const y = r * rowH - 6;
        const base = [[178, 84, 58], [166, 74, 50], [188, 98, 66], [152, 66, 44], [196, 110, 74]][Math.floor(rand() * 5)];
        tiled(s, s, x, y, (px, py) => {
          const g = ctx.createLinearGradient(px, 0, px + 30, 0);
          g.addColorStop(0, `rgb(${base.map((v) => v * 0.62).join(',')})`);
          g.addColorStop(0.45, `rgb(${base.map((v) => Math.min(255, v * 1.15)).join(',')})`);
          g.addColorStop(1, `rgb(${base.map((v) => v * 0.55).join(',')})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(px + 1, py);
          ctx.lineTo(px + 29, py);
          ctx.lineTo(px + 29, py + rowH + 2);
          ctx.quadraticCurveTo(px + 15, py + rowH + 8, px + 1, py + rowH + 2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(40,15,8,0.35)';
          ctx.fillRect(px + 1, py + rowH, 28, 3);
        });
      }
    }
    // Lichens.
    for (let i = 0; i < 260; i += 1) {
      ctx.fillStyle = rand() < 0.6 ? `rgba(190,190,140,${0.25 + rand() * 0.3})` : `rgba(90,110,60,${0.3 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.arc(rand() * s, rand() * s, 1 + rand() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function shutterCanvas() {
  return paint('asc-shutter', 256, 512, (ctx, w, h) => {
    const rand = rng(17);
    ctx.fillStyle = '#2f6e69';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#245753';
    ctx.fillRect(18, 18, w - 36, h - 36);
    for (let y = 26; y < h - 26; y += 18) {
      ctx.fillStyle = '#3a807a';
      ctx.fillRect(22, y, w - 44, 7);
      ctx.fillStyle = 'rgba(10,30,28,0.6)';
      ctx.fillRect(22, y + 7, w - 44, 5);
    }
    ctx.fillStyle = '#2a625e';
    ctx.fillRect(0, h / 2 - 10, w, 20);
    // Peinture écaillée.
    for (let i = 0; i < 160; i += 1) {
      ctx.fillStyle = rand() < 0.7 ? '#8a6c48' : '#c9c2a8';
      ctx.beginPath();
      ctx.ellipse(rand() * w, rand() * h, 1 + rand() * 6, 1 + rand() * 3, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    blotches(ctx, w, h, rand, 30, [[20, 40, 35, 0.2], [200, 220, 200, 0.08]], 10, 60);
  });
}

function windowCanvas() {
  return paint('asc-window', 256, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, '#9fb9cc');
    g.addColorStop(0.35, '#3b556c');
    g.addColorStop(1, '#101a26');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Reflet du ciel en biais.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(w * 0.1, 0);
    ctx.lineTo(w * 0.45, 0);
    ctx.lineTo(w * 0.05, h * 0.6);
    ctx.lineTo(0, h * 0.6);
    ctx.fill();
    // Rideau intérieur.
    ctx.fillStyle = 'rgba(200,170,120,0.35)';
    ctx.fillRect(w * 0.62, h * 0.08, w * 0.3, h * 0.84);
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(0, 0, w, 14);
    ctx.fillRect(0, h - 14, w, 14);
    ctx.fillRect(0, 0, 14, h);
    ctx.fillRect(w - 14, 0, 14, h);
    ctx.fillRect(w / 2 - 6, 0, 12, h);
    [h / 3, (2 * h) / 3].forEach((y) => ctx.fillRect(0, y - 5, w, 10));
  });
}

function crateCanvas() {
  return paint('asc-crate', 512, 512, (ctx, s) => {
    const rand = rng(23);
    const planks = 5;
    for (let i = 0; i < planks; i += 1) {
      const x = (i * s) / planks;
      const tone = [[204, 164, 112], [192, 150, 100], [214, 176, 124], [184, 142, 94]][i % 4];
      ctx.fillStyle = `rgb(${tone.join(',')})`;
      ctx.fillRect(x, 0, s / planks, s);
      for (let k = 0; k < 40; k += 1) {
        ctx.strokeStyle = `rgba(110,72,38,${0.12 + rand() * 0.15})`;
        ctx.lineWidth = 1 + rand() * 1.5;
        ctx.beginPath();
        const gx = x + rand() * (s / planks);
        ctx.moveTo(gx, 0);
        ctx.bezierCurveTo(gx + (rand() - 0.5) * 20, s * 0.3, gx + (rand() - 0.5) * 20, s * 0.7, gx + (rand() - 0.5) * 10, s);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,35,15,0.55)';
      ctx.fillRect(x, 0, 3, s);
    }
    // Planches en X de renfort.
    ctx.save();
    ctx.strokeStyle = '#a97e4c';
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.moveTo(40, 40);
    ctx.lineTo(s - 40, s - 40);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,42,18,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(56, 26);
    ctx.lineTo(s - 26, s - 56);
    ctx.moveTo(26, 56);
    ctx.lineTo(s - 56, s - 26);
    ctx.stroke();
    ctx.restore();
    // Cadre et coins métalliques.
    ctx.lineWidth = 36;
    ctx.strokeStyle = '#34383e';
    ctx.strokeRect(18, 18, s - 36, s - 36);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(200,210,220,0.35)';
    ctx.strokeRect(2, 2, s - 4, s - 4);
    [[0, 0], [s - 96, 0], [0, s - 96], [s - 96, s - 96]].forEach(([x, y]) => {
      ctx.fillStyle = '#2a2d32';
      ctx.fillRect(x, y, 96, 96);
      ctx.fillStyle = 'rgba(220,225,235,0.18)';
      ctx.fillRect(x + 4, y + 4, 88, 5);
      [[18, 18], [78, 18], [18, 78], [78, 78]].forEach(([rx, ry]) => {
        ctx.fillStyle = '#6a7078';
        ctx.beginPath();
        ctx.arc(x + rx, y + ry, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(x + rx - 2, y + ry - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    // Pochoirs.
    ctx.fillStyle = 'rgba(40,28,20,0.7)';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('A-17', s / 2, s / 2 - 40);
    ctx.font = 'bold 24px Arial';
    ctx.fillText('KINGDOM CARGO', s / 2, s / 2 + 8);
    ctx.fillStyle = 'rgba(210,80,40,0.75)';
    ctx.beginPath();
    ctx.moveTo(s / 2, s / 2 + 40);
    ctx.lineTo(s / 2 - 26, s / 2 + 80);
    ctx.lineTo(s / 2 + 26, s / 2 + 80);
    ctx.fill();
    blotches(ctx, s, s, rand, 50, [[60, 40, 20, 0.12], [255, 250, 230, 0.08]], 20, 90);
    speckle(ctx, s, s, rand, 6000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.1)'], 1.5);
  });
}

function metalBoxCanvas() {
  return paint('asc-metalbox', 512, 512, (ctx, s) => {
    const rand = rng(55);
    ctx.fillStyle = '#3d4753';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 64) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, y, s, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, y + 58, s, 6);
    }
    ctx.fillStyle = '#e8742a';
    ctx.fillRect(0, 368, s, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = -40; x < s; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 408);
      ctx.lineTo(x + 20, 368);
      ctx.lineTo(x + 36, 368);
      ctx.lineTo(x + 16, 408);
      ctx.fill();
    }
    ctx.fillStyle = '#e9ecef';
    ctx.fillRect(300, 120, 150, 90);
    ctx.fillStyle = '#20242a';
    for (let x = 312; x < 438; x += 3 + Math.floor(rand() * 4)) ctx.fillRect(x, 170, 1 + Math.floor(rand() * 3), 30);
    ctx.font = 'bold 22px Arial';
    ctx.fillText('KNGDM 04', 314, 152);
    for (let x = 20; x < s; x += 60) {
      [24, s - 24].forEach((y) => {
        ctx.fillStyle = '#7a848f';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    for (let i = 0; i < 120; i += 1) {
      ctx.strokeStyle = `rgba(200,210,220,${0.1 + rand() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = rand() * s;
      const y = rand() * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 12);
      ctx.stroke();
    }
    blotches(ctx, s, s, rand, 40, [[0, 0, 0, 0.15], [150, 110, 70, 0.1]], 20, 80);
  });
}

function generatorCanvas(glow) {
  return paint(`asc-generator-${glow}`, 512, 512, (ctx, s) => {
    const rand = rng(61);
    ctx.fillStyle = glow ? '#000000' : '#2e343c';
    ctx.fillRect(0, 0, s, s);
    if (!glow) {
      ctx.fillStyle = '#23282e';
      ctx.fillRect(40, 60, 250, 300);
      for (let y = 72; y < 350; y += 16) {
        ctx.fillStyle = '#434a54';
        ctx.fillRect(48, y, 234, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(48, y + 6, 234, 4);
      }
      for (let x = 0; x < s; x += 48) {
        ctx.fillStyle = '#e8c21a';
        ctx.beginPath();
        ctx.moveTo(x, s);
        ctx.lineTo(x + 24, s - 60);
        ctx.lineTo(x + 48, s - 60);
        ctx.lineTo(x + 24, s);
        ctx.fill();
      }
      ctx.fillStyle = '#1a1d21';
      ctx.fillRect(320, 70, 150, 200);
      blotches(ctx, s, s, rand, 40, [[0, 0, 0, 0.2], [120, 90, 60, 0.12]], 20, 80);
    }
    ctx.fillStyle = glow ? '#3df5d8' : '#1a6a60';
    ctx.fillRect(334, 86, 122, 70);
    ctx.fillStyle = glow ? '#bafff2' : '#2a8a7a';
    for (let k = 0; k < 5; k += 1) ctx.fillRect(342, 96 + k * 11, 30 + rand() * 70, 4);
    [[350, 200, '#3dff7a'], [390, 200, '#ffc23d'], [430, 200, '#ff4655']].forEach(([x, y, c]) => {
      ctx.fillStyle = glow ? c : '#333';
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function doorCanvas(glow) {
  return paint(`asc-door-${glow}`, 1024, 1024, (ctx, s) => {
    const rand = rng(71);
    ctx.fillStyle = glow ? '#000000' : '#4a5159';
    ctx.fillRect(0, 0, s, s);
    if (!glow) {
      for (let i = 0; i < 6; i += 1) {
        const x = (i * s) / 6;
        const g = ctx.createLinearGradient(x, 0, x + s / 6, 0);
        g.addColorStop(0, '#3e454d');
        g.addColorStop(0.5, '#56606a');
        g.addColorStop(1, '#3a4148');
        ctx.fillStyle = g;
        ctx.fillRect(x + 6, 0, s / 6 - 12, s);
        for (let y = 30; y < s; y += 60) {
          ctx.fillStyle = '#6c7680';
          ctx.beginPath();
          ctx.arc(x + 22, y, 6, 0, Math.PI * 2);
          ctx.arc(x + s / 6 - 22, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#262a30';
      ctx.fillRect(0, s / 2 - 10, s, 20);
      for (let x = -80; x < s; x += 80) {
        ctx.fillStyle = '#e8c21a';
        ctx.fillRect(0, s - 110, s, 110);
        ctx.fillStyle = '#16181c';
        ctx.beginPath();
        ctx.moveTo(x, s);
        ctx.lineTo(x + 60, s - 110);
        ctx.lineTo(x + 100, s - 110);
        ctx.lineTo(x + 40, s);
        ctx.fill();
      }
      for (let x = -80; x < s; x += 80) {
        ctx.fillStyle = '#16181c';
        ctx.beginPath();
        ctx.moveTo(x, s);
        ctx.lineTo(x + 60, s - 110);
        ctx.lineTo(x + 100, s - 110);
        ctx.lineTo(x + 40, s);
        ctx.fill();
      }
      blotches(ctx, s, s, rand, 60, [[0, 0, 0, 0.2], [140, 100, 60, 0.12], [255, 255, 255, 0.05]], 30, 160);
    }
    // Bandes lumineuses.
    ctx.fillStyle = glow ? '#4af4ff' : '#1e6a74';
    [s * 0.22, s * 0.78].forEach((x) => ctx.fillRect(x - 8, 60, 16, s - 220));
    ctx.fillRect(60, s / 2 - 4, s - 120, 8);
  });
}

function awningCanvas() {
  return paint('asc-awning', 512, 256, (ctx, w, h) => {
    const rand = rng(33);
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = (x / 64) % 2 ? '#efe3c6' : '#1f7a76';
      ctx.fillRect(x, 0, 64, h);
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rand, 30, [[60, 50, 40, 0.1]], 10, 50);
  });
}

function bannerCanvas() {
  return paint('asc-banner', 256, 640, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#15504e');
    g.addColorStop(0.5, '#1f726e');
    g.addColorStop(1, '#15504e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#d9b25a';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    // Emblème : rose des vents dans un cercle.
    const cx = w / 2;
    const cy = h * 0.42;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#d9b25a';
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      const r = k % 2 ? 45 : 95;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a + 0.35) * 16, cy + Math.sin(a + 0.35) * 16);
      ctx.lineTo(cx + Math.cos(a - 0.35) * 16, cy + Math.sin(a - 0.35) * 16);
      ctx.fill();
    }
    // Bas en pointe.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(0, h - 90);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w, h - 90);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  });
}

function ivyCanvas() {
  return paint('asc-ivy', 512, 512, (ctx, s) => {
    const rand = rng(12);
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 900; i += 1) {
      const y = rand() * s;
      const spread = s * 0.5 * (0.3 + (y / s) * 0.7);
      const x = s / 2 + (rand() - 0.5) * spread * 2 * rand();
      const tone = [[48, 92, 40], [62, 110, 48], [38, 76, 34], [80, 124, 56]][Math.floor(rand() * 4)];
      ctx.fillStyle = `rgb(${tone.join(',')})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + rand() * 7, 4 + rand() * 5, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, y, 1, 4);
    }
  });
}

function leavesCanvas() {
  return paint('asc-leaves', 256, 256, (ctx, s) => {
    const rand = rng(8);
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 18; i += 1) {
      const tone = [[170, 110, 50], [140, 90, 40], [190, 150, 70], [110, 80, 40]][Math.floor(rand() * 4)];
      ctx.fillStyle = `rgba(${tone.join(',')},0.9)`;
      ctx.beginPath();
      ctx.ellipse(20 + rand() * (s - 40), 20 + rand() * (s - 40), 6 + rand() * 6, 3 + rand() * 3, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function shadowCanvas() {
  return paint('asc-shadow', 128, 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function baseShadowCanvas() {
  return paint('asc-baseshadow', 16, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function siteCanvas() {
  return paint('asc-site', 1024, 1024, (ctx, s) => {
    const rand = rng(99);
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(214,72,52,0.9)';
    ctx.lineWidth = 26;
    ctx.setLineDash([90, 50]);
    ctx.strokeRect(60, 60, s - 120, s - 120);
    ctx.setLineDash([]);
    // Grand « A » peint.
    ctx.font = 'bold 520px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(214,72,52,0.85)';
    ctx.strokeText('A', s / 2, s / 2 + 30);
    ctx.fillStyle = 'rgba(245,238,222,0.8)';
    ctx.fillText('A', s / 2, s / 2 + 30);
    // Peinture usée par les passages.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 + rand() * 0.7})`;
      ctx.fillRect(rand() * s, rand() * s, 2 + rand() * 7, 2 + rand() * 7);
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}

function wallSignCanvas() {
  return paint('asc-sign', 512, 512, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(214,72,52,0.92)';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2 - 30, 170, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4ecdc';
    ctx.font = 'bold 260px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', s / 2, s / 2 - 16);
    ctx.fillStyle = 'rgba(214,72,52,0.92)';
    ctx.beginPath();
    ctx.moveTo(s / 2 - 90, s - 70);
    ctx.lineTo(s / 2 + 60, s - 70);
    ctx.lineTo(s / 2 + 60, s - 110);
    ctx.lineTo(s / 2 + 130, s - 50);
    ctx.lineTo(s / 2 + 60, s + 10);
    ctx.lineTo(s / 2 + 60, s - 30);
    ctx.lineTo(s / 2 - 90, s - 30);
    ctx.fill();
  });
}

function skylineCanvas() {
  return paint('asc-skyline', 512, 512, (ctx, s) => {
    const rand = rng(44);
    ctx.fillStyle = '#e4cfae';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, s, rand, 30, [[200, 150, 110, 0.2], [255, 250, 235, 0.2]], 30, 120);
    for (let y = 30; y < s; y += 110) {
      for (let x = 20; x < s; x += 64) {
        ctx.fillStyle = '#5b6570';
        ctx.fillRect(x, y, 26, 56);
        ctx.fillStyle = '#5f8f8a';
        ctx.fillRect(x - 12, y, 10, 56);
        ctx.fillRect(x + 28, y, 10, 56);
      }
    }
  });
}

function cloudCanvas() {
  return paint('asc-cloud', 512, 256, (ctx, w, h) => {
    const rand = rng(5);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 40; i += 1) {
      const x = w * 0.15 + rand() * w * 0.7;
      const y = h * 0.35 + rand() * h * 0.35;
      const r = 30 + rand() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

// --- Construction -------------------------------------------------------------

export function buildAscentArena(arena, { floorY, isDark }) {
  const Y = (h) => floorY + h;
  const colliders = [];
  const shade = isDark ? 0.42 : 1;

  // Matériaux. `tile` = taille (m) d'une répétition de texture, appliquée en UV
  // monde : les pièces fusionnées raccordent sans couture.
  const std = (params, tile = null) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
    if (m.color) m.color.multiplyScalar(shade);
    m.userData.tile = tile;
    return m;
  };
  const withBump = (canvas, tile, extra = {}) => {
    const map = tex(canvas);
    const bump = tex(canvas, { srgb: false });
    return std({ map, bumpMap: bump, bumpScale: 1.4, roughness: 0.92, ...extra }, tile);
  };
  const M = {
    cream: withBump(stuccoCanvas('cream', '#e6d3b0'), 7),
    peach: withBump(stuccoCanvas('peach', '#e2ae84'), 7),
    salmon: withBump(stuccoCanvas('salmon', '#d69478'), 7),
    stone: withBump(ashlarCanvas(), 3),
    paving: withBump(pavingCanvas(), 5, { roughness: 0.9 }),
    roof: withBump(roofCanvas(), 2.4, { roughness: 0.75 }),
    trim: std({ color: 0xe8dcc4, roughness: 0.8 }, null),
    darkTrim: std({ color: 0x7d6f5c, roughness: 0.85 }),
    shutter: std({ map: tex(shutterCanvas(), { wrap: false }), roughness: 0.7, side: THREE.DoubleSide }),
    window: std({ map: tex(windowCanvas(), { wrap: false }), roughness: 0.15, metalness: 0.3 }),
    crate: std({ map: tex(crateCanvas(), { wrap: false }), bumpMap: tex(crateCanvas(), { srgb: false, wrap: false }), bumpScale: 1.2, roughness: 0.8 }),
    metalBox: std({ map: tex(metalBoxCanvas(), { wrap: false }), roughness: 0.55, metalness: 0.55 }),
    generator: std({ map: tex(generatorCanvas(false), { wrap: false }), emissive: 0xffffff, emissiveMap: tex(generatorCanvas(true), { wrap: false }), emissiveIntensity: 1.3, roughness: 0.5, metalness: 0.6 }),
    door: std({ map: tex(doorCanvas(false), { wrap: false }), emissive: 0xffffff, emissiveMap: tex(doorCanvas(true), { wrap: false }), emissiveIntensity: 1.2, roughness: 0.45, metalness: 0.7 }),
    iron: std({ color: 0x24211e, roughness: 0.5, metalness: 0.7 }),
    bronze: std({ color: 0x8a6a3a, roughness: 0.35, metalness: 0.9 }),
    wood: std({ color: 0x5a3a24, roughness: 0.8 }),
    terracotta: std({ color: 0xb4583d, roughness: 0.8 }),
    teal: std({ color: 0x2f7d7a, roughness: 0.6 }),
    awning: std({ map: tex(awningCanvas(), { wrap: false }), roughness: 0.9, side: THREE.DoubleSide }),
    void: new THREE.MeshBasicMaterial({ color: 0x0a0b0d, vertexColors: true }),
    leaf: std({ color: 0xffffff, roughness: 0.85, flatShading: true }),
    flower: std({ color: 0xffffff, roughness: 0.7 }),
    bark: std({ color: 0x5c4a3a, roughness: 0.95, flatShading: true }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd79a).multiplyScalar(isDark ? 1.4 : 1.1), vertexColors: true }),
  };

  // Seaux de géométries par matériau, fusionnés à la fin.
  const buckets = new Map();
  const tmpN = new THREE.Vector3();
  const push = (geometry, material, matrix, { ao = true, colorFn = null } = {}) => {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    g.clearGroups();
    ['uv1', 'uv2'].forEach((a) => g.deleteAttribute(a));
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
    const uv = g.attributes.uv;
    const tile = material.userData.tile;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i) - floorY;
      const z = pos.getZ(i);
      tmpN.fromBufferAttribute(nor, i);
      if (tile) {
        const ax = Math.abs(tmpN.x);
        const ay = Math.abs(tmpN.y);
        const az = Math.abs(tmpN.z);
        if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
        else if (ax >= az) uv.setXY(i, z / tile, y / tile);
        else uv.setXY(i, x / tile, y / tile);
      }
      let c = 1;
      if (colorFn) c = colorFn(x, y, z, tmpN);
      else if (ao) {
        const t = Math.min(1, Math.max(0, y / 1.6));
        c = tmpN.y < -0.5 ? 0.55 : 0.6 + 0.4 * t * t * (3 - 2 * t);
      }
      const col = Array.isArray(c) ? c : [c, c, c];
      colors[i * 3] = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    ['position', 'normal', 'uv', 'color'].forEach((a) => {
      if (!g.attributes[a]) throw new Error(a);
    });
    Object.keys(g.attributes).forEach((a) => {
      if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
    });
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(g);
  };
  const mtx = (x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

  // Boîte posée à y0 au-dessus du sol (hauteur h). Segments en hauteur pour
  // que l'ombrage de contact reste concentré près du sol.
  const box = (w, h, d, material, x, y0, z, { ry = 0, solid = false, ao = true, colorFn = null } = {}) => {
    const hs = h > 2 ? Math.min(12, Math.ceil(h / 0.9)) : 1;
    const geom = new THREE.BoxGeometry(w, h, d, 1, hs, 1);
    const m = mtx(x, Y(y0 + h / 2), z, ry);
    push(geom, material, m, { ao, colorFn });
    if (solid) {
      const b = new THREE.Box3().setFromBufferAttribute(geom.attributes.position);
      b.applyMatrix4(m);
      colliders.push(b);
    }
  };

  // --- Sol ------------------------------------------------------------------
  box(52, 0.4, 66, M.paving, 1, -0.4, -22, { ao: false });
  // Bordures de pavés le long des façades.
  [[-21.2, -22, 1.6, 60], [23.2, -22, 1.6, 60]].forEach(([x, z, w, d]) => box(w, 0.06, d, M.stone, x, 0, z, { ao: false }));

  // --- Couloir de sortie (A Main) autour du joueur -------------------------------
  box(1.2, 5.2, 12, M.cream, -3.8, 0, 3, { solid: true });
  box(1.2, 5.2, 12, M.cream, 3.8, 0, 3, { solid: true });
  box(8.8, 1.3, 1.25, M.stone, 0, 0, 9.3);
  box(8.8, 5, 1.2, M.cream, 0, 0, 9.3);
  // Arche d'entrée sur le site, avec claveaux et clé de voûte.
  const arch = (cx, z, span, spring, depth, material, ry = 0, y0 = 0) => {
    const r = span / 2;
    const s = new THREE.Shape();
    s.moveTo(-r - 1.2, 0);
    s.lineTo(r + 1.2, 0);
    s.lineTo(r + 1.2, spring + r + 1.4);
    s.lineTo(-r - 1.2, spring + r + 1.4);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-r, 0);
    hole.lineTo(-r, spring);
    hole.absarc(0, spring, r, Math.PI, 0, true);
    hole.lineTo(r, 0);
    hole.closePath();
    s.holes.push(hole);
    const geom = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 });
    geom.translate(0, 0, -depth / 2);
    push(geom, material, mtx(cx, Y(y0), z, ry));
    // Claveaux en pierre.
    const count = Math.max(9, Math.round((Math.PI * (r + 0.3)) / 0.62)) | 1;
    for (let k = 0; k < count; k += 1) {
      const a = Math.PI - ((k + 0.5) / count) * Math.PI;
      const vx = Math.cos(a) * (r + 0.3);
      const vy = spring + Math.sin(a) * (r + 0.3);
      const vb = new THREE.BoxGeometry(k === (count - 1) / 2 ? 0.7 : (Math.PI * (r + 0.3)) / count - 0.05, 0.62, depth + 0.1);
      push(vb, M.stone, mtx(cx, Y(y0), z, ry).multiply(mtx(vx, vy, 0, 0, 0, a - Math.PI / 2)));
    }
    // Piédroits.
    [-1, 1].forEach((side) => {
      const pb = new THREE.BoxGeometry(0.5, spring, depth + 0.16);
      push(pb, M.stone, mtx(cx, Y(y0), z, ry).multiply(mtx(side * (r + 0.25), spring / 2, 0)));
    });
  };
  arch(0, -3.2, 5.6, 3.1, 1.3, M.cream);
  box(10, 3, 1.3, M.cream, 0, 7.2, -3.2);
  box(10.4, 0.35, 1.6, M.trim, 0, 7, -3.2);
  // Façades de part et d'autre de l'arche (vues de biais).
  box(17, 9, 1.2, M.peach, -12.1, 0, -3.2, { solid: true });
  box(17.8, 8, 1.2, M.salmon, 13.5, 0, -3.2, { solid: true });
  box(17, 0.4, 1.6, M.trim, -12.1, 9, -3.2);
  box(17.8, 0.4, 1.6, M.trim, 13.5, 8, -3.2);

  // --- Éléments de façade réutilisables -----------------------------------
  // Fenêtre sur un mur d'axe X (normale vers +z ou -z) ou Z (normale ±x).
  // `n` : direction vers l'extérieur du mur (vers le site).
  const windowOn = (x, y0, z, n, { w = 1.3, h = 2, shutters = true, flowers = false, balcony = false } = {}) => {
    const ry = Math.atan2(n.x, n.z);
    const base = mtx(x, Y(y0), z, ry);
    const at = (dx, dy, dz, geom, material, extra = null) => push(geom, material, base.clone().multiply(extra ?? mtx(dx, dy, dz)));
    at(0, h / 2, 0.08, new THREE.PlaneGeometry(w - 0.1, h - 0.1), M.window);
    at(0, h + 0.12, 0.12, new THREE.BoxGeometry(w + 0.5, 0.24, 0.3), M.trim);
    at(0, h + 0.36, 0.1, new THREE.BoxGeometry(w + 0.3, 0.24, 0.22), M.trim);
    at(0, -0.1, 0.14, new THREE.BoxGeometry(w + 0.4, 0.14, 0.34), M.trim);
    [-1, 1].forEach((s) => at(s * (w / 2 + 0.1), h / 2, 0.1, new THREE.BoxGeometry(0.18, h, 0.24), M.trim));
    if (shutters) {
      [-1, 1].forEach((s) => {
        push(new THREE.PlaneGeometry(w / 2, h), M.shutter, base.clone().multiply(mtx(s * (w / 2 + w / 4 + 0.15), h / 2, 0.14 + 0.12, s * -0.35)), { ao: false });
      });
    }
    if (flowers || balcony) {
      at(0, 0.12, 0.4, new THREE.BoxGeometry(w + 0.2, 0.34, 0.4), M.terracotta);
      for (let k = 0; k < 9; k += 1) {
        const fx = -w / 2 + (k / 8) * w;
        const hue = [0.95, 0.02, 0.9, 0.12][k % 4];
        push(new THREE.IcosahedronGeometry(0.16 + (k % 3) * 0.04, 0), M.leaf, base.clone().multiply(mtx(fx, 0.38, 0.42)), { colorFn: () => [0.25, 0.45 + (k % 3) * 0.07, 0.2] });
        push(new THREE.IcosahedronGeometry(0.07, 0), M.flower, base.clone().multiply(mtx(fx + 0.05, 0.52, 0.5)), { colorFn: () => new THREE.Color().setHSL(hue, 0.75, 0.55).toArray() });
      }
    }
    if (balcony) {
      at(0, -0.2, 0.55, new THREE.BoxGeometry(w + 1, 0.16, 1.1), M.stone);
      for (let k = 0; k <= 8; k += 1) at(-w / 2 - 0.4 + (k / 8) * (w + 0.8), 0.45, 1.05, new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), M.iron);
      at(0, 0.92, 1.05, new THREE.BoxGeometry(w + 0.9, 0.05, 0.05), M.iron);
      at(0, 0.02, 1.05, new THREE.BoxGeometry(w + 0.9, 0.05, 0.05), M.iron);
    }
  };
  const cornice = (x, y, z, len, alongX, depthOut, n) => {
    const w = alongX ? len : 0.5;
    const d = alongX ? 0.5 : len;
    box(alongX ? len : 0.35 + depthOut, 0.28, alongX ? 0.35 + depthOut : len, M.trim, x + (alongX ? 0 : n * depthOut * 0.5), y, z + (alongX ? n * depthOut * 0.5 : 0), { ao: false });
    box(alongX ? len : 0.5 + depthOut, 0.18, alongX ? 0.5 + depthOut : len, M.trim, x + (alongX ? 0 : n * depthOut * 0.6), y + 0.28, z + (alongX ? n * depthOut * 0.6 : 0), { ao: false });
    return [w, d];
  };
  // Toit en pente (tuiles) posé sur un bâtiment.
  const roof = (cx, cz, w, d, yTop, slopeAlongX, overhang = 0.6) => {
    const ww = w + overhang * 2;
    const dd = d + overhang * 2;
    const rise = (slopeAlongX ? ww : dd) * 0.22;
    const halfSpan = (slopeAlongX ? ww : dd) / 2;
    const len = slopeAlongX ? dd : ww;
    const slopeLen = Math.hypot(halfSpan, rise);
    const angle = Math.atan2(rise, halfSpan);
    [-1, 1].forEach((side) => {
      const g = new THREE.BoxGeometry(slopeAlongX ? slopeLen : len, 0.22, slopeAlongX ? len : slopeLen);
      const m = slopeAlongX
        ? mtx(cx + side * halfSpan / 2, Y(yTop + rise / 2), cz, 0, 0, side * -angle)
        : mtx(cx, Y(yTop + rise / 2), cz + side * halfSpan / 2, 0, side * angle, 0);
      push(g, M.roof, m, { ao: false });
    });
    // Faîtage.
    const ridge = new THREE.CylinderGeometry(0.16, 0.16, len, 8);
    push(ridge, M.terracotta, slopeAlongX ? mtx(cx, Y(yTop + rise + 0.05), cz, 0, Math.PI / 2, 0) : mtx(cx, Y(yTop + rise + 0.05), cz, 0, 0, Math.PI / 2), { ao: false });
    // Pignons.
    [-1, 1].forEach((side) => {
      const gs = new THREE.Shape();
      gs.moveTo(-halfSpan + overhang, 0);
      gs.lineTo(halfSpan - overhang, 0);
      gs.lineTo(0, rise * ((halfSpan - overhang) / halfSpan));
      gs.closePath();
      const gg = new THREE.ExtrudeGeometry(gs, { depth: 0.3, bevelEnabled: false });
      push(gg, M.cream, slopeAlongX ? mtx(cx, Y(yTop), cz + side * (d / 2), 0) : mtx(cx + side * (w / 2), Y(yTop), cz, Math.PI / 2), { ao: false });
    });
  };

  const quoins = (x, z, h, n) => {
    for (let y = 0.2, k = 0; y < h - 0.6; y += 0.62, k += 1) {
      const long = k % 2 === 0;
      box(n.x ? 0.16 : long ? 1 : 0.6, 0.56, n.z ? 0.16 : long ? 1 : 0.6, M.stone, x + n.x * 0.08, y, z + n.z * 0.08, { ao: false });
    }
  };
  const pilaster = (x, z, y0, h, n) => {
    box(n.x ? 0.2 : 0.7, h, n.z ? 0.2 : 0.7, M.trim, x + n.x * 0.1, y0, z + n.z * 0.1, { ao: false });
    box(n.x ? 0.32 : 0.9, 0.3, n.z ? 0.32 : 0.9, M.trim, x + n.x * 0.16, y0 + h - 0.3, z + n.z * 0.16, { ao: false });
  };

  // --- Bâtiment gauche (x = -21) : trois niveaux, balcons, lierre -----------
  box(4, 13, 50, M.peach, -23, 0, -28, { solid: true });
  box(0.5, 1.4, 50, M.stone, -20.8, 0, -28);
  cornice(-21, 4.4, -28, 50, false, 0.4, 1);
  cornice(-21, 12.8, -28, 50, false, 0.6, 1);
  roof(-23, -28, 4, 50, 13.3, true);
  [-8, -14, -20, -36, -42].forEach((z, i) => {
    windowOn(-20.99, 5.4, z, new THREE.Vector3(1, 0, 0), { balcony: i === 1 || i === 3, flowers: i === 0 });
    windowOn(-20.99, 9.2, z, new THREE.Vector3(1, 0, 0), { flowers: i % 2 === 0 });
  });
  [-10, -18, -40].forEach((z) => windowOn(-20.99, 1.4, z, new THREE.Vector3(1, 0, 0), { w: 1.2, h: 1.9, shutters: false }));
  // Passage voûté vers le jardin (A Tree), plongé dans l'ombre.
  arch(-21, -28, 3.6, 2.6, 1.6, M.peach, Math.PI / 2);
  box(0.05, 4.4, 3.6, M.void, -20.96, 0, -28, { ao: false });
  [-5, -11, -17, -23, -33, -39, -45].forEach((z) => pilaster(-21, z, 4.8, 7.8, new THREE.Vector3(1, 0, 0)));
  quoins(-21, -3.9, 13, new THREE.Vector3(1, 0, 0));
  // Descente d'eau.
  box(0.16, 13, 0.16, M.iron, -20.6, 0, -24.3);

  // --- Bâtiment droit (x = 23) : grande porte mécanique, auvents, bannières ---
  box(4, 10, 50, M.salmon, 25, 0, -28, { solid: true });
  box(0.5, 1.4, 50, M.stone, 22.8, 0, -28);
  cornice(23, 9.6, -28, 50, false, 0.6, -1);
  roof(25, -28, 4, 50, 10.1, true);
  [-7, -13, -34, -40, -46].forEach((z, i) => windowOn(22.99, 5.6, z, new THREE.Vector3(-1, 0, 0), { flowers: i % 2 === 1 }));
  // Porte A : cadre de pierre, vantail d'acier, rails.
  push(new THREE.PlaneGeometry(5.6, 4.8), M.door, mtx(22.72, Y(2.4), -22, -Math.PI / 2), { ao: false });
  box(0.7, 5.6, 0.7, M.stone, 22.6, 0, -25.1);
  box(0.7, 5.6, 0.7, M.stone, 22.6, 0, -18.9);
  box(0.9, 0.8, 7, M.stone, 22.6, 5.2, -22);
  box(0.3, 0.3, 7.4, M.iron, 22.35, 4.95, -22);
  [-4, -16, -28, -31, -37, -43].forEach((z) => pilaster(23, z, 4.8, 4.6, new THREE.Vector3(-1, 0, 0)));
  quoins(23, -3.9, 10, new THREE.Vector3(-1, 0, 0));
  // Vitrines sous auvents.
  [-10, -44].forEach((z) => {
    windowOn(22.99, 0.8, z, new THREE.Vector3(-1, 0, 0), { w: 2.6, h: 2.4, shutters: false });
    const aw = new THREE.PlaneGeometry(4, 1.8);
    push(aw, M.awning, mtx(21.9, Y(3.8), z, -Math.PI / 2, 0, 0).multiply(mtx(0, 0, 0, 0, -0.9, 0)), { ao: false });
    [-1.9, 1.9].forEach((dz) => box(0.05, 3.4, 0.05, M.iron, 21.2, 0, z + dz));
  });

  // --- Fond : Heaven (balcon) au-dessus de Hell (arcades) -------------------
  const backZ = -50;
  box(46, 12, 4, M.cream, 1, 0, backZ - 2, { solid: true });
  box(46, 1.4, 0.5, M.stone, 1, 0, backZ + 0.2);
  // Hell : trois arcades sombres.
  [-10, -3, 4].forEach((x) => {
    box(5.2, 3.6, 0.2, M.void, x, 0, backZ + 0.02, { ao: false });
  });
  const hellArch = (x) => arch(x, backZ + 0.02, 4.4, 2.2, 0.5, M.cream);
  [-10, -3, 4].forEach(hellArch);
  // Balcon de Heaven sur toute la largeur, balustrade à balustres.
  const heavenY = 4.4;
  box(26, 0.5, 3.2, M.stone, -3, heavenY - 0.5, backZ + 1.4, { solid: true });
  box(26.4, 0.3, 3.5, M.trim, -3, heavenY - 0.8, backZ + 1.5, { ao: false });
  const baluster = new THREE.LatheGeometry(
    [[0, 0], [0.09, 0], [0.09, 0.08], [0.05, 0.14], [0.09, 0.42], [0.06, 0.58], [0.05, 0.66], [0.08, 0.72], [0.08, 0.78], [0, 0.78]].map(([r, h]) => new THREE.Vector2(r, h)),
    10,
  );
  for (let x = -15.6; x <= 9.6; x += 0.34) push(baluster, M.trim, mtx(x, Y(heavenY + 0.1), backZ + 2.8));
  box(26, 0.14, 0.36, M.trim, -3, heavenY + 0.88, backZ + 2.8);
  box(26, 0.12, 0.3, M.trim, -3, heavenY, backZ + 2.8);
  // Portes-fenêtres de Heaven et étage.
  [-12, -6, 0, 6].forEach((x) => windowOn(x, heavenY + 0.1, backZ + 0.01, new THREE.Vector3(0, 0, 1), { w: 1.6, h: 2.8, shutters: true }));
  [-14, -8, -2, 4, 10, 16].forEach((x) => windowOn(x, 8.6, backZ + 0.01, new THREE.Vector3(0, 0, 1), { flowers: x % 4 === 0 }));
  cornice(1, 11.6, backZ, 46, true, 0.6, 1);
  [-17, -11, -5, 1, 7, 13, 19].forEach((x) => pilaster(x, backZ, 7.6, 4, new THREE.Vector3(0, 0, 1)));
  cornice(1, 7.4, backZ, 46, true, 0.3, 1);
  roof(1, backZ - 2, 46, 4, 12.2, false);
  // Bannières sur la façade du fond.
  // Escalier de pierre vers Heaven (côté droit).
  const steps = 14;
  for (let k = 0; k < steps; k += 1) {
    const h = ((k + 1) / steps) * heavenY;
    box(3, h, 0.72, M.stone, 13.6, 0, -36.4 - k * 0.72, { solid: true });
  }
  box(8, 0.5, 3.4, M.stone, 11.5, heavenY - 0.5, -47.9, { solid: true });

  // --- Clocher (repère visible de loin) ---------------------------------------
  const tx = -14;
  const tz = -58;
  box(7, 16, 7, M.salmon, tx, 0, tz);
  box(7.6, 0.4, 7.6, M.trim, tx, 11, tz, { ao: false });
  box(7.6, 0.4, 7.6, M.trim, tx, 15.8, tz, { ao: false });
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => box(1.1, 4.4, 1.1, M.salmon, tx + sx * 2.95, 16, tz + sz * 2.95, { ao: false }));
  box(7, 1.6, 7, M.salmon, tx, 20.4, tz, { ao: false });
  box(7.8, 0.5, 7.8, M.trim, tx, 22, tz, { ao: false });
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((ry) => {
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    arch(tx + n.x * 3.3, tz + n.z * 3.3, 3.2, 1.9, 0.4, M.stone, ry, 16);
    windowOn(tx + n.x * 3.51, 12.6, tz + n.z * 3.51, n, { w: 1, h: 1.7, shutters: false });
  });
  // Cloche et flèche.
  const bell = new THREE.LatheGeometry([[0, 0], [0.4, 0], [0.62, -0.3], [0.7, -1], [1, -1.4], [1.05, -1.5], [0, -1.5]].map(([r, h]) => new THREE.Vector2(r, h)), 20);
  push(bell, M.bronze, mtx(tx, Y(20.2), tz), { ao: false });
  const spire = new THREE.ConeGeometry(5.4, 6, 4);
  push(spire, M.roof, mtx(tx, Y(25.5), tz, Math.PI / 4), { ao: false });
  push(new THREE.SphereGeometry(0.35, 12, 8), M.bronze, mtx(tx, Y(28.7), tz), { ao: false });

  // --- Mobilier du site ----------------------------------------------------------
  const crate = (x, y0, z, size, ry) => box(size, size, size, M.crate, x, y0, z, { ry, solid: true });
  // « Default » : double caisse au centre du site, et sa voisine.
  crate(1.4, 0, -27, 1.7, 0.05);
  crate(1.5, 1.7, -27.1, 1.7, -0.08);
  crate(3.3, 0, -26.6, 1.4, 0.2);
  // Triple au fond à droite.
  crate(9.2, 0, -39, 1.6, 0.1);
  crate(10.9, 0, -38.8, 1.6, -0.05);
  crate(10, 1.6, -38.9, 1.6, 0.25);
  // Caisses métalliques près de Hell.
  box(2.6, 1.3, 1.3, M.metalBox, -7.5, 0, -43.5, { ry: 0.08, solid: true });
  box(2.6, 1.3, 1.3, M.metalBox, -7.3, 1.3, -43.4, { ry: -0.12, solid: true });
  box(1.3, 1.3, 1.3, M.metalBox, -5, 0, -44.8, { ry: 0.4, solid: true });
  // Générateur à gauche du site, relié au mur par des câbles.
  box(3.4, 2.5, 2.2, M.generator, -14, 0, -19, { ry: 0.02, solid: true });
  box(3.6, 0.2, 2.4, M.iron, -14, 2.5, -19);
  [-15.2, -14, -12.8].forEach((x) => push(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 12), M.iron, mtx(x, Y(2.95), -19.6)));
  [[-15.5, 0.8], [-14.8, 1.4]].forEach(([x, y]) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, Y(y), -20.1),
      new THREE.Vector3(x - 1.5, Y(0.1), -20.6),
      new THREE.Vector3(-19, Y(0.1), -21),
      new THREE.Vector3(-20.7, Y(2.5), -21.2),
    ]);
    push(new THREE.TubeGeometry(curve, 30, 0.07, 6, false), M.iron, new THREE.Matrix4(), { ao: false });
  });
  // Muret et banc près de l'entrée droite.
  box(5, 1, 0.8, M.stone, 13.5, 0, -12, { solid: true });
  box(5.3, 0.14, 1, M.trim, 13.5, 1, -12);
  // Barils.
  [[-17.5, -33], [-17.3, -34.4], [18.8, -30]].forEach(([x, z], i) => {
    push(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 16), i === 2 ? M.teal : M.terracotta, mtx(x, Y(0.55), z));
    [0.15, 0.95].forEach((h) => push(new THREE.CylinderGeometry(0.435, 0.435, 0.06, 16), M.iron, mtx(x, Y(h), z)));
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.42, Y(0), z - 0.42), new THREE.Vector3(x + 0.42, Y(1.1), z + 0.42)));
  });

  // Olivier dans sa jardinière de pierre (avant droit).
  const treeX = 16.5;
  const treeZ = -7.5;
  push(new THREE.CylinderGeometry(1.7, 1.8, 0.8, 24), M.stone, mtx(treeX, Y(0.4), treeZ));
  push(new THREE.CylinderGeometry(1.55, 1.55, 0.05, 24), M.bark, mtx(treeX, Y(0.78), treeZ), { colorFn: () => [0.45, 0.32, 0.22] });
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 1.2, 0.1), new THREE.Vector3(-0.2, 2.4, -0.2), new THREE.Vector3(0.2, 3.3, 0.1)]);
  const trunkGeo = new THREE.TubeGeometry(trunk, 16, 0.24, 8, false);
  push(trunkGeo, M.bark, mtx(treeX, Y(0.8), treeZ), { ao: false });
  colliders.push(new THREE.Box3(new THREE.Vector3(treeX - 1.8, Y(0), treeZ - 1.8), new THREE.Vector3(treeX + 1.8, Y(0.8), treeZ + 1.8)));
  const trand = rng(4);
  for (let k = 0; k < 14; k += 1) {
    const a = trand() * Math.PI * 2;
    const r = trand() * 1.6;
    const g = new THREE.IcosahedronGeometry(0.9 + trand() * 0.6, 1);
    const green = [0.28 + trand() * 0.08, 0.4 + trand() * 0.12, 0.22 + trand() * 0.06];
    push(g, M.leaf, mtx(treeX + Math.cos(a) * r, Y(3.8 + trand() * 1.4), treeZ + Math.sin(a) * r, trand() * 3, 0, 0, 1, 0.7, 1), {
      colorFn: (x, y, z, n) => green.map((c) => c * (0.75 + n.y * 0.25)),
    });
  }
  // Jardinières rondes le long du fond.
  [[-16, -46.5], [16.5, -30]].forEach(([x, z]) => {
    push(new THREE.CylinderGeometry(0.7, 0.55, 0.8, 18), M.terracotta, mtx(x, Y(0.4), z));
    for (let k = 0; k < 5; k += 1) {
      push(new THREE.IcosahedronGeometry(0.4, 1), M.leaf, mtx(x + (k - 2) * 0.15, Y(1.05 + (k % 2) * 0.2), z + ((k * 7) % 3 - 1) * 0.15), { colorFn: () => [0.26, 0.46, 0.22] });
    }
  });

  // Réverbères en fonte avec lanterne.
  const lamps = [[-18.6, -12], [-18.6, -34], [20.6, -16], [20.6, -36]];
  lamps.forEach(([x, z]) => {
    push(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 12), M.iron, mtx(x, Y(0.25), z));
    push(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 10), M.iron, mtx(x, Y(2.3), z));
    push(new THREE.BoxGeometry(0.34, 0.06, 0.34), M.iron, mtx(x, Y(4.1), z));
    push(new THREE.BoxGeometry(0.26, 0.4, 0.26), M.bulb, mtx(x, Y(4.35), z), { ao: false });
    push(new THREE.ConeGeometry(0.26, 0.25, 4), M.iron, mtx(x, Y(4.68), z, Math.PI / 4));
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.26, Y(0), z - 0.26), new THREE.Vector3(x + 0.26, Y(4.8), z + 0.26)));
  });

  // Guirlandes lumineuses tendues entre les deux façades.
  [-15, -24, -33].forEach((z, i) => {
    const pts = [];
    for (let k = 0; k <= 30; k += 1) {
      const t = k / 30;
      pts.push(new THREE.Vector3(-20.7 + t * 43.4, Y(8.4 - Math.sin(t * Math.PI) * 1.4 - i * 0.2), z + Math.sin(t * Math.PI * 2) * 0.4));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    push(new THREE.TubeGeometry(curve, 60, 0.02, 4, false), M.iron, new THREE.Matrix4(), { ao: false });
    for (let k = 1; k < 22; k += 1) {
      const p = curve.getPointAt(k / 22);
      push(new THREE.SphereGeometry(0.075, 8, 6), M.bulb, mtx(p.x, p.y - 0.12, p.z), { ao: false });
    }
  });

  // Lierre sur la façade gauche et la façade du fond (plans découpés).
  const ivyMat = new THREE.MeshStandardMaterial({ map: tex(ivyCanvas(), { wrap: false }), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  ivyMat.color.multiplyScalar(shade);
  [[-20.9, 4.2, -31, Math.PI / 2, 5, 8], [-20.9, 3.4, -16, Math.PI / 2, 4, 6.5], [17, 5.2, backZ + 0.05, 0, 5, 9]].forEach(([x, y, z, ry, w, h]) => {
    const ivy = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ivyMat);
    ivy.position.set(x, Y(y), z);
    ivy.rotation.y = ry;
    arena.add(ivy);
  });

  // --- Décalques au sol : zone de plant, feuilles mortes, ombres de contact ---
  const decal = (canvas, w, d, x, z, { ry = 0, opacity = 1 } = {}) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: tex(canvas, { wrap: false }), transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = ry;
    m.position.set(x, Y(0.015), z);
    arena.add(m);
    return m;
  };
  const plantZone = { minX: -5, maxX: 8, minZ: -33, maxZ: -21 };
  decal(siteCanvas(), 13, 12, 1.5, -27, { opacity: isDark ? 0.5 : 0.85 });
  const shadow = shadowCanvas();
  [[1.6, -27, 3.6], [3.3, -26.6, 2.4], [10, -38.9, 4.2], [-7.3, -43.7, 4.6], [-14, -19, 5.2], [16.5, -7.5, 5.6], [13.5, -12, 5.6]].forEach(([x, z, s]) => decal(shadow, s, s * 0.8, x, z));
  const leaves = leavesCanvas();
  const lrand = rng(3);
  for (let i = 0; i < 26; i += 1) decal(leaves, 1.2, 1.2, -18 + lrand() * 38, -46 + lrand() * 40, { ry: lrand() * 6, opacity: 0.8 });
  // Ombre au pied des façades.
  const baseShadow = baseShadowCanvas();
  [[-20.3, -28, 50, Math.PI / 2], [22.3, -28, 50, -Math.PI / 2], [1, backZ + 0.8, 46, 0]].forEach(([x, z, len, ry]) => {
    const m = decal(baseShadow, len, 1.4, x, z);
    m.rotation.z = ry;
  });

  // Enseigne peinte « A » sur la façade gauche.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: tex(wallSignCanvas(), { wrap: false }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  sign.position.set(-20.95, Y(2.6), -23);
  sign.rotation.y = Math.PI / 2;
  arena.add(sign);

  // Bannières qui ondulent au vent (déformation dans le shader).
  const wind = { value: 0 };
  const bannerMat = new THREE.MeshStandardMaterial({ map: tex(bannerCanvas(), { wrap: false }), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  bannerMat.color.multiplyScalar(shade);
  bannerMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = `uniform float uWind;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nfloat hang = (1.0 - uv.y);\ntransformed.z += sin(uWind * 2.2 + position.y * 1.3) * 0.18 * hang + sin(uWind * 3.7 + position.x * 2.0) * 0.05 * hang;',
    )}`;
  };
  [[22.68, 7.2, -15, -Math.PI / 2], [22.68, 7.2, -29, -Math.PI / 2], [-9, 9.4, backZ + 0.3, 0], [7, 9.4, backZ + 0.3, 0]].forEach(([x, y, z, ry]) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.5, 4, 12), bannerMat);
    b.position.set(x, Y(y), z);
    b.rotation.y = ry;
    b.onBeforeRender = () => {
      wind.value = performance.now() / 1000;
    };
    arena.add(b);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 6), M.iron);
    rod.rotation.z = Math.PI / 2;
    rod.rotation.y = ry;
    rod.position.set(x, Y(y + 1.78), z);
    arena.add(rod);
  });

  // --- Ville en arrière-plan (silhouettes au-dessus des toits) ----------------
  const skylineMat = std({ map: tex(skylineCanvas()), roughness: 0.95 }, 12);
  const brand = rng(21);
  const blocks = [];
  for (let i = 0; i < 16; i += 1) blocks.push([-40 + i * 6 + brand() * 3, -68 - brand() * 26, 6 + brand() * 5, 14 + brand() * 12]);
  for (let i = 0; i < 7; i += 1) blocks.push([-40 - brand() * 8, -10 - i * 8, 8, 12 + brand() * 10]);
  for (let i = 0; i < 7; i += 1) blocks.push([42 + brand() * 8, -10 - i * 8, 8, 12 + brand() * 10]);
  for (let i = 0; i < 9; i += 1) blocks.push([-32 + i * 8 + brand() * 3, 20 + brand() * 10, 7 + brand() * 4, 10 + brand() * 10]);
  blocks.forEach(([x, z, w, h]) => {
    box(w, h, w, skylineMat, x, 0, z, { ao: false });
    const cone = new THREE.ConeGeometry(w * 0.78, w * 0.35, 4);
    push(cone, M.roof, mtx(x, Y(h + w * 0.17), z, Math.PI / 4), { ao: false });
  });
  // Coupole de la cathédrale au loin.
  push(new THREE.CylinderGeometry(7, 7, 30, 24), M.cream, mtx(24, Y(15), -95), { ao: false });
  push(new THREE.SphereGeometry(7.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.teal, mtx(24, Y(30), -95), { ao: false });
  push(new THREE.CylinderGeometry(0.6, 1, 3, 10), M.cream, mtx(24, Y(38.8), -95), { ao: false });

  // --- Fusion ------------------------------------------------------------------
  buckets.forEach((list, material) => {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    arena.add(mesh);
  });

  // --- Ciel, îles flottantes, nuages (hors brouillard) -------------------------
  const skyTop = new THREE.Color(isDark ? 0x05070d : 0x3f7fcf);
  const skyHorizon = new THREE.Color(isDark ? 0x141a28 : 0xcfe4f2);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: skyTop }, uHorizon: { value: skyHorizon }, uSun: { value: new THREE.Vector3(8, 16, 6).normalize() }, uSunStrength: { value: isDark ? 0 : 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform float uSunStrength; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          if (h < 0.0) col = uHorizon * 0.9;
          float s = max(dot(normalize(vDir), uSun), 0.0);
          col += vec3(1.0, 0.9, 0.7) * (pow(s, 900.0) * 3.0 + pow(s, 10.0) * 0.18) * uSunStrength;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -10;
  // Le ciel suit la caméra : il ne sort jamais de la distance d'affichage.
  sky.onBeforeRender = (renderer, scene, camera) => sky.position.copy(camera.position);
  arena.add(sky);

  const haze = (hex, amount) => new THREE.Color(hex).lerp(skyHorizon, amount);
  const islandMat = (hex, amount) => new THREE.MeshStandardMaterial({ color: haze(hex, amount), roughness: 0.95, flatShading: true, fog: false });
  const island = (x, y, z, radius, seed, amount) => {
    const group = new THREE.Group();
    group.position.set(x, Y(y), z);
    const r = rng(seed);
    const rock = new THREE.ConeGeometry(radius, radius * 1.7, 10, 5);
    rock.rotateX(Math.PI);
    const p = rock.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      if (p.getY(i) < radius * 0.8) {
        p.setX(i, p.getX(i) * (0.8 + r() * 0.4));
        p.setZ(i, p.getZ(i) * (0.8 + r() * 0.4));
        p.setY(i, p.getY(i) + (r() - 0.5) * radius * 0.2);
      }
    }
    rock.computeVertexNormals();
    const rockMesh = new THREE.Mesh(rock, islandMat(0x8a7560, amount));
    rockMesh.position.y = -radius * 0.85;
    group.add(rockMesh);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 0.98, radius * 0.1, 10), islandMat(0x7e9b58, amount));
    group.add(top);
    const houseMat = islandMat(0xe8d6b4, amount);
    const roofMat = islandMat(0xb4583d, amount);
    for (let k = 0; k < 7; k += 1) {
      const a = r() * Math.PI * 2;
      const d = r() * radius * 0.65;
      const w = radius * (0.12 + r() * 0.1);
      const h = radius * (0.15 + r() * 0.25);
      const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), houseMat);
      house.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
      group.add(house);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, w * 0.5, 4), roofMat);
      cap.position.set(Math.cos(a) * d, h + w * 0.25, Math.sin(a) * d);
      cap.rotation.y = Math.PI / 4;
      group.add(cap);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.06, radius * 0.09, radius * 0.9, 8), houseMat);
    spire.position.y = radius * 0.45;
    group.add(spire);
    const cup = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.1, radius * 0.3, 8), islandMat(0x2f7d7a, amount));
    cup.position.y = radius * 1.05;
    group.add(cup);
    // Cascade qui tombe du bord.
    const fall = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 0.08, radius * 1.4),
      new THREE.MeshBasicMaterial({ color: haze(0xf4fbff, amount * 0.5), transparent: true, opacity: 0.55, fog: false, depthWrite: false }),
    );
    fall.position.set(radius * 0.95, -radius * 0.7, 0);
    group.add(fall);
    const baseY = group.position.y;
    const phase = r() * 6;
    rockMesh.onBeforeRender = () => {
      group.position.y = baseY + Math.sin(performance.now() / 4000 + phase) * 1.2;
    };
    arena.add(group);
  };
  island(30, 70, -160, 24, 11, 0.35);
  island(-70, 52, -150, 13, 12, 0.45);
  island(95, 44, -120, 10, 13, 0.5);
  island(-110, 60, -60, 11, 14, 0.5);

  const cloudTex = tex(cloudCanvas(), { wrap: false });
  const crand = rng(9);
  for (let i = 0; i < 12; i += 1) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: isDark ? 0.15 : 0.75 }));
    const a = -Math.PI * 0.95 + crand() * Math.PI * 0.9;
    const d = 140 + crand() * 30;
    cloud.position.set(Math.cos(a) * d, Y(30 + crand() * 55), Math.sin(a) * d);
    cloud.scale.set(60 + crand() * 40, 26 + crand() * 14, 1);
    const baseX = cloud.position.x;
    const speed = 0.4 + crand() * 0.6;
    cloud.onBeforeRender = () => {
      cloud.position.x = baseX + ((performance.now() / 1000) * speed) % 40 - 20;
    };
    arena.add(cloud);
  }

  // --- Lumières d'ambiance ---------------------------------------------------------
  lamps.slice(0, 2).forEach(([x, z]) => {
    const light = new THREE.PointLight(0xffc98a, isDark ? 6 : 1.2, 14, 2);
    light.position.set(x + (x < 0 ? 0.6 : -0.6), Y(4.2), z);
    arena.add(light);
  });
  const doorLight = new THREE.PointLight(0x4af4ff, isDark ? 3 : 0.8, 8, 2);
  doorLight.position.set(21.4, Y(2.5), -22);
  arena.add(doorLight);

  return {
    colliders,
    spawn: { position: new THREE.Vector3(0, 0, 0), yaw: 0 },
    plantZone,
    bounds: { minX: -20, maxX: 22, minZ: -48, maxZ: 8 },
    floorY,
    // Éclairage de plein jour : les accents rouge/bleu de la salle classique
    // teinteraient les façades.
    softAccents: true,
    botZones: [{ minX: -12, maxX: 18, minZ: -46, maxZ: -9, y: 0 }],
  };
}
