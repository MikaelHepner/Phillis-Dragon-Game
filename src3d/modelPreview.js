import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRAGON_TYPES_BY_ID } from './data/dragonTypes.js';
import { createDragon } from './dragons/DragonFactory.js';

// Debug page: the Meshy glTF dragon beside a procedural one, under the SAME
// lighting the game currently uses, so the comparison is about the mesh only.
// Throwaway visual-review tool — delete with modelpreview.html when done.

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3d566e);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0xdfefff, 0x506b50, 0.7));
const sun = new THREE.DirectionalLight(0xfff2cf, 1.4);
sun.position.set(60, 90, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 400 });
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x4c9e3f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const only = params.get('only');
const TARGET_HEIGHT = 20; // match the procedural dragon's overall height

if (only !== 'model') {
  const proc = createDragon(DRAGON_TYPES_BY_ID.phillis);
  proc.group.position.set(-24, 0, 0);
  scene.add(proc.group);
  renderer.setAnimationLoop(null);
  window.__proc = proc;
}

new GLTFLoader().load('/models/dragon.glb', (gltf) => {
  const model = gltf.scene;

  // Normalise: scale so the model stands TARGET_HEIGHT tall, then drop it
  // onto the ground and centre it on x/z regardless of how it was authored.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = TARGET_HEIGHT / size.y;
  model.scale.setScalar(s);

  const scaled = new THREE.Box3().setFromObject(model);
  const c = scaled.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -scaled.min.y, -c.z);

  const holder = new THREE.Group();
  holder.add(model);
  holder.position.set(only ? 0 : 24, 0, 0);
  holder.rotation.y = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? 0));
  scene.add(holder);

  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  console.log('[preview] source size', size.toArray().map((n) => n.toFixed(2)).join(' x '), '-> scale', s.toFixed(2));
  window.__model = holder;
}, undefined, (e) => console.error('[preview] load failed', e));

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 2000);
camera.position.set(0, 26, 86);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 10, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.05;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (window.__proc) window.__proc.update(dt);
  controls.update();
  renderer.render(scene, camera);
});
