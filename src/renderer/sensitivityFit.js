// Régression quadratique (précision = a·sens² + b·sens + c) sur les
// résultats du Sensitivity Finder, pour suggérer une sensibilité qui n'est
// pas forcément l'une des valeurs testées — si le maximum réel se situe
// entre deux points testés, une simple "meilleure des N valeurs" ne peut
// jamais le trouver, alors que la courbe qui passe par tous les points, si.

// Résout un système 3×3 par la méthode de Cramer — pas de dépendance externe
// pour un calcul aussi petit (3 inconnues, ~9 points de données).
function solve3x3(A, B) {
  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(A);
  if (Math.abs(D) < 1e-9) return null; // système dégénéré (points colinéaires, trop peu de points distincts...)
  const withCol = (col, vec) => A.map((row, i) => row.map((v, j) => (j === col ? vec[i] : v)));
  return {
    c: det3(withCol(0, B)) / D,
    b: det3(withCol(1, B)) / D,
    a: det3(withCol(2, B)) / D,
  };
}

function fitQuadratic(points) {
  let Sx = 0;
  let Sxx = 0;
  let Sxxx = 0;
  let Sxxxx = 0;
  let Sy = 0;
  let Sxy = 0;
  let Sxxy = 0;
  points.forEach(({ x, y }) => {
    const x2 = x * x;
    const x3 = x2 * x;
    const x4 = x3 * x;
    Sx += x;
    Sxx += x2;
    Sxxx += x3;
    Sxxxx += x4;
    Sy += y;
    Sxy += x * y;
    Sxxy += x2 * y;
  });
  const n = points.length;
  return solve3x3(
    [
      [n, Sx, Sxx],
      [Sx, Sxx, Sxxx],
      [Sxx, Sxxx, Sxxxx],
    ],
    [Sy, Sxy, Sxxy],
  );
}

// Score d'un essai : touches × précision (= touches² ÷ tirs). Sur des cibles
// fixes la précision seule plafonne vite à 100 % pour tous les essais (repéré
// en vrai : 9 essais à 100,0 %), et rien ne départage plus les sensibilités.
// Le nombre de touches en 20 s, lui, varie avec la vitesse d'acquisition, et
// la précision le pondère : un raté fait perdre du temps ET compte contre
// l'essai. Ni un joueur qui tire trop peu (précision parfaite, peu de touches)
// ni un joueur qui arrose (beaucoup de touches, beaucoup de ratés) n'est favorisé.
export function effectiveHits(result) {
  if (result.accuracy === null || result.accuracy === undefined) return null;
  if (!Number.isFinite(result.hits)) return null;
  return result.hits * (result.accuracy / 100);
}

// En dessous de cet écart (en touches effectives) entre le meilleur et le
// pire essai, les 9 sensibilités sont indiscernables : la différence est du
// bruit d'un essai de 20 s, pas un vrai optimum.
const INDISTINCT_RANGE = 1;

// Sensibilité testée la plus proche de l'actuelle parmi celles à égalité avec
// le meilleur score. Avant, l'égalité était tranchée par l'ordre de test
// (premier = la plus basse), ce qui faisait toujours proposer ×0,6.
function bestPoint(points, currentSens) {
  const top = Math.max(...points.map((p) => p.y));
  const tied = points.filter((p) => p.y >= top - 1e-9);
  if (!Number.isFinite(currentSens)) return tied[0];
  return tied.reduce((closest, p) => (Math.abs(p.x - currentSens) < Math.abs(closest.x - currentSens) ? p : closest));
}

// `results` : [{ sens, accuracy, hits }, ...], `currentSens` : la sensibilité
// de départ de la série. Retourne :
//  - suggested : la sensibilité suggérée (peut différer de toutes les valeurs
//    testées), ou null si pas assez de données ;
//  - indistinct : vrai si les essais sont trop proches pour départager — la
//    suggestion est alors la sensibilité actuelle, pas une "meilleure" ;
//  - edge : 'up' / 'down' si l'optimum estimé est au-delà de la plage testée
//    (sinon null) ;
//  - best : l'essai au meilleur score (égalités tranchées vers la sens actuelle).
export function analyzeFinderResults(results, currentSens) {
  const scored = results
    .map((r) => ({ ...r, effective: effectiveHits(r) }))
    .filter((r) => r.effective !== null && Number.isFinite(r.sens));
  const points = scored.map((r) => ({ x: r.sens, y: r.effective }));

  if (points.length < 3) return { suggested: null, indistinct: false, edge: null, best: null, scored };

  const ys = points.map((p) => p.y);
  const best = bestPoint(points, currentSens);
  const bestResult = scored.find((r) => r.sens === best.x) ?? null;

  if (Math.max(...ys) - Math.min(...ys) < INDISTINCT_RANGE) {
    const suggested = Number.isFinite(currentSens) ? Math.round(currentSens * 1000) / 1000 : Math.round(best.x * 1000) / 1000;
    return { suggested, indistinct: true, edge: null, best: bestResult, scored };
  }

  const fit = fitQuadratic(points);
  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const round = (v) => Math.round(v * 1000) / 1000;
  // Extrapoler loin des valeurs réellement testées n'a plus de sens (la
  // courbe n'a été mesurée que dans cette plage) — marge de 15 % autour,
  // pas plus.
  const margin = (maxX - minX) * 0.15;

  // La suggestion vient TOUJOURS d'un calcul sur les essais, jamais du simple
  // "meilleur essai" (avant, sans sommet, elle retombait sur une valeur testée).
  // `edge` signale que l'optimum estimé sort de la plage testée : à refaire
  // en centrant la série sur la valeur suggérée.

  // Système dégénéré (points colinéaires...) : barycentre des sensibilités
  // pondéré par le score — utilise tous les essais, tombe entre deux valeurs.
  if (!fit) {
    const total = ys.reduce((sum, y) => sum + y, 0);
    const centroid = points.reduce((sum, p) => sum + p.x * p.y, 0) / total;
    return { suggested: round(centroid), indistinct: false, edge: null, best: bestResult, scored };
  }

  // Courbe en cloche : le sommet est l'optimum estimé.
  if (fit.a < -1e-6) {
    const vertex = -fit.b / (2 * fit.a);
    const clamped = Math.min(maxX + margin, Math.max(minX - margin, vertex));
    const edge = vertex > maxX ? 'up' : vertex < minX ? 'down' : null;
    return { suggested: round(clamped), indistinct: false, edge, best: bestResult, scored };
  }

  // Pas de sommet (le score monte ou descend sur toute la plage, ou courbe en
  // U) : l'optimum est au-delà d'un bord. On suggère un pas de plus dans le
  // sens de la tendance, sans aller plus loin que la marge.
  const valueAt = (x) => fit.a * x * x + fit.b * x + fit.c;
  const rising = valueAt(maxX) >= valueAt(minX);
  return {
    suggested: round(rising ? maxX + margin : minX - margin),
    indistinct: false,
    edge: rising ? 'up' : 'down',
    best: bestResult,
    scored,
  };
}
