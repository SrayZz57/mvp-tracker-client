// Bruits de tir propres à chaque arme et à chaque skin, synthétisés en Web Audio
// (rien à charger ni à créditer). Chaque son est un empilement de couches courtes :
// « crack » (bruit filtré aigu), corps (bruit grave), « thump » (oscillateur qui
// chute) et une traîne propre au thème du skin.

const noiseBuffers = new WeakMap();

// Mémoire d'une rafale à l'autre : note suivante de Patchbay, régime du turbo
// d'Apex Downforce (remis à zéro après une pause).
const PENTATONIC = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
const patchbayState = { step: 0, last: -1 };
const apexState = { shots: 0, last: -1 };

// Un seul tampon de bruit blanc par contexte audio, réutilisé à chaque tir.
function noiseBuffer(ctx) {
  if (!noiseBuffers.has(ctx)) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return noiseBuffers.get(ctx);
}

function envelope(ctx, at, peak, attack, decay) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return gain;
}

function noiseLayer(ctx, out, at, { type = 'bandpass', freq = 1400, q = 0.7, peak = 0.4, attack = 0.002, decay = 0.1, sweepTo = null }) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, at);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + attack + decay);
  filter.Q.value = q;
  const gain = envelope(ctx, at, peak, attack, decay);
  source.connect(filter).connect(gain).connect(out);
  // Départ aléatoire dans le tampon : deux tirs consécutifs ne sonnent pas identiques.
  source.start(at, Math.random() * 0.8, attack + decay + 0.02);
}

function toneLayer(ctx, out, at, { type = 'sine', from = 110, to = 45, peak = 0.35, attack = 0.002, decay = 0.09, filter = null }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
  const gain = envelope(ctx, at, peak, attack, decay);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    node = osc.connect(f);
  }
  node.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + attack + decay + 0.02);
}

// Légère variation de hauteur et de volume à chaque tir, comme une vraie arme.
function master(ctx, volume) {
  const gain = ctx.createGain();
  gain.gain.value = volume * (0.9 + Math.random() * 0.2);
  gain.connect(ctx.destination);
  return gain;
}

const SHOTS = {
  // Fusil d'assaut classique : claquement sec, corps plein, courte traîne.
  'vandal:standard': (ctx, at) => {
    const out = master(ctx, 1);
    const pitch = 0.94 + Math.random() * 0.12;
    noiseLayer(ctx, out, at, { freq: 2100 * pitch, q: 0.8, peak: 0.45, decay: 0.07 });
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 700, q: 0.5, peak: 0.5, decay: 0.12 });
    toneLayer(ctx, out, at, { from: 95 * pitch, to: 38, peak: 0.45, decay: 0.1 });
    noiseLayer(ctx, out, at + 0.02, { type: 'lowpass', freq: 1200, sweepTo: 300, peak: 0.08, attack: 0.01, decay: 0.28 });
  },

  // Magma : détonation grave et lourde, puis crépitement de braises et grésillement.
  'vandal:magma': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 1500, q: 0.6, peak: 0.35, decay: 0.06 });
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 480, q: 0.7, peak: 0.6, decay: 0.2 });
    toneLayer(ctx, out, at, { from: 75, to: 28, peak: 0.6, decay: 0.2 });
    // Crépitements : petits claquements dispersés sur ~250 ms.
    for (let i = 0; i < 6; i += 1) {
      noiseLayer(ctx, out, at + 0.04 + Math.random() * 0.22, { type: 'highpass', freq: 2500 + Math.random() * 3000, peak: 0.06 + Math.random() * 0.05, attack: 0.001, decay: 0.012 });
    }
    // Grésillement de lave qui s'éteint.
    noiseLayer(ctx, out, at + 0.03, { type: 'highpass', freq: 5000, sweepTo: 2200, peak: 0.035, attack: 0.02, decay: 0.35 });
  },

  // Circuit : décharge d'énergie — balayage descendant, bip numérique, sub-basse.
  'vandal:circuit': (ctx, at) => {
    const out = master(ctx, 0.9);
    toneLayer(ctx, out, at, { type: 'sawtooth', from: 1900, to: 180, peak: 0.22, decay: 0.12, filter: 3200 });
    toneLayer(ctx, out, at, { type: 'square', from: 2600, to: 2400, peak: 0.07, decay: 0.025 });
    toneLayer(ctx, out, at, { from: 85, to: 40, peak: 0.45, decay: 0.09 });
    noiseLayer(ctx, out, at, { freq: 3200, q: 1.4, peak: 0.18, decay: 0.04 });
    // Écho électronique : même balayage, plus faible et plus aigu, juste après.
    toneLayer(ctx, out, at + 0.055, { type: 'triangle', from: 1400, to: 600, peak: 0.05, decay: 0.08 });
  },

  // Céleste : impact cristallin — note de cloche (deux partiels inharmoniques),
  // scintillement aigu qui s'éteint lentement, sous une sub-basse feutrée.
  'vandal:celeste': (ctx, at) => {
    const out = master(ctx, 0.85);
    const root = 520 * (0.97 + Math.random() * 0.06);
    toneLayer(ctx, out, at, { from: root, to: root * 0.98, peak: 0.16, decay: 0.45 });
    toneLayer(ctx, out, at, { from: root * 2.76, to: root * 2.7, peak: 0.07, decay: 0.3 });
    toneLayer(ctx, out, at, { type: 'triangle', from: root * 4.1, to: root * 4.3, peak: 0.04, decay: 0.2 });
    toneLayer(ctx, out, at, { from: 80, to: 42, peak: 0.4, decay: 0.1 });
    noiseLayer(ctx, out, at, { freq: 1900, q: 0.9, peak: 0.22, decay: 0.05 });
    noiseLayer(ctx, out, at + 0.01, { type: 'highpass', freq: 7000, peak: 0.03, attack: 0.03, decay: 0.4 });
  },

  // Dragon de jade : coup de gong grave (partiels inharmoniques qui s'éteignent
  // lentement) et souffle rauque du dragon.
  'vandal:jade': (ctx, at) => {
    const out = master(ctx, 0.9);
    const root = 150 * (0.97 + Math.random() * 0.06);
    [[1, 0.2, 0.55], [1.48, 0.1, 0.45], [2.12, 0.07, 0.35], [2.94, 0.04, 0.25]].forEach(([ratio, peak, decay]) => {
      toneLayer(ctx, out, at, { from: root * ratio * 1.02, to: root * ratio, peak, decay });
    });
    toneLayer(ctx, out, at, { from: 70, to: 32, peak: 0.5, decay: 0.16 });
    noiseLayer(ctx, out, at, { freq: 1700, q: 0.7, peak: 0.28, decay: 0.05 });
    noiseLayer(ctx, out, at + 0.01, { type: 'lowpass', freq: 1400, sweepTo: 250, q: 3, peak: 0.12, attack: 0.02, decay: 0.3 });
  },

  // Horloger : détonation feutrée, cliquetis de rouages, ressort qui vibre et
  // jet de vapeur.
  'vandal:clockwork': (ctx, at) => {
    const out = master(ctx, 0.95);
    noiseLayer(ctx, out, at, { freq: 1600, q: 0.8, peak: 0.35, decay: 0.06 });
    toneLayer(ctx, out, at, { from: 100, to: 40, peak: 0.45, decay: 0.1 });
    [0.03, 0.06, 0.085].forEach((d, i) => {
      toneLayer(ctx, out, at + d, { type: 'square', from: 2400 + i * 700, to: 2300 + i * 700, peak: 0.035, decay: 0.012 });
    });
    toneLayer(ctx, out, at + 0.02, { type: 'triangle', from: 330, to: 310, peak: 0.06, decay: 0.22 });
    noiseLayer(ctx, out, at + 0.05, { type: 'highpass', freq: 3500, sweepTo: 6000, peak: 0.06, attack: 0.02, decay: 0.3 });
  },

  // --- Operator (sniper) ------------------------------------------------------
  // Détonation lourde avec écho, puis la manœuvre de la culasse, calée sur
  // l'animation (sniperModel.js) : levier relevé, culasse tirée, douille qui
  // tinte, culasse repoussée puis verrouillée.
  'sniper:standard': (ctx, at) => sniperShot(ctx, at, {}),
  'sniper:glacier': (ctx, at) =>
    sniperShot(ctx, at, {
      tail: (out, t) => {
        // Craquement de glace puis tintement cristallin qui s'éteint.
        for (let i = 0; i < 5; i += 1) noiseLayer(ctx, out, t + 0.02 + Math.random() * 0.12, { type: 'highpass', freq: 4000 + Math.random() * 3000, peak: 0.06, attack: 0.001, decay: 0.02 });
        [2093, 2637, 3136].forEach((f, i) => toneLayer(ctx, out, t + 0.03 + i * 0.04, { type: 'triangle', from: f, to: f * 0.99, peak: 0.045, decay: 0.6 }));
      },
    }),
  'sniper:void': (ctx, at) =>
    sniperShot(ctx, at, {
      body: 0.5,
      tail: (out, t) => {
        // Boom étiré vers le grave, comme avalé par la singularité.
        toneLayer(ctx, out, t, { from: 90, to: 22, peak: 0.6, decay: 0.7 });
        toneLayer(ctx, out, t + 0.05, { type: 'sawtooth', from: 180, to: 40, peak: 0.08, attack: 0.05, decay: 0.6, filter: 600 });
        noiseLayer(ctx, out, t, { type: 'lowpass', freq: 3000, sweepTo: 120, peak: 0.2, attack: 0.005, decay: 0.8 });
      },
    }),
  'sniper:phoenix': (ctx, at) =>
    sniperShot(ctx, at, {
      tail: (out, t) => {
        // Rugissement de flamme et cri aigu de l'oiseau.
        noiseLayer(ctx, out, t, { type: 'bandpass', freq: 700, sweepTo: 2400, q: 0.8, peak: 0.2, attack: 0.02, decay: 0.45 });
        toneLayer(ctx, out, t + 0.04, { type: 'triangle', from: 1800, to: 2600, peak: 0.05, attack: 0.03, decay: 0.25 });
        toneLayer(ctx, out, t + 0.12, { type: 'triangle', from: 2600, to: 1500, peak: 0.04, decay: 0.3 });
      },
    }),
  'sniper:storm': (ctx, at) =>
    sniperShot(ctx, at, {
      tail: (out, t) => {
        // Claquement électrique sec puis tonnerre qui roule au loin.
        toneLayer(ctx, out, t, { type: 'square', from: 3200, to: 900, peak: 0.08, decay: 0.05 });
        for (let i = 0; i < 6; i += 1) noiseLayer(ctx, out, t + i * 0.01, { type: 'highpass', freq: 5000, peak: 0.08, attack: 0.001, decay: 0.008 });
        noiseLayer(ctx, out, t + 0.15, { type: 'lowpass', freq: 260, q: 0.6, peak: 0.35, attack: 0.08, decay: 1.1 });
      },
    }),
  'sniper:crown': (ctx, at) =>
    sniperShot(ctx, at, {
      tail: (out, t) => {
        // Fanfare de cloches : accord majeur qui résonne.
        [523, 659, 784, 1047].forEach((f, i) => toneLayer(ctx, out, t + i * 0.035, { from: f, to: f, peak: 0.07, attack: 0.005, decay: 0.8 }));
        noiseLayer(ctx, out, t + 0.02, { type: 'highpass', freq: 6000, peak: 0.03, attack: 0.03, decay: 0.5 });
      },
    }),

  // --- Vandal, seconde série ------------------------------------------------------
  'vandal:aurora': (ctx, at) => {
    SHOTS['vandal:standard'](ctx, at);
    const out = master(ctx, 0.6);
    // Nappe éthérée : quinte qui monte doucement puis s'efface.
    [440, 660].forEach((f) => toneLayer(ctx, out, at + 0.02, { type: 'sine', from: f, to: f * 1.01, peak: 0.05, attack: 0.04, decay: 0.5 }));
  },
  'vandal:sakura': (ctx, at) => {
    SHOTS['vandal:standard'](ctx, at);
    const out = master(ctx, 0.6);
    // Pincement de koto : note pincée qui s'éteint.
    [587, 880].forEach((f, i) => toneLayer(ctx, out, at + i * 0.04, { type: 'triangle', from: f * 1.02, to: f, peak: 0.08, attack: 0.002, decay: 0.35 }));
  },
  'vandal:radiation': (ctx, at) => {
    SHOTS['vandal:standard'](ctx, at);
    const out = master(ctx, 0.7);
    // Tics de compteur Geiger qui s'emballent.
    for (let i = 0; i < 8; i += 1) noiseLayer(ctx, out, at + 0.03 + Math.random() * 0.25, { type: 'highpass', freq: 3000, peak: 0.08, attack: 0.001, decay: 0.004 });
  },
  'vandal:pharaoh': (ctx, at) => {
    SHOTS['vandal:standard'](ctx, at);
    const out = master(ctx, 0.6);
    // Sistre : cliquetis métallique, et souffle de sable.
    for (let i = 0; i < 4; i += 1) toneLayer(ctx, out, at + 0.02 + i * 0.03, { type: 'square', from: 3100 + i * 250, to: 3000, peak: 0.025, decay: 0.05 });
    noiseLayer(ctx, out, at + 0.04, { type: 'bandpass', freq: 2500, q: 0.7, peak: 0.05, attack: 0.05, decay: 0.3 });
  },
  'vandal:hologram': (ctx, at) => {
    const out = master(ctx, 0.9);
    // Tir « numérique » : bruit décimé et bips.
    toneLayer(ctx, out, at, { type: 'square', from: 1200, to: 150, peak: 0.16, decay: 0.09, filter: 5000 });
    toneLayer(ctx, out, at, { from: 90, to: 40, peak: 0.45, decay: 0.09 });
    [0.03, 0.06].forEach((d) => toneLayer(ctx, out, at + d, { type: 'square', from: 2600, to: 2600, peak: 0.04, decay: 0.02 }));
  },

  // --- Skins ultimes --------------------------------------------------------------
  'vandal:titan': (ctx, at) => {
    SHOTS['vandal:standard'](ctx, at);
    const out = master(ctx, 0.8);
    // Vérins hydrauliques et décharge du réacteur.
    noiseLayer(ctx, out, at + 0.02, { type: 'bandpass', freq: 400, sweepTo: 1600, q: 2, peak: 0.12, attack: 0.01, decay: 0.12 });
    toneLayer(ctx, out, at, { type: 'sawtooth', from: 160, to: 60, peak: 0.12, decay: 0.2, filter: 900 });
  },
  'vandal:arcane': (ctx, at) => {
    const out = master(ctx, 0.9);
    toneLayer(ctx, out, at, { from: 90, to: 40, peak: 0.4, decay: 0.12 });
    [523, 784, 1047, 1568].forEach((f, i) => toneLayer(ctx, out, at + i * 0.02, { type: 'sine', from: f * 1.5, to: f, peak: 0.06, attack: 0.005, decay: 0.4 }));
    noiseLayer(ctx, out, at, { freq: 3000, q: 1, peak: 0.12, decay: 0.08 });
  },
  'vandal:mercury': (ctx, at) => {
    SHOTS['vandal:standard'](ctx, at);
    const out = master(ctx, 0.7);
    // Goutte liquide : glissando rond et « ploc ».
    toneLayer(ctx, out, at + 0.03, { type: 'sine', from: 400, to: 1200, peak: 0.1, attack: 0.005, decay: 0.08 });
    toneLayer(ctx, out, at + 0.1, { type: 'sine', from: 900, to: 500, peak: 0.06, decay: 0.1 });
  },
  'vandal:sylvan': (ctx, at) => {
    SHOTS['vandal:standard'](ctx, at);
    const out = master(ctx, 0.6);
    // Bruissement de feuilles et carillon de bois.
    noiseLayer(ctx, out, at + 0.03, { type: 'bandpass', freq: 3500, q: 0.6, peak: 0.06, attack: 0.03, decay: 0.3 });
    [659, 988].forEach((f, i) => toneLayer(ctx, out, at + 0.04 + i * 0.05, { type: 'triangle', from: f, to: f, peak: 0.05, decay: 0.25 }));
  },
  'vandal:spectre': (ctx, at) => {
    SHOTS['vandal:standard'](ctx, at);
    const out = master(ctx, 0.6);
    // Souffle spectral et note de shakuhachi.
    noiseLayer(ctx, out, at + 0.02, { type: 'bandpass', freq: 800, sweepTo: 400, q: 6, peak: 0.08, attack: 0.05, decay: 0.45 });
    toneLayer(ctx, out, at + 0.04, { type: 'sine', from: 494, to: 466, peak: 0.07, attack: 0.05, decay: 0.5 });
  },
  'sniper:orbital': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => {
      noiseLayer(ctx, out, t + 0.05, { type: 'lowpass', freq: 800, sweepTo: 2400, peak: 0.12, attack: 0.1, decay: 0.6 });
      [1320, 1760].forEach((f, i) => toneLayer(ctx, out, t + 0.1 + i * 0.12, { type: 'square', from: f, to: f, peak: 0.03, decay: 0.06 }));
    },
  }),
  'sniper:ossuary': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => {
      noiseLayer(ctx, out, t + 0.02, { type: 'bandpass', freq: 300, sweepTo: 120, q: 3, peak: 0.25, attack: 0.04, decay: 0.6 });
      toneLayer(ctx, out, t + 0.03, { type: 'sawtooth', from: 110, to: 70, peak: 0.08, attack: 0.05, decay: 0.5, filter: 500 });
    },
  }),
  'sniper:stained': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => {
      [392, 494, 587, 784].forEach((f, i) => toneLayer(ctx, out, t + 0.02 + i * 0.01, { from: f, to: f, peak: 0.06, attack: 0.005, decay: 1.2 }));
      toneLayer(ctx, out, t + 0.02, { from: 1175, to: 1170, peak: 0.03, decay: 0.8 });
    },
  }),
  'sniper:abyssal': (ctx, at) => sniperShot(ctx, at, {
    body: 0.7,
    tail: (out, t) => {
      noiseLayer(ctx, out, t, { type: 'lowpass', freq: 300, q: 3, peak: 0.3, decay: 0.5 });
      toneLayer(ctx, out, t + 0.1, { type: 'sine', from: 60, to: 90, peak: 0.1, attack: 0.1, decay: 0.8 });
    },
  }),
  // Faille : la réalité qui se déchire (bruit aigu qui glisse vers le bas) et un
  // accord étrange, légèrement désaccordé, qui résonne.
  'sniper:rift': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => {
      noiseLayer(ctx, out, t + 0.005, { type: 'highpass', freq: 7000, sweepTo: 700, q: 1.5, peak: 0.16, attack: 0.004, decay: 0.45 });
      [233, 277, 415, 523].forEach((f, i) => toneLayer(ctx, out, t + 0.02 + i * 0.015, { type: i % 2 ? 'triangle' : 'sine', from: f * 1.01, to: f * 0.97, peak: 0.035, attack: 0.02, decay: 1.2 }));
    },
  }),
  // Locomotive : coup de canon, jet de vapeur puis sifflet à deux tons.
  'sniper:locomotive': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => {
      noiseLayer(ctx, out, t + 0.02, { type: 'highpass', freq: 2500, q: 0.7, peak: 0.12, attack: 0.02, decay: 0.5 });
      [587, 740].forEach((f) => toneLayer(ctx, out, t + 0.15, { type: 'triangle', from: f, to: f * 0.99, peak: 0.04, attack: 0.05, decay: 0.55 }));
    },
  }),
  // Kaléidoscope : détonation qui se diffracte en arpège de verre.
  'sniper:kaleidoscope': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => [1047, 1319, 1568, 2093, 2637].forEach((f, i) => toneLayer(ctx, out, t + 0.03 + i * 0.035, { from: f, to: f, peak: 0.035, attack: 0.003, decay: 0.45 })),
  }),
  // Marbre : impact de pierre, éclats, résonance de salle antique.
  'sniper:marble': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => {
      noiseLayer(ctx, out, t + 0.01, { freq: 1100, q: 6, peak: 0.12, decay: 0.12 });
      for (let i = 0; i < 5; i += 1) noiseLayer(ctx, out, t + 0.05 + Math.random() * 0.25, { freq: 2500 + Math.random() * 2000, q: 4, peak: 0.04, attack: 0.001, decay: 0.02 });
      noiseLayer(ctx, out, t + 0.1, { type: 'lowpass', freq: 900, peak: 0.05, attack: 0.05, decay: 0.9 });
    },
  }),
  // Tisseuse : cordes de harpe pincées en glissando.
  'sniper:weaver': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => [392, 494, 587, 740, 880, 1175].forEach((f, i) => toneLayer(ctx, out, t + 0.05 + i * 0.03, { type: 'triangle', from: f * 1.01, to: f, peak: 0.04, attack: 0.002, decay: 0.7 })),
  }),
  // Corsaire : coup de canon grave et roulant, pièces qui tintent.
  'sniper:corsair': (ctx, at) => sniperShot(ctx, at, {
    body: 1.3,
    tail: (out, t) => {
      toneLayer(ctx, out, t, { from: 55, to: 24, peak: 0.4, decay: 0.6 });
      for (let i = 0; i < 6; i += 1) toneLayer(ctx, out, t + 0.25 + Math.random() * 0.4, { from: 3000 + Math.random() * 1500, to: 2900, peak: 0.025, attack: 0.001, decay: 0.12 });
    },
  }),
  'sniper:supernova': (ctx, at) => sniperShot(ctx, at, {
    tail: (out, t) => {
      noiseLayer(ctx, out, t, { type: 'lowpass', freq: 4000, sweepTo: 150, peak: 0.3, attack: 0.005, decay: 1 });
      toneLayer(ctx, out, t, { from: 50, to: 20, peak: 0.6, decay: 0.8 });
    },
  }),
  'glock:chronos': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    [0.02, 0.07, 0.12, 0.17].forEach((d, i) => toneLayer(ctx, out, t + d, { type: 'square', from: i % 2 ? 2400 : 3000, to: 2400, peak: 0.04, decay: 0.02 }));
  }),
  'glock:monarch': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    noiseLayer(ctx, out, t + 0.02, { type: 'bandpass', freq: 1800, q: 0.8, peak: 0.07, attack: 0.02, decay: 0.2 });
    [1319, 1568].forEach((f, i) => toneLayer(ctx, out, t + 0.05 + i * 0.06, { type: 'sine', from: f, to: f * 1.02, peak: 0.04, decay: 0.2 }));
  }, 0.8),
  'glock:scorpion': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Cliquetis de chitine et sifflement.
    for (let i = 0; i < 4; i += 1) noiseLayer(ctx, out, t + 0.03 + i * 0.025, { type: 'highpass', freq: 3500, peak: 0.06, attack: 0.001, decay: 0.01 });
    noiseLayer(ctx, out, t + 0.12, { type: 'highpass', freq: 5000, peak: 0.04, attack: 0.02, decay: 0.3 });
  }),
  'glock:quantum': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    toneLayer(ctx, out, t, { type: 'sine', from: 200, to: 4000, peak: 0.08, attack: 0.002, decay: 0.12 });
    toneLayer(ctx, out, t + 0.05, { type: 'sine', from: 4000, to: 200, peak: 0.05, decay: 0.15 });
  }),
  // Métamorphe : décharge de rail électrique, sifflement de servo et claquement
  // mécanique des volets, puis condensateurs qui se rechargent.
  'glock:metamorph': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    toneLayer(ctx, out, t, { type: 'square', from: 3200, to: 180, peak: 0.1, decay: 0.09, filter: 4000 });
    noiseLayer(ctx, out, t, { type: 'highpass', freq: 4500, peak: 0.12, decay: 0.05 });
    toneLayer(ctx, out, t + 0.03, { type: 'sawtooth', from: 700, to: 1500, peak: 0.035, attack: 0.01, decay: 0.1, filter: 2500 });
    noiseLayer(ctx, out, t + 0.1, { type: 'lowpass', freq: 400, q: 2, peak: 0.12, attack: 0.001, decay: 0.03 });
    toneLayer(ctx, out, t + 0.14, { from: 500, to: 3800, peak: 0.018, attack: 0.03, decay: 0.28 });
  }),
  'glock:arcade': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    toneLayer(ctx, out, t, { type: 'square', from: 1800, to: 200, peak: 0.12, decay: 0.1 });
    toneLayer(ctx, out, t + 0.1, { type: 'square', from: 880, to: 880, peak: 0.03, decay: 0.04 });
  }, 0.7),
  'glock:hanabi': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Sifflement de fusée qui monte puis crépitement.
    toneLayer(ctx, out, t + 0.02, { from: 900, to: 2800, peak: 0.04, attack: 0.05, decay: 0.3 });
    for (let i = 0; i < 8; i += 1) noiseLayer(ctx, out, t + 0.45 + Math.random() * 0.3, { type: 'highpass', freq: 3000, q: 1, peak: 0.05, attack: 0.001, decay: 0.012 });
    toneLayer(ctx, out, t + 0.45, { from: 90, to: 40, peak: 0.2, decay: 0.3 });
  }),
  'glock:mirage': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    noiseLayer(ctx, out, t + 0.01, { freq: 1200, sweepTo: 400, q: 0.7, peak: 0.12, attack: 0.01, decay: 0.35 });
  }),
  'glock:candy': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // « Pop » de bonbon et petit grincement élastique.
    toneLayer(ctx, out, t, { from: 400, to: 1200, peak: 0.12, attack: 0.004, decay: 0.08 });
    toneLayer(ctx, out, t + 0.06, { type: 'triangle', from: 1800, to: 1400, peak: 0.04, decay: 0.1 });
  }, 0.7),
  'glock:kintsugi': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Tintement de porcelaine et d'or.
    [2093, 3136, 4186].forEach((f, i) => toneLayer(ctx, out, t + i * 0.012, { from: f, to: f * 0.998, peak: 0.05 - i * 0.012, attack: 0.002, decay: 0.5 }));
  }),
  'glock:harlequin': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Grelots.
    [2637, 3136, 2794, 3520].forEach((f, i) => toneLayer(ctx, out, t + 0.02 + i * 0.03, { type: 'triangle', from: f, to: f, peak: 0.04, attack: 0.002, decay: 0.12 }));
  }),

  // Lithosphère : choc de pierre, basse profonde et résonance de bol chantant
  // (partiels inharmoniques), puis grondement magnétique pendant le réalignement
  // des blocs, conclu par un « tink » cristallin quand le dernier revient en place.
  'vandal:lithosphere': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 1200, q: 8, peak: 0.5, decay: 0.07 });
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 500, q: 0.7, peak: 0.45, decay: 0.16 });
    toneLayer(ctx, out, at, { from: 60, to: 34, peak: 0.55, decay: 0.22 });
    [[420, 0.09, 1.4], [1130, 0.05, 1.1], [2310, 0.025, 0.7]].forEach(([f, peak, decay]) => toneLayer(ctx, out, at + 0.01, { from: f, to: f * 0.995, peak, attack: 0.004, decay }));
    // Grondement magnétique : 80 Hz modulé en amplitude par de courtes pulsations.
    for (let i = 0; i < 5; i += 1) toneLayer(ctx, out, at + 0.06 + i * 0.08, { from: 82, to: 78, peak: 0.12 - i * 0.02, attack: 0.02, decay: 0.07 });
    toneLayer(ctx, out, at + 0.42, { type: 'triangle', from: 3520, to: 3500, peak: 0.05, attack: 0.002, decay: 0.3 });
  },
  // Symbiote : attaque humide, basse organique, réverb sous-marine ; puis inspiration et succion.
  'vandal:symbiote': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 900, sweepTo: 300, q: 4, peak: 0.45, decay: 0.12 });
    toneLayer(ctx, out, at, { from: 64, to: 48, peak: 0.5, decay: 0.2 });
    noiseLayer(ctx, out, at + 0.03, { type: 'lowpass', freq: 1500, sweepTo: 400, peak: 0.12, attack: 0.02, decay: 0.55 });
    noiseLayer(ctx, out, at + 0.2, { type: 'bandpass', freq: 400, sweepTo: 1400, q: 2, peak: 0.07, attack: 0.15, decay: 0.2 });
    toneLayer(ctx, out, at + 0.5, { type: 'sine', from: 260, to: 220, peak: 0.06, decay: 0.05 });
  },
  // Héliopause : claquement propre, « thoom » pur, harmonique montante ; recharge qui ronfle puis verrouillage.
  'vandal:heliopause': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 4000, q: 1, peak: 0.35, decay: 0.03 });
    toneLayer(ctx, out, at, { from: 90, to: 30, peak: 0.55, decay: 0.16 });
    toneLayer(ctx, out, at, { type: 'triangle', from: 800, to: 2400, peak: 0.08, decay: 0.2 });
    toneLayer(ctx, out, at + 0.08, { type: 'sawtooth', from: 120, to: 480, peak: 0.05, attack: 0.05, decay: 0.3, filter: 1200 });
    [0.42, 0.45, 0.48].forEach((d) => noiseLayer(ctx, out, at + d, { freq: 2000, q: 4, peak: 0.06, attack: 0.001, decay: 0.012 }));
  },
  // Reliquaire : grave lourd, chœur mineur, réverb de nef ; chaînes et soupir.
  'vandal:reliquary': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 1500, q: 0.8, peak: 0.35, decay: 0.06 });
    toneLayer(ctx, out, at, { from: 72, to: 36, peak: 0.6, decay: 0.28 });
    [220, 262, 330].forEach((f) => toneLayer(ctx, out, at + 0.02, { type: 'sine', from: f, to: f * 0.99, peak: 0.05, attack: 0.03, decay: 1.1 }));
    for (let i = 0; i < 5; i += 1) noiseLayer(ctx, out, at + 0.1 + Math.random() * 0.2, { type: 'highpass', freq: 3500, q: 3, peak: 0.05, attack: 0.001, decay: 0.02 });
    noiseLayer(ctx, out, at + 0.25, { type: 'bandpass', freq: 500, sweepTo: 250, q: 3, peak: 0.07, attack: 0.05, decay: 0.4 });
  },
  // Nullbyte : attaque sèche, corps « bitcrushé », souffle de serveur ; deux bips et ventilateur.
  'vandal:nullbyte': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 3200, q: 1.2, peak: 0.45, decay: 0.02 });
    toneLayer(ctx, out, at, { type: 'square', from: 110, to: 40, peak: 0.25, decay: 0.1, filter: 2500 });
    noiseLayer(ctx, out, at + 0.01, { type: 'bandpass', freq: 2000, q: 1, peak: 0.1, decay: 0.18 });
    toneLayer(ctx, out, at + 0.12, { type: 'square', from: 2600, to: 2600, peak: 0.04, decay: 0.025 });
    toneLayer(ctx, out, at + 0.16, { type: 'square', from: 1900, to: 1900, peak: 0.04, decay: 0.025 });
    noiseLayer(ctx, out, at + 0.2, { type: 'lowpass', freq: 800, peak: 0.05, attack: 0.05, decay: 0.3 });
  },
    // Patchbay : kick de boîte à rythmes, caisse claire filtrée et une note de
  // synthé qui avance dans une gamme pentatonique mineure (une rafale de 8
  // tirs joue une phrase) ; puis « blip » de filtre et clic de relais.
  'vandal:patchbay': (ctx, at) => {
    const out = master(ctx, 1);
    const pitch = 0.96 + Math.random() * 0.08;
    toneLayer(ctx, out, at, { from: 150 * pitch, to: 45, peak: 0.6, decay: 0.09 });
    noiseLayer(ctx, out, at, { freq: 2400, q: 1, peak: 0.35, decay: 0.04 });
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 600, peak: 0.25, decay: 0.08 });
    if (at - patchbayState.last > 0.6) patchbayState.step = 0;
    patchbayState.last = at;
    const f = PENTATONIC[patchbayState.step % PENTATONIC.length];
    patchbayState.step += 1;
    toneLayer(ctx, out, at + 0.005, { type: 'sawtooth', from: f, to: f * 0.998, peak: 0.07, attack: 0.004, decay: 0.11, filter: 2200 });
    toneLayer(ctx, out, at + 0.03, { type: 'square', from: 1300, to: 300, peak: 0.04, decay: 0.12, filter: 2400 });
    noiseLayer(ctx, out, at + 0.15, { type: 'highpass', freq: 4000, q: 2, peak: 0.05, attack: 0.001, decay: 0.008 });
  },
  // Apex Downforce : pétarade de rupteur (trois claquements rapprochés), grave de
  // moteur, sifflement de turbo qui monte d'un demi-ton tous les 3 tirs ; puis
  // « pschitt » de wastegate et passage de rapport séquentiel.
  'vandal:downforce': (ctx, at) => {
    const out = master(ctx, 1);
    [0, 0.008, 0.016].forEach((d, i) => noiseLayer(ctx, out, at + d, { freq: 900, q: 1.4, peak: 0.42 - i * 0.1, decay: 0.03 }));
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 520, peak: 0.4, decay: 0.12 });
    toneLayer(ctx, out, at, { type: 'sawtooth', from: 110, to: 70, peak: 0.28, decay: 0.12, filter: 900 });
    toneLayer(ctx, out, at, { from: 220, to: 140, peak: 0.12, decay: 0.12 });
    if (at - apexState.last > 0.4) apexState.shots = 0;
    apexState.last = at;
    const rev = 2 ** (Math.min(12, Math.floor(apexState.shots / 3)) / 12);
    apexState.shots += 1;
    toneLayer(ctx, out, at + 0.01, { from: 6000 * rev, to: 9000 * rev, peak: 0.025, attack: 0.02, decay: 0.12 });
    noiseLayer(ctx, out, at + 0.06, { type: 'highpass', freq: 3000, peak: 0.07, attack: 0.01, decay: 0.15 });
    noiseLayer(ctx, out, at + 0.1, { freq: 1800, q: 5, peak: 0.08, attack: 0.001, decay: 0.015 });
  },
  // Singularité : implosion (souffle aspiré qui descend), claquement, boom
  // sub-grave qui s'effondre et scintillement d'harmoniques aiguës.
  'vandal:singularity': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 3000, sweepTo: 180, q: 2, peak: 0.25, attack: 0.004, decay: 0.3 });
    noiseLayer(ctx, out, at, { freq: 1800, q: 1, peak: 0.4, decay: 0.035 });
    toneLayer(ctx, out, at, { from: 70, to: 22, peak: 0.65, decay: 0.38 });
    toneLayer(ctx, out, at + 0.01, { type: 'triangle', from: 180, to: 60, peak: 0.12, decay: 0.2 });
    [1760, 2640, 3520].forEach((f, i) => toneLayer(ctx, out, at + 0.03 + i * 0.02, { from: f, to: f * 0.97, peak: 0.02, attack: 0.004, decay: 0.3 }));
  },
  // Origami : claquement de feuille pliée d'un coup sec, froissement, battement d'ailes.
  'vandal:origami': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 2600, q: 1.5, peak: 0.45, decay: 0.03 });
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 600, peak: 0.4, decay: 0.1 });
    toneLayer(ctx, out, at, { from: 120, to: 50, peak: 0.45, decay: 0.1 });
    for (let i = 0; i < 4; i += 1) noiseLayer(ctx, out, at + 0.04 + i * 0.03, { type: 'highpass', freq: 3000 + Math.random() * 2000, q: 1, peak: 0.05, attack: 0.002, decay: 0.02 });
    [0.12, 0.2].forEach((d) => noiseLayer(ctx, out, at + d, { freq: 700, q: 1, peak: 0.06, attack: 0.01, decay: 0.05 }));
  },
  // Essaim : détonation feutrée comme dans la cire, puis bourdonnement qui s'affole.
  'vandal:hive': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 1800, q: 0.9, peak: 0.4, decay: 0.05 });
    toneLayer(ctx, out, at, { from: 110, to: 45, peak: 0.5, decay: 0.12 });
    toneLayer(ctx, out, at + 0.02, { type: 'sawtooth', from: 220, to: 250, peak: 0.05, attack: 0.03, decay: 0.3, filter: 1200 });
    toneLayer(ctx, out, at + 0.03, { type: 'sawtooth', from: 227, to: 205, peak: 0.04, attack: 0.03, decay: 0.28, filter: 1100 });
  },
  // Voxel : tir de console rétro (carré qui chute) et petit « bling » de score.
  'vandal:voxel': (ctx, at) => {
    const out = master(ctx, 0.9);
    toneLayer(ctx, out, at, { type: 'square', from: 1400, to: 110, peak: 0.16, decay: 0.12 });
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 900, peak: 0.35, decay: 0.07 });
    toneLayer(ctx, out, at, { from: 100, to: 45, peak: 0.4, decay: 0.08 });
    if (Math.random() < 0.35) [1318, 1976].forEach((f, i) => toneLayer(ctx, out, at + 0.06 + i * 0.05, { type: 'square', from: f, to: f, peak: 0.04, decay: 0.05 }));
  },
  // Maelström : détonation étouffée par l'eau, gerbe, bulles qui remontent.
  'vandal:maelstrom': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 700, q: 1.5, peak: 0.5, decay: 0.14 });
    toneLayer(ctx, out, at, { from: 90, to: 38, peak: 0.5, decay: 0.18 });
    noiseLayer(ctx, out, at + 0.02, { freq: 2200, sweepTo: 900, q: 1, peak: 0.14, decay: 0.2 });
    for (let i = 0; i < 4; i += 1) toneLayer(ctx, out, at + 0.08 + Math.random() * 0.2, { from: 500 + Math.random() * 400, to: 1300, peak: 0.035, decay: 0.04 });
  },
  // Sumi : coup de pinceau sec (souffle filtré) et frappe de taiko grave.
  'vandal:sumi': (ctx, at) => {
    const out = master(ctx, 1);
    noiseLayer(ctx, out, at, { freq: 1600, q: 0.8, peak: 0.35, decay: 0.05 });
    toneLayer(ctx, out, at, { from: 95, to: 48, peak: 0.6, decay: 0.24 });
    noiseLayer(ctx, out, at + 0.01, { type: 'bandpass', freq: 3500, sweepTo: 1200, q: 0.8, peak: 0.1, attack: 0.02, decay: 0.16 });
  },
  // --- Glock ---------------------------------------------------------------------
  'glock:futuristic': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    toneLayer(ctx, out, t, { type: 'sawtooth', from: 2200, to: 400, peak: 0.12, decay: 0.08, filter: 3500 });
  }),
  'glock:banana': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // « Plop » élastique de la banane qui part.
    toneLayer(ctx, out, t, { type: 'sine', from: 300, to: 900, peak: 0.3, attack: 0.005, decay: 0.12 });
  }, 0.5),
  'glock:synthwave': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Synthé des années 80 : deux dents de scie désaccordées et un écho.
    [0, 7].forEach((cents) => toneLayer(ctx, out, t, { type: 'sawtooth', from: 880 * 2 ** (cents / 1200), to: 220, peak: 0.07, decay: 0.16, filter: 2600 }));
    toneLayer(ctx, out, t + 0.12, { type: 'square', from: 660, to: 330, peak: 0.03, decay: 0.12, filter: 1800 });
  }),
  'glock:kraken': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Détonation étouffée comme sous l'eau, puis bulles.
    noiseLayer(ctx, out, t, { type: 'lowpass', freq: 380, q: 2, peak: 0.35, decay: 0.25 });
    for (let i = 0; i < 5; i += 1) toneLayer(ctx, out, t + 0.05 + Math.random() * 0.2, { type: 'sine', from: 600 + Math.random() * 500, to: 1400, peak: 0.05, decay: 0.04 });
  }, 0.6),
  'glock:oni': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Coup de taiko grave et souffle démoniaque.
    toneLayer(ctx, out, t, { from: 110, to: 55, peak: 0.5, decay: 0.3 });
    noiseLayer(ctx, out, t + 0.02, { type: 'bandpass', freq: 500, sweepTo: 180, q: 1.5, peak: 0.12, attack: 0.03, decay: 0.35 });
  }),
  'glock:prism': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Verre qui chante : arpège de sinusoïdes très aiguës.
    [1760, 2217, 2637, 3520].forEach((f, i) => toneLayer(ctx, out, t + i * 0.025, { from: f, to: f, peak: 0.05, attack: 0.003, decay: 0.45 }));
  }, 0.7),
  'glock:xeno': (ctx, at) => pistolShot(ctx, at, (out, t) => {
    // Crachat organique : bruit mouillé et sifflement d'acide.
    noiseLayer(ctx, out, t, { type: 'bandpass', freq: 900, sweepTo: 300, q: 4, peak: 0.25, decay: 0.12 });
    noiseLayer(ctx, out, t + 0.05, { type: 'highpass', freq: 5000, peak: 0.05, attack: 0.02, decay: 0.4 });
  }),
};

// Tir de pistolet : claquement court et sec, plus une couche propre au skin.
function pistolShot(ctx, at, extra, body = 1) {
  const out = master(ctx, 0.9);
  noiseLayer(ctx, out, at, { freq: 2600, q: 0.8, peak: 0.45 * body, decay: 0.05 });
  noiseLayer(ctx, out, at, { type: 'lowpass', freq: 900, q: 0.6, peak: 0.35 * body, decay: 0.08 });
  toneLayer(ctx, out, at, { from: 140, to: 60, peak: 0.3 * body, decay: 0.07 });
  extra?.(out, at);
}

function sniperShot(ctx, at, { body = 1, tail = null }) {
  const out = master(ctx, 1);
  noiseLayer(ctx, out, at, { freq: 2400, q: 0.7, peak: 0.55, decay: 0.08 });
  noiseLayer(ctx, out, at, { type: 'lowpass', freq: 520, q: 0.6, peak: 0.75 * body, decay: 0.28 });
  toneLayer(ctx, out, at, { from: 70, to: 26, peak: 0.7 * body, decay: 0.3 });
  // Écho : la détonation revient atténuée et plus sourde.
  noiseLayer(ctx, out, at + 0.18, { type: 'lowpass', freq: 700, sweepTo: 200, peak: 0.12, attack: 0.02, decay: 0.6 });
  tail?.(out, at);
  // Manœuvre de culasse (délais = animation de sniperModel.js, ~0,95 s).
  const bolt = at + 0.17;
  const click = (t, freq, peak) => {
    noiseLayer(ctx, out, t, { freq, q: 3, peak, attack: 0.001, decay: 0.025 });
    toneLayer(ctx, out, t, { type: 'square', from: freq * 0.5, to: freq * 0.45, peak: peak * 0.3, decay: 0.02 });
  };
  click(bolt + 0.02, 1800, 0.14);
  noiseLayer(ctx, out, bolt + 0.17, { freq: 1100, sweepTo: 2200, q: 1.5, peak: 0.08, attack: 0.02, decay: 0.2 });
  toneLayer(ctx, out, bolt + 0.42, { type: 'triangle', from: 4200, to: 4000, peak: 0.05, decay: 0.12 });
  noiseLayer(ctx, out, bolt + 0.45, { freq: 2200, sweepTo: 1200, q: 1.5, peak: 0.08, attack: 0.02, decay: 0.18 });
  click(bolt + 0.66, 2400, 0.16);
}

// Sons d'apparition des skins Transcendants (même durée que l'animation).
const INTROS = {
  'vandal:singularity': (ctx, at) => {
    const out = master(ctx, 0.9);
    toneLayer(ctx, out, at, { from: 28, to: 60, peak: 0.4, attack: 1.2, decay: 0.3 });
    noiseLayer(ctx, out, at, { freq: 200, sweepTo: 2400, q: 1.2, peak: 0.12, attack: 1.3, decay: 0.2 });
    noiseLayer(ctx, out, at + 1.55, { freq: 1500, q: 1, peak: 0.3, decay: 0.05 });
    toneLayer(ctx, out, at + 1.55, { from: 80, to: 25, peak: 0.55, decay: 0.5 });
  },
  'glock:metamorph': (ctx, at) => {
    const out = master(ctx, 0.9);
    for (let i = 0; i < 14; i += 1) {
      const t = at + 0.22 + i * 0.055 + Math.random() * 0.015;
      noiseLayer(ctx, out, t, { freq: 1600 + Math.random() * 1600, q: 4, peak: 0.1, attack: 0.001, decay: 0.02 });
      toneLayer(ctx, out, t, { type: 'square', from: 900, to: 700, peak: 0.02, decay: 0.015 });
    }
    toneLayer(ctx, out, at + 0.2, { type: 'sawtooth', from: 300, to: 900, peak: 0.03, attack: 0.1, decay: 0.7, filter: 1800 });
    toneLayer(ctx, out, at + 1.0, { from: 200, to: 2400, peak: 0.06, attack: 0.2, decay: 0.2 });
    noiseLayer(ctx, out, at + 1.35, { type: 'lowpass', freq: 500, peak: 0.25, decay: 0.12 });
  },
  'sniper:rift': (ctx, at) => {
    const out = master(ctx, 0.9);
    noiseLayer(ctx, out, at, { type: 'highpass', freq: 800, sweepTo: 6000, q: 1, peak: 0.12, attack: 0.25, decay: 0.2 });
    [196, 233, 294].forEach((f) => toneLayer(ctx, out, at + 0.3, { from: f * 0.98, to: f * 1.02, peak: 0.05, attack: 0.3, decay: 1.1 }));
    noiseLayer(ctx, out, at + 1.35, { freq: 3000, sweepTo: 300, q: 2, peak: 0.15, attack: 0.02, decay: 0.3 });
  },
  'vandal:origami': (ctx, at) => {
    const out = master(ctx, 0.9);
    for (let i = 0; i < 16; i += 1) noiseLayer(ctx, out, at + 0.05 + i * 0.075 + Math.random() * 0.02, { freq: 1500 + Math.random() * 2500, q: 1.2, peak: 0.07, attack: 0.002, decay: 0.03 });
    toneLayer(ctx, out, at + 1.35, { type: 'triangle', from: 1568, to: 1568, peak: 0.04, decay: 0.5 });
  },
  'vandal:hive': (ctx, at) => {
    const out = master(ctx, 0.9);
    [0, 7, 13].forEach((c, i) => toneLayer(ctx, out, at + i * 0.05, { type: 'sawtooth', from: 180 * 2 ** (c / 100), to: 240 * 2 ** (c / 100), peak: 0.035, attack: 0.6, decay: 0.8, filter: 1000 }));
    noiseLayer(ctx, out, at + 1.4, { type: 'lowpass', freq: 500, peak: 0.15, decay: 0.1 });
  },
  'vandal:voxel': (ctx, at) => {
    const out = master(ctx, 0.8);
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => toneLayer(ctx, out, at + 0.1 + i * 0.16, { type: 'square', from: f, to: f, peak: 0.05, decay: 0.12 }));
  },
  'vandal:maelstrom': (ctx, at) => {
    const out = master(ctx, 0.9);
    noiseLayer(ctx, out, at, { type: 'lowpass', freq: 300, sweepTo: 1600, q: 1, peak: 0.2, attack: 0.8, decay: 0.5 });
    for (let i = 0; i < 10; i += 1) toneLayer(ctx, out, at + 0.2 + Math.random() * 1.2, { from: 400 + Math.random() * 500, to: 1200, peak: 0.03, decay: 0.05 });
    noiseLayer(ctx, out, at + 1.45, { freq: 1500, q: 1, peak: 0.15, decay: 0.2 });
  },
  'vandal:sumi': (ctx, at) => {
    const out = master(ctx, 0.9);
    noiseLayer(ctx, out, at + 0.05, { freq: 900, sweepTo: 3000, q: 0.8, peak: 0.1, attack: 0.3, decay: 0.8 });
    toneLayer(ctx, out, at + 1.35, { from: 110, to: 50, peak: 0.45, decay: 0.4 });
  },
  'glock:arcade': (ctx, at) => {
    const out = master(ctx, 0.8);
    toneLayer(ctx, out, at, { from: 1200, to: 1200, peak: 0.05, decay: 0.08 });
    toneLayer(ctx, out, at + 0.1, { from: 1600, to: 1600, peak: 0.05, decay: 0.15 });
    noiseLayer(ctx, out, at + 0.4, { type: 'highpass', freq: 6000, peak: 0.08, decay: 0.25 });
    [262, 330, 392, 523].forEach((f, i) => toneLayer(ctx, out, at + 0.75 + i * 0.1, { type: 'square', from: f, to: f, peak: 0.05, decay: 0.09 }));
  },
  'glock:hanabi': (ctx, at) => {
    const out = master(ctx, 0.9);
    toneLayer(ctx, out, at, { from: 600, to: 2600, peak: 0.05, attack: 0.3, decay: 0.1 });
    toneLayer(ctx, out, at + 0.4, { from: 90, to: 35, peak: 0.5, decay: 0.5 });
    for (let i = 0; i < 18; i += 1) noiseLayer(ctx, out, at + 0.5 + Math.random() * 0.9, { type: 'highpass', freq: 3500, q: 1, peak: 0.05, attack: 0.001, decay: 0.01 });
  },
  'glock:mirage': (ctx, at) => {
    const out = master(ctx, 0.9);
    noiseLayer(ctx, out, at, { freq: 2500, sweepTo: 500, q: 0.6, peak: 0.12, attack: 0.3, decay: 1.1 });
    toneLayer(ctx, out, at + 1.4, { from: 180, to: 90, peak: 0.2, decay: 0.3 });
  },
  'glock:candy': (ctx, at) => {
    const out = master(ctx, 0.8);
    for (let i = 0; i < 10; i += 1) toneLayer(ctx, out, at + 0.1 + i * 0.1, { from: 300 + Math.random() * 300, to: 900 + Math.random() * 600, peak: 0.06, attack: 0.004, decay: 0.07 });
  },
  'glock:kintsugi': (ctx, at) => {
    const out = master(ctx, 0.8);
    for (let i = 0; i < 8; i += 1) toneLayer(ctx, out, at + 0.1 + i * 0.1, { from: 2000 + i * 180, to: 1990 + i * 180, peak: 0.03, attack: 0.002, decay: 0.25 });
    [523, 784, 1047].forEach((f) => toneLayer(ctx, out, at + 1.05, { type: 'triangle', from: f, to: f, peak: 0.035, attack: 0.1, decay: 0.8 }));
  },
  'sniper:locomotive': (ctx, at) => {
    const out = master(ctx, 0.9);
    for (let i = 0; i < 8; i += 1) noiseLayer(ctx, out, at + 0.3 + i * 0.15, { type: 'lowpass', freq: 700, q: 1, peak: 0.12, attack: 0.01, decay: 0.08 });
    [587, 740].forEach((f) => toneLayer(ctx, out, at + 1.4, { type: 'triangle', from: f, to: f, peak: 0.05, attack: 0.05, decay: 0.5 }));
  },
  'sniper:kaleidoscope': (ctx, at) => {
    const out = master(ctx, 0.8);
    [523, 659, 784, 988, 1175, 1319, 1568].forEach((f, i) => toneLayer(ctx, out, at + i * 0.18, { from: f, to: f, peak: 0.035, attack: 0.01, decay: 0.6 }));
  },
  'sniper:marble': (ctx, at) => {
    const out = master(ctx, 0.9);
    for (let i = 0; i < 16; i += 1) noiseLayer(ctx, out, at + 0.1 + (i / 16) * 1.2, { freq: 1000 + Math.random() * 1500, q: 4, peak: 0.08, attack: 0.001, decay: 0.05 });
    noiseLayer(ctx, out, at + 0.1, { type: 'lowpass', freq: 500, peak: 0.06, attack: 0.2, decay: 1.2 });
  },
  'sniper:weaver': (ctx, at) => {
    const out = master(ctx, 0.8);
    [294, 370, 440, 587, 740, 880, 1175].forEach((f, i) => toneLayer(ctx, out, at + 0.1 + i * 0.17, { type: 'triangle', from: f, to: f, peak: 0.04, attack: 0.002, decay: 0.8 }));
  },
  'sniper:corsair': (ctx, at) => {
    const out = master(ctx, 0.9);
    noiseLayer(ctx, out, at + 0.25, { freq: 400, q: 3, peak: 0.12, attack: 0.05, decay: 0.2 });
    for (let i = 0; i < 20; i += 1) toneLayer(ctx, out, at + 0.4 + Math.random() * 0.9, { from: 2600 + Math.random() * 1800, to: 2500, peak: 0.02, attack: 0.001, decay: 0.12 });
  },
};

export function playWeaponIntro(ctx, weapon, skin) {
  INTROS[`${weapon}:${skin}`]?.(ctx, ctx.currentTime);
}

// `weapon`/`skin` : réglages de l'Aim Trainer. Renvoie false si aucun son dédié
// (l'appelant joue alors le tir par défaut).
export function playWeaponShot(ctx, weapon, skin = 'standard') {
  const play = SHOTS[`${weapon}:${skin}`] ?? SHOTS[`${weapon}:standard`];
  if (!play) return false;
  play(ctx, ctx.currentTime);
  return true;
}
