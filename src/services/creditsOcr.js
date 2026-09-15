import { utilityProcess } from 'electron';
import { Jimp, ResizeStrategy } from 'jimp';

// Crédits max théoriques en jeu (bien au-delà du plafond de 9000 réel) — sert
// juste à rejeter un résultat OCR aberrant (bruit lu comme un grand nombre).
const MIN_CREDITS = 0;
const MAX_CREDITS = 9000;

// Trois chemins fixés une fois par main.js au démarrage (voir les setters
// juste en dessous) : le modèle de langue bundlé, le script de tesseract.js
// lui-même (contourne un bug de résolution de chemin après compilation par
// Vite — voir setOcrWorkerScriptPath), et le script du process séparé qui
// exécute tout ça (voir setOcrWorkerProcessPath).
let langDir = null;
let workerScriptPath = null;
let workerProcessPath = null;

export function setOcrLangDir(dir) {
  langDir = dir;
}

export function setOcrWorkerScriptPath(scriptPath) {
  workerScriptPath = scriptPath;
}

export function setOcrWorkerProcessPath(scriptPath) {
  workerProcessPath = scriptPath;
}

// L'OCR tourne dans un VRAI process Node séparé (utilityProcess.fork(), pas
// un thread interne à Electron) : tesseract.js utilise `worker_threads` pour
// son propre moteur, et l'isoler dans son propre process évite qu'un souci
// de ce côté-là (crash, blocage) n'affecte jamais le process principal de
// l'app — voir ocrWorkerProcess.js pour le détail de ce qui tourne dedans.
let child = null;
let msgCounter = 0;
const pending = new Map();

function ensureChild() {
  if (child) return child;
  child = utilityProcess.fork(workerProcessPath, [], { stdio: 'pipe' });
  // Utile pour diagnostiquer un futur souci côté OCR (crash, erreur
  // tesseract...) sans avoir à rajouter du logging après coup.
  child.stdout?.on('data', (d) => console.log('[ocr]', d.toString().trim()));
  child.stderr?.on('data', (d) => console.error('[ocr]', d.toString().trim()));
  child.on('message', (m) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.text);
    else p.reject(new Error(m.error));
  });
  // Le process peut mourir (crash, tué par l'OS...) — on le relance tout
  // seul au prochain appel plutôt que de rester bloqué définitivement sans
  // OCR. Toute requête encore en attente à ce moment-là ne sera jamais
  // résolue : le timeout côté appelant (main.js) prend le relais.
  child.on('exit', () => {
    child = null;
  });
  return child;
}

function recognizeInChildProcess(buffer, langPath, workerPath) {
  const id = msgCounter;
  msgCounter += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureChild().postMessage({ id, buffer, langPath, workerPath });
  });
}

// Le crop d'origine (voir CAPTURE_REGIONS.credits dans screenCapture.js)
// fait quelques dizaines de pixels de haut : bien assez pour l'œil humain,
// mais l'OCR n'y arrivait pas du tout tel quel (chiffres mal reconnus/
// confondus, à cause de la petite taille et de la police stylisée du HUD).
// Un agrandissement avec interpolation bicubique (plus lisse que le plus
// proche voisin par défaut) a réglé le problème en test — voir le
// comparatif de méthodes tenté avant d'arriver à celle-ci (seuillage
// noir/blanc essayé aussi, en pire : détruisait les traits fins des chiffres).
// x8 plutôt que x6 : compense la capture source réduite de moitié
// (CAPTURE_SCALE dans screenCapture.js, pour ne plus saturer le système
// pendant la partie) — même niveau de détail final pour l'OCR qu'avant.
const UPSCALE_FACTOR = 8;

async function preprocess(pngBuffer) {
  const img = await Jimp.read(pngBuffer);
  img.resize({ w: img.width * UPSCALE_FACTOR, h: img.height * UPSCALE_FACTOR, mode: ResizeStrategy.BICUBIC });
  return img.getBuffer('image/png');
}

// Retourne le nombre de crédits lu, ou `null` si rien d'exploitable — que ce
// soit parce que le joueur n'est pas dans la boutique, que la capture est
// vide/noire (plein écran exclusif), ou que l'OCR n'a rien reconnu de
// plausible. Volontairement permissif sur les faux négatifs (préférer ne
// rien afficher plutôt qu'un chiffre inventé).
export async function readCredits(pngBuffer) {
  const upscaled = await preprocess(pngBuffer);
  const text = await recognizeInChildProcess(new Uint8Array(upscaled), langDir, workerScriptPath);

  const digits = text.replace(/\D/g, '');
  if (!digits) return null;

  const value = Number(digits);
  if (!Number.isFinite(value) || value < MIN_CREDITS || value > MAX_CREDITS) return null;

  return value;
}

export async function shutdownOcr() {
  if (!child) return;
  child.kill();
  child = null;
}
