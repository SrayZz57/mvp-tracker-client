import { AGENT_HEIGHT, AGENT_HEAD_RADIUS } from './aimTrainerModes.js';

// Déplacement à la première personne sur une carte décrite par des pavés
// (THREE.Box3, coordonnées monde) : course et marche aux vitesses de Valorant,
// saut, accroupi, montée et descente automatiques des marches. Pensé pour le
// futur mode « entrées sur site » (carte : aimMapAscentA.js) ; l'aperçu de
// carte (MapExplorer.jsx) s'en sert déjà.
//
// Le joueur est un pavé vertical de 60 cm de côté. Chaque image, on avance
// d'abord en x puis en z (glisse le long des murs), puis on résout la gravité.

export const WALKER = {
  radius: 0.3,
  height: AGENT_HEIGHT,
  crouchHeight: 1.45,
  // Yeux à hauteur de tête, comme dans les autres modes : la tête d'un agent
  // debout arrive pile au niveau du viseur (voir aimBots.js).
  eye: AGENT_HEIGHT - AGENT_HEAD_RADIUS,
  crouchEye: 1.3,
  run: 6.75, // m/s, course de Valorant
  walk: 3.8, // Maj
  crouchSpeed: 2.3,
  accel: 26, // mêmes accélérations que les agents (aimBots.js)
  decel: 48,
  airAccel: 6,
  gravity: 21,
  jump: 6.5, // sommet du saut à ~1 m
  step: 0.5, // marche franchie sans sauter
};

const GAP = 1e-3;

export function createWalker(solids, W = WALKER) {
  const pos = { x: 0, y: 0, z: 0 }; // pieds
  const vel = { x: 0, y: 0, z: 0 };
  let onGround = false;
  let crouched = false;
  let eyeHeight = W.eye; // lissé entre debout et accroupi
  let stepLag = 0; // décalage de caméra après une marche, résorbé en douceur

  const height = () => (crouched ? W.crouchHeight : W.height);
  const r = W.radius;

  const overlapping = (x, y, z, h) => {
    const out = [];
    for (const s of solids) {
      if (s.max.x <= x - r || s.min.x >= x + r || s.max.z <= z - r || s.min.z >= z + r) continue;
      if (s.max.y <= y + 1e-4 || s.min.y >= y + h) continue;
      out.push(s);
    }
    return out;
  };

  // Plus haut sol sous l'empreinte du joueur entre `below` et `above`.
  const groundBetween = (x, z, below, above) => {
    let top = -Infinity;
    for (const s of solids) {
      if (s.max.x <= x - r || s.min.x >= x + r || s.max.z <= z - r || s.min.z >= z + r) continue;
      if (s.max.y <= above + 1e-4 && s.max.y >= below - 1e-4 && s.max.y > top) top = s.max.y;
    }
    return top;
  };

  const moveAxis = (axis, delta) => {
    if (!delta) return;
    const h = height();
    const nx = axis === 'x' ? pos.x + delta : pos.x;
    const nz = axis === 'z' ? pos.z + delta : pos.z;
    const hit = overlapping(nx, pos.y, nz, h);
    if (!hit.length) {
      pos.x = nx;
      pos.z = nz;
      return;
    }
    // Tout ce qui bloque est assez bas : on monte dessus (marches, rebords).
    if (onGround) {
      let top = -Infinity;
      hit.forEach((s) => {
        top = Math.max(top, s.max.y);
      });
      if (top - pos.y <= W.step && !overlapping(nx, top, nz, h).length) {
        stepLag += top - pos.y;
        pos.x = nx;
        pos.z = nz;
        pos.y = top;
        return;
      }
    }
    // Sinon on se colle à la face, sans jamais reculer.
    const cur = axis === 'x' ? pos.x : pos.z;
    let limit = cur + delta;
    hit.forEach((s) => {
      if (delta > 0) limit = Math.min(limit, (axis === 'x' ? s.min.x : s.min.z) - r - GAP);
      else limit = Math.max(limit, (axis === 'x' ? s.max.x : s.max.z) + r + GAP);
    });
    limit = delta > 0 ? Math.max(cur, limit) : Math.min(cur, limit);
    pos[axis] = limit;
    vel[axis] = 0;
  };

  return {
    pos,
    vel,
    get onGround() {
      return onGround;
    },
    get crouched() {
      return crouched;
    },
    // Place le joueur (pieds) et le pose sur le sol en dessous.
    teleport(x, y, z) {
      pos.x = x;
      pos.y = y;
      pos.z = z;
      vel.x = 0;
      vel.y = 0;
      vel.z = 0;
      stepLag = 0;
      const ground = groundBetween(x, z, y - 2, y + 0.6);
      if (ground > -Infinity) pos.y = ground;
      onGround = ground > -Infinity;
    },
    // input : { forward, strafe (-1..1), yaw (radians, 0 = -z), walk, crouch, jump }
    update(dt, input) {
      // Saut accroupi : en l'air, s'accroupir replie les jambes (la tête ne
      // bouge pas, les pieds montent), ce qui permet d'atteindre les caisses
      // trop hautes pour un saut simple. On les ressort en se relevant.
      const tuck = W.height - W.crouchHeight;
      if (input.crouch && !crouched) {
        crouched = true;
        if (!onGround) {
          pos.y += tuck;
          stepLag += tuck;
        }
      } else if (!input.crouch && crouched) {
        if (onGround) {
          if (!overlapping(pos.x, pos.y, pos.z, W.height).length) crouched = false;
        } else if (!overlapping(pos.x, pos.y - tuck, pos.z, W.height).length) {
          crouched = false;
          pos.y -= tuck;
          stepLag -= tuck;
        }
      }

      const speed = crouched ? W.crouchSpeed : input.walk ? W.walk : W.run;
      let tx = 0;
      let tz = 0;
      const len = Math.hypot(input.forward, input.strafe);
      if (len > 0) {
        const f = input.forward / Math.max(1, len);
        const s = input.strafe / Math.max(1, len);
        const sy = Math.sin(input.yaw);
        const cy = Math.cos(input.yaw);
        tx = (-sy * f + cy * s) * speed;
        tz = (-cy * f - sy * s) * speed;
      }
      const rate = onGround ? (len > 0 ? W.accel : W.decel) : W.airAccel;
      const ax = tx - vel.x;
      const az = tz - vel.z;
      const dl = Math.hypot(ax, az);
      const maxd = rate * dt;
      if (dl <= maxd) {
        vel.x = tx;
        vel.z = tz;
      } else {
        vel.x += (ax / dl) * maxd;
        vel.z += (az / dl) * maxd;
      }
      if (input.jump && onGround) {
        vel.y = W.jump;
        onGround = false;
      }

      // Pas de 20 cm au plus : aucun mur ne peut être traversé d'une image à l'autre.
      const steps = Math.max(1, Math.ceil((Math.hypot(vel.x, vel.z) * dt) / 0.2));
      for (let i = 0; i < steps; i += 1) {
        moveAxis('x', (vel.x * dt) / steps);
        moveAxis('z', (vel.z * dt) / steps);
      }

      if (onGround && vel.y <= 0) {
        // Descente de marches : on reste collé au sol s'il est juste en dessous.
        const ground = groundBetween(pos.x, pos.z, pos.y - W.step, pos.y);
        if (ground > -Infinity) {
          stepLag -= pos.y - ground;
          pos.y = ground;
          vel.y = 0;
        } else {
          onGround = false;
        }
      }
      if (!onGround) {
        vel.y -= W.gravity * dt;
        const dy = vel.y * dt;
        if (dy <= 0) {
          const ground = groundBetween(pos.x, pos.z, pos.y + dy, pos.y);
          if (ground > -Infinity) {
            pos.y = ground;
            vel.y = 0;
            onGround = true;
          } else pos.y += dy;
        } else {
          const h = height();
          let ceiling = Infinity;
          for (const s of solids) {
            if (s.max.x <= pos.x - r || s.min.x >= pos.x + r || s.max.z <= pos.z - r || s.min.z >= pos.z + r) continue;
            if (s.min.y >= pos.y + h - 1e-4 && s.min.y <= pos.y + h + dy && s.min.y < ceiling) ceiling = s.min.y;
          }
          if (ceiling < Infinity) {
            pos.y = ceiling - h;
            vel.y = 0;
          } else pos.y += dy;
        }
      }

      const targetEye = crouched ? W.crouchEye : W.eye;
      eyeHeight += (targetEye - eyeHeight) * Math.min(1, dt * 14);
      stepLag *= Math.exp(-dt * 16);
      if (Math.abs(stepLag) < 1e-3) stepLag = 0;
    },
    // Hauteur de la caméra (monde).
    eyeY() {
      return pos.y + eyeHeight - stepLag;
    },
  };
}
