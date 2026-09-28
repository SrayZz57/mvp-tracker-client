import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createVandalViewmodel } from './vandalModel.js';
import { createGlockViewmodel } from './glockModel.js';
import { createSniperViewmodel } from './sniperModel.js';
import { playWeaponShot, playWeaponIntro } from './weaponSounds.js';
import { SKIN_RARITY } from './skinRarity.js';

const FACTORIES = { vandal: createVandalViewmodel, glock: createGlockViewmodel, sniper: createSniperViewmodel };

function disposeTree(root) {
  root.traverse((obj) => {
    obj.geometry?.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    materials.forEach((m) => m.dispose());
  });
}

// Scène 3D d'une arme en direct (mêmes modèles et effets qu'en jeu), qu'on fait
// tourner à la souris et qu'on zoome à la molette. Partagée par le Vestiaire et
// le Battle Pass. Le parent pilote la scène par la ref : startFiring,
// stopFiring, replayIntro, resetView.
// hands : null (arme seule) ou un skin de gants ('standard', 'neon'...).
const WeaponStage = forwardRef(function WeaponStage({ weapon, skin, hands = null, className }, ref) {
  const mountRef = useRef(null);
  const stageRef = useRef(null);
  const firingRef = useRef(null);
  const latest = useRef({ weapon, skin });
  latest.current = { weapon, skin };

  // Scène : créée une fois, l'arme y est remplacée à chaque changement de skin.
  useEffect(() => {
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a1f22, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.5, 2.5, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff4655, 1.6);
    rim.position.set(-2, 0.6, -1.5);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x7fb8ff, 0.6);
    fill.position.set(-1, -1, 2);
    scene.add(fill);

    // Socle : disque lumineux discret sous l'arme.
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const fctx = floorCanvas.getContext('2d');
    const g = fctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,70,85,0.35)');
    g.addColorStop(0.5, 'rgba(255,70,85,0.08)');
    g.addColorStop(1, 'rgba(255,70,85,0)');
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, 256, 256);
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: floorTexture, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.525, 96), new THREE.MeshBasicMaterial({ color: 0xff4655, transparent: true, opacity: 0.35 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.199;
    scene.add(ring);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);
    camera.position.set(0.95, 0.3, 0.55);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.35;
    controls.maxDistance = 2;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI - 0.6;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
    });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const stage = { renderer, scene, camera, controls, pivot: null, weapon: null, audio: null };
    stageRef.current = stage;

    let last = performance.now();
    let frame;
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (stage.weapon) {
        stage.weapon.update(dt);
        // update() replace l'arme dans sa pose de vue joueur : ici elle reste
        // centrée sur le socle (seul le recul interne est conservé).
        stage.weapon.holder.position.set(0, 0, 0);
        stage.weapon.holder.rotation.set(0, 0, 0);
      }
      ring.material.opacity = 0.25 + 0.1 * Math.sin(now / 700);
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(firingRef.current);
      observer.disconnect();
      controls.dispose();
      if (stage.pivot) disposeTree(stage.pivot);
      disposeTree(scene);
      renderer.dispose();
      stage.audio?.close();
      mount.removeChild(renderer.domElement);
      stageRef.current = null;
    };
  }, []);

  const playIntro = (stage) => {
    stage.weapon.replayIntro?.();
    if (!stage.audio) stage.audio = new (window.AudioContext || window.webkitAudioContext)();
    stage.audio.resume();
    playWeaponIntro(stage.audio, latest.current.weapon, latest.current.skin);
  };

  // Changement d'arme ou de skin : on reconstruit le modèle et on le recentre.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (stage.pivot) {
      stage.scene.remove(stage.pivot);
      disposeTree(stage.pivot);
    }
    const created = FACTORIES[weapon]({ renderer: stage.renderer, scene: stage.scene, skin, hands: hands ?? false });
    const pivot = new THREE.Group();
    pivot.add(created.holder);
    created.holder.position.set(0, 0, 0);
    created.holder.rotation.set(0, 0, 0);
    created.update(1);
    created.holder.position.set(0, 0, 0);
    created.holder.rotation.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3();
    // Les décors d'apparition (rails, coffre, bloc de marbre...) sont dans des
    // groupes masqués : seule compte une pièce visible jusqu'à la racine.
    const shown = (o) => {
      for (let n = o; n; n = n.parent) if (!n.visible || n.userData.isHands) return false;
      return true;
    };
    created.holder.traverse((o) => {
      if (o.isMesh && shown(o)) box.expandByObject(o, true);
    });
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Taille à l'écran comparable entre armes, sans que le Glock (bien plus court)
    // ne remplisse toute la scène.
    const scale = Math.min(0.85 / size.length(), 2.2);
    pivot.scale.setScalar(scale);
    pivot.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    stage.scene.add(pivot);
    stage.pivot = pivot;
    stage.weapon = created;
    // Lancée après le cadrage : pendant l'apparition les pièces sont dispersées.
    if (SKIN_RARITY[skin] === 'transcendent') playIntro(stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weapon, skin, hands]);

  useImperativeHandle(ref, () => {
    const fireOnce = () => {
      const stage = stageRef.current;
      if (!stage?.weapon) return;
      stage.weapon.fire();
      if (!stage.audio) stage.audio = new (window.AudioContext || window.webkitAudioContext)();
      stage.audio.resume();
      playWeaponShot(stage.audio, latest.current.weapon, latest.current.skin);
    };
    return {
      startFiring() {
        fireOnce();
        clearInterval(firingRef.current);
        // Cadence proche du jeu : rafale pour la Vandal, coup par coup pour le Glock,
        // et le temps de manœuvrer la culasse pour le sniper.
        firingRef.current = setInterval(fireOnce, { vandal: 95, glock: 260, sniper: 1150 }[latest.current.weapon] ?? 260);
      },
      stopFiring() {
        clearInterval(firingRef.current);
      },
      replayIntro() {
        const stage = stageRef.current;
        if (stage?.weapon) playIntro(stage);
      },
      resetView() {
        const stage = stageRef.current;
        if (!stage) return;
        stage.camera.position.set(0.95, 0.3, 0.55);
        stage.controls.target.set(0, 0, 0);
        stage.controls.autoRotate = true;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className={className} />;
});

export default WeaponStage;
