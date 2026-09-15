import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { Jimp, diff } from 'jimp';

// Portrait du personnage joué (voir CAPTURE_REGIONS.portrait dans
// screenCapture.js, signalé par l'utilisateur le 2026-09-16) plutôt que les
// icônes de capacités : une seule image nette à comparer, jamais teintée
// selon l'état d'achat contrairement aux cartes de COMPÉTENCES (qui a fait
// complètement échouer la première version de ce fichier). Tous les agents
// jouables sont comparés, pas seulement les 17 dont les coûts de capacités
// sont connus (voir abilityCosts.js) — un agent identifié mais sans coûts
// connus affichera juste arme/bouclier, pas de section capacités (déjà géré
// dans BuyOverlay.jsx), pas la peine de le limiter ici.
const SLOT_SIZE = 96;

// Même logique de seuil de luminosité que l'ancien matching par icônes de
// capacités (voir git history) : les portraits ont eux aussi un fond
// transparent sur valorant-api.com, à aplatir sur un fond neutre avant
// comparaison pour ne pas comparer des couleurs de fond qui n'existent pas
// en jeu (le portrait y est posé sur le fond du panneau, pas transparent).
const ICON_BRIGHTNESS_THRESHOLD = 200;

// Score de différence (0 = identique, 1 = totalement différent) en dessous
// duquel on considère l'agent identifié. Volontairement strict : un faux
// "pas identifié" (pas de suggestion de capacités) est sans conséquence,
// un faux positif afficherait les capacités du mauvais agent. À ajuster
// après un premier vrai test avec cette nouvelle zone de capture (portrait),
// pas encore vérifié comme l'a été le seuil des icônes de capacités.
const MATCH_THRESHOLD = 0.22;

let agentsDataPromise = null;
function loadAgentsData() {
  if (!agentsDataPromise) {
    agentsDataPromise = fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=fr-FR')
      .then((response) => response.json())
      .then((json) => json.data);
  }
  return agentsDataPromise;
}

function cacheDir() {
  const dir = path.join(app.getPath('userData'), 'agent-portraits');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Composite d'abord sur un fond noir opaque avant de réduire en masque
// noir/blanc — sans ça, un pixel transparent garde sa couleur RVB
// sous-jacente (souvent claire) et ressort à tort comme un trait clair, ce
// qui rendait toutes les icônes quasi indiscernables entre elles (bug
// identifié le 2026-09-16 sur l'ancien matching par icônes de capacités).
// Un pixel capturé à l'écran (déjà 100% opaque) n'est pas affecté par cette
// étape de fond.
function toIconMask(img) {
  const flattened = new Jimp({ width: img.bitmap.width, height: img.bitmap.height, color: 0x000000ff });
  flattened.composite(img, 0, 0);

  flattened.greyscale();
  flattened.scan(0, 0, flattened.bitmap.width, flattened.bitmap.height, function scanPixel(x, y, idx) {
    const bin = this.bitmap.data[idx] > ICON_BRIGHTNESS_THRESHOLD ? 255 : 0;
    this.bitmap.data[idx] = bin;
    this.bitmap.data[idx + 1] = bin;
    this.bitmap.data[idx + 2] = bin;
  });
  return flattened;
}

async function loadPortrait(url) {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const icon = await Jimp.read(buffer);
  icon.resize({ w: SLOT_SIZE, h: SLOT_SIZE });
  return icon;
}

// Map<agentName, masque prêt à comparer> — masqué une fois pour toutes ici,
// pas à chaque comparaison (voir matchAgent).
let referenceMasks = null;

export async function ensureAgentIconCache() {
  if (referenceMasks) return;
  referenceMasks = new Map();

  const agents = await loadAgentsData();
  const dir = cacheDir();

  // En parallèle plutôt qu'un agent après l'autre : en séquence, un premier
  // lancement sans rien en cache (nouvelle install) pouvait prendre une
  // bonne trentaine de secondes et ralentissait tout le démarrage de l'app
  // (constaté en test le 2026-09-16). Un agent en échec de téléchargement ne
  // doit pas bloquer les autres.
  await Promise.all(
    agents.map(async (agentData) => {
      const agentName = agentData.displayName;
      const cachePath = path.join(dir, `${agentName}.png`);

      try {
        const icon = existsSync(cachePath) ? await Jimp.read(cachePath) : null;
        if (icon) {
          referenceMasks.set(agentName, toIconMask(icon));
          return;
        }

        const url = agentData.displayIcon;
        if (!url) return;

        const freshIcon = await loadPortrait(url);
        await freshIcon.write(cachePath);
        referenceMasks.set(agentName, toIconMask(freshIcon));
      } catch (err) {
        console.error(`[agentIconMatch] échec du cache pour ${agentName}`, err);
      }
    }),
  );
}

// Retourne l'agent le plus proche SI sous le seuil de confiance, sinon
// `null`. Ne lève jamais — un crop illisible doit juste aboutir à "agent non
// identifié", pas à une erreur qui casse la boucle de capture dans main.js.
export async function matchAgent(portraitPngBuffer) {
  if (!referenceMasks || referenceMasks.size === 0) return null;

  try {
    const captured = await Jimp.read(portraitPngBuffer);
    captured.resize({ w: SLOT_SIZE, h: SLOT_SIZE });
    const capturedMask = toIconMask(captured);

    let best = null;
    for (const [agentName, referenceMask] of referenceMasks) {
      const { percent } = diff(capturedMask, referenceMask);
      if (!best || percent < best.percent) best = { agentName, percent };
    }

    if (best && best.percent <= MATCH_THRESHOLD) return best.agentName;
    return null;
  } catch (err) {
    console.error('[agentIconMatch] échec du matching', err);
    return null;
  }
}
