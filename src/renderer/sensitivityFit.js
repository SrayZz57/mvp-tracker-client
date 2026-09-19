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

// `results` : [{ sens, accuracy }, ...] — retourne la sensibilité suggérée
// (peut différer de toutes les valeurs testées) ou null si pas assez de
// données exploitables pour une estimation fiable.
export function suggestSensitivity(results) {
  const points = results
    .filter((r) => r.accuracy !== null && Number.isFinite(r.sens))
    .map((r) => ({ x: r.sens, y: r.accuracy }));

  if (points.length < 3) return null;

  const fit = fitQuadratic(points);
  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);

  // Pas de vrai maximum (courbe qui monte ou descend tout du long, ou
  // système dégénéré) — retombe sur la sens testée avec la meilleure
  // précision plutôt que de proposer une valeur non fiable.
  if (!fit || fit.a >= -1e-6) {
    const best = points.reduce((top, p) => (!top || p.y > top.y ? p : top), null);
    return best ? Math.round(best.x * 1000) / 1000 : null;
  }

  const vertex = -fit.b / (2 * fit.a);
  // Extrapoler loin des valeurs réellement testées n'a plus de sens (la
  // courbe n'a été mesurée que dans cette plage) — marge de 15 % autour,
  // pas plus.
  const margin = (maxX - minX) * 0.15;
  const clamped = Math.min(maxX + margin, Math.max(minX - margin, vertex));
  return Math.round(clamped * 1000) / 1000;
}
