import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { makeSkyTexture } from './classicArena.js';
import { AGENT_FLOOR_Y } from './aimBots.js';
import { PLAYABLE_MAPS } from './playableMaps.js';
import { createWalker, WALKER } from './mapWalker.js';
import './mapExplorer.css';

// Aperçu d'une carte reproduite (playableMaps.js) : on s'y déplace comme en jeu
// (collisions, escaliers, saut, accroupi) pour vérifier la carte avant le
// futur mode « entrées sur site ». Minimap officielle en incrustation, avec la
// position du joueur, pour comparer le plan pixel par pixel.

const VALORANT_YAW = 0.07; // degrés par unité de souris et par point de sensibilité
const DEG = Math.PI / 180;
const FLY_SPEED = 9;
const MINIMAP_SIZE = 240; // px à l'écran
const MINIMAP_WINDOW = 150; // px de la minimap officielle autour du joueur

const hToVFov = (hDeg, aspect) => (2 * Math.atan(Math.tan((hDeg * DEG) / 2) / aspect)) / DEG;

export default function MapExplorer({ t, mapId = 'ascentA', settings = {} }) {
  const tr = (key, params) => t(`aimTrainer.mapPreview.${key}`, params);
  const trMap = (key, params) => t(`aimTrainer.mapPreview.maps.${mapId}.${key}`, params);
  const mapDef = PLAYABLE_MAPS[mapId];
  const mountRef = useRef(null);
  const minimapRef = useRef(null);
  const sceneRef = useRef(null);
  const [locked, setLocked] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [hud, setHud] = useState({ callout: null, u: 0, v: 0, h: 0, noclip: false });
  const minimapOnRef = useRef(showMinimap);
  minimapOnRef.current = showMinimap;

  useEffect(() => {
    const mount = mountRef.current;
    const isDark = settings.theme === 'dark';
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
    if (!isDark && mapDef.sky) {
      sky = mapDef.sky();
      scene.add(sky);
    } else if (!isDark) {
      sky = new THREE.Mesh(
        new THREE.SphereGeometry(180, 40, 24),
        new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
      );
      scene.add(sky);
    }

    const map = new THREE.Group();
    scene.add(map);
    const info = mapDef.build(map, { floorY, isDark });
    // Soleil et ombres portées propres à la carte, comme sur les captures du jeu.
    mapDef.light(scene, renderer, info, { isDark });
    const walker = createWalker(info.solids);

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
    goTo(info.spawns[0]);

    // Minimap officielle (valorant-api.com), dessinée autour du joueur.
    const minimapImg = new Image();
    minimapImg.crossOrigin = 'anonymous';
    let minimapReady = false;
    minimapImg.onload = () => {
      minimapReady = true;
    };
    minimapImg.src = mapDef.minimapUrl;
    const drawMinimap = () => {
      const canvas = minimapRef.current;
      if (!canvas || !minimapOnRef.current) return;
      const ctx = canvas.getContext('2d');
      const { u, v } = mapDef.toMinimap(camera.position.x, camera.position.z);
      const scale = MINIMAP_SIZE / MINIMAP_WINDOW;
      ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
      ctx.fillStyle = 'rgba(12,14,20,0.85)';
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
      if (minimapReady) {
        // L'image fait 1024 px : 1 px de minimap = 1 unité de nos données.
        const k = minimapImg.naturalWidth / 1024;
        ctx.drawImage(
          minimapImg,
          (u - MINIMAP_WINDOW / 2) * k,
          (v - MINIMAP_WINDOW / 2) * k,
          MINIMAP_WINDOW * k,
          MINIMAP_WINDOW * k,
          0,
          0,
          MINIMAP_SIZE,
          MINIMAP_SIZE,
        );
      }
      // Joueur : point et cône de vision (lacet 0 = nord = haut de l'image).
      const c = MINIMAP_SIZE / 2;
      const dir = -euler.y - Math.PI / 2;
      ctx.fillStyle = 'rgba(255,70,85,0.25)';
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, 42, dir - 0.5, dir + 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff4655';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${Math.round(scale * 100) / 100}× · N ↑`, 8, MINIMAP_SIZE - 8);
    };

    // --- Entrées -----------------------------------------------------------------
    const keys = new Set();
    let jumpQueued = false;
    const isLocked = () => document.pointerLockElement === renderer.domElement;
    const onMouseMove = (e) => {
      if (!isLocked()) return;
      const k = (settings.sens ?? 0.35) * VALORANT_YAW * DEG;
      euler.y -= e.movementX * k;
      euler.x = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, euler.x - e.movementY * k));
      camera.quaternion.setFromEuler(euler);
    };
    const setNoclip = (next) => {
      noclip = next;
      if (!noclip) walker.teleport(camera.position.x, camera.position.y - WALKER.eye, camera.position.z);
    };
    // Déplacements : position physique des touches (e.code, ZQSD en AZERTY).
    const onKeyDown = (e) => {
      if (!isLocked()) return;
      if (e.code === 'Space' || e.ctrlKey) e.preventDefault();
      keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Space') jumpQueued = true;
      if (e.code === 'KeyM') setShowMinimap((v) => !v);
      if (e.code === 'KeyN') setNoclip(!noclip);
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
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = hToVFov(settings.fov ?? 103, w / h);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    // --- Boucle ----------------------------------------------------------------------
    let last = performance.now();
    let frame = 0;
    let lastHud = 0;
    let lastMinimap = 0;
    let hudKey = '';
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const locked = isLocked();
      const fwd = locked ? (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) : 0;
      const side = locked ? (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) : 0;
      const crouch = locked && (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'));
      if (noclip) {
        const speed = FLY_SPEED * (keys.has('ShiftLeft') ? 0.35 : 1) * dt;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        camera.position.addScaledVector(dir, fwd * speed).addScaledVector(right, side * speed);
        camera.position.y += ((locked && keys.has('Space') ? 1 : 0) - (crouch ? 1 : 0)) * speed;
        jumpQueued = false;
      } else {
        walker.update(dt, {
          forward: fwd,
          strafe: side,
          yaw: euler.y,
          walk: locked && (keys.has('ShiftLeft') || keys.has('ShiftRight')),
          crouch,
          jump: jumpQueued,
        });
        jumpQueued = false;
        // Sortie de carte (chute) : retour au point de départ.
        if (walker.pos.y < floorY - 10) goTo(info.spawns[0]);
        camera.position.set(walker.pos.x, walker.eyeY(), walker.pos.z);
      }
      if (sky) sky.position.copy(camera.position);
      renderer.render(scene, camera);

      if (now - lastMinimap > 50) {
        lastMinimap = now;
        drawMinimap();
      }
      if (now - lastHud > 120) {
        lastHud = now;
        const feet = noclip ? camera.position.y - WALKER.eye - floorY : walker.pos.y - floorY;
        const { u, v } = mapDef.toMinimap(camera.position.x, camera.position.z);
        const next = {
          callout: mapDef.calloutAt(camera.position.x, camera.position.z, feet),
          u: Math.round(u),
          v: Math.round(v),
          h: Math.round(feet * 100) / 100,
          noclip,
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
      goTo: (id) => {
        const spawn = info.spawns.find((s) => s.id === id);
        if (!spawn) return;
        noclip = false;
        goTo(spawn);
        renderer.domElement.requestPointerLock();
      },
    };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (isLocked()) document.exitPointerLock();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      minimapImg.onload = null;
      scene.traverse((o) => {
        o.shadow?.map?.dispose();
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => {
          ['map', 'bumpMap', 'emissiveMap'].forEach((slot) => m[slot]?.dispose());
          m.dispose();
        });
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
    // Scène créée une fois ; les réglages sont lus à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-screen">
      <div ref={mountRef} className="mx-canvas" onClick={() => !locked && sceneRef.current?.lock()} />
      <canvas ref={minimapRef} className={showMinimap ? 'mx-minimap' : 'mx-minimap mx-hidden'} width={MINIMAP_SIZE} height={MINIMAP_SIZE} />

      {locked && <div className="mx-crosshair" aria-hidden="true" />}
      {hud.callout && <div className="mx-callout">{trMap(`callouts.${hud.callout}`)}</div>}
      <div className="mx-coords">
        {tr('coords', { u: hud.u, v: hud.v, h: hud.h.toFixed(2) })}
        {hud.noclip && <strong> · {tr('noclip')}</strong>}
      </div>
      {locked && <p className="mx-help">{tr('help')}</p>}

      {!locked && (
        <div className="mx-menu">
          <div className="mx-card">
            <span className="mx-eyebrow">{tr('eyebrow')}</span>
            <h2>{trMap('title')}</h2>
            <p>{trMap('intro')}</p>
            <p className="mx-note">{trMap('accuracy')}</p>
            <div className="mx-spawns">
              {mapDef.spawns.map((spawn, i) => (
                <button key={spawn.id} type="button" className="mx-spawn" onClick={() => sceneRef.current?.goTo(spawn.id)}>
                  <kbd>{i + 1}</kbd>
                  {trMap(`spawns.${spawn.id}`)}
                </button>
              ))}
            </div>
            <button type="button" className="mx-play" onClick={() => sceneRef.current?.lock()}>
              {tr('play')}
            </button>
            <ul className="mx-keys">
              {['move', 'walk', 'jump', 'crouch', 'teleport', 'minimap', 'noclip'].map((k) => (
                <li key={k}>{tr(`keys.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
