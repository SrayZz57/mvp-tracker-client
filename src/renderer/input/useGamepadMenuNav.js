import { useEffect } from 'react';
import { GamepadInput } from './GamepadInput.js';

// Navigation au clavier-virtuel façon manette dans les menus de l'Aim
// Trainer (hub, modes, réglages...) : D-pad ou stick gauche pour déplacer le
// focus entre les éléments cliquables, A pour valider, B pour revenir en
// arrière. Repose sur `element.focus()` + `.click()` natifs (donc sur le
// `:focus-visible` déjà stylé dans index.css) — aucun système de sélection
// parallèle à maintenir, et le clavier continue de fonctionner exactement
// pareil (Tab, Entrée...), cette couche ne fait que déplacer le focus DOM.
//
// Une navigation spatiale simple (le plus proche dans la direction
// demandée, via getBoundingClientRect), pas une vraie grille : suffisant
// pour des menus en cartes/listes, pas cherché à être parfait sur une mise
// en page très irrégulière.
const FOCUSABLE_SELECTOR = 'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const MOVE_INITIAL_DELAY_MS = 220;
const MOVE_REPEAT_MS = 160;
const STICK_THRESHOLD = 0.5;

function getFocusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => el.offsetParent !== null && !el.closest('[aria-hidden="true"]'));
}

// Logique de score PURE (pas de DOM, testable en isolation — voir
// useGamepadMenuNav.test.mjs) : lequel des `rects` est "le plus proche dans
// la direction (dx, dy)" en partant de `fromRect`. Score = distance sur
// l'axe demandé + pénalité de décalage sur l'axe perpendiculaire, pour
// préférer "juste en dessous" à "loin en diagonale". Renvoie l'INDEX du
// meilleur candidat dans `rects`, ou -1 si aucun n'est dans cette direction.
export function pickClosestRect(fromRect, rects, dx, dy) {
  const fx = fromRect.left + fromRect.width / 2;
  const fy = fromRect.top + fromRect.height / 2;
  let bestIndex = -1;
  let bestScore = Infinity;
  rects.forEach((r, i) => {
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const ddx = ex - fx;
    const ddy = ey - fy;
    const primary = dx !== 0 ? ddx * dx : ddy * dy;
    if (primary <= 1) return; // doit être réellement dans cette direction
    const secondary = dx !== 0 ? Math.abs(ddy) : Math.abs(ddx);
    const score = primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  });
  return bestIndex;
}

// Élément DOM le plus proche dans la direction (dx, dy) — habillage de
// pickClosestRect avec de vrais getBoundingClientRect().
function findNext(items, current, dx, dy) {
  if (!current) return items[0] ?? null;
  const others = items.filter((el) => el !== current);
  const index = pickClosestRect(current.getBoundingClientRect(), others.map((el) => el.getBoundingClientRect()), dx, dy);
  return index === -1 ? null : others[index];
}

/**
 * @param containerRef ref du conteneur dans lequel naviguer (re-scanné à
 *   chaque déplacement, donc pas besoin de le reconstruire si le contenu
 *   change — cartes qui apparaissent/disparaissent selon l'écran affiché).
 * @param active désactive tout le hook (jamais de listener posé) — utile
 *   pendant une session de jeu, où c'est AimTrainerGame.jsx qui gère la
 *   manette (visée, tir, pause), pas ce hook.
 * @param onBack appelé sur B — généralement "revenir à l'écran précédent".
 */
export function useGamepadMenuNav({ containerRef, active = true, onBack }) {
  useEffect(() => {
    if (!active) return undefined;
    const gamepad = new GamepadInput();
    let frame;
    let held = { up: false, down: false, left: false, right: false };
    let nextRepeatAt = { up: 0, down: 0, left: 0, right: 0 };
    let aWasDown = false;
    let bWasDown = false;

    const move = (dx, dy) => {
      const root = containerRef.current;
      if (!root) return;
      // Une fenêtre modale ouverte (CustomModeConfig, PlaylistManager,
      // SensitivityFinder, SkinViewer...) est un enfant DANS ce même
      // conteneur, mais recouvre visuellement le reste : sans ça, le focus
      // pourrait sauter sur un bouton du hub caché derrière.
      const modalRoot = root.querySelector('.custom-config-overlay, [role="dialog"]');
      const items = getFocusables(modalRoot ?? root);
      if (!items.length) return;
      const current = document.activeElement && items.includes(document.activeElement) ? document.activeElement : null;
      const target = findNext(items, current, dx, dy) ?? (current ? null : items[0]);
      if (target) {
        target.focus();
        target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const state = gamepad.poll();
      if (!state) return;
      const now = performance.now();

      const dpadUp = state.buttons[12]?.pressed ?? false;
      const dpadDown = state.buttons[13]?.pressed ?? false;
      const dpadLeft = state.buttons[14]?.pressed ?? false;
      const dpadRight = state.buttons[15]?.pressed ?? false;
      const dirs = {
        up: dpadUp || state.leftStick.y < -STICK_THRESHOLD,
        down: dpadDown || state.leftStick.y > STICK_THRESHOLD,
        left: dpadLeft || state.leftStick.x < -STICK_THRESHOLD,
        right: dpadRight || state.leftStick.x > STICK_THRESHOLD,
      };

      for (const [dir, dx, dy] of [
        ['up', 0, -1],
        ['down', 0, 1],
        ['left', -1, 0],
        ['right', 1, 0],
      ]) {
        const pressed = dirs[dir];
        if (pressed && !held[dir]) {
          move(dx, dy);
          nextRepeatAt[dir] = now + MOVE_INITIAL_DELAY_MS;
        } else if (pressed && held[dir] && now >= nextRepeatAt[dir]) {
          move(dx, dy);
          nextRepeatAt[dir] = now + MOVE_REPEAT_MS;
        }
        held[dir] = pressed;
      }

      // A (index 0) : valide l'élément focus — un vrai .click(), donc tout
      // onClick existant marche sans rien y changer.
      const aDown = state.buttons[0]?.pressed ?? false;
      if (aDown && !aWasDown) document.activeElement?.click?.();
      aWasDown = aDown;

      // B (index 1) : retour arrière, si fourni.
      const bDown = state.buttons[1]?.pressed ?? false;
      if (bDown && !bWasDown) onBack?.();
      bWasDown = bDown;
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      gamepad.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, onBack]);
}
