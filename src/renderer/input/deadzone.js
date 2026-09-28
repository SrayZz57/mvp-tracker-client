// Deadzone RADIALE (sur la magnitude du stick, pas par axe séparément) :
// un simple `if (abs(v) < dz) v = 0` par axe déforme le cercle du stick en
// carré et casse la diagonale. Ici : magnitude en dessous de `inner` → zéro ;
// au-dessus, on renormalise ce qui reste entre `inner` et `outer` sur
// [0, 1], puis on réapplique la direction d'origine — la valeur progresse
// donc proprement juste après la deadzone au lieu de sauter d'un coup.
//
// x, y : axes bruts du stick, chacun dans [-1, 1].
// inner, outer : rayons de la deadzone (mêmes unités que la magnitude du
// stick, typiquement [0, 1]).
export function applyRadialDeadzone(x, y, inner = 0, outer = 1) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= inner) return { x: 0, y: 0, magnitude: 0 };
  const usableRange = Math.max(1e-6, outer - inner);
  const normalizedMagnitude = Math.min(1, (magnitude - inner) / usableRange);
  const scale = normalizedMagnitude / magnitude;
  return { x: x * scale, y: y * scale, magnitude: normalizedMagnitude };
}
