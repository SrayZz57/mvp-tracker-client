import { rng, paint, blotches } from './aimArenaAscent.js';

// Matières du site A d'Ascent (aimMapAscentA.js) dans le style de Valorant :
// aplats doux, dégradés peints, arêtes adoucies, presque pas de grain fin (le
// jeu n'a pas de bruit « photo »). Dessinées en code d'après des captures du
// jeu : aucune texture de Riot n'est reprise (dépôt public).
//
// Échelle : chaque canvas indique la taille réelle qu'il couvre (tuilage en UV
// monde dans aimMapAscentA.js) ; les caisses, elles, reçoivent une face entière.

// --- Outils de dessin ---------------------------------------------------------

const hashKey = (key) => [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Teinte voisine : chaque pierre/dalle a sa propre nuance, sans bruit.
function jitter(hex, rand, amount = 10) {
  const d = (rand() - 0.5) * 2 * amount;
  const [r, g, b] = hexToRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c + d + (rand() - 0.5) * amount * 0.4))));
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

// Dessin reproduit de l'autre côté des bords : la texture raccorde sans couture.
function wrap(w, h, x, y, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(x + dx, y + dy);
}

// Pierre peinte : aplat, clair en haut, plus sombre en bas, liseré lumineux sur
// l'arête haute (lumière du jeu, qui vient d'en haut).
function softStone(ctx, x, y, w, h, color, { r = 12, light = 0.14, dark = 0.16, rim = 0.28 } = {}) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(255,250,242,${light})`);
  g.addColorStop(0.45, 'rgba(255,250,242,0)');
  g.addColorStop(1, `rgba(60,40,50,${dark})`);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  if (rim > 0) {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.strokeStyle = `rgba(255,248,236,${rim})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.6, y + 2);
    ctx.lineTo(x + w - r * 0.6, y + 2);
    ctx.stroke();
    ctx.restore();
  }
}

// Largeurs qui remplissent exactement `total` (rangée qui boucle).
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

// --- Murs -------------------------------------------------------------------------

// Enduit mat (6 m de côté) avec des grappes de pierres qui affleurent là où il
// est tombé — des moellons de grès sur les murs beiges, de fines briques pâles
// sur les façades lavande, comme sur le site A.
export function plasterCanvas(key, base, { stone = '#d9bd98', clusters = 2, brick = false } = {}) {
  return paint(`ascV-plaster-${key}`, 1024, 1024, (ctx, s) => {
    const rand = rng(hashKey(key));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, s, rand, 26, [[255, 252, 246, 0.07], [70, 50, 70, 0.05]], 160, 380);
    for (let c = 0; c < clusters; c += 1) {
      const cx = rand() * s;
      const cy = rand() * s;
      // Enduit plus clair autour de la zone abîmée.
      wrap(s, s, cx, cy, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 20, px, py, 190);
        g.addColorStop(0, 'rgba(255,250,240,0.12)');
        g.addColorStop(1, 'rgba(255,250,240,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - 190, py - 190, 380, 380);
      });
      // Contour irrégulier : chaque rangée a sa propre largeur et son décalage,
      // et des pierres manquent çà et là.
      const rows = brick ? 5 + Math.floor(rand() * 3) : 3 + Math.floor(rand() * 2);
      const rowH = brick ? 26 : 46;
      const width = 140 + rand() * 140;
      for (let r = 0; r < rows; r += 1) {
        const span = width * Math.sin(((r + 0.5) / rows) * Math.PI) * (0.45 + rand() * 0.6);
        let x = cx - span / 2 + (rand() - 0.5) * 50;
        const y = cy - (rows * rowH) / 2 + r * rowH;
        const end = x + span;
        while (x < end) {
          const w = brick ? 58 + rand() * 8 : 54 + rand() * 60;
          if (rand() < 0.65) {
            const color = jitter(stone, rand, 9);
            wrap(s, s, x, y, (px, py) => softStone(ctx, px, py, w - 5, rowH - 5, color, { r: brick ? 4 : 13, light: 0.1, dark: 0.12, rim: 0.2 }));
          }
          x += w;
        }
      }
    }
  });
}

// Soubassement en gros moellons de grès (2,4 m de côté).
export function sandstoneCanvas(key = 'base', palette = ['#e2c49c', '#d9b98e', '#e8cfab', '#d2b186', '#dcbf95']) {
  return paint(`ascV-sandstone-${key}`, 1024, 1024, (ctx, s) => {
    const rand = rng(hashKey(key) + 11);
    ctx.fillStyle = '#a78d74';
    ctx.fillRect(0, 0, s, s);
    const rowH = 128; // 30 cm
    for (let r = 0; r < s / rowH; r += 1) {
      let x = rand() * 80;
      rowPieces(s, 150, 330, rand).forEach((w) => {
        const color = palette[Math.floor(rand() * palette.length)];
        const tone = jitter(color, rand, 6);
        wrap(s, s, x, r * rowH, (px, py) => softStone(ctx, px + 4, py + 4, w - 8, rowH - 8, tone, { r: 26, light: 0.16, dark: 0.2 }));
        x += w;
      });
    }
  });
}

// Pierre de taille crème des murets, rebords et joues d'escalier (2,4 m).
export function copingCanvas() {
  return paint('ascV-coping', 1024, 512, (ctx, w, h) => {
    const rand = rng(501);
    ctx.fillStyle = '#cdbfa8';
    ctx.fillRect(0, 0, w, h);
    let x = 0;
    rowPieces(w, 380, 560, rand).forEach((pw) => {
      softStone(ctx, x + 3, 3, pw - 6, h - 6, jitter('#ebe1cf', rand, 5), { r: 18, light: 0.2, dark: 0.1, rim: 0.3 });
      x += pw;
    });
  });
}

// --- Sols -----------------------------------------------------------------------

// Dallage du site : carreaux gris-bleu d'environ 65 cm (2,6 m de côté).
export function siteTilesCanvas() {
  return paint('ascV-siteTiles', 1024, 1024, (ctx, s) => {
    const rand = rng(502);
    ctx.fillStyle = '#4f5263';
    ctx.fillRect(0, 0, s, s);
    const n = 4;
    const c = s / n;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        softStone(ctx, i * c + 4, j * c + 4, c - 8, c - 8, jitter('#7d8195', rand, 5), { r: 6, light: 0.08, dark: 0.08, rim: 0.12 });
      }
    }
    blotches(ctx, s, s, rand, 14, [[40, 42, 60, 0.06], [255, 255, 255, 0.04]], 120, 300);
  });
}

// Pavés gris posés en éventail, mousse dans les joints (6 m de côté).
//
// Géométrie des éventails : cercles de rayon R, espacés de 2A dans une rangée,
// rangées décalées de A et espacées de Hr, dessinées de haut en bas. Avec
// Hr ≤ R − √(R² − A²), chaque rangée recouvre la jonction de deux éventails
// de la rangée au-dessus, et avec A² + Hr² < R² elle en cache aussi le pied :
// il ne reste de chaque cercle que ses arcs supérieurs, comme sur la place.
export function fanCobbleCanvas() {
  return paint('ascV-fanCobble', 1024, 1024, (ctx, s) => {
    const rand = rng(503);
    const joint = '#4c4649';
    ctx.fillStyle = joint;
    ctx.fillRect(0, 0, s, s);
    const A = 256; // demi-pas horizontal (1,5 m) : période 512 px
    const Hr = 128; // pas vertical (75 cm) : période 256 px
    const R = 296; // rayon d'un éventail (1,7 m)
    const ring = 34; // largeur d'un anneau de pavés (20 cm)
    const len = 38; // longueur d'un pavé (22 cm)
    const palette = ['#8a8588', '#938e90', '#7f7a7e', '#999497', '#78737a'];
    for (let row = -4; row <= s / Hr + 4; row += 1) {
      for (let i = -2; i <= s / (2 * A) + 2; i += 1) {
        const cx = i * 2 * A + (Math.abs(row) % 2 === 0 ? 0 : A);
        const cy = row * Hr;
        // Tirages propres à l'éventail et identiques à une période de texture
        // d'écart : la texture raccorde sans couture.
        const wrapRow = ((row % (s / Hr)) + s / Hr) % (s / Hr);
        const wrapCol = ((i % (s / (2 * A))) + s / (2 * A)) % (s / (2 * A));
        const cr = rng(1000 + wrapRow * 7 + wrapCol);
        ctx.fillStyle = joint;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, 2 * Math.PI);
        ctx.fill();
        // Anneaux visibles seulement (le cœur est recouvert par les rangées suivantes).
        for (let r = R; r - ring >= 10; r -= ring) {
          const inner = r - ring;
          const count = Math.round((2 * Math.PI * (r - ring / 2)) / len);
          const da = (2 * Math.PI) / count;
          const phase = cr() * da;
          for (let k = 0; k < count; k += 1) {
            // Seul le haut du cercle reste visible : inutile de dessiner le bas.
            // Joint de ~4 px quel que soit l'anneau (écart angulaire = px / rayon).
            const gap = 4 / (r - ring / 2);
            const a0 = phase + k * da + gap;
            const a1 = phase + (k + 1) * da - gap;
            const mid = (a0 + a1) / 2;
            if (Math.sin(mid) > 0.55) continue;
            const color = jitter(palette[Math.floor(cr() * palette.length)], cr, 6);
            ctx.beginPath();
            ctx.arc(cx, cy, r - 3, a0, a1);
            ctx.arc(cx, cy, inner + 3, a1, a0, true);
            ctx.closePath();
            ctx.lineJoin = 'round';
            ctx.lineWidth = 5;
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.stroke();
            ctx.fill();
            // Relief : bord extérieur éclairé.
            ctx.strokeStyle = 'rgba(255,248,244,0.14)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r - 5, a0 + 0.02, a1 - 0.02);
            ctx.stroke();
          }
        }
      }
    }
    // Mousse dans les joints, par petites plaques discrètes.
    for (let i = 0; i < 50; i += 1) {
      const x = rand() * s;
      const y = rand() * s;
      wrap(s, s, x, y, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, 26);
        g.addColorStop(0, 'rgba(84,100,58,0.2)');
        g.addColorStop(1, 'rgba(84,100,58,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - 26, py - 26, 52, 52);
      });
    }
  });
}

// Marches et pierre grise (1,6 m de côté).
export function greyStoneCanvas() {
  return paint('ascV-greyStone', 512, 512, (ctx, s) => {
    const rand = rng(504);
    ctx.fillStyle = '#8b8894';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, s, rand, 20, [[255, 255, 255, 0.06], [40, 35, 50, 0.07]], 60, 180);
    let x = 0;
    rowPieces(s, 150, 260, rand).forEach((w) => {
      ctx.fillStyle = 'rgba(50,45,60,0.35)';
      ctx.fillRect(x, 0, 3, s);
      x += w;
    });
  });
}

// Sable clair de Tree (4 m de côté).
export function sandCanvas() {
  return paint('ascV-sand', 512, 512, (ctx, s) => {
    const rand = rng(505);
    ctx.fillStyle = '#d7b98d';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, s, rand, 40, [[190, 150, 105, 0.18], [245, 225, 190, 0.2]], 40, 140);
  });
}

// Gravier et terre battue de Garden (3 m de côté).
export function gardenGroundCanvas() {
  return paint('ascV-garden', 512, 512, (ctx, s) => {
    const rand = rng(506);
    ctx.fillStyle = '#a89c8a';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, s, rand, 34, [[120, 132, 80, 0.16], [215, 205, 185, 0.18]], 40, 120);
    for (let i = 0; i < 380; i += 1) {
      const x = rand() * s;
      const y = rand() * s;
      ctx.fillStyle = rand() < 0.5 ? 'rgba(235,228,215,0.5)' : 'rgba(110,100,90,0.35)';
      roundRect(ctx, x, y, 5 + rand() * 7, 4 + rand() * 5, 3);
      ctx.fill();
    }
  });
}

// Gazon peint, vert olive (2,5 m de côté).
export function grassCanvas() {
  return paint('ascV-grass', 512, 512, (ctx, s) => {
    const rand = rng(507);
    ctx.fillStyle = '#76833f';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, s, rand, 40, [[140, 150, 72, 0.22], [90, 104, 48, 0.22], [168, 170, 96, 0.12]], 40, 150);
    for (let i = 0; i < 2200; i += 1) {
      const x = rand() * s;
      const y = rand() * s;
      ctx.strokeStyle = rand() < 0.55 ? 'rgba(150,164,82,0.28)' : 'rgba(84,98,44,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 2, y - 5, x + (rand() - 0.5) * 6, y - 9 - rand() * 6);
      ctx.stroke();
    }
  });
}

// --- Caisses et objets --------------------------------------------------------

// Grande caisse en contreplaqué clair tenue par une armature de tubes gris-vert.
export function plywoodCrateCanvas(key = 'tall', { bands = 2 } = {}) {
  return paint(`ascV-plywood-${key}`, 512, 1024, (ctx, w, h) => {
    const rand = rng(hashKey(key) + 3);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#d8a36a');
    g.addColorStop(1, '#c78e57');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Veinage large et doux.
    for (let i = 0; i < 26; i += 1) {
      const x = rand() * w;
      ctx.strokeStyle = `rgba(150,95,50,${0.07 + rand() * 0.07})`;
      ctx.lineWidth = 3 + rand() * 8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 60, h * 0.3, x + (rand() - 0.5) * 60, h * 0.7, x + (rand() - 0.5) * 30, h);
      ctx.stroke();
    }
    // Joints entre panneaux.
    ctx.fillStyle = 'rgba(110,70,40,0.35)';
    ctx.fillRect(w / 2 - 2, 0, 4, h);
    // Armature : cadre, montant central, traverses.
    const tube = (x, y, tw, th) => {
      ctx.fillStyle = '#a3ada0';
      ctx.fillRect(x, y, tw, th);
      const gg = tw > th ? ctx.createLinearGradient(0, y, 0, y + th) : ctx.createLinearGradient(x, 0, x + tw, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0.35)');
      gg.addColorStop(0.5, 'rgba(255,255,255,0)');
      gg.addColorStop(1, 'rgba(30,40,35,0.35)');
      ctx.fillStyle = gg;
      ctx.fillRect(x, y, tw, th);
    };
    const t = 22;
    tube(0, 0, t, h);
    tube(w - t, 0, t, h);
    tube(0, 0, w, t);
    tube(0, h - t, w, t);
    tube(w / 2 - 9, 0, 18, h);
    for (let b = 1; b <= bands; b += 1) tube(0, (h * b) / (bands + 1) - 9, w, 18);
    // Colliers de serrage aux croisements.
    for (let b = 0; b <= bands + 1; b += 1) {
      const y = b === 0 ? t / 2 : b === bands + 1 ? h - t / 2 : (h * b) / (bands + 1);
      [t / 2, w / 2, w - t / 2].forEach((x) => {
        ctx.fillStyle = '#7f8a80';
        roundRect(ctx, x - 16, y - 16, 32, 32, 6);
        ctx.fill();
      });
    }
  });
}

// Caisse verte du « default » : panneaux menthe lumineux quadrillés, cadre et
// croix gris clair. `glow` : carte d'émission (seul le verre éclaire).
export function greenCrateCanvas(glow = false) {
  return paint(`ascV-greenCrate-${glow}`, 512, 512, (ctx, s) => {
    ctx.fillStyle = glow ? '#000' : '#b9b5ac';
    ctx.fillRect(0, 0, s, s);
    const f = 34;
    ctx.save();
    ctx.beginPath();
    ctx.rect(f, f, s - 2 * f, s - 2 * f);
    ctx.clip();
    const g = ctx.createLinearGradient(0, f, 0, s - f);
    g.addColorStop(0, glow ? '#3f8a52' : '#c4f8cb');
    g.addColorStop(1, glow ? '#2f7042' : '#a3edb1');
    ctx.fillStyle = g;
    ctx.fillRect(f, f, s - 2 * f, s - 2 * f);
    ctx.strokeStyle = glow ? 'rgba(0,0,0,0.25)' : 'rgba(90,170,110,0.55)';
    ctx.lineWidth = 2;
    for (let k = -s; k < 2 * s; k += 30) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + s, s);
      ctx.moveTo(k, s);
      ctx.lineTo(k + s, 0);
      ctx.stroke();
    }
    ctx.restore();
    if (!glow) {
      // Cadre biseauté et croix.
      ctx.strokeStyle = '#b4b0a7';
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f, f);
      ctx.lineTo(s - f, s - f);
      ctx.moveTo(s - f, f);
      ctx.lineTo(f, s - f);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(3, 3, s - 6, s - 6);
      ctx.strokeStyle = 'rgba(60,55,50,0.4)';
      ctx.strokeRect(f - 2, f - 2, s - 2 * f + 4, s - 2 * f + 4);
    } else {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(f, f);
      ctx.lineTo(s - f, s - f);
      ctx.moveTo(s - f, f);
      ctx.lineTo(f, s - f);
      ctx.stroke();
    }
  });
}

// Bloc de grès sculpté (le voisin de la caisse verte, les blocs empilés) :
// trois assises aux arêtes arrondies.
export function stoneBlockCanvas() {
  return paint('ascV-stoneBlock', 512, 512, (ctx, s) => {
    const rand = rng(508);
    ctx.fillStyle = '#b5a282';
    ctx.fillRect(0, 0, s, s);
    const rows = 3;
    const rh = s / rows;
    for (let r = 0; r < rows; r += 1) {
      const split = r === 1 ? [0.55, 0.45] : [1];
      let x = 0;
      split.forEach((part) => {
        const pw = part * s;
        softStone(ctx, x + 5, r * rh + 5, pw - 10, rh - 10, jitter('#e3d0b0', rand, 6), { r: 22, light: 0.22, dark: 0.18, rim: 0.35 });
        x += pw;
      });
    }
  });
}

// Bâche gris-vert tendue sur un bloc.
export function tarpCanvas() {
  return paint('ascV-tarp', 512, 512, (ctx, s) => {
    const rand = rng(509);
    ctx.fillStyle = '#8a9a92';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 10; i += 1) {
      const x = rand() * s;
      const g = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
      g.addColorStop(0, 'rgba(40,55,50,0)');
      g.addColorStop(0.5, `rgba(40,55,50,${0.1 + rand() * 0.12})`);
      g.addColorStop(1, 'rgba(40,55,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 40, 0, 80, s);
    }
  });
}

// Bâche blanche des échafaudages de Heaven.
export function clothCanvas() {
  return paint('ascV-cloth', 512, 512, (ctx, s) => {
    const rand = rng(510);
    ctx.fillStyle = '#efe9e0';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 12; i += 1) {
      const x = rand() * s;
      const g = ctx.createLinearGradient(x - 36, 0, x + 36, 0);
      g.addColorStop(0, 'rgba(150,130,140,0)');
      g.addColorStop(0.5, `rgba(150,130,140,${0.1 + rand() * 0.1})`);
      g.addColorStop(1, 'rgba(150,130,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 36, 0, 72, s);
    }
    ctx.fillStyle = '#d6cdc2';
    ctx.fillRect(0, 0, s, 8);
  });
}

// Générateur : flancs gris ardoise (panneaux biseautés, persiennes, liseré
// orange sur le dessus).
export function generatorSideCanvas() {
  return paint('ascV-genSide', 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4b4e5b';
    ctx.fillRect(0, 0, w, h);
    const panel = (x, y, pw, ph) => {
      roundRect(ctx, x, y, pw, ph, 10);
      ctx.fillStyle = '#575b69';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 3;
      ctx.stroke();
    };
    panel(24, 60, 300, 390);
    panel(350, 60, 320, 170);
    panel(700, 60, 300, 390);
    // Persiennes.
    for (let y = 262; y < 440; y += 22) {
      ctx.fillStyle = '#353743';
      ctx.fillRect(362, y, 296, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(362, y, 296, 3);
    }
    ctx.fillStyle = '#d8573e';
    ctx.fillRect(0, 0, w, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = -30; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.lineTo(x + 18, 0);
      ctx.lineTo(x + 34, 0);
      ctx.lineTo(x + 16, 26);
      ctx.fill();
    }
  });
}

// Générateur, faces avant/arrière : anneau à grille orange lumineuse en haut,
// triangle jaune en bas. `glow` : carte d'émission.
export function generatorEndCanvas(glow = false) {
  return paint(`ascV-genEnd-${glow}`, 512, 768, (ctx, w, h) => {
    ctx.fillStyle = glow ? '#000' : '#474a57';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.34;
    const R = w * 0.4;
    if (!glow) {
      roundRect(ctx, 16, 16, w - 32, h * 0.66 - 24, 30);
      ctx.fillStyle = '#525664';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, R + 18, 0, Math.PI * 2);
      ctx.fillStyle = '#30323b';
      ctx.fill();
    }
    // Grille lumineuse.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = glow ? '#ffb23e' : '#ffc567';
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.fillStyle = glow ? '#000' : '#3b2f24';
    for (let k = -R; k < R; k += 26) {
      ctx.fillRect(cx + k, cy - R, 7, 2 * R);
      ctx.fillRect(cx - R, cy + k, 2 * R, 7);
    }
    ctx.restore();
    // Disque et croix au centre.
    ctx.fillStyle = glow ? '#000' : '#2e2f37';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - R, cy - 14, 2 * R, 28);
    ctx.fillRect(cx - 14, cy - R, 28, 2 * R);
    // Bloc du bas et triangle.
    if (!glow) {
      roundRect(ctx, 16, h * 0.68, w - 32, h * 0.3, 20);
      ctx.fillStyle = '#3d404c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = glow ? '#ffd24a' : '#ffe07a';
    ctx.beginPath();
    ctx.moveTo(cx - 34, h * 0.78);
    ctx.lineTo(cx + 34, h * 0.78);
    ctx.lineTo(cx, h * 0.84);
    ctx.closePath();
    ctx.fill();
  });
}

// Rideau de garage clair au fond de Hell.
export function shutterCanvas() {
  return paint('ascV-shutter', 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#cfc5b6';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const g = ctx.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.25)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(70,60,50,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 32, h);
    }
    [w / 3, (2 * w) / 3].forEach((x) => {
      ctx.fillStyle = 'rgba(80,70,60,0.45)';
      ctx.fillRect(x - 3, 0, 6, h);
    });
    const g = ctx.createLinearGradient(0, h * 0.75, 0, h);
    g.addColorStop(0, 'rgba(90,75,60,0)');
    g.addColorStop(1, 'rgba(90,75,60,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.75, w, h * 0.25);
  });
}

// Porte A : grands panneaux d'acier gris, voyant triangulaire.
export function aDoorCanvas(glow = false) {
  return paint(`ascV-aDoor-${glow}`, 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = glow ? '#000' : '#4a4e58';
    ctx.fillRect(0, 0, w, h);
    if (!glow) {
      [0, w / 2].forEach((x) => {
        roundRect(ctx, x + 18, 18, w / 2 - 36, h - 36, 14);
        ctx.fillStyle = '#545964';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 4;
        ctx.stroke();
      });
      ctx.fillStyle = '#2d3038';
      ctx.fillRect(w / 2 - 6, 0, 12, h);
    }
    ctx.fillStyle = glow ? '#f4f1e6' : '#f7f4ea';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 44, h - 110);
    ctx.lineTo(w / 2 + 44, h - 110);
    ctx.lineTo(w / 2, h - 60);
    ctx.closePath();
    ctx.fill();
  });
}

// Fenêtre cintrée (cadre crème, vitre sombre, rideau) sur fond transparent.
export function archWindowCanvas() {
  return paint('ascV-archWindow', 256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const r = w / 2;
    const path = (inset) => {
      ctx.beginPath();
      ctx.moveTo(inset, h - inset);
      ctx.lineTo(inset, r);
      ctx.arc(r, r, r - inset, Math.PI, 0);
      ctx.lineTo(w - inset, h - inset);
      ctx.closePath();
    };
    path(0);
    ctx.fillStyle = '#eadfca';
    ctx.fill();
    path(26);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5d6784');
    g.addColorStop(1, '#2d3346');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    path(26);
    ctx.clip();
    ctx.fillStyle = 'rgba(238,214,180,0.55)';
    ctx.fillRect(w * 0.55, r * 0.6, w * 0.3, h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(30, h * 0.2);
    ctx.lineTo(w * 0.45, h * 0.2);
    ctx.lineTo(30, h * 0.6);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#eadfca';
    ctx.fillRect(w / 2 - 6, r * 0.4, 12, h);
  });
}
