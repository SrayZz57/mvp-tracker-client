import { desktopCapturer, screen } from 'electron';

// Capture ponctuelle (pas un flux vidéo continu type OBS) via l'API native
// d'Electron, disponible directement dans le process main — pas besoin de
// getUserMedia côté renderer ni de permission particulière. Coût négligeable
// tant qu'on ne l'appelle pas en boucle serrée (voir l'intervalle ~2s dans
// main.js) : ça ne touche jamais au processus de Valorant, contrairement à
// l'ancienne API locale du client Riot (retirée le 2026-09-15).
//
// Limite connue en plein écran EXCLUSIF (pas Sans bordure) : certaines
// combinaisons pilote GPU/Windows renvoient une image noire ou périmée.
// Volontairement pas de détection dédiée pour ce cas — readCredits() et
// matchAgent() rejettent un résultat non exploitable, ce qui a le même effet
// (aucune suggestion affichée) sans code spécifique à maintenir.

// Régions exprimées en fraction de la résolution de l'écran principal, pour
// s'adapter aux résolutions 16:9 courantes (1920×1080, 2560×1440, 3840×2160).
// Calibrées le 2026-09-16 à partir d'une vraie capture d'écran de boutique
// envoyée par l'utilisateur (2559×1439) — remplace les premières valeurs de
// départ (au doigt mouillé) qui ciblaient les mauvais endroits : les crédits
// sont en haut à gauche du panneau boutique ("800 ¤", sous les armes
// possédées), pas en bas à droite ; les capacités sont 3 grandes cartes
// (COMPÉTENCES) en bas au centre, pas une petite bande en haut. Encore une
// estimation avec marge — à affiner si le calibrage reste imprécis. Ne gère
// pas l'ultra-wide ni un scale UI custom.
export const CAPTURE_REGIONS = {
  // Resserré le 2026-09-16 sur les seuls chiffres (pas tout le pavé "800 ¤"
  // avec sa marge) — vérifié directement sur une vraie capture : à cette
  // taille, un léger surcadrage suffisait à faire complètement échouer l'OCR
  // (voir la mise à l'échelle + le mode page unique dans creditsOcr.js, qui
  // ont aussi été nécessaires en plus de ce recadrage).
  credits: { xFrac: 0.135, yFrac: 0.195, wFrac: 0.065, hFrac: 0.038 },
  // Portrait du personnage joué, juste au-dessus des crédits dans le même
  // panneau (signalé par l'utilisateur le 2026-09-16 — bien plus fiable que
  // les icônes de capacités : une seule image nette, jamais teintée selon
  // l'état d'achat contrairement aux cartes de COMPÉTENCES). Remplace le
  // matching par icônes de capacités. Estimation à partir des captures
  // reçues, pas encore calibrée aussi précisément que la zone crédits.
  portrait: { xFrac: 0.01, yFrac: 0.1, wFrac: 0.045, hFrac: 0.085 },
};

function regionToRect(region, screenSize) {
  return {
    x: Math.round(region.xFrac * screenSize.width),
    y: Math.round(region.yFrac * screenSize.height),
    width: Math.round(region.wFrac * screenSize.width),
    height: Math.round(region.hFrac * screenSize.height),
  };
}

// `thumbnailSize` en résolution native causait un vrai coût système (souris
// qui saccade EN JEU pendant les captures répétées toutes les ~2s, constaté
// en test le 2026-09-16) — `desktopCapturer` fait tout le travail lourd
// (composition, lecture GPU→CPU, encodage) à CETTE taille, donc la réduire
// réduit directement ce coût, pas juste la taille du résultat. Moitié de la
// résolution native reste largement suffisant : la zone crédits/capacités
// n'est de toute façon qu'un petit crop, encore agrandi ensuite pour l'OCR
// (voir UPSCALE_FACTOR dans creditsOcr.js). `types: ['screen']` uniquement —
// pas besoin d'énumérer les fenêtres individuelles (`types: ['window']`),
// plus lent pour rien ici.
const CAPTURE_SCALE = 0.5;

export async function captureScreenCrops({ includeFull = false } = {}) {
  const display = screen.getPrimaryDisplay();
  const { width: nativeWidth, height: nativeHeight } = display.size;
  const width = Math.round(nativeWidth * CAPTURE_SCALE);
  const height = Math.round(nativeHeight * CAPTURE_SCALE);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  const source = sources[0];
  if (!source || source.thumbnail.isEmpty()) return null;

  const full = source.thumbnail;
  const creditsRect = regionToRect(CAPTURE_REGIONS.credits, { width, height });
  const portraitRect = regionToRect(CAPTURE_REGIONS.portrait, { width, height });

  return {
    creditsPng: full.crop(creditsRect).toPNG(),
    portraitPng: full.crop(portraitRect).toPNG(),
    // Coûteux à encoder (screenshot plein écran) — seulement pour le mode
    // debug de calibrage, jamais sur le chemin chaud toutes les ~2s.
    fullPng: includeFull ? full.toPNG() : null,
  };
}
