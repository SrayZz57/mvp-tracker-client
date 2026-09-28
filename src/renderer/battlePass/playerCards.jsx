// Cartes de joueur du Battle Pass : des visuels ORIGINAUX de MVP Tracker,
// dessinés en SVG (dégradés, formes, lueurs), dans l'esprit des cartes de joueur
// des jeux de tir : bannière large, sujet fort, contrastes marqués. Aucun visuel
// tiers : rien à télécharger, rien qui pèse dans le build, et un rendu net à
// toutes les tailles.
//
// Chaque carte est un SVG 452×128 (le ratio d'une bannière de profil) posé en
// image de fond : il s'adapte à toute zone avec `cover`, donc les mêmes cartes
// servent de miniature, de bannière d'ami et d'aperçu géant.

const W = 452;
const H = 128;

// Petits éléments récurrents.
const glow = (id, blur) =>
  `<filter id='${id}' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='${blur}'/></filter>`;
const corners = (c) =>
  `<g fill='none' stroke='${c}' stroke-width='2' opacity='.85'>` +
  `<path d='M6 20V6h14M${W - 20} 6h14v14M${W - 6} ${H - 20}v14h-14M20 ${H - 6}H6v-14'/></g>`;
const vignette =
  `<defs><linearGradient id='v' x1='0' y1='0' x2='0' y2='1'><stop offset='.6' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.55'/></linearGradient></defs>` +
  `<rect width='${W}' height='${H}' fill='url(#v)'/>`;

const dots = (x, y, cols, rows, gap, color, r = 1.3) => {
  let out = '';
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out += `<circle cx='${x + i * gap}' cy='${y + j * gap}' r='${r}'/>`;
  return `<g fill='${color}'>${out}</g>`;
};

const CARDS = {
  // Recon : le réticule d'un tireur d'élite, vert froid.
  recon: `
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#071512'/><stop offset='1' stop-color='#14382f'/></linearGradient>
      <pattern id='st' width='14' height='14' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><rect width='6' height='14' fill='#5fe8c0' opacity='.06'/></pattern>
      <radialGradient id='hl' cx='.78' cy='.5' r='.5'><stop offset='0' stop-color='#5fe8c0' stop-opacity='.45'/><stop offset='1' stop-color='#5fe8c0' stop-opacity='0'/></radialGradient>
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/><rect width='${W}' height='${H}' fill='url(#st)'/><rect width='${W}' height='${H}' fill='url(#hl)'/>
    ${dots(24, 22, 9, 5, 14, '#5fe8c0', 1.1).replace('<g ', "<g opacity='.35' ")}
    <g fill='none' stroke='#5fe8c0' stroke-width='2'>
      <circle cx='352' cy='64' r='48' opacity='.9'/><circle cx='352' cy='64' r='30' opacity='.6'/><circle cx='352' cy='64' r='5' fill='#5fe8c0'/>
      <path d='M352 4v34M352 90v34M292 64h34M378 64h34' stroke-width='2.5'/>
      <path d='M316 28l8 8M388 28l-8 8M316 100l8-8M388 100l-8-8' opacity='.5'/>
    </g>
    <rect x='0' y='112' width='190' height='4' fill='#5fe8c0' opacity='.7'/><rect x='0' y='119' width='110' height='2' fill='#5fe8c0' opacity='.4'/>
    ${vignette}${corners('#5fe8c0')}`,

  // Flick : entailles rouges et vitesse, le geste du flick.
  flick: `
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#120608'/><stop offset='1' stop-color='#2b0c12'/></linearGradient>
      <linearGradient id='sl' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ff4655' stop-opacity='0'/><stop offset='.5' stop-color='#ff4655'/><stop offset='1' stop-color='#ff8a94'/></linearGradient>
      ${glow('g', 5)}
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/>
    <g filter='url(#g)' opacity='.8'><polygon points='150,128 250,0 300,0 200,128' fill='#ff4655'/></g>
    <polygon points='120,128 220,0 250,0 150,128' fill='url(#sl)' opacity='.85'/>
    <polygon points='210,128 310,0 322,0 222,128' fill='#fff' opacity='.9'/>
    <polygon points='330,128 420,0 452,0 452,128' fill='#ff4655' opacity='.18'/>
    <g stroke='#ff4655' stroke-width='1.5' opacity='.55'>
      <path d='M0 30h140M20 46h110M0 62h100M30 78h120M0 94h80'/>
    </g>
    <g fill='none' stroke='#ff4655' stroke-width='2.5'><circle cx='388' cy='64' r='36'/><circle cx='388' cy='64' r='20' opacity='.7'/></g><circle cx='388' cy='64' r='6' fill='#fff'/>
    ${vignette}${corners('#ff4655')}`,

  // Tracer : traînées de balles néon.
  tracer: `
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0c0620'/><stop offset='1' stop-color='#1d0a3e'/></linearGradient>
      <linearGradient id='t1' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ff3df0' stop-opacity='0'/><stop offset='.7' stop-color='#ff3df0'/><stop offset='1' stop-color='#fff'/></linearGradient>
      <linearGradient id='t2' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#36e6ff' stop-opacity='0'/><stop offset='.7' stop-color='#36e6ff'/><stop offset='1' stop-color='#fff'/></linearGradient>
      ${glow('g', 4)}
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/>
    <g fill='none' stroke-linecap='round'>
      <g filter='url(#g)' stroke-width='8' opacity='.7'>
        <path d='M-10 104C120 100 220 70 430 34' stroke='url(#t1)'/><path d='M-10 122C140 116 250 96 440 70' stroke='url(#t2)'/>
      </g>
      <path d='M-10 104C120 100 220 70 430 34' stroke='url(#t1)' stroke-width='3'/>
      <path d='M-10 122C140 116 250 96 440 70' stroke='url(#t2)' stroke-width='3'/>
      <path d='M-10 84C90 82 190 52 330 22' stroke='url(#t1)' stroke-width='1.5' opacity='.6'/>
    </g>
    <circle cx='430' cy='34' r='7' fill='#fff'/><circle cx='430' cy='34' r='16' fill='#ff3df0' opacity='.35' filter='url(#g)'/>
    <circle cx='440' cy='70' r='5' fill='#fff'/>
    ${dots(300, 14, 8, 2, 16, '#fff', 1).replace('<g ', "<g opacity='.3' ")}
    ${vignette}${corners('#ff3df0')}`,

  // Overdrive : bandes de chantier et éclair jaune.
  overdrive: `
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#14110a'/><stop offset='1' stop-color='#26200c'/></linearGradient>
      <pattern id='hz' width='28' height='28' patternUnits='userSpaceOnUse' patternTransform='rotate(-45)'><rect width='14' height='28' fill='#ffd400'/></pattern>
      <radialGradient id='hl' cx='.72' cy='.5' r='.45'><stop offset='0' stop-color='#ffd400' stop-opacity='.5'/><stop offset='1' stop-color='#ffd400' stop-opacity='0'/></radialGradient>
      ${glow('g', 6)}
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/><rect width='${W}' height='${H}' fill='url(#hl)'/>
    <rect x='0' y='0' width='${W}' height='12' fill='url(#hz)' opacity='.9'/><rect x='0' y='116' width='${W}' height='12' fill='url(#hz)' opacity='.9'/>
    <g filter='url(#g)'><polygon points='330,14 270,70 306,70 288,114 372,52 332,52 356,14' fill='#ffd400'/></g>
    <polygon points='330,14 270,70 306,70 288,114 372,52 332,52 356,14' fill='#fff3a0'/>
    <g stroke='#ffd400' stroke-width='2' opacity='.5'><path d='M40 40h120M60 56h90M40 72h130M70 88h80'/></g>
    ${corners('#ffd400')}`,

  // Glacier : éclats de glace.
  glacier: `
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#06172a'/><stop offset='1' stop-color='#114466'/></linearGradient>
      <linearGradient id='ic' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#e8fbff'/><stop offset='1' stop-color='#63c8ff'/></linearGradient>
      <radialGradient id='hl' cx='.7' cy='.4' r='.5'><stop offset='0' stop-color='#9fe6ff' stop-opacity='.45'/><stop offset='1' stop-color='#9fe6ff' stop-opacity='0'/></radialGradient>
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/><rect width='${W}' height='${H}' fill='url(#hl)'/>
    <g fill='url(#ic)'>
      <polygon points='300,128 340,30 372,128' opacity='.9'/><polygon points='350,128 392,4 424,128' opacity='.75'/>
      <polygon points='250,128 280,62 312,128' opacity='.55'/><polygon points='402,128 428,50 452,128' opacity='.6'/>
      <polygon points='200,128 222,84 244,128' opacity='.35'/>
    </g>
    <g fill='#fff' opacity='.7'><polygon points='340,30 346,80 332,80'/><polygon points='392,4 400,60 386,60'/></g>
    <g fill='none' stroke='#bff2ff' stroke-width='1' opacity='.4'><path d='M0 100l90-40 60 20 70-50'/><path d='M0 120l120-30 90 10'/></g>
    ${dots(24, 20, 6, 3, 18, '#fff', 1.4).replace('<g ', "<g opacity='.5' ")}
    ${vignette}${corners('#9fe6ff')}`,

  // Ember : braises et flammes.
  ember: `
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0a0403'/><stop offset='1' stop-color='#3a0f04'/></linearGradient>
      <radialGradient id='hl' cx='.6' cy='1.1' r='.8'><stop offset='0' stop-color='#ff7a1f' stop-opacity='.95'/><stop offset='.5' stop-color='#ff4a0a' stop-opacity='.4'/><stop offset='1' stop-color='#ff4a0a' stop-opacity='0'/></radialGradient>
      <linearGradient id='fl' x1='0' y1='1' x2='0' y2='0'><stop offset='0' stop-color='#ff4a0a'/><stop offset='.6' stop-color='#ff9a3a'/><stop offset='1' stop-color='#ffe08a'/></linearGradient>
      ${glow('g', 4)}
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/><rect width='${W}' height='${H}' fill='url(#hl)'/>
    <g filter='url(#g)' opacity='.7'><path d='M250 128C260 96 244 84 262 56 268 84 290 90 282 128z' fill='#ff6a1a'/></g>
    <g fill='url(#fl)'>
      <path d='M240 128C252 92 232 80 254 46 262 80 288 92 276 128z'/>
      <path d='M296 128C304 104 292 96 306 74 312 98 330 104 322 128z' opacity='.9'/>
      <path d='M200 128C206 110 198 104 208 88 214 106 226 112 220 128z' opacity='.85'/>
      <path d='M340 128C346 112 338 108 348 94 352 110 364 114 360 128z' opacity='.8'/>
    </g>
    <g fill='#ffd27a'>
      <circle cx='270' cy='30' r='2.2'/><circle cx='318' cy='48' r='1.8'/><circle cx='226' cy='58' r='1.6'/><circle cx='352' cy='72' r='1.6'/><circle cx='290' cy='16' r='1.4'/><circle cx='188' cy='76' r='1.4'/><circle cx='372' cy='36' r='1.8'/>
    </g>
    <g stroke='#ff7a1f' stroke-width='1.5' opacity='.5'><path d='M20 40h100M20 54h70M20 68h90'/></g>
    ${corners('#ff8a3a')}`,

  // Vortex : spirale bleu-vert / violet.
  vortex: `
    <defs>
      <radialGradient id='bg' cx='.72' cy='.5' r='.9'><stop offset='0' stop-color='#0a2a35'/><stop offset='1' stop-color='#040b12'/></radialGradient>
      <linearGradient id='sp' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#3df2c4'/><stop offset='1' stop-color='#9b6bff'/></linearGradient>
      ${glow('g', 5)}
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/>
    <g fill='none' stroke='url(#sp)' transform='translate(326 64)' stroke-linecap='round'>
      <g filter='url(#g)' opacity='.7' stroke-width='6'><ellipse rx='120' ry='40' transform='rotate(-14)'/><ellipse rx='84' ry='28' transform='rotate(-14)'/></g>
      <ellipse rx='150' ry='52' transform='rotate(-14)' stroke-width='1.2' opacity='.5'/>
      <ellipse rx='120' ry='40' transform='rotate(-14)' stroke-width='2.2'/>
      <ellipse rx='90' ry='30' transform='rotate(-14)' stroke-width='2.6'/>
      <ellipse rx='60' ry='20' transform='rotate(-14)' stroke-width='3'/>
      <ellipse rx='32' ry='11' transform='rotate(-14)' stroke-width='3.4'/>
    </g>
    <circle cx='326' cy='64' r='7' fill='#fff'/><circle cx='326' cy='64' r='20' fill='#3df2c4' opacity='.35' filter='url(#g)'/>
    ${dots(24, 30, 8, 4, 16, '#3df2c4', 1).replace('<g ', "<g opacity='.3' ")}
    ${vignette}${corners('#3df2c4')}`,

  // Eclipse : soleil noir et couronne dorée.
  eclipse: `
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#08070c'/><stop offset='1' stop-color='#1c1408'/></linearGradient>
      <radialGradient id='hl' cx='.72' cy='.5' r='.5'><stop offset='.35' stop-color='#ffd27a' stop-opacity='.65'/><stop offset='1' stop-color='#ffd27a' stop-opacity='0'/></radialGradient>
      ${glow('g', 4)}
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/><rect width='${W}' height='${H}' fill='url(#hl)'/>
    <g stroke='#ffd27a' stroke-width='1.6' opacity='.55' transform='translate(326 64)'>
      ${Array.from({ length: 32 }, (_, i) => `<line x1='0' y1='-46' x2='0' y2='${-(62 + (i % 3) * 22)}' transform='rotate(${i * 11.25})'/>`).join('')}
    </g>
    <circle cx='326' cy='64' r='44' fill='none' stroke='#ffe6a8' stroke-width='6' filter='url(#g)'/>
    <circle cx='326' cy='64' r='42' fill='#050409' stroke='#ffd27a' stroke-width='2.5'/>
    <g fill='none' stroke='#ffd27a' stroke-width='1.4' opacity='.5'><path d='M20 34h150M20 48h110M20 62h130'/></g>
    <rect x='0' y='112' width='170' height='4' fill='#ffd27a' opacity='.7'/>
    ${vignette}${corners('#ffd27a')}`,

  // Singularité : trou noir et disque d'accrétion (carte du niveau 50).
  singularity: `
    <defs>
      <radialGradient id='bg' cx='.68' cy='.5' r='1'><stop offset='0' stop-color='#1b0838'/><stop offset='1' stop-color='#05030e'/></radialGradient>
      <linearGradient id='ds' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ff6ad5' stop-opacity='0'/><stop offset='.35' stop-color='#ff6ad5'/><stop offset='.5' stop-color='#fff'/><stop offset='.7' stop-color='#9b7bff'/><stop offset='1' stop-color='#9b7bff' stop-opacity='0'/></linearGradient>
      ${glow('g', 6)}
    </defs>
    <rect width='${W}' height='${H}' fill='url(#bg)'/>
    <g fill='#fff' opacity='.85'>
      <circle cx='40' cy='24' r='1.4'/><circle cx='96' cy='96' r='1'/><circle cx='150' cy='40' r='1.6'/><circle cx='210' cy='104' r='1'/><circle cx='250' cy='20' r='1.2'/><circle cx='436' cy='100' r='1.4'/><circle cx='420' cy='18' r='1'/>
    </g>
    <g transform='translate(316 64) rotate(-12)'>
      <ellipse rx='190' ry='26' fill='none' stroke='url(#ds)' stroke-width='14' filter='url(#g)' opacity='.85'/>
      <ellipse rx='190' ry='26' fill='none' stroke='url(#ds)' stroke-width='3'/>
      <ellipse rx='140' ry='18' fill='none' stroke='url(#ds)' stroke-width='2' opacity='.7'/>
    </g>
    <circle cx='316' cy='64' r='34' fill='#ff6ad5' opacity='.3' filter='url(#g)'/>
    <circle cx='316' cy='64' r='30' fill='#02010a' stroke='#ffd0f4' stroke-width='2'/>
    <g transform='translate(316 64) rotate(-12)'><path d='M-190 0Q-100 -6 -34 0M34 0Q100 6 190 0' stroke='#fff' stroke-width='1.6' fill='none' opacity='.7'/></g>
    ${vignette}${corners('#ff6ad5')}`,
};

// --- Détails : un second niveau de dessin par carte (relief, repères, éclats) ----

const ticks = (x1, y1, x2, y2, n, len, color) => {
  let out = '';
  for (let i = 0; i <= n; i++) {
    const x = x1 + ((x2 - x1) * i) / n;
    const y = y1 + ((y2 - y1) * i) / n;
    out += Math.abs(y2 - y1) < 1 ? `<path d='M${x} ${y - len}v${len * 2}'/>` : `<path d='M${x - len} ${y}h${len * 2}'/>`;
  }
  return `<g stroke='${color}' stroke-width='1.2' opacity='.6'>${out}</g>`;
};

const rays = (cx, cy, r1, r2, n, color, width = 1.4) =>
  `<g stroke='${color}' stroke-width='${width}' stroke-linecap='round'>${Array.from(
    { length: n },
    (_, i) => `<line x1='${cx + Math.cos((i * 2 * Math.PI) / n) * r1}' y1='${cy + Math.sin((i * 2 * Math.PI) / n) * r1}' x2='${cx + Math.cos((i * 2 * Math.PI) / n) * r2}' y2='${cy + Math.sin((i * 2 * Math.PI) / n) * r2}'/>`,
  ).join('')}</g>`;

const DETAIL = {
  recon: `
    ${ticks(300, 64, 404, 64, 13, 4, '#5fe8c0')}${ticks(352, 16, 352, 112, 12, 4, '#5fe8c0')}
    <path d='M318 40A44 44 0 0 1 362 22' fill='none' stroke='#fff' stroke-width='2' opacity='.55' stroke-linecap='round'/>
    <text x='24' y='104' fill='#5fe8c0' opacity='.7' font-family='monospace' font-size='9' letter-spacing='2'>RNG 0412 · WIND 02</text>`,
  flick: `
    <g fill='none' stroke='#ff4655'>
      <circle cx='340' cy='64' r='36' opacity='.28' stroke-width='2'/><circle cx='300' cy='64' r='36' opacity='.16' stroke-width='2'/><circle cx='262' cy='64' r='36' opacity='.08' stroke-width='2'/>
    </g>
    <path d='M388 20v16M388 92v16M344 64h16M416 64h16' stroke='#fff' stroke-width='2' opacity='.7'/>`,
  tracer: `
    ${rays(430, 34, 10, 26, 10, '#ff8af5', 1.5)}${rays(440, 70, 8, 20, 8, '#8af1ff', 1.3)}
    <g stroke='#fff' stroke-width='1' opacity='.4'><path d='M300 8L452 8M320 120L452 120'/></g>`,
  overdrive: `
    <polygon points='400,20 372,54 388,54 378,86 420,44 402,44 414,20' fill='#ffd400' opacity='.55'/>
    <g fill='none' stroke='#ffd400' stroke-width='1.5' opacity='.6'><path d='M30 100h60l14-14h50M30 30h40l12 12h70'/><circle cx='154' cy='86' r='3'/><circle cx='152' cy='42' r='3'/></g>
    <g fill='#fff3a0'><circle cx='262' cy='34' r='2'/><circle cx='292' cy='100' r='2.4'/><circle cx='378' cy='100' r='1.6'/></g>`,
  glacier: `
    <g stroke='#e8fbff' stroke-width='1.6' opacity='.8' fill='none' stroke-linecap='round' transform='translate(70 44)'>
      <path d='M0-22V22M-19-11L19 11M-19 11L19-11'/><path d='M-5-18L0-24 5-18M-5 18L0 24 5 18'/>
    </g>
    <g fill='none' stroke='#bff2ff' stroke-width='1' opacity='.45'><path d='M300 128L340 30 372 128M350 128L392 4 424 128'/><path d='M340 30L322 100M392 4L376 90'/></g>`,
  ember: `
    <g fill='none' stroke='#ffb14a' stroke-width='1.4' opacity='.35' stroke-linecap='round'>
      <path d='M180 100c10-8 20 8 30 0s20 8 30 0'/><path d='M310 60c10-8 20 8 30 0s20 8 30 0'/><path d='M120 84c10-8 20 8 30 0'/>
    </g>`,
  vortex: `
    ${rays(326, 64, 24, 30, 36, '#9b6bff', 1)}
    <g fill='#fff' opacity='.7'><circle cx='36' cy='22' r='1.2'/><circle cx='90' cy='104' r='1'/><circle cx='210' cy='20' r='1.4'/><circle cx='430' cy='112' r='1.2'/><circle cx='150' cy='60' r='1'/></g>
    <g fill='none' stroke='#3df2c4' stroke-width='1' opacity='.4'><circle cx='326' cy='64' r='168'/></g>`,
  eclipse: `
    <g fill='none' stroke='#ffd27a' stroke-width='1' opacity='.35'><circle cx='326' cy='64' r='74'/><circle cx='326' cy='64' r='96'/></g>
    <g fill='#ffd27a'><circle cx='326' cy='-10' r='2.6'/><circle cx='400' cy='64' r='2.6'/><circle cx='252' cy='64' r='2.6'/></g>
    <path d='M270 20C290 4 362 4 382 20' fill='none' stroke='#fff' stroke-width='1.6' opacity='.5'/>`,
  singularity: `
    <g fill='none' stroke='#fff' opacity='.55'><circle cx='316' cy='64' r='38' stroke-width='1'/><circle cx='316' cy='64' r='46' stroke-width='.6' opacity='.6'/></g>
    <g stroke-linecap='round'><path d='M316 4V26M316 102V124' stroke='#ffb0ec' stroke-width='3' opacity='.8'/><path d='M316 0V22M316 106V128' stroke='#fff' stroke-width='1.2'/></g>`,
};

// --- Animation : uniquement pour la grande carte (voir `animated`) -----------------
//
// Animations SMIL/CSS d'une image SVG : elles tournent sans JavaScript, mais
// coûtent du dessin en continu. On ne les met donc que sur l'aperçu, jamais sur
// les miniatures ni dans les listes.

const twinkle = (x, y, r, color, dur, begin = 0) =>
  `<circle cx='${x}' cy='${y}' r='${r}' fill='${color}'><animate attributeName='opacity' values='0.1;1;0.1' dur='${dur}s' begin='${begin}s' repeatCount='indefinite'/></circle>`;

const rise = (x, y, dur, begin, color = '#ffd27a') =>
  `<circle cx='${x}' cy='${y}' r='2' fill='${color}' opacity='0'>` +
  `<animateTransform attributeName='transform' type='translate' values='0 0;6 -70' dur='${dur}s' begin='${begin}s' repeatCount='indefinite'/>` +
  `<animate attributeName='opacity' values='0;1;0' dur='${dur}s' begin='${begin}s' repeatCount='indefinite'/></circle>`;

const ANIM = {
  recon: `
    <circle cx='352' cy='64' r='58' fill='none' stroke='#5fe8c0' stroke-width='2' stroke-dasharray='3 11' opacity='.8'>
      <animateTransform attributeName='transform' type='rotate' from='0 352 64' to='360 352 64' dur='14s' repeatCount='indefinite'/></circle>
    <rect width='${W}' height='2' fill='#5fe8c0' opacity='.35'><animate attributeName='y' values='0;126;0' dur='6s' repeatCount='indefinite'/></rect>`,
  flick: `
    <circle cx='388' cy='64' r='20' fill='none' stroke='#ff4655' stroke-width='2'>
      <animate attributeName='r' values='20;60' dur='1.8s' repeatCount='indefinite'/><animate attributeName='opacity' values='.9;0' dur='1.8s' repeatCount='indefinite'/></circle>
    <g stroke='#ff8a94' stroke-width='1.5'><path d='M0 100h90'><animate attributeName='opacity' values='0;.8;0' dur='1.4s' repeatCount='indefinite'/></path><path d='M20 112h70'><animate attributeName='opacity' values='0;.8;0' dur='1.4s' begin='.5s' repeatCount='indefinite'/></path></g>`,
  tracer: `
    <circle r='4' fill='#fff'><animateMotion dur='2.6s' repeatCount='indefinite' path='M-10 104C120 100 220 70 430 34'/></circle>
    <circle r='3.4' fill='#c8f8ff'><animateMotion dur='3.1s' begin='.7s' repeatCount='indefinite' path='M-10 122C140 116 250 96 440 70'/></circle>
    <circle cx='430' cy='34' r='10' fill='#ff3df0' opacity='.4'><animate attributeName='r' values='8;18;8' dur='1.6s' repeatCount='indefinite'/></circle>`,
  overdrive: `
    <polygon points='330,14 270,70 306,70 288,114 372,52 332,52 356,14' fill='#fff'>
      <animate attributeName='opacity' values='0;0;.9;0;.5;0;0' dur='3.2s' repeatCount='indefinite'/></polygon>
    ${twinkle(262, 34, 2, '#fff', 1.4)}${twinkle(292, 100, 2.4, '#fff3a0', 1.9, 0.4)}${twinkle(378, 100, 1.8, '#fff', 1.2, 0.8)}`,
  glacier: `
    ${twinkle(340, 30, 2.4, '#fff', 2)}${twinkle(392, 8, 2.4, '#fff', 2.6, 0.5)}${twinkle(70, 44, 2.6, '#fff', 2.2, 1)}${twinkle(250, 70, 2, '#e8fbff', 1.8, 0.3)}${twinkle(424, 60, 2, '#fff', 2.4, 1.2)}
    <rect x='-80' y='0' width='40' height='128' fill='#fff' opacity='.10' transform='skewX(-20)'><animate attributeName='x' values='-80;520' dur='5.5s' repeatCount='indefinite'/></rect>`,
  ember: `${rise(250, 118, 3.2, 0)}${rise(300, 118, 2.6, 0.8)}${rise(340, 118, 3.6, 1.4)}${rise(210, 118, 2.9, 0.3)}${rise(270, 118, 3.4, 2, '#ffb14a')}${rise(320, 118, 2.8, 1.1, '#ffb14a')}${rise(360, 118, 3.1, 0.6)}${rise(230, 118, 2.7, 1.7)}
    <path d='M240 128C252 92 232 80 254 46 262 80 288 92 276 128z' fill='#ffe08a' opacity='.25'><animate attributeName='opacity' values='.1;.4;.1' dur='1.3s' repeatCount='indefinite'/></path>`,
  vortex: `
    <g transform='translate(326 64) rotate(-14)'>
      <circle r='4' fill='#fff'><animateMotion dur='4s' repeatCount='indefinite' path='M-90 0a90 30 0 1 0 180 0a90 30 0 1 0 -180 0'/></circle>
      <circle r='3' fill='#3df2c4'><animateMotion dur='6s' repeatCount='indefinite' path='M-120 0a120 40 0 1 1 240 0a120 40 0 1 1 -240 0'/></circle>
      <circle r='3' fill='#9b6bff'><animateMotion dur='3s' repeatCount='indefinite' path='M-60 0a60 20 0 1 0 120 0a60 20 0 1 0 -120 0'/></circle>
    </g>
    <circle cx='326' cy='64' r='12' fill='#3df2c4' opacity='.4'><animate attributeName='r' values='10;22;10' dur='2.4s' repeatCount='indefinite'/></circle>`,
  eclipse: `
    <circle cx='326' cy='64' r='72' fill='none' stroke='#ffd27a' stroke-width='3' stroke-dasharray='2 9' opacity='.8'>
      <animateTransform attributeName='transform' type='rotate' from='0 326 64' to='360 326 64' dur='30s' repeatCount='indefinite'/></circle>
    <circle cx='326' cy='64' r='46' fill='none' stroke='#fff2c8' stroke-width='3'><animate attributeName='opacity' values='.2;.8;.2' dur='3s' repeatCount='indefinite'/></circle>`,
  singularity: `
    <g transform='translate(316 64) rotate(-12)'>
      <circle r='4' fill='#fff'><animateMotion dur='3.2s' repeatCount='indefinite' path='M-190 0a190 26 0 1 0 380 0a190 26 0 1 0 -380 0'/></circle>
      <circle r='3' fill='#ff8af0'><animateMotion dur='4.6s' begin='1s' repeatCount='indefinite' path='M-140 0a140 18 0 1 0 280 0a140 18 0 1 0 -280 0'/></circle>
    </g>
    ${twinkle(40, 24, 1.6, '#fff', 2)}${twinkle(150, 40, 1.8, '#fff', 2.6, 0.6)}${twinkle(250, 20, 1.4, '#ffd0f4', 1.8, 1)}${twinkle(436, 100, 1.6, '#fff', 2.2, 0.3)}
    <circle cx='316' cy='64' r='36' fill='none' stroke='#ff6ad5' stroke-width='2'><animate attributeName='opacity' values='.1;.7;.1' dur='2.8s' repeatCount='indefinite'/></circle>`,
};

// Finition commune : grain, fines lignes de balayage et reflet diagonal. C'est ce
// qui casse l'aplat « vectoriel » et donne du matériau à toutes les cartes.
const FINISH =
  `<defs><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='7'/>` +
  `<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/></filter>` +
  `<pattern id='sc' width='4' height='4' patternUnits='userSpaceOnUse'><rect width='4' height='1' fill='#000' opacity='.10'/></pattern>` +
  `<linearGradient id='gl' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.10'/><stop offset='.45' stop-color='#fff' stop-opacity='0'/></linearGradient></defs>` +
  `<rect width='${W}' height='${H}' filter='url(#n)' opacity='.08'/><rect width='${W}' height='${H}' fill='url(#sc)'/>` +
  `<polygon points='0,0 230,0 120,${H} 0,${H}' fill='url(#gl)'/>`;

const svgUrl = (body) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMidYMid slice'>${body}</svg>`)}")`;

// Corps SVG d'une carte. Les coins de cadre (à la fin de chaque carte) restent au-dessus.
const compose = (key, animated) => `${CARDS[key]}${DETAIL[key] ?? ''}${FINISH}${animated ? (ANIM[key] ?? '') : ''}`;

const build = (animated) => Object.fromEntries(Object.keys(CARDS).map((key) => [key, svgUrl(compose(key, animated))]));
const STATIC = build(false);
const ANIMATED = build(true);

export const PLAYER_CARDS = Object.fromEntries(Object.keys(CARDS).map((key) => [key, { image: STATIC[key], animatedImage: ANIMATED[key] }]));

export const cardStyle = (key, animated = false) => {
  const card = PLAYER_CARDS[key];
  if (!card) return undefined;
  return {
    backgroundColor: '#0d0f15',
    backgroundImage: animated ? card.animatedImage : card.image,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
};

// `cardId` est l'id de la récompense (« card:recon »).
export const cardKeyFromId = (cardId) => (cardId ? cardId.replace(/^card:/, '') : null);

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Carte prête à poser : <PlayerCardArt cardId="card:recon" className="…" />.
// `animated` : version animée (aperçu seulement), ignorée si l'utilisateur a
// réduit les animations dans Windows. Un reflet lumineux la traverse (CSS).
export default function PlayerCardArt({ cardId, className = '', animated = false, children }) {
  const style = cardStyle(cardKeyFromId(cardId), animated && !prefersReducedMotion());
  if (!style) return null;
  return (
    <div className={`player-card-art ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

// La carte « en vrai » : cadre biseauté aux couleurs de la rareté, plaque avec
// l'avatar, le pseudo et le titre, et un effet holographique qui suit la souris
// (rarétés épique et au-dessus). Sert pour le grand aperçu du Battle Pass.
export function PlayerCardFrame({ cardId, rarity, name, title, avatar, levelLabel, rarityLabel }) {
  const holo = rarity !== 'base';

  const onMove = (event) => {
    if (prefersReducedMotion()) return;
    const el = event.currentTarget;
    const box = el.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width;
    const py = (event.clientY - box.top) / box.height;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--rx', `${(0.5 - py) * 9}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * 12}deg`);
  };
  const onLeave = (event) => {
    const el = event.currentTarget;
    ['--rx', '--ry'].forEach((p) => el.style.setProperty(p, '0deg'));
  };

  return (
    <div className="pc-frame" data-rarity={rarity} data-holo={holo ? 'true' : 'false'} onPointerMove={onMove} onPointerLeave={onLeave}>
      <PlayerCardArt cardId={cardId} animated className="pc-art" />
      <span className="pc-glare" aria-hidden="true" />
      {holo && <span className="pc-holo" aria-hidden="true" />}
      <span className="pc-inner" aria-hidden="true" />
      <div className="pc-plate">
        <span className="pc-avatar">{avatar ? <img src={avatar} alt="" /> : <span>{(name || '?').charAt(0).toUpperCase()}</span>}</span>
        <span className="pc-id">
          <strong>{name}</strong>
          {title && <em>« {title} »</em>}
        </span>
        <span className="pc-meta">
          <b>{rarityLabel}</b>
          <i>{levelLabel}</i>
        </span>
      </div>
    </div>
  );
}
