import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { makeSkyTexture } from '../classicArena.js';
import { AGENT_FLOOR_Y, buildAgentModel } from '../aimBots.js';
import { AGENT_HEIGHT } from '../aimTrainerModes.js';
import { PLAYABLE_MAPS } from '../playableMaps.js';
import { createWalker, WALKER } from '../mapWalker.js';
import { ARENA_LIMITS, createArena, createEnemy, ENEMY_STYLES, loadArenasOf, sanitizeArena, saveArenasOf } from './arenaStore.js';
import './arenaEditor.css';

// Pose d'ennemis sur une carte Valorant (aimMap*.js) : on s'y déplace comme
// dans l'aperçu de carte, on vise le sol et on clique pour poser un ennemi
// exactement là. Les arènes obtenues (base = identifiant de la carte) se jouent
// comme celles de l'éditeur classique. Sauvegarde locale automatique.

const RUN_SPEED = 6.75; // m/s, course de Valorant
const VALORANT_YAW = 0.07; // degrés par unité de souris et par point de sensibilité
const DEG = Math.PI / 180;
const REACH = 70; // portée de pose, en mètres
const FLY_SPEED = 9;
const STAND_MARGIN = 0.06; // tolérance pour retrouver le sol sous le point visé
const WALL_PUSH = 0.35; // recul depuis un mur visé, ~ rayon d'un ennemi

const hToVFov = (hDeg, aspect) => (2 * Math.atan(Math.tan((hDeg * DEG) / 2) / aspect)) / DEG;

// Dessus du plus haut pavé sous (x, z) qui ne dépasse pas `maxY` : la surface
// sur laquelle l'ennemi se tient.
function surfaceBelow(solids, x, z, maxY) {
  let top = null;
  for (const s of solids) {
    if (x < s.min.x || x > s.max.x || z < s.min.z || z > s.max.z) continue;
    if (s.max.y > maxY + STAND_MARGIN) continue;
    if (top === null || s.max.y > top) top = s.max.y;
  }
  return top;
}

function nearestSolidHit(ray, solids, maxDist) {
  const tmp = new THREE.Vector3();
  let best = null;
  for (const s of solids) {
    if (!ray.intersectBox(s, tmp)) continue;
    const d = ray.origin.distanceTo(tmp);
    if (d < maxDist && (!best || d < best.distance)) best = { point: tmp.clone(), distance: d };
  }
  return best;
}

export default function MapEnemyEditor({ t, mapId, settings = {}, onPlay }) {
  const tr = (key, params) => t(`aimTrainer.mapEditor.${key}`, params);
  const trMap = (key, params) => t(`aimTrainer.mapPreview.maps.${mapId}.${key}`, params);
  const mapDef = PLAYABLE_MAPS[mapId];

  const [arenas, setArenas] = useState(() => {
    const list = loadArenasOf(mapId);
    return list.length ? list : [createArena(t('aimTrainer.mapEditor.defaultName'), mapId)];
  });
  const [arena, setArena] = useState(() => [...arenas].sort((a, b) => b.updatedAt - a.updatedAt)[0]);
  const [saveState, setSaveState] = useState('saved');
  const [locked, setLocked] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [hud, setHud] = useState({ callout: null, noclip: false, toast: null });

  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const arenaRef = useRef(arena);
  arenaRef.current = arena;
  const arenasRef = useRef(arenas);
  arenasRef.current = arenas;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const persist = useCallback(
    (current) => {
      const list = arenasRef.current.some((a) => a.id === current.id)
        ? arenasRef.current.map((a) => (a.id === current.id ? current : a))
        : [...arenasRef.current, current];
      arenasRef.current = list;
      setArenas(list);
      setSaveState(saveArenasOf(mapId, list) ? 'saved' : 'error');
      return list;
    },
    [mapId],
  );

  const commit = useCallback((next) => {
    setArena(sanitizeArena({ ...next, updatedAt: Date.now() }));
  }, []);

  useEffect(() => {
    setSaveState('saving');
    const id = setTimeout(() => persist(arena), 400);
    return () => clearTimeout(id);
  }, [arena, persist]);
  useEffect(() => () => persist(arenaRef.current), [persist]);

  const openArena = (next) => {
    setArena(next);
    setRenaming(false);
  };
  const switchArena = (id) => {
    const next = persist(arenaRef.current).find((a) => a.id === id);
    if (next) openArena(next);
  };
  const newArena = () => {
    persist(arenaRef.current);
    const created = createArena(t('aimTrainer.mapEditor.defaultName'), mapId);
    persist(created);
    openArena(created);
  };
  const deleteArena = () => {
    if (!window.confirm(t('aimTrainer.arenaEditor.deleteConfirm', { name: arena.name }))) return;
    let next = arenasRef.current.filter((a) => a.id !== arena.id);
    if (!next.length) next = [createArena(t('aimTrainer.mapEditor.defaultName'), mapId)];
    arenasRef.current = next;
    setArenas(next);
    setSaveState(saveArenasOf(mapId, next) ? 'saved' : 'error');
    openArena(next[0]);
  };
  const setEnemySetting = (field, value) => commit({ ...arenaRef.current, enemySettings: { ...arenaRef.current.enemySettings, [field]: value } });

  // --- Scène -------------------------------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    const cfg = settingsRef.current;
    const isDark = cfg.theme === 'dark';
    const floorY = AGENT_FLOOR_Y;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? 0x0b0d12 : 0xb9d3ea);
    scene.fog = new THREE.FogExp2(isDark ? 0x0b0d12 : 0xd6dcf0, isDark ? 0.018 : 0.004);
    let sky = null;
    if (!isDark) {
      sky =
        mapDef.sky?.() ??
        new THREE.Mesh(
          new THREE.SphereGeometry(180, 40, 24),
          new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
        );
      scene.add(sky);
    }

    const map = new THREE.Group();
    scene.add(map);
    const info = mapDef.build(map, { floorY, isDark });
    mapDef.light(scene, renderer, info, { isDark });
    const solids = info.solids;
    const walker = createWalker(solids);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    scene.add(camera);
    let noclip = false;

    const goTo = (spawn) => {
      walker.teleport(spawn.x, spawn.feetY + 0.2, spawn.z);
      euler.set(0, spawn.yaw, 0);
      camera.quaternion.setFromEuler(euler);
      camera.position.set(walker.pos.x, walker.eyeY(), walker.pos.z);
    };
    // Reprend là où l'arène a son point de départ ; une arène neuve (point à
    // l'origine, jamais posé) commence au premier point de la carte.
    const startSpot = () => {
      const s = arenaRef.current.spawn;
      if (s.x === 0 && s.z === 0 && s.y === 0 && s.yaw === 0) return info.spawns[0];
      return { x: s.x, z: s.z, feetY: floorY + s.y, yaw: s.yaw };
    };
    goTo(startSpot());

    // --- Marqueurs ----------------------------------------------------------------
    const markerMat = (color, opacity) =>
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.5, transparent: true, opacity, depthWrite: false });
    const mats = { seen: markerMat(0xff2238, 0.9), ghost: markerMat(0x4ec9f5, 0.5) };
    const markers = new THREE.Group();
    scene.add(markers);
    const ghost = buildAgentModel(mats.ghost).group;
    ghost.visible = false;
    scene.add(ghost);

    const spawnMarker = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4ec9f5, transparent: true, opacity: 0.85, depthWrite: false });
    spawnMarker.add(
      new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 32).rotateX(Math.PI / 2), ringMat),
      new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 12).rotateX(-Math.PI / 2).translate(0, 0.05, -0.62), ringMat),
    );
    scene.add(spawnMarker);

    const sync = (data) => {
      markers.children.forEach((g) => g.traverse((o) => o.geometry?.dispose()));
      markers.clear();
      data.enemies.forEach((enemy) => {
        const { group } = buildAgentModel(mats.seen);
        group.position.set(enemy.x, floorY + enemy.y, enemy.z);
        group.scale.setScalar(enemy.scale ?? data.enemySettings.scale);
        group.userData.enemyId = enemy.id;
        markers.add(group);
      });
      spawnMarker.position.set(data.spawn.x, floorY + data.spawn.y + 0.05, data.spawn.z);
      spawnMarker.rotation.y = data.spawn.yaw;
    };
    sync(arenaRef.current);

    // --- Visée ------------------------------------------------------------------------
    const aimRay = new THREE.Ray();
    const forward = new THREE.Vector3();
    const aimAtGround = () => {
      camera.getWorldPosition(aimRay.origin);
      camera.getWorldDirection(forward);
      aimRay.direction.copy(forward);
      const hit = nearestSolidHit(aimRay, solids, REACH);
      if (!hit) return null;
      // Contre un mur, on recule un peu pour que l'ennemi ne soit pas dedans.
      const x = hit.point.x - forward.x * WALL_PUSH * (1 - Math.abs(forward.y));
      const z = hit.point.z - forward.z * WALL_PUSH * (1 - Math.abs(forward.y));
      const top = surfaceBelow(solids, x, z, hit.point.y);
      if (top === null) return null;
      return { x, z, y: top - floorY };
    };
    const raycaster = new THREE.Raycaster();
    const aimedEnemyId = () => {
      raycaster.set(aimRay.origin, forward.clone());
      raycaster.far = REACH;
      const hits = raycaster.intersectObjects(markers.children, true);
      if (!hits.length) return null;
      const wall = nearestSolidHit(aimRay, solids, REACH);
      if (wall && wall.distance < hits[0].distance) return null;
      let obj = hits[0].object;
      while (obj && !obj.userData.enemyId) obj = obj.parent;
      return obj?.userData.enemyId ?? null;
    };

    let toast = null;
    let toastUntil = 0;
    const say = (key) => {
      toast = key;
      toastUntil = performance.now() + 1800;
    };

    const placeEnemy = () => {
      const current = arenaRef.current;
      if (current.enemies.length >= ARENA_LIMITS.maxEnemies) return say('full');
      const spot = aimAtGround();
      if (!spot) return;
      // Pas deux ennemis au même endroit (double clic, doublon de clic).
      if (current.enemies.some((e) => Math.hypot(e.x - spot.x, e.z - spot.z) < 0.5 && Math.abs(e.y - spot.y) < 0.5)) return;
      setArena(sanitizeArena({ ...current, enemies: [...current.enemies, createEnemy(spot)], updatedAt: Date.now() }));
    };
    const removeEnemy = () => {
      aimAtGround();
      const id = aimedEnemyId();
      const current = arenaRef.current;
      if (!id) return;
      setArena(sanitizeArena({ ...current, enemies: current.enemies.filter((e) => e.id !== id), updatedAt: Date.now() }));
    };
    const undoEnemy = () => {
      const current = arenaRef.current;
      if (!current.enemies.length) return;
      setArena(sanitizeArena({ ...current, enemies: current.enemies.slice(0, -1), updatedAt: Date.now() }));
    };
    const setSpawn = () => {
      const feet = noclip ? aimAtGround() : { x: walker.pos.x, z: walker.pos.z, y: walker.pos.y - floorY };
      if (!feet) return;
      const current = arenaRef.current;
      setArena(sanitizeArena({ ...current, spawn: { x: feet.x, z: feet.z, y: feet.y, yaw: euler.y }, updatedAt: Date.now() }));
      say('spawnSet');
    };

    // --- Entrées -----------------------------------------------------------------------
    const keys = new Set();
    let jumpQueued = false;
    const isLocked = () => document.pointerLockElement === renderer.domElement;
    const onMouseMove = (e) => {
      if (!isLocked()) return;
      const k = (cfg.sens ?? 0.35) * VALORANT_YAW * DEG;
      euler.y -= e.movementX * k;
      euler.x = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, euler.x - e.movementY * k));
      camera.quaternion.setFromEuler(euler);
    };
    const onMouseDown = (e) => {
      if (!isLocked()) return;
      e.preventDefault();
      if (e.button === 0) placeEnemy();
      if (e.button === 2) removeEnemy();
    };
    const setNoclip = (next) => {
      noclip = next;
      if (!noclip) walker.teleport(camera.position.x, camera.position.y - WALKER.eye, camera.position.z);
    };
    const onKeyDown = (e) => {
      if (!isLocked()) return;
      if (e.code === 'Space' || e.ctrlKey) e.preventDefault();
      keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Space') jumpQueued = true;
      if (e.code === 'KeyN') setNoclip(!noclip);
      if (e.code === 'KeyP') setSpawn();
      if (e.code === 'Backspace' || e.code === 'KeyX') undoEnemy();
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && info.spawns[Number(digit[1]) - 1]) {
        noclip = false;
        goTo(info.spawns[Number(digit[1]) - 1]);
      }
    };
    const onKeyUp = (e) => keys.delete(e.code);
    const onLockChange = () => {
      const now = isLocked();
      setLocked(now);
      if (!now) keys.clear();
    };
    const onBlur = () => keys.clear();
    const onContextMenu = (e) => e.preventDefault();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = hToVFov(cfg.fov ?? 103, w / h);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    // --- Boucle ------------------------------------------------------------------------
    let last = performance.now();
    let frame = 0;
    let lastHud = 0;
    let hudKey = '';
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const lockedNow = isLocked();
      const fwd = lockedNow ? (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) : 0;
      const side = lockedNow ? (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) : 0;
      const crouch = lockedNow && (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'));
      if (noclip) {
        const speed = FLY_SPEED * (keys.has('ShiftLeft') ? 0.35 : 1) * dt;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        camera.position.addScaledVector(dir, fwd * speed).addScaledVector(right, side * speed);
        camera.position.y += ((lockedNow && keys.has('Space') ? 1 : 0) - (crouch ? 1 : 0)) * speed;
        jumpQueued = false;
      } else {
        walker.update(dt, {
          forward: fwd,
          strafe: side,
          yaw: euler.y,
          walk: lockedNow && (keys.has('ShiftLeft') || keys.has('ShiftRight')),
          crouch,
          jump: jumpQueued,
        });
        jumpQueued = false;
        if (walker.pos.y < floorY - 10) goTo(startSpot());
        camera.position.set(walker.pos.x, walker.eyeY(), walker.pos.z);
      }
      if (sky) sky.position.copy(camera.position);

      // Fantôme au point visé, uniquement en mode pose.
      const spot = lockedNow ? aimAtGround() : null;
      if (spot) {
        const full = arenaRef.current.enemies.length >= ARENA_LIMITS.maxEnemies;
        ghost.visible = !full;
        ghost.position.set(spot.x, floorY + spot.y, spot.z);
        ghost.scale.setScalar(arenaRef.current.enemySettings.scale);
      } else {
        ghost.visible = false;
      }
      spawnMarker.rotation.y = arenaRef.current.spawn.yaw;
      renderer.render(scene, camera);

      if (now - lastHud > 120) {
        lastHud = now;
        const feet = noclip ? camera.position.y - WALKER.eye - floorY : walker.pos.y - floorY;
        const next = {
          callout: mapDef.calloutAt(camera.position.x, camera.position.z, feet),
          noclip,
          toast: now < toastUntil ? toast : null,
        };
        const key = JSON.stringify(next);
        if (key !== hudKey) {
          hudKey = key;
          setHud(next);
        }
      }
    };
    loop();

    sceneRef.current = {
      lock: () => renderer.domElement.requestPointerLock(),
      sync,
    };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (isLocked()) document.exitPointerLock();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      scene.traverse((o) => {
        o.shadow?.map?.dispose();
        o.geometry?.dispose();
        const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        list.forEach((m) => {
          ['map', 'bumpMap', 'emissiveMap'].forEach((slot) => m[slot]?.dispose());
          m.dispose();
        });
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
    // Scène créée une fois ; l'arène est relue via arenaRef et `sync`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.sync(arena);
  }, [arena]);

  const es = arena.enemySettings;
  const toastText = hud.toast ? tr(`toast.${hud.toast}`) : null;

  return (
    <div className="ae-screen">
      <div ref={mountRef} className="ae-canvas" onClick={() => !locked && sceneRef.current?.lock()} />

      {locked ? (
        <>
          <div className="ae-crosshair" aria-hidden="true" />
          <p className="ae-help">{tr('help')}</p>
          <p className="ae-counts">
            {tr('counts', { enemies: arena.enemies.length, maxEnemies: ARENA_LIMITS.maxEnemies })}
            {hud.noclip && <> · {tr('noclip')}</>}
            {hud.callout && <> · {trMap(`callouts.${hud.callout}`)}</>}
          </p>
          {toastText && <p className="ae-selection-hint">{toastText}</p>}
        </>
      ) : (
        <div className="ae-menu" role="dialog" aria-modal="true">
          <div className="ae-menu-card">
            <header className="ae-menu-head">
              <h2>{tr('title', { map: trMap('title') })}</h2>
              <span className={`ae-save ae-save-${saveState}`}>{t(`aimTrainer.arenaEditor.save.${saveState}`)}</span>
            </header>
            <p className="ae-note">{tr('intro')}</p>

            <section className="ae-menu-row">
              {renaming ? (
                <input
                  className="ae-input"
                  autoFocus
                  maxLength={ARENA_LIMITS.nameLength}
                  defaultValue={arena.name}
                  onBlur={(e) => {
                    setRenaming(false);
                    const name = e.target.value.trim();
                    if (name && name !== arena.name) commit({ ...arena, name });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                />
              ) : (
                <select className="ae-input" value={arena.id} onChange={(e) => switchArena(e.target.value)}>
                  {arenas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id === arena.id ? arena.name : a.name}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="ae-link" onClick={() => setRenaming(true)}>
                {t('aimTrainer.arenaEditor.rename')}
              </button>
              <button type="button" className="ae-link" onClick={newArena}>
                {t('aimTrainer.arenaEditor.newArena')}
              </button>
              <button type="button" className="ae-link danger" onClick={deleteArena}>
                {t('aimTrainer.arenaEditor.deleteArena')}
              </button>
            </section>

            <section className="ae-menu-section">
              <h3>{t('aimTrainer.arenaEditor.enemiesTitle')}</h3>
              <p className="ae-note">{tr('enemiesHint', { count: arena.enemies.length })}</p>
              <label className="ae-setting">
                <span>{t('aimTrainer.arenaEditor.enemyStyle')}</span>
                <select className="ae-input" value={es.style} onChange={(e) => setEnemySetting('style', e.target.value)}>
                  {ENEMY_STYLES.map((id) => (
                    <option key={id} value={id}>
                      {t(`aimTrainer.agentStyles.${id}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ae-setting">
                <span>{t('aimTrainer.arenaEditor.enemySpeed', { value: (RUN_SPEED * es.speed).toFixed(2) })}</span>
                <input type="range" min={ARENA_LIMITS.enemySpeed.min} max={ARENA_LIMITS.enemySpeed.max} step="0.05" value={es.speed} onChange={(e) => setEnemySetting('speed', Number(e.target.value))} />
              </label>
              <label className="ae-setting">
                <span>{t('aimTrainer.arenaEditor.enemyScale', { value: (AGENT_HEIGHT * es.scale).toFixed(2) })}</span>
                <input type="range" min={ARENA_LIMITS.enemyScale.min} max={ARENA_LIMITS.enemyScale.max} step="0.05" value={es.scale} onChange={(e) => setEnemySetting('scale', Number(e.target.value))} />
              </label>
            </section>

            <section className="ae-menu-section">
              <h3>{t('aimTrainer.arenaEditor.controlsTitle')}</h3>
              <ul className="ae-controls">
                {['move', 'place', 'remove', 'undo', 'spawn', 'teleport', 'fly'].map((k) => (
                  <li key={k}>
                    <kbd>{tr(`controls.${k}.keys`)}</kbd>
                    {tr(`controls.${k}.label`)}
                  </li>
                ))}
              </ul>
            </section>

            <footer className="ae-menu-foot">
              <span className="ae-note">{tr('counts', { enemies: arena.enemies.length, maxEnemies: ARENA_LIMITS.maxEnemies })}</span>
              <div className="ae-menu-actions">
                <button type="button" className="ae-link" onClick={() => commit({ ...arena, enemies: [] })} disabled={!arena.enemies.length}>
                  {tr('clearAll')}
                </button>
                <button type="button" className="ae-build" onClick={() => sceneRef.current?.lock()}>
                  {t('aimTrainer.arenaEditor.build')}
                </button>
                {onPlay && (
                  <button
                    type="button"
                    className="ae-build ae-play"
                    disabled={arena.enemies.length === 0}
                    title={arena.enemies.length === 0 ? t('aimTrainer.arenaEditor.playDisabled') : ''}
                    onClick={() => {
                      persist(arena);
                      onPlay(arena);
                    }}
                  >
                    {t('aimTrainer.arenaEditor.play')}
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
