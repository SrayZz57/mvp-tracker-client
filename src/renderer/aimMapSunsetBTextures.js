import { rng, paint, blotches } from './aimArenaAscent.js';

// Matières du site B de Sunset (aimMapSunsetB.js), dans le style du jeu :
// Los Angeles Art déco au coucher du soleil — béton beige en panneaux, filets
// cuivrés, bleu ardoise, brique orangée, grandes dalles claires bordées de
// bandes grises. Dessinées en code d'après les captures officielles du patch
// 9.08 : aucune texture de Riot n'est reprise (dépôt public).

const hashKey = (key) => [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function jitter(hex, rand, amount = 8) {
  const d = (rand() - 0.5) * 2 * amount;
  const [r, g, b] = hexToRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c + d))));
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

// Panneau peint : aplat, dégradé doux, liseré clair en haut, sombre en bas.
function panel(ctx, x, y, w, h, color, { r = 4, light = 0.1, dark = 0.12 } = {}) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(255,248,240,${light})`);
  g.addColorStop(0.5, 'rgba(255,248,240,0)');
  g.addColorStop(1, `rgba(50,35,45,${dark})`);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

// --- Sols -----------------------------------------------------------------------

// Grandes dalles beige rosé (~90 cm) encadrées de bandes gris-violet, comme
// sur le site B (3,6 m de côté : 3 × 3 dalles et une bande).
export function plazaTilesCanvas() {
  return paint('snV-tiles', 1024, 1024, (ctx, s) => {
    const rand = rng(701);
    ctx.fillStyle = '#8f8088';
    ctx.fillRect(0, 0, s, s);
    const band = 64;
    const cell = (s - band) / 3;
    // Bande grise sur deux côtés : elle forme un quadrillage en tuilant.
    ctx.fillStyle = '#9a8d97';
    ctx.fillRect(0, 0, s, band);
    ctx.fillRect(0, 0, band, s);
    for (let k = 0; k < s; k += 128) {
      panel(ctx, k + 3, 4, 122, band - 8, jitter('#a2949e', rand, 5), { r: 3 });
      panel(ctx, 4, k + 3, band - 8, 122, jitter('#a2949e', rand, 5), { r: 3 });
    }
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        panel(ctx, band + i * cell + 4, band + j * cell + 4, cell - 8, cell - 8, jitter('#d9c1b4', rand, 7), { r: 4, light: 0.12, dark: 0.08 });
      }
    }
    // Quelques dalles plus sombres, comme sur les captures.
    for (let k = 0; k < 2; k += 1) {
      const i = Math.floor(rand() * 3);
      const j = Math.floor(rand() * 3);
      ctx.fillStyle = 'rgba(90,70,80,0.22)';
      ctx.fillRect(band + i * cell + 30, band + j * cell + 30, cell - 60, cell - 60);
    }
    blotches(ctx, s, s, rand, 16, [[255, 250, 245, 0.05], [60, 45, 55, 0.05]], 120, 300);
  });
}

// Parquet du hall du cinéma (B Main), lames brunes (2 m de côté).
export function woodFloorCanvas() {
  return paint('snV-wood', 512, 512, (ctx, s) => {
    const rand = rng(702);
    ctx.fillStyle = '#5a3b2e';
    ctx.fillRect(0, 0, s, s);
    const lw = 32;
    for (let x = 0; x < s; x += lw) {
      let y = -rand() * 200;
      while (y < s) {
        const len = 160 + rand() * 220;
        panel(ctx, x + 1, y + 1, lw - 2, len - 2, jitter('#8a5a44', rand, 12), { r: 2, light: 0.08, dark: 0.1 });
        y += len;
      }
    }
    blotches(ctx, s, s, rand, 20, [[255, 220, 190, 0.05], [30, 15, 10, 0.08]], 60, 180);
  });
}

// --- Murs -----------------------------------------------------------------------

// Béton beige coulé en grands panneaux (4 m de côté), joints fins.
export function concreteCanvas(key, base) {
  return paint(`snV-concrete-${key}`, 1024, 1024, (ctx, s) => {
    const rand = rng(hashKey(key) + 17);
    ctx.fillStyle = '#8c8084';
    ctx.fillRect(0, 0, s, s);
    const rows = [0, 256, 640, 1024];
    for (let r = 0; r < rows.length - 1; r += 1) {
      const cols = r === 1 ? [0, 512, 1024] : [0, 384, 1024];
      for (let c = 0; c < cols.length - 1; c += 1) {
        panel(ctx, cols[c] + 3, rows[r] + 3, cols[c + 1] - cols[c] - 6, rows[r + 1] - rows[r] - 6, jitter(base, rand, 5), { r: 2, light: 0.08, dark: 0.1 });
      }
    }
    // Trous de banche.
    for (let i = 0; i < 18; i += 1) {
      ctx.fillStyle = 'rgba(70,55,60,0.25)';
      ctx.beginPath();
      ctx.arc(rand() * s, rand() * s, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    blotches(ctx, s, s, rand, 22, [[255, 250, 245, 0.05], [70, 55, 65, 0.06]], 120, 320);
  });
}

// Brique orangée des immeubles (2 m de côté).
export function brickCanvas() {
  return paint('snV-brick', 1024, 1024, (ctx, s) => {
    const rand = rng(703);
    ctx.fillStyle = '#b89583';
    ctx.fillRect(0, 0, s, s);
    const bh = 34;
    const bw = 104;
    for (let r = 0; r * bh < s; r += 1) {
      const off = r % 2 ? bw / 2 : 0;
      for (let x = -bw; x < s + bw; x += bw) {
        const color = jitter(['#b96a4c', '#c27455', '#ad6045', '#c47d5c'][Math.floor(rand() * 4)], rand, 6);
        [0, s].forEach((dx) => panel(ctx, x + off + 3 - dx, r * bh + 3, bw - 6, bh - 6, color, { r: 3, light: 0.1, dark: 0.12 }));
      }
    }
    blotches(ctx, s, s, rand, 18, [[255, 235, 220, 0.06], [70, 40, 40, 0.06]], 120, 300);
  });
}

// Marbre clair du hall du cinéma (3 m de côté).
export function marbleCanvas() {
  return paint('snV-marble', 512, 512, (ctx, s) => {
    const rand = rng(704);
    ctx.fillStyle = '#ddd0c7';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i += 1) {
      ctx.strokeStyle = `rgba(150,130,125,${0.08 + rand() * 0.08})`;
      ctx.lineWidth = 2 + rand() * 3;
      ctx.beginPath();
      let x = rand() * s;
      let y = rand() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k += 1) {
        x += (rand() - 0.3) * 90;
        y += (rand() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,100,100,0.3)';
    ctx.fillRect(0, s / 2 - 1, s, 2);
    ctx.fillRect(s / 2 - 1, 0, 2, s);
  });
}

// Pilier Art déco du site (une face entière) : soubassement sombre, filets
// cuivrés, panneaux en retrait et fente de verre vert au centre.
export function pillarCanvas() {
  return paint('snV-pillar', 512, 2048, (ctx, w, h) => {
    const rand = rng(705);
    ctx.fillStyle = '#b3a4a3';
    ctx.fillRect(0, 0, w, h);
    // Panneaux de béton.
    for (let y = 0; y < h; y += 256) panel(ctx, 6, y + 4, w - 12, 248, jitter('#bcadab', rand, 4), { r: 2, light: 0.08, dark: 0.08 });
    // Montants latéraux en retrait.
    [[20, 70], [w - 90, 70]].forEach(([x, pw]) => {
      ctx.fillStyle = 'rgba(80,60,70,0.18)';
      ctx.fillRect(x, 260, pw, h - 560);
    });
    // Deux fentes vitrées vertes, étroites, sur le haut du pilier.
    [w / 2 - 110, w / 2 + 60].forEach((x) => {
      ctx.fillStyle = '#2d3b43';
      ctx.fillRect(x - 8, 110, 66, 820);
      const g = ctx.createLinearGradient(0, 120, 0, 920);
      g.addColorStop(0, '#a8ecd0');
      g.addColorStop(1, '#5c9c90');
      ctx.fillStyle = g;
      ctx.fillRect(x, 120, 50, 800);
      ctx.fillStyle = 'rgba(30,45,50,0.45)';
      for (let y = 160; y < 920; y += 90) ctx.fillRect(x, y, 50, 5);
    });
    // Lames verticales bleu ardoise au milieu.
    ctx.fillStyle = '#4f5d70';
    ctx.fillRect(w / 2 - 110, 980, 220, h - 1640);
    for (let x = w / 2 - 104; x < w / 2 + 104; x += 18) {
      ctx.fillStyle = '#6d7f94';
      ctx.fillRect(x, 990, 10, h - 1660);
    }
    // Filets cuivrés et soubassement.
    ctx.fillStyle = '#d98a52';
    ctx.fillRect(0, h - 640, w, 24);
    ctx.fillRect(0, 150, w, 16);
    ctx.fillStyle = '#6d6a78';
    ctx.fillRect(0, h - 616, w, 30);
    ctx.fillStyle = '#7d7584';
    ctx.fillRect(0, h - 380, w, 380);
    ctx.fillStyle = 'rgba(40,30,40,0.25)';
    for (let x = 0; x < w; x += 128) ctx.fillRect(x, h - 380, 3, 380);
    ctx.fillStyle = '#d98a52';
    ctx.fillRect(0, h - 392, w, 12);
  });
}

// --- Objets ---------------------------------------------------------------------

// Caisse en planches brunes cerclée de bois plus sombre.
export function woodCrateCanvas() {
  return paint('snV-woodCrate', 512, 512, (ctx, s) => {
    const rand = rng(706);
    ctx.fillStyle = '#6e4632';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 64) panel(ctx, 4, y + 3, s - 8, 58, jitter('#b27a52', rand, 10), { r: 3 });
    ctx.fillStyle = '#7c5139';
    [0, s - 40].forEach((x) => ctx.fillRect(x, 0, 40, s));
    [0, s - 40].forEach((y) => ctx.fillRect(0, y, s, 40));
    ctx.fillStyle = 'rgba(255,230,200,0.12)';
    ctx.fillRect(0, 0, s, 6);
  });
}

// Bac de recyclage vert.
export function recycleCanvas() {
  return paint('snV-recycle', 256, 256, (ctx, s) => {
    ctx.fillStyle = '#7f9b6a';
    ctx.fillRect(0, 0, s, s);
    panel(ctx, 12, 12, s - 24, s - 24, '#8fae78', { r: 10 });
    ctx.strokeStyle = '#e8efe0';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2 + 10, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e8efe0';
    [0, 2.1, 4.2].forEach((a) => {
      ctx.save();
      ctx.translate(s / 2 + Math.cos(a) * 42, s / 2 + 10 + Math.sin(a) * 42);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(10, 0);
      ctx.lineTo(-10, 8);
      ctx.fill();
      ctx.restore();
    });
  });
}

// Garde-corps Art déco (croisillons) sur fond transparent.
export function railingCanvas() {
  return paint('snV-railing', 512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#6b5a55';
    ctx.lineWidth = 7;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.lineWidth = 5;
    for (let x = 0; x < w; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x + 4, h - 6);
      ctx.lineTo(x + 64, 6);
      ctx.lineTo(x + 124, h - 6);
      ctx.moveTo(x + 4, 6);
      ctx.lineTo(x + 64, h - 6);
      ctx.lineTo(x + 124, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 128, 4);
      ctx.lineTo(x + 128, h - 4);
      ctx.stroke();
    }
  });
}

// Ciel de coucher de soleil : bleu en haut, violet puis rose-orangé à l'horizon.
export function sunsetSkyCanvas() {
  return paint('snV-sky', 64, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5f7ec9');
    g.addColorStop(0.3, '#8f8fd6');
    g.addColorStop(0.44, '#d7a3cf');
    g.addColorStop(0.5, '#f4b893');
    g.addColorStop(0.53, '#f6c9a2');
    g.addColorStop(1, '#8a7a92');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// Silhouettes de la ville au loin (façades à fenêtres éclairées).
export function cityCanvas() {
  return paint('snV-city', 256, 512, (ctx, w, h) => {
    const rand = rng(707);
    ctx.fillStyle = '#9d8fa8';
    ctx.fillRect(0, 0, w, h);
    for (let y = 16; y < h; y += 28) {
      for (let x = 12; x < w; x += 24) {
        ctx.fillStyle = rand() < 0.25 ? 'rgba(255,214,160,0.7)' : 'rgba(70,60,90,0.35)';
        ctx.fillRect(x, y, 12, 16);
      }
    }
  });
}
