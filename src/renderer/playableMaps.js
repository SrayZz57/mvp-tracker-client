import {
  ASCENT_A_SPAWNS,
  ASCENT_MINIMAP_URL,
  buildAscentSiteA,
  calloutAt as calloutAtAscentA,
  lightAscentSiteA,
  toMinimap as toMinimapAscent,
} from './aimMapAscentA.js';
import {
  SUNSET_B_SPAWNS,
  SUNSET_MINIMAP_URL,
  buildSunsetSiteB,
  calloutAtSunsetB,
  lightSunsetSiteB,
  sunsetSky,
  toMinimap as toMinimapSunset,
} from './aimMapSunsetB.js';
import { HAVEN_A_SPAWNS, HAVEN_MINIMAP_URL, buildHavenSiteA, calloutAtHavenA, lightHavenSiteA, toMinimap as toMinimapHaven } from './aimMapHavenA.js';

// Cartes reproduites d'après les minimaps officielles, où l'on se déplace
// (aperçu MapExplorer.jsx, futur mode d'entrées sur site). Chaque entrée
// fournit la construction, l'éclairage, les points de départ, les noms de
// zone et la conversion vers les pixels de sa minimap. `sky` : ciel propre à
// la carte (sinon le ciel classique de l'Aim Trainer).
export const PLAYABLE_MAPS = {
  ascentA: {
    id: 'ascentA',
    minimapUrl: ASCENT_MINIMAP_URL,
    spawns: ASCENT_A_SPAWNS,
    build: buildAscentSiteA,
    light: lightAscentSiteA,
    calloutAt: calloutAtAscentA,
    toMinimap: toMinimapAscent,
  },
  sunsetB: {
    id: 'sunsetB',
    minimapUrl: SUNSET_MINIMAP_URL,
    spawns: SUNSET_B_SPAWNS,
    build: buildSunsetSiteB,
    light: lightSunsetSiteB,
    calloutAt: calloutAtSunsetB,
    toMinimap: toMinimapSunset,
    sky: sunsetSky,
  },
  havenA: {
    id: 'havenA',
    minimapUrl: HAVEN_MINIMAP_URL,
    spawns: HAVEN_A_SPAWNS,
    build: buildHavenSiteA,
    light: lightHavenSiteA,
    calloutAt: calloutAtHavenA,
    toMinimap: toMinimapHaven,
  },
};

