// Ambiance + bruitages du menu Aim Trainer — même logique que les sons de jeu
// dans AimTrainerGame.jsx (playGunshot, playTargetPop...) : tout est synthétisé
// via Web Audio, aucun fichier audio embarqué (pas de question de licence/droits
// à gérer, poids du bundle inchangé).

const VOLUME_KEY = 'mvptracker-aim-hub-volume';
const MUTED_KEY = 'mvptracker-aim-hub-muted';

let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function loadHubAudioPrefs() {
  let volume = 0.16;
  let muted = false;
  try {
    const rawVol = localStorage.getItem(VOLUME_KEY);
    if (rawVol !== null) volume = Math.min(1, Math.max(0, Number(rawVol)));
    muted = localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    // localStorage indisponible : valeurs par défaut
  }
  return { volume, muted };
}

export function saveHubAudioPrefs({ volume, muted }) {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // rien à faire si localStorage est indisponible
  }
}

// --- Bruitages courts (survol / clic / confirmation / retour) --------------

function beep({ freq, duration, type = 'sine', gain = 0.06, sweep = null }) {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(sweep, audioCtx.currentTime + duration);
  amp.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  amp.gain.exponentialRampToValueAtTime(gain, audioCtx.currentTime + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.connect(amp).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration + 0.02);
}

export function playHoverSfx() {
  beep({ freq: 720, duration: 0.05, type: 'triangle', gain: 0.03 });
}

export function playClickSfx() {
  beep({ freq: 420, duration: 0.09, type: 'square', gain: 0.05, sweep: 640 });
}

export function playConfirmSfx() {
  beep({ freq: 380, duration: 0.14, type: 'sine', gain: 0.07, sweep: 760 });
}

export function playBackSfx() {
  beep({ freq: 300, duration: 0.09, type: 'triangle', gain: 0.05, sweep: 180 });
}

// --- Nappe d'ambiance en boucle ---------------------------------------------
// Deux oscillateurs SINUSOÏDAUX légèrement désaccordés (battement lent,
// texture "drone") + un filtre passe-bas très fermé pour rester chaud et
// feutré. Version précédente utilisait des ondes "sawtooth" (dents de scie,
// riches en harmoniques aiguës) qui rendaient le son agressif/criard —
// remplacées par du sinus/triangle, plus aucune aspérité. Fondu d'entrée
// progressif (pas de démarrage brutal) et volume par défaut abaissé.

let musicNodes = null;

export function startHubMusic(volume, muted) {
  if (musicNodes) return;
  const audioCtx = getCtx();
  const master = audioCtx.createGain();
  const target = muted ? 0 : volume;
  master.gain.setValueAtTime(0, audioCtx.currentTime);
  master.gain.linearRampToValueAtTime(target, audioCtx.currentTime + 2.2);
  master.connect(audioCtx.destination);

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.3;
  filter.connect(master);

  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 0.04;
  lfoGain.gain.value = 60;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  const baseFreqs = [110, 110.6, 220]; // A2, légèrement désaccordé, A3 — battement lent + octave
  const oscillators = baseFreqs.map((freq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = i === 2 ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    const oscGain = audioCtx.createGain();
    oscGain.gain.value = i === 2 ? 0.04 : 0.07;
    osc.connect(oscGain).connect(filter);
    osc.start();
    return osc;
  });

  musicNodes = { master, filter, lfo, oscillators };
}

export function stopHubMusic() {
  if (!musicNodes) return;
  const audioCtx = getCtx();
  const { master, lfo, oscillators } = musicNodes;
  // Fondu de sortie court plutôt qu'un arrêt net (clic audible sinon).
  master.gain.cancelScheduledValues(audioCtx.currentTime);
  master.gain.setTargetAtTime(0, audioCtx.currentTime, 0.15);
  setTimeout(() => {
    lfo.stop();
    oscillators.forEach((o) => o.stop());
  }, 400);
  musicNodes = null;
}

export function setHubMusicVolume(volume, muted) {
  if (!musicNodes) return;
  musicNodes.master.gain.setTargetAtTime(muted ? 0 : volume, getCtx().currentTime, 0.08);
}
