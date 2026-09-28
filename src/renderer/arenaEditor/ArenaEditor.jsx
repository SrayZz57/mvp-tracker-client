import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PersonStanding } from 'lucide-react';
import Icon from '../Icon.jsx';
import { buildClassicRoom, CLASSIC_WALL_HALF, makeSkyTexture } from '../classicArena.js';
import { AGENT_FLOOR_Y, buildAgentModel } from '../aimBots.js';
import { AGENT_HEIGHT } from '../aimTrainerModes.js';
import { ARENA_LIMITS, createArena, createBox, createEnemy, decodeArenaCode, encodeArenaCode, ENEMY_STYLES, loadArenas, sanitizeArena, saveArenas } from './arenaStore.js';
import { BOX_STYLES, BOX_STYLE_IDS, cssColor } from './boxStyles.js';
import { PATROL_RADIUS } from './buildCustomArena.js';
import { PIECES, STAIR_STEPS, doorBoxes, pieceDims, placeEnemy, placeOnHit, stairBoxes } from './buildMath.js';
import { InputManager, AIM_MODE } from '../input/InputManager.js';
import './arenaEditor.css';

// Valeurs proposées au clavier pour les réglages propres à un ennemi (voir
// cycleEnemySetting) — les mêmes bornes que ARENA_LIMITS, plus `null` en
// première position pour revenir au réglage de session (voir arenaStore.js).
const ENEMY_SPEED_STEPS = [null, 0.6, 0.8, 1, 1.3, 1.6, 2];
const ENEMY_SCALE_STEPS = [null, 0.7, 0.85, 1, 1.15, 1.3, 1.5];

// Éditeur d'arène à la première personne : on se déplace dans la salle de
// base du jeu (la même que dans les modes classiques) et on pose des blocs
// ou des ennemis là où l'on vise, comme dans un jeu de construction. Échap
// ouvre le menu (arènes, réglages des ennemis). Sauvegarde locale automatique.

const RUN_SPEED = 6.75; // m/s, course de Valorant
const VALORANT_YAW = 0.07; // degrés par unité de souris et par point de sensibilité
const REACH = 40; // portée de construction, en mètres
const HISTORY_MAX = 100;
const EYE_MAX = 25;
const DEG = Math.PI / 180;
const BOUNDS = { halfW: CLASSIC_WALL_HALF, halfD: CLASSIC_WALL_HALF };
const ENEMY_SLOT = PIECES.findIndex((p) => p.id === 'enemy');

const hToVFov = (hDeg, aspect) => (2 * Math.atan(Math.tan((hDeg * DEG) / 2) / aspect)) / DEG;

// Silhouette de face d'une pièce, à l'échelle, pour la barre d'objets.
function PieceIcon({ piece }) {
  if (piece.id === 'enemy') return <Icon icon={PersonStanding} size={26} />;
  if (piece.stairs) {
    // Silhouette en escalier plutôt qu'un simple rectangle, sinon on ne la
    // distingue pas d'un mur bas à cette taille.
    return (
      <span className="ae-piece-stairs" aria-hidden="true">
        {Array.from({ length: STAIR_STEPS }, (_, i) => (
          <span key={i} style={{ height: `${((i + 1) / STAIR_STEPS) * 100}%` }} />
        ))}
      </span>
    );
  }
  if (piece.door) {
    // Silhouette de porte : un rectangle avec une ouverture au centre.
    return (
      <span className="ae-piece-door" aria-hidden="true">
        <span className="ae-piece-door-gap" style={{ width: `${(piece.doorway.w / piece.w) * 100}%` }} />
      </span>
    );
  }
  const scale = 26 / Math.max(piece.w, piece.h, 2);
  return <span className="ae-piece-shape" style={{ width: Math.max(3, piece.w * scale), height: Math.max(3, piece.h * scale) }} />;
}

export default function ArenaEditor({ t, settings = {}, onPlay }) {
  const tr = (key, params) => t(`aimTrainer.arenaEditor.${key}`, params);
  const [arenas, setArenas] = useState(() => {
    const list = loadArenas();
    return list.length ? list : [createArena(t('aimTrainer.arenaEditor.defaultName'))];
  });
  const [arena, setArena] = useState(() => arenas[0]);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [saveState, setSaveState] = useState('saved');
  const [locked, setLocked] = useState(false);
  const [slot, setSlot] = useState(0);
  const [styleId, setStyleId] = useState('wood');
  const [quarter, setQuarter] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [aimedEnemyId, setAimedEnemyId] = useState(null);
  const [selectionCount, setSelectionCount] = useState(0);
  const [grabbing, setGrabbing] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [importText, setImportText] = useState('');

  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const minimapRef = useRef(null);
  const arenaRef = useRef(arena);
  const arenasRef = useRef(arenas);
  const historyRef = useRef(history);
  const toolRef = useRef({ slot, styleId, quarter });
  const minimapOnRef = useRef(showMinimap);
  arenaRef.current = arena;
  arenasRef.current = arenas;
  historyRef.current = history;
  toolRef.current = { slot, styleId, quarter };
  minimapOnRef.current = showMinimap;

  // --- Historique et sauvegarde ----------------------------------------------------
  const applyHistory = useCallback((nextHistory, nextArena) => {
    historyRef.current = nextHistory;
    arenaRef.current = nextArena;
    setHistory(nextHistory);
    setArena(nextArena);
  }, []);

  const commit = useCallback(
    (next) => {
      const clean = sanitizeArena({ ...next, updatedAt: Date.now() });
      const h = historyRef.current;
      applyHistory({ past: [...h.past, arenaRef.current].slice(-HISTORY_MAX), future: [] }, clean);
    },
    [applyHistory],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length) applyHistory({ past: h.past.slice(0, -1), future: [arenaRef.current, ...h.future] }, h.past[h.past.length - 1]);
  }, [applyHistory]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    const [next, ...rest] = h.future;
    applyHistory({ past: [...h.past, arenaRef.current], future: rest }, next);
  }, [applyHistory]);

  const persist = useCallback((current) => {
    const list = arenasRef.current.some((a) => a.id === current.id)
      ? arenasRef.current.map((a) => (a.id === current.id ? current : a))
      : [...arenasRef.current, current];
    arenasRef.current = list;
    setArenas(list);
    setSaveState(saveArenas(list) ? 'saved' : 'error');
    return list;
  }, []);

  // Écriture regroupée pendant la construction, immédiate en quittant.
  useEffect(() => {
    setSaveState('saving');
    const id = setTimeout(() => persist(arena), 400);
    return () => clearTimeout(id);
  }, [arena, persist]);
  useEffect(() => () => persist(arenaRef.current), [persist]);

  const openArena = (next) => {
    applyHistory({ past: [], future: [] }, next);
    sceneRef.current?.clearSelection();
    sceneRef.current?.goToSpawn(next);
  };
  const switchArena = (id) => {
    const next = persist(arenaRef.current).find((a) => a.id === id);
    if (next) openArena(next);
  };
  const newArena = () => {
    persist(arenaRef.current);
    const created = createArena(t('aimTrainer.arenaEditor.defaultName'));
    persist(created);
    openArena(created);
  };
  const deleteArena = () => {
    if (!window.confirm(tr('deleteConfirm', { name: arena.name }))) return;
    let next = arenasRef.current.filter((a) => a.id !== arena.id);
    if (!next.length) next = [createArena(t('aimTrainer.arenaEditor.defaultName'))];
    arenasRef.current = next;
    setArenas(next);
    setSaveState(saveArenas(next) ? 'saved' : 'error');
    openArena(next[0]);
  };
  const setEnemySetting = (field, value) => commit({ ...arenaRef.current, enemySettings: { ...arenaRef.current.enemySettings, [field]: value } });

  const copyShareCode = () => {
    const code = encodeArenaCode(arena);
    setShareCode(code);
    navigator.clipboard
      ?.writeText(code)
      .then(() => setShareMsg(tr('share.copied')))
      .catch(() => {});
  };
  const importArena = () => {
    const decoded = decodeArenaCode(importText);
    if (!decoded) {
      setShareMsg(tr('share.invalid'));
      return;
    }
    persist(decoded);
    openArena(decoded);
    setImportText('');
    setShareMsg(tr('share.imported'));
  };

  // --- Scène -------------------------------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    const isDark = settings.theme === 'dark';
    const floorY = AGENT_FLOOR_Y;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    // Même ambiance que la salle de base du jeu.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? 0x0b0d12 : 0xa8cbe8);
    scene.fog = new THREE.FogExp2(isDark ? 0x0b0d12 : 0xa8cbe8, isDark ? 0.02 : 0.006);
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a4152, isDark ? 0.5 : 1.5));
    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.15 : 0.45));
    const sun = new THREE.DirectionalLight(0xfff2dc, isDark ? 0.6 : 2.6);
    sun.position.set(8, 16, 6);
    scene.add(sun);
    const back = new THREE.DirectionalLight(0xa8c4ff, isDark ? 0.3 : 0.9);
    back.position.set(-6, 8, -10);
    scene.add(back);
    if (!isDark) {
      scene.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(120, 40, 24),
          new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
        ),
      );
    }
    const room = new THREE.Group();
    buildClassicRoom(room, { floorY, isDark });
    scene.add(room);

    // Sol « visable » : exactement la salle, pour ne jamais construire hors murs.
    const buildFloor = new THREE.Mesh(new THREE.PlaneGeometry(BOUNDS.halfW * 2, BOUNDS.halfD * 2), new THREE.MeshBasicMaterial({ visible: false }));
    buildFloor.rotation.x = -Math.PI / 2;
    buildFloor.position.y = floorY;
    buildFloor.userData.kind = 'floor';
    scene.add(buildFloor);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 300);
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    scene.add(camera);

    const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const unitEdges = new THREE.EdgesGeometry(unitBox);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x0b0c0f, transparent: true, opacity: 0.5 });
    const aimedMat = new THREE.LineBasicMaterial({ color: 0xff4655 });
    const materials = Object.fromEntries(
      BOX_STYLE_IDS.map((id) => {
        const s = BOX_STYLES[id];
        return [id, new THREE.MeshStandardMaterial({ color: s.color, roughness: s.roughness, metalness: s.metalness, transparent: s.opacity !== undefined, opacity: s.opacity ?? 1, depthWrite: s.opacity === undefined })];
      }),
    );
    const ghostMats = Object.fromEntries(
      BOX_STYLE_IDS.map((id) => [id, new THREE.MeshBasicMaterial({ color: BOX_STYLES[id].color, transparent: true, opacity: 0.45, depthWrite: false })]),
    );
    const enemyMat = new THREE.MeshStandardMaterial({ color: 0xff2238, emissive: 0xff2238, emissiveIntensity: 0.35, roughness: 0.5 });
    const enemyGhostMat = new THREE.MeshBasicMaterial({ color: 0xff2238, transparent: true, opacity: 0.4, depthWrite: false });

    const boxGroup = new THREE.Group();
    const enemyGroup = new THREE.Group();
    scene.add(boxGroup, enemyGroup);

    // Anneau de patrouille : visible seulement en construction, pour voir où
    // un ennemi peut bouger une fois le mode de déplacement choisi (voir
    // PATROL_RADIUS dans buildCustomArena.js).
    const patrolGeom = new THREE.RingGeometry(PATROL_RADIUS - 0.04, PATROL_RADIUS, 40);
    const patrolMat = new THREE.MeshBasicMaterial({ color: 0xff4655, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const patrolGroup = new THREE.Group();
    scene.add(patrolGroup);
    const patrolMeshes = new Map();

    // Marqueurs de sélection (voir toggleSelection) : petits octaèdres
    // flottants au-dessus de chaque bloc/ennemi sélectionné.
    const selectMat = new THREE.MeshBasicMaterial({ color: 0xffe066, depthTest: false });
    const selectMarkers = new Map(); // "box:id" | "enemy:id" -> mesh
    const selection = new Set();

    // Aperçu de la pièce en main.
    const ghostBox = new THREE.Mesh(unitBox, ghostMats.wood);
    ghostBox.add(new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
    const ghostEnemy = buildAgentModel(enemyGhostMat).group;
    ghostBox.visible = false;
    ghostEnemy.visible = false;
    scene.add(ghostBox, ghostEnemy);

    // Point de départ du joueur : colonne verte et flèche au sol.
    const spawnMark = new THREE.Group();
    const spawnMat = new THREE.MeshBasicMaterial({ color: 0x3fd0a0, transparent: true, opacity: 0.55, depthWrite: false });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, AGENT_HEIGHT, 16), spawnMat);
    pillar.position.y = AGENT_HEIGHT / 2;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 3).rotateX(-Math.PI / 2), spawnMat);
    arrow.position.set(0, 0.05, -1.2);
    spawnMark.add(pillar, arrow);
    scene.add(spawnMark);

    const boxMeshes = new Map();
    const enemyMeshes = new Map();
    const keys = new Set();
    // Manette (voir src/renderer/input/) : mêmes réglages (sensibilité,
    // deadzone, courbe) que dans le vrai jeu, pour un ressenti cohérent —
    // additif, ne remplace ni la souris ni ZQSD.
    const inputManager = new InputManager(settings.controller?.profile, settings.controller?.rotationScale);
    inputManager.setMode(AIM_MODE.BASE);
    let gpFireWasDown = false;
    let gpRemoveWasDown = false;
    let gpPickWasDown = false;
    let gpSlotPrevWasDown = false;
    let gpSlotNextWasDown = false;
    let gpRotateWasDown = false;
    let gpMaterialWasDown = false;
    let gpMenuWasDown = false;
    let gpMinimapWasDown = false;
    let gpSpawnWasDown = false;
    let gpGrabWasDown = false;
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    let aim = null; // { kind: 'box'|'enemy'|'floor', id, placement }
    let aimedEdges = null;

    const goToSpawn = (a = arenaRef.current) => {
      camera.position.set(a.spawn.x, 0, a.spawn.z);
      euler.set(0, a.spawn.yaw ?? 0, 0);
      camera.quaternion.setFromEuler(euler);
    };
    goToSpawn();

    const sync = (a) => {
      const seen = new Set();
      a.boxes.forEach((box) => {
        seen.add(box.id);
        let mesh = boxMeshes.get(box.id);
        if (!mesh) {
          mesh = new THREE.Mesh(unitBox, materials[box.style]);
          mesh.userData = { kind: 'box', id: box.id };
          mesh.add(new THREE.LineSegments(unitEdges, edgeMat));
          boxGroup.add(mesh);
          boxMeshes.set(box.id, mesh);
        }
        mesh.material = materials[box.style];
        mesh.position.set(box.x, floorY + box.y, box.z);
        mesh.rotation.set(0, box.rotY, 0);
        mesh.scale.set(box.w, box.h, box.d);
      });
      boxMeshes.forEach((mesh, id) => {
        if (!seen.has(id)) {
          boxGroup.remove(mesh);
          boxMeshes.delete(id);
        }
      });
      const seenEnemies = new Set();
      a.enemies.forEach((enemy) => {
        seenEnemies.add(enemy.id);
        let group = enemyMeshes.get(enemy.id);
        if (!group) {
          group = buildAgentModel(enemyMat).group;
          group.traverse((o) => {
            o.userData = { ...o.userData, kind: 'enemy', id: enemy.id };
          });
          enemyGroup.add(group);
          enemyMeshes.set(enemy.id, group);
        }
        group.position.set(enemy.x, floorY + enemy.y, enemy.z);
        // Taille propre à l'ennemi si réglée, sinon celle de la session
        // (voir settingsFor dans aimBots.js pour le même calcul en jeu).
        group.scale.setScalar(enemy.scale ?? a.enemySettings.scale);

        let ring = patrolMeshes.get(enemy.id);
        if (!ring) {
          ring = new THREE.Mesh(patrolGeom, patrolMat);
          ring.rotation.x = -Math.PI / 2;
          patrolGroup.add(ring);
          patrolMeshes.set(enemy.id, ring);
        }
        ring.position.set(enemy.x, floorY + enemy.y + 0.02, enemy.z);
      });
      enemyMeshes.forEach((group, id) => {
        if (!seenEnemies.has(id)) {
          enemyGroup.remove(group);
          enemyMeshes.delete(id);
        }
      });
      patrolMeshes.forEach((ring, id) => {
        if (!seenEnemies.has(id)) {
          patrolGroup.remove(ring);
          patrolMeshes.delete(id);
        }
      });
      ghostEnemy.scale.setScalar(a.enemySettings.scale);
      spawnMark.position.set(a.spawn.x, floorY, a.spawn.z);
      spawnMark.rotation.y = a.spawn.yaw ?? 0;

      // Un bloc/ennemi retiré (Annuler compris) sort aussi de la sélection,
      // sinon son marqueur resterait figé là où il a été vu pour la dernière fois.
      const validKeys = new Set([...a.boxes.map((b) => `box:${b.id}`), ...a.enemies.map((e) => `enemy:${e.id}`)]);
      const before = selection.size;
      [...selection].forEach((key) => {
        if (!validKeys.has(key)) selection.delete(key);
      });
      if (selection.size !== before) setSelectionCount(selection.size);

      applyHighlight();
    };

    // Repositionne/crée/retire les marqueurs de sélection d'après `selection`
    // (voir toggleSelection) — appelé après chaque sync() et à chaque
    // changement de sélection, pour suivre un bloc/ennemi qu'on vient de
    // déplacer (voir confirmGrab).
    const applyHighlight = () => {
      const a = arenaRef.current;
      selection.forEach((key) => {
        if (selectMarkers.has(key)) return;
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), selectMat);
        scene.add(mesh);
        selectMarkers.set(key, mesh);
      });
      selectMarkers.forEach((mesh, key) => {
        if (!selection.has(key)) {
          scene.remove(mesh);
          selectMarkers.delete(key);
          return;
        }
        const [kind, id] = key.split(':');
        if (kind === 'box') {
          const box = a.boxes.find((b) => b.id === id);
          if (box) mesh.position.set(box.x, floorY + box.y + box.h + 0.35, box.z);
        } else {
          const enemy = a.enemies.find((e) => e.id === id);
          if (enemy) mesh.position.set(enemy.x, floorY + enemy.y + AGENT_HEIGHT * (enemy.scale ?? a.enemySettings.scale) + 0.35, enemy.z);
        }
      });
    };

    // Ce que vise le viseur, et où irait la pièce en main.
    const updateAim = () => {
      // Matrices à jour même sans image dessinée depuis (bloc tout juste posé,
      // souris bougée entre deux images).
      scene.updateMatrixWorld();
      raycaster.setFromCamera(center, camera);
      raycaster.far = REACH;
      const hits = raycaster.intersectObjects([...boxGroup.children, ...enemyGroup.children, buildFloor], true).filter((h) => h.object.isMesh);
      const hit = hits[0];
      if (aimedEdges) aimedEdges.material = edgeMat;
      aimedEdges = null;
      ghostBox.visible = false;
      ghostEnemy.visible = false;
      aim = null;
      if (!hit) return;
      const { kind, id } = hit.object.userData;
      const tool = toolRef.current;
      const piece = PIECES[tool.slot];
      const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      const box = kind === 'box' ? arenaRef.current.boxes.find((b) => b.id === id) : null;
      const terrainHit = {
        point: { x: hit.point.x, y: hit.point.y - floorY, z: hit.point.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        box: box ? { y: box.y } : undefined,
      };
      aim = { kind, id, placement: null };
      if (kind === 'box') {
        aimedEdges = boxMeshes.get(id)?.children[0] ?? null;
        if (aimedEdges) aimedEdges.material = aimedMat;
      }
      if (kind === 'enemy') return; // viser un ennemi : clic droit pour le retirer
      if (piece.id === 'enemy') {
        const spot = placeEnemy(terrainHit, BOUNDS);
        if (!spot) return;
        aim.placement = spot;
        ghostEnemy.position.set(spot.x, floorY + spot.y, spot.z);
        ghostEnemy.visible = true;
      } else {
        const dims = pieceDims(piece, tool.quarter);
        const spot = placeOnHit(terrainHit, dims, BOUNDS);
        if (!spot) return;
        aim.placement = { ...spot, dims };
        ghostBox.material = ghostMats[tool.styleId];
        ghostBox.position.set(spot.x, floorY + spot.y, spot.z);
        ghostBox.rotation.set(0, 0, 0);
        ghostBox.scale.set(dims.w, dims.h, dims.d);
        ghostBox.visible = true;
      }
    };

    // La visée est recalculée au clic : pas de décalage d'une image après un
    // mouvement de souris.
    const place = () => {
      updateAim();
      const current = arenaRef.current;
      if (!aim?.placement) return;
      const tool = toolRef.current;
      const piece = PIECES[tool.slot];
      if (piece.id === 'enemy') {
        if (current.enemies.length >= ARENA_LIMITS.maxEnemies) return;
        commit({ ...current, enemies: [...current.enemies, createEnemy(aim.placement)] });
        return;
      }
      const { x, y, z, dims } = aim.placement;
      if (piece.stairs) {
        if (current.boxes.length + STAIR_STEPS > ARENA_LIMITS.maxBoxes) return;
        const steps = stairBoxes({ x, y, z }, piece, tool.quarter).map((s) => createBox({ ...s, style: tool.styleId }));
        commit({ ...current, boxes: [...current.boxes, ...steps] });
        return;
      }
      if (piece.door) {
        const segments = doorBoxes({ x, y, z }, piece, tool.quarter);
        if (current.boxes.length + segments.length > ARENA_LIMITS.maxBoxes) return;
        commit({ ...current, boxes: [...current.boxes, ...segments.map((s) => createBox({ ...s, style: tool.styleId }))] });
        return;
      }
      if (current.boxes.length >= ARENA_LIMITS.maxBoxes) return;
      // Emprise déjà tournée : stockée sans rotation, les collisions du jeu
      // restent donc exactes (boîtes alignées sur les axes).
      commit({ ...current, boxes: [...current.boxes, createBox({ x, y, z, w: dims.w, h: dims.h, d: dims.d, rotY: 0, style: tool.styleId })] });
    };

    const remove = () => {
      updateAim();
      const current = arenaRef.current;
      if (aim?.kind === 'box') commit({ ...current, boxes: current.boxes.filter((b) => b.id !== aim.id) });
      else if (aim?.kind === 'enemy') commit({ ...current, enemies: current.enemies.filter((e) => e.id !== aim.id) });
    };

    // Pipette (clic molette) : reprend la forme et le style du bloc visé.
    const pick = () => {
      updateAim();
      if (aim?.kind !== 'box') return;
      const box = arenaRef.current.boxes.find((b) => b.id === aim.id);
      if (!box) return;
      setStyleId(box.style);
      const idx = PIECES.findIndex((p) => p.w === box.w && p.h === box.h && p.d === box.d);
      const idxTurned = PIECES.findIndex((p) => p.w === box.d && p.h === box.h && p.d === box.w);
      if (idx >= 0) {
        setSlot(idx);
        setQuarter(0);
      } else if (idxTurned >= 0) {
        setSlot(idxTurned);
        setQuarter(1);
      }
    };

    // --- Sélection multiple et déplacement de groupe ----------------------------------
    // Maj+Clic ajoute/retire ce qui est visé (bloc ou ennemi) de `selection` ;
    // G démarre un déplacement en bloc (ancré au point du sol visé), un clic
    // valide, un clic droit (ou un second G) annule. Rien n'est écrit dans
    // l'historique tant que ce n'est pas confirmé (voir confirmGrab) : un
    // Annuler/Rétablir n'a donc pas à défaire chaque image d'un survol.
    const toggleSelection = () => {
      if (!aim || aim.kind === 'floor') return;
      const key = `${aim.kind}:${aim.id}`;
      if (selection.has(key)) selection.delete(key);
      else selection.add(key);
      setSelectionCount(selection.size);
      applyHighlight();
    };

    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
    const floorPointUnderAim = () => {
      raycaster.setFromCamera(center, camera);
      const pt = new THREE.Vector3();
      return raycaster.ray.intersectPlane(floorPlane, pt) ? { x: pt.x, z: pt.z } : null;
    };

    let grabActive = false;
    let grabAnchor = null;
    let grabInitial = []; // [{ kind, id, x, z }]

    const startGrab = () => {
      if (!selection.size) return;
      const anchor = floorPointUnderAim();
      if (!anchor) return;
      const a = arenaRef.current;
      grabInitial = [...selection]
        .map((key) => {
          const [kind, id] = key.split(':');
          const obj = kind === 'box' ? a.boxes.find((b) => b.id === id) : a.enemies.find((e) => e.id === id);
          return obj ? { kind, id, x: obj.x, z: obj.z } : null;
        })
        .filter(Boolean);
      if (!grabInitial.length) return;
      grabAnchor = anchor;
      grabActive = true;
      setGrabbing(true);
    };
    const stopGrab = () => {
      grabActive = false;
      grabAnchor = null;
      grabInitial = [];
      setGrabbing(false);
    };
    const cancelGrab = () => {
      if (!grabActive) return;
      stopGrab();
      sync(arenaRef.current); // remet les maillages déplacés en aperçu à leur vraie place
    };
    const confirmGrab = () => {
      if (!grabActive) return;
      const pt = floorPointUnderAim();
      const dx = pt ? pt.x - grabAnchor.x : 0;
      const dz = pt ? pt.z - grabAnchor.z : 0;
      const byId = Object.fromEntries(grabInitial.map((g) => [g.id, g]));
      const boxIds = new Set(grabInitial.filter((g) => g.kind === 'box').map((g) => g.id));
      const enemyIds = new Set(grabInitial.filter((g) => g.kind === 'enemy').map((g) => g.id));
      const current = arenaRef.current;
      stopGrab();
      commit({
        ...current,
        boxes: current.boxes.map((b) => (boxIds.has(b.id) ? { ...b, x: byId[b.id].x + dx, z: byId[b.id].z + dz } : b)),
        enemies: current.enemies.map((en) => (enemyIds.has(en.id) ? { ...en, x: byId[en.id].x + dx, z: byId[en.id].z + dz } : en)),
      });
    };
    // Aperçu du déplacement en cours : ne touche ni l'arène ni l'historique,
    // juste les maillages déjà existants (confirmGrab écrit la vraie donnée).
    const previewGrab = () => {
      if (!grabActive) return;
      const pt = floorPointUnderAim();
      if (!pt) return;
      const dx = pt.x - grabAnchor.x;
      const dz = pt.z - grabAnchor.z;
      grabInitial.forEach((g) => {
        const moveXZ = (obj) => {
          if (!obj) return;
          obj.position.x = g.x + dx;
          obj.position.z = g.z + dz;
        };
        if (g.kind === 'box') {
          moveXZ(boxMeshes.get(g.id));
          moveXZ(selectMarkers.get(`box:${g.id}`));
        } else {
          moveXZ(enemyMeshes.get(g.id));
          moveXZ(patrolMeshes.get(g.id));
          moveXZ(selectMarkers.get(`enemy:${g.id}`));
        }
      });
    };

    // --- Réglages propres à l'ennemi visé ---------------------------------------------
    // E/F/V font défiler une liste de valeurs (la première, null, revient au
    // réglage de session — voir settingsFor dans aimBots.js) ; Retour arrière
    // remet les trois à null d'un coup.
    const cycleEnemySetting = (field, steps) => {
      if (aim?.kind !== 'enemy') return;
      const current = arenaRef.current;
      const enemy = current.enemies.find((en) => en.id === aim.id);
      if (!enemy) return;
      const idx = steps.indexOf(enemy[field]);
      const next = steps[(idx + 1 + steps.length) % steps.length];
      commit({ ...current, enemies: current.enemies.map((en) => (en.id === aim.id ? { ...en, [field]: next } : en)) });
    };
    const resetEnemySettings = () => {
      if (aim?.kind !== 'enemy') return;
      const current = arenaRef.current;
      commit({ ...current, enemies: current.enemies.map((en) => (en.id === aim.id ? { ...en, style: null, speed: null, scale: null } : en)) });
    };

    // --- Mini-carte --------------------------------------------------------------------
    const drawMinimap = () => {
      const canvas = minimapRef.current;
      if (!canvas || !minimapOnRef.current) return;
      const ctx = canvas.getContext('2d');
      const size = canvas.width;
      const scale = size / (BOUNDS.halfW * 2);
      const toPx = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
      const a = arenaRef.current;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(10, 12, 18, 0.78)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#8892a6';
      a.boxes.forEach((b) => {
        const [px, pz] = toPx(b.x, b.z);
        ctx.fillRect(px - (b.w * scale) / 2, pz - (b.d * scale) / 2, Math.max(2, b.w * scale), Math.max(2, b.d * scale));
      });
      a.enemies.forEach((en) => {
        const [px, pz] = toPx(en.x, en.z);
        ctx.strokeStyle = 'rgba(255, 70, 85, 0.55)';
        ctx.beginPath();
        ctx.arc(px, pz, Math.max(2, PATROL_RADIUS * scale), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ff4655';
        ctx.beginPath();
        ctx.arc(px, pz, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      const [sx, sz] = toPx(a.spawn.x, a.spawn.z);
      ctx.fillStyle = '#3fd0a0';
      ctx.beginPath();
      ctx.arc(sx, sz, 4, 0, Math.PI * 2);
      ctx.fill();
      const [px, pz] = toPx(camera.position.x, camera.position.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(euler.y);
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    // --- Entrées ---------------------------------------------------------------------
    const isLocked = () => document.pointerLockElement === renderer.domElement;
    const onMouseMove = (e) => {
      if (!isLocked()) return;
      const k = (settings.sens ?? 0.35) * VALORANT_YAW * DEG;
      euler.y -= e.movementX * k;
      euler.x = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, euler.x - e.movementY * k));
      camera.quaternion.setFromEuler(euler);
    };
    const onMouseDown = (e) => {
      if (!isLocked()) return;
      if (grabActive) {
        if (e.button === 0) confirmGrab();
        else if (e.button === 2) cancelGrab();
        return;
      }
      if (e.button === 0) {
        if (e.shiftKey) toggleSelection();
        else place();
      } else if (e.button === 2) remove();
      else if (e.button === 1) pick();
    };
    const onWheel = (e) => {
      if (!isLocked()) return;
      e.preventDefault();
      setSlot((s) => (s + (e.deltaY > 0 ? 1 : -1) + PIECES.length) % PIECES.length);
    };
    const onContextMenu = (e) => e.preventDefault();
    // Déplacements : position physique des touches (e.code, ZQSD en AZERTY).
    // Raccourcis : lettre tapée (e.key), sinon Ctrl+Z tomberait sur Ctrl+W en AZERTY.
    const onKeyDown = (e) => {
      if (!isLocked()) return;
      const letter = e.key.toLowerCase();
      if (e.code === 'Space' || e.ctrlKey) e.preventDefault();
      if (e.ctrlKey) {
        if (e.repeat) return;
        if (letter === 'z' && !e.shiftKey) undo();
        else if (letter === 'y' || (letter === 'z' && e.shiftKey)) redo();
        return;
      }
      keys.add(e.code);
      if (e.repeat) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && Number(digit[1]) <= PIECES.length) setSlot(Number(digit[1]) - 1);
      if (letter === 'r') setQuarter((q) => (q + 1) % 4);
      if (letter === 't') setStyleId((id) => BOX_STYLE_IDS[(BOX_STYLE_IDS.indexOf(id) + (e.shiftKey ? -1 : 1) + BOX_STYLE_IDS.length) % BOX_STYLE_IDS.length]);
      if (letter === 'p') {
        const a = arenaRef.current;
        commit({ ...a, spawn: { x: camera.position.x, z: camera.position.z, yaw: euler.y } });
      }
      if (letter === 'g') {
        if (grabActive) cancelGrab();
        else startGrab();
      }
      if (letter === 'm') setShowMinimap((v) => !v);
      if (aim?.kind === 'enemy') {
        if (letter === 'e') cycleEnemySetting('style', [null, ...ENEMY_STYLES]);
        else if (letter === 'f') cycleEnemySetting('speed', ENEMY_SPEED_STEPS);
        else if (letter === 'v') cycleEnemySetting('scale', ENEMY_SCALE_STEPS);
        else if (letter === 'backspace') resetEnemySettings();
      }
    };
    const onKeyUp = (e) => keys.delete(e.code);
    const onLockChange = () => {
      const now = isLocked();
      setLocked(now);
      if (!now) keys.clear();
    };
    const onBlur = () => keys.clear();
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
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

    // Déplacement libre (sans collision) : on vole pour construire en hauteur.
    let last = performance.now();
    let frame = 0;
    let lastAimedEnemy = null;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // --- Manette --------------------------------------------------------------------
      // Stick gauche = déplacement (ajouté à ZQSD), stick droit = regarder
      // (même moteur que le jeu, voir InputManager.js), boutons pour les
      // actions de construction les plus utilisées. Pas de remapping ici
      // (contrairement au tir/visée/pause de l'Aim Trainer, voir
      // GamepadRemap.jsx) : l'éditeur n'a pas de mode compétitif à
      // équilibrer, une disposition fixe suffit.
      if (settings.controller?.profile) inputManager.setProfile(settings.controller.profile);
      if (settings.controller?.rotationScale) inputManager.setRotationScale(settings.controller.rotationScale);
      const { connected: gpConnected, gamepadState: gp, result: gpResult } = inputManager.pollGamepadFrame(dt);
      if (isLocked() && gpConnected && gp) {
        if (gpResult) {
          euler.y -= gpResult.yaw * DEG;
          euler.x = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, euler.x - gpResult.pitch * DEG));
          camera.quaternion.setFromEuler(euler);
        }
        const btn = (i) => gp.buttons[i]?.pressed ?? false;
        const edge = (down, wasDown) => down && !wasDown;

        const fireDown = gp.r2 > 0.5;
        if (edge(fireDown, gpFireWasDown)) place();
        gpFireWasDown = fireDown;

        const removeDown = gp.l2 > 0.5;
        if (edge(removeDown, gpRemoveWasDown)) remove();
        gpRemoveWasDown = removeDown;

        const pickDown = btn(0); // A
        if (edge(pickDown, gpPickWasDown)) pick();
        gpPickWasDown = pickDown;

        const slotPrevDown = btn(4); // L1
        if (edge(slotPrevDown, gpSlotPrevWasDown)) setSlot((s) => (s - 1 + PIECES.length) % PIECES.length);
        gpSlotPrevWasDown = slotPrevDown;

        const slotNextDown = btn(5); // R1
        if (edge(slotNextDown, gpSlotNextWasDown)) setSlot((s) => (s + 1) % PIECES.length);
        gpSlotNextWasDown = slotNextDown;

        const rotateDown = btn(3); // Y
        if (edge(rotateDown, gpRotateWasDown)) setQuarter((q) => (q + 1) % 4);
        gpRotateWasDown = rotateDown;

        const materialDown = btn(2); // X
        if (edge(materialDown, gpMaterialWasDown)) setStyleId((id) => BOX_STYLE_IDS[(BOX_STYLE_IDS.indexOf(id) + 1) % BOX_STYLE_IDS.length]);
        gpMaterialWasDown = materialDown;

        const menuDown = btn(1); // B — ouvre le menu, comme Échap
        if (edge(menuDown, gpMenuWasDown)) document.exitPointerLock?.();
        gpMenuWasDown = menuDown;

        const minimapDown = btn(9); // Start
        if (edge(minimapDown, gpMinimapWasDown)) setShowMinimap((v) => !v);
        gpMinimapWasDown = minimapDown;

        const spawnDown = btn(8); // Select
        if (edge(spawnDown, gpSpawnWasDown)) commit({ ...arenaRef.current, spawn: { x: camera.position.x, z: camera.position.z, yaw: euler.y } });
        gpSpawnWasDown = spawnDown;

        const grabDown = btn(10); // L3 (clic du stick gauche)
        if (edge(grabDown, gpGrabWasDown)) {
          if (grabActive) cancelGrab();
          else startGrab();
        }
        gpGrabWasDown = grabDown;
      }

      if (isLocked()) {
        const speed = RUN_SPEED * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2 : 1) * dt;
        const gpLeft = gpConnected && gp ? gp.leftStick : { x: 0, y: 0 };
        const gpMag = Math.hypot(gpLeft.x, gpLeft.y);
        const gpDeadzoned = gpMag > 0.15 ? gpLeft : { x: 0, y: 0 };
        const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - gpDeadzoned.y;
        const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + gpDeadzoned.x;
        const lift = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0);
        if (fwd || side) {
          const len = Math.hypot(fwd, side);
          const sy = Math.sin(euler.y);
          const cy = Math.cos(euler.y);
          camera.position.x += ((-sy * fwd + cy * side) / len) * speed;
          camera.position.z += ((-cy * fwd - sy * side) / len) * speed;
        }
        camera.position.y += lift * speed;
        camera.position.x = Math.max(-BOUNDS.halfW + 0.5, Math.min(BOUNDS.halfW - 0.5, camera.position.x));
        camera.position.z = Math.max(-BOUNDS.halfD + 0.5, Math.min(BOUNDS.halfD - 0.5, camera.position.z));
        camera.position.y = Math.max(0, Math.min(EYE_MAX, camera.position.y));
      }
      updateAim();
      previewGrab();
      const nowAimedEnemy = aim?.kind === 'enemy' ? aim.id : null;
      if (nowAimedEnemy !== lastAimedEnemy) {
        lastAimedEnemy = nowAimedEnemy;
        setAimedEnemyId(nowAimedEnemy);
      }
      renderer.render(scene, camera);
      drawMinimap();
    };
    loop();

    sceneRef.current = {
      sync,
      goToSpawn,
      requestLock: () => renderer.domElement.requestPointerLock(),
      clearSelection: () => {
        cancelGrab();
        selection.clear();
        setSelectionCount(0);
        applyHighlight();
      },
    };
    sync(arenaRef.current);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (isLocked()) document.exitPointerLock();
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      scene.traverse((o) => {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      inputManager.destroy();
    };
    // Scène créée une fois ; l'état courant est lu par les refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.sync(arena);
  }, [arena]);

  const piece = PIECES[slot];
  const es = arena.enemySettings;
  const aimedEnemy = aimedEnemyId ? arena.enemies.find((e) => e.id === aimedEnemyId) : null;

  return (
    <div className="ae-screen">
      <div ref={mountRef} className="ae-canvas" onClick={() => !locked && sceneRef.current?.requestLock()} />

      {locked ? (
        <>
          <div className="ae-crosshair" aria-hidden="true" />
          <p className="ae-help">{tr('buildHelp')}</p>
          <p className="ae-counts">
            {tr('counts', { boxes: arena.boxes.length, maxBoxes: ARENA_LIMITS.maxBoxes, enemies: arena.enemies.length, maxEnemies: ARENA_LIMITS.maxEnemies })}
          </p>

          {aimedEnemy && (
            <div className="ae-enemy-panel">
              <strong>{tr('selectedEnemy.title')}</strong>
              <p>{tr('selectedEnemy.style', { value: aimedEnemy.style ? t(`aimTrainer.agentStyles.${aimedEnemy.style}`) : tr('selectedEnemy.session') })}</p>
              <p>{tr('selectedEnemy.speed', { value: aimedEnemy.speed != null ? `${(RUN_SPEED * aimedEnemy.speed).toFixed(2)} m/s` : tr('selectedEnemy.session') })}</p>
              <p>{tr('selectedEnemy.scale', { value: aimedEnemy.scale != null ? `${(AGENT_HEIGHT * aimedEnemy.scale).toFixed(2)} m` : tr('selectedEnemy.session') })}</p>
              <small>{tr('selectedEnemy.hint')}</small>
            </div>
          )}

          {(selectionCount > 0 || grabbing) && <p className="ae-selection-hint">{tr(grabbing ? 'selection.grabbing' : 'selection.hint', { count: selectionCount })}</p>}

          {showMinimap && <canvas ref={minimapRef} className="ae-minimap" width={220} height={220} />}

          <div className="ae-hud">
            {slot !== ENEMY_SLOT && (
              <div className="ae-styles-bar">
                {BOX_STYLE_IDS.map((id) => (
                  <span key={id} className={id === styleId ? 'ae-style-chip active' : 'ae-style-chip'}>
                    <span className="ae-swatch" style={{ background: cssColor(BOX_STYLES[id].color) }} />
                    {tr(`styles.${id}`)}
                  </span>
                ))}
                <small>T</small>
              </div>
            )}
            <div className="ae-hotbar">
              {PIECES.map((p, i) => (
                <div key={p.id} className={i === slot ? 'ae-slot active' : 'ae-slot'} data-enemy={p.id === 'enemy' || undefined}>
                  <small>{i + 1}</small>
                  <PieceIcon piece={p} />
                </div>
              ))}
            </div>
            <p className="ae-slot-name">
              {tr(`pieces.${piece.id}`)}
              {piece.id !== 'enemy' && ` · ${pieceDims(piece, quarter).w} × ${piece.h} × ${pieceDims(piece, quarter).d} m`}
            </p>
          </div>
        </>
      ) : (
        <div className="ae-menu" role="dialog" aria-modal="true">
          <div className="ae-menu-card">
            <header className="ae-menu-head">
              <h2>{tr('toolTitle')}</h2>
              <span className={`ae-save ae-save-${saveState}`}>{tr(`save.${saveState}`)}</span>
            </header>

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
                {tr('rename')}
              </button>
              <button type="button" className="ae-link" onClick={newArena}>
                {tr('newArena')}
              </button>
              <button type="button" className="ae-link danger" onClick={deleteArena}>
                {tr('deleteArena')}
              </button>
            </section>

            <section className="ae-menu-section">
              <h3>{tr('enemiesTitle')}</h3>
              <p className="ae-note">{tr('enemiesHint', { count: arena.enemies.length })}</p>
              <label className="ae-setting">
                <span>{tr('enemyStyle')}</span>
                <select className="ae-input" value={es.style} onChange={(e) => setEnemySetting('style', e.target.value)}>
                  {ENEMY_STYLES.map((id) => (
                    <option key={id} value={id}>
                      {t(`aimTrainer.agentStyles.${id}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ae-setting">
                <span>{tr('enemySpeed', { value: (RUN_SPEED * es.speed).toFixed(2) })}</span>
                <input type="range" min={ARENA_LIMITS.enemySpeed.min} max={ARENA_LIMITS.enemySpeed.max} step="0.05" value={es.speed} onChange={(e) => setEnemySetting('speed', Number(e.target.value))} />
              </label>
              <label className="ae-setting">
                <span>{tr('enemyScale', { value: (AGENT_HEIGHT * es.scale).toFixed(2) })}</span>
                <input type="range" min={ARENA_LIMITS.enemyScale.min} max={ARENA_LIMITS.enemyScale.max} step="0.05" value={es.scale} onChange={(e) => setEnemySetting('scale', Number(e.target.value))} />
              </label>
              <label className="ae-setting">
                <span>{tr('enemyCount', { count: es.count })}</span>
                <input type="range" min={ARENA_LIMITS.enemyCount.min} max={ARENA_LIMITS.enemyCount.max} step="1" value={es.count} onChange={(e) => setEnemySetting('count', Number(e.target.value))} />
              </label>
            </section>

            <section className="ae-menu-section">
              <h3>{tr('share.title')}</h3>
              <div className="ae-menu-row">
                <button type="button" className="ae-link" onClick={copyShareCode}>
                  {tr('share.export')}
                </button>
              </div>
              {shareCode && <textarea className="ae-input ae-share-code" readOnly value={shareCode} onFocus={(e) => e.target.select()} />}
              <div className="ae-menu-row">
                <input
                  className="ae-input"
                  placeholder={tr('share.pastePlaceholder')}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <button type="button" className="ae-link" onClick={importArena} disabled={!importText.trim()}>
                  {tr('share.import')}
                </button>
              </div>
              {shareMsg && <p className="ae-note">{shareMsg}</p>}
            </section>

            <section className="ae-menu-section">
              <h3>{tr('controlsTitle')}</h3>
              <ul className="ae-controls">
                {['move', 'fly', 'place', 'remove', 'pick', 'pieces', 'rotate', 'style', 'spawn', 'select', 'grab', 'minimap', 'undo'].map((k) => (
                  <li key={k}>
                    <kbd>{tr(`controls.${k}.keys`)}</kbd>
                    {tr(`controls.${k}.label`)}
                  </li>
                ))}
              </ul>
              <p className="ae-note">{tr('controls.gamepadHint')}</p>
            </section>

            <footer className="ae-menu-foot">
              <span className="ae-note">
                {tr('counts', { boxes: arena.boxes.length, maxBoxes: ARENA_LIMITS.maxBoxes, enemies: arena.enemies.length, maxEnemies: ARENA_LIMITS.maxEnemies })}
              </span>
              <div className="ae-menu-actions">
                <button type="button" className="ae-link" onClick={undo} disabled={!history.past.length}>
                  {tr('undo')}
                </button>
                <button type="button" className="ae-link" onClick={redo} disabled={!history.future.length}>
                  {tr('redo')}
                </button>
                <button type="button" className="ae-build" onClick={() => sceneRef.current?.requestLock()}>
                  {tr('build')}
                </button>
                {onPlay && (
                  <button
                    type="button"
                    className="ae-build ae-play"
                    disabled={arena.enemies.length === 0}
                    title={arena.enemies.length === 0 ? tr('playDisabled') : ''}
                    onClick={() => {
                      persist(arena);
                      onPlay(arena);
                    }}
                  >
                    {tr('play')}
                  </button>
                )}
              </div>
            </footer>
            <p className="ae-note ae-next">{tr('nextStep')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
