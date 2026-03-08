import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';

const pseudoNoise3D = (x, y, z) => Math.sin(x * 1.7 + z * 1.2) * 0.5 + Math.sin(y * 2.3 + z * 1.8) * 0.3 + Math.sin((x + y + z) * 0.9) * 0.2;
const states = ['Cube', 'Inflated', 'Radial', 'Polygonal', 'Organic'];

const app = document.querySelector('#app');
app.innerHTML = `<canvas id="stage"></canvas><video id="cameraFeed" autoplay playsinline muted></video><div id="debugLayer"></div><div id="hud"></div>`;
document.querySelector('#hud').innerHTML = `<button data-action="camera">Camera On</button><button data-action="debug">Debug Off</button><label>Morph Sensitivity <input data-action="morph" type="range" min="0.5" max="2.2" step="0.05" value="1"/></label><label>Float Intensity <input data-action="float" type="range" min="0.2" max="2" step="0.05" value="1"/></label><button data-action="reset">Reset</button><button data-action="full">Fullscreen</button><div id="status">Initializing…</div>`;

const canvas = document.querySelector('#stage');
const video = document.querySelector('#cameraFeed');
const debugLayer = document.querySelector('#debugLayer');
const statusEl = document.querySelector('#status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor('#f4f4f2');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.1, 7.3);
const root = new THREE.Group();
scene.add(root);
scene.add(new THREE.AmbientLight(0xffffff, 1.0));

const nodes = [];
const edges = [];
const lineGeometries = [];
const lines = [];
const nodeGeo = new THREE.SphereGeometry(0.026, 8, 8);
const tmp = new THREE.Vector3();
const center = new THREE.Vector3();
let morphSensitivity = 1;
let floatIntensity = 1;
let debugMode = false;
let showCamera = false;
let cameraEnabled = false;
let hands = null;
let morphEnergy = 0;
let currentStateIndex = 0;
let stateLerp = 0;
const prevFingerMap = new Map();
const fingers = [];

function buildCubeLattice() {
  const depthLayers = 5;
  const grid = 4;
  let id = 0;
  for (let z = 0; z < depthLayers; z++) for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    const px = (x / (grid - 1) - 0.5) * 3;
    const py = (y / (grid - 1) - 0.5) * 3;
    const pz = (z / (depthLayers - 1) - 0.5) * 3;
    const warp = 1 - Math.abs(pz) * 0.12;
    const base = new THREE.Vector3(px * warp, py * warp, pz);
    const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: 0x0d0d0d }));
    mesh.position.copy(base);
    root.add(mesh);
    nodes.push({ index: id++, base: base.clone(), morphTarget: base.clone(), position: base.clone(), velocity: new THREE.Vector3(), force: new THREE.Vector3(), pinned: 0, mesh });
  }
  const idx = (x, y, z) => z * grid * grid + y * grid + x;
  for (let z = 0; z < depthLayers; z++) for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    const a = idx(x, y, z);
    if (x + 1 < grid) edges.push([a, idx(x + 1, y, z)]);
    if (y + 1 < grid) edges.push([a, idx(x, y + 1, z)]);
    if (z + 1 < depthLayers) edges.push([a, idx(x, y, z + 1)]);
    if (x + 1 < grid && y + 1 < grid) edges.push([a, idx(x + 1, y + 1, z)]);
  }
  for (const [a, b] of edges) {
    const g = new THREE.BufferGeometry().setFromPoints([nodes[a].position, nodes[b].position]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.78 }));
    root.add(line); lineGeometries.push(g); lines.push(line);
  }
}

function computeMorphTargets(state, handCenter) {
  const time = performance.now() * 0.001;
  for (const n of nodes) {
    const t = n.base.clone();
    if (state === 'Inflated') t.multiplyScalar(1.18 + 0.08 * Math.sin(time * 1.1 + n.base.length()));
    else if (state === 'Radial') t.copy(n.base.clone().normalize().add(handCenter.clone().multiplyScalar(0.35)).normalize().multiplyScalar(2.2 + Math.sin(n.index * 0.13 + time) * 0.32));
    else if (state === 'Polygonal') {
      const theta = Math.atan2(n.base.y, n.base.x); const slices = 8;
      const snapped = Math.round((theta / (Math.PI * 2)) * slices) / slices * (Math.PI * 2); const radius = 2 + 0.5 * Math.cos(n.base.z * 1.8);
      t.set(Math.cos(snapped) * radius, Math.sin(snapped) * radius, n.base.z * 0.8);
    } else if (state === 'Organic') {
      const nv = pseudoNoise3D(n.base.x * 0.6 + time * 0.2, n.base.y * 0.6, n.base.z * 0.6);
      t.add(n.base.clone().normalize().multiplyScalar(0.6 + nv * 0.65)).multiplyScalar(1.12);
    }
    n.morphTarget.copy(t);
  }
}

const worldFromLandmark = (x, y, z) => new THREE.Vector3((x - 0.5) * -2.2, (0.5 - y) * 1.6, THREE.MathUtils.clamp(z * 4, -1.5, 1.5));

function updateState(dt) {
  const targetIndex = THREE.MathUtils.clamp(Math.floor(morphEnergy * morphSensitivity * 0.08), 0, states.length - 1);
  if (targetIndex !== currentStateIndex) { stateLerp += dt * 0.9; if (stateLerp > 1) { currentStateIndex += Math.sign(targetIndex - currentStateIndex); stateLerp = 0; } }
  if (!fingers.length && morphEnergy > 0) morphEnergy *= 0.992;
}

function physicsStep(dt) {
  center.set(0, 0, 0); for (const n of nodes) center.add(n.position); center.multiplyScalar(1 / nodes.length);
  const handCenter = fingers.reduce((acc, f) => acc.add(f.position), new THREE.Vector3()).multiplyScalar(fingers.length ? 1 / fingers.length : 0);
  computeMorphTargets(states[currentStateIndex], handCenter);
  for (const n of nodes) {
    n.force.set(0, 0, 0);
    n.force.add(tmp.copy(n.morphTarget).sub(n.position).multiplyScalar(5.2));
    n.force.add(n.base.clone().sub(n.position).multiplyScalar(0.8));
    n.force.add(center.clone().sub(n.position).multiplyScalar(0.1));
    n.force.addScaledVector(n.base.clone().normalize(), pseudoNoise3D(n.base.x * 0.7, n.base.y * 0.7, performance.now() * 0.00026 + n.index * 0.03) * 0.24 * floatIntensity);
    let localStress = 0; n.pinned = 0;
    for (const f of fingers) {
      const dist = n.position.distanceTo(f.position);
      if (dist < 0.85) {
        const pull = THREE.MathUtils.smoothstep(0.85 - dist, 0, 0.85);
        n.force.addScaledVector(f.position.clone().sub(n.position).normalize(), pull * 14);
        n.force.addScaledVector(f.velocity, pull * 2.2);
        localStress += pull; n.pinned = Math.max(n.pinned, pull);
      }
    }
    morphEnergy += localStress * 0.06;
    n.velocity.addScaledVector(n.force, dt); n.velocity.multiplyScalar(0.9); n.position.addScaledVector(n.velocity, dt); n.mesh.position.copy(n.position);
    n.mesh.material.opacity = 0.65 + n.pinned * 0.35; n.mesh.material.transparent = true;
  }
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i]; const pos = lineGeometries[i].attributes.position;
    pos.setXYZ(0, nodes[a].position.x, nodes[a].position.y, nodes[a].position.z); pos.setXYZ(1, nodes[b].position.x, nodes[b].position.y, nodes[b].position.z); pos.needsUpdate = true;
    const stretch = nodes[a].position.distanceTo(nodes[b].position) / nodes[a].base.distanceTo(nodes[b].base);
    lines[i].material.opacity = THREE.MathUtils.clamp(0.35 + stretch * 0.4, 0.2, 0.82);
  }
  root.rotation.y += dt * 0.08; root.rotation.x = Math.sin(performance.now() * 0.0002) * 0.11;
}

async function setupHands() {
  if (!window.Hands) { statusEl.textContent = 'MediaPipe script not loaded - ambient mode'; return; }
  hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.55, minTrackingConfidence: 0.5 });
  hands.onResults((results) => {
    fingers.length = 0; debugLayer.innerHTML = '';
    [4, 8, 12, 16, 20].forEach((id) => (results.multiHandLandmarks ?? []).forEach((landmarks, handIndex) => {
      const lm = landmarks[id]; const p = worldFromLandmark(lm.x, lm.y, lm.z); const key = `${handIndex}-${id}`;
      const prev = prevFingerMap.get(key) ?? p; const vel = p.clone().sub(prev).multiplyScalar(55); prevFingerMap.set(key, p.clone()); fingers.push({ position: p, velocity: vel });
      if (debugMode) { const dot = document.createElement('div'); dot.className = 'dot'; dot.style.left = `${(1 - lm.x) * 100}%`; dot.style.top = `${lm.y * 100}%`; debugLayer.appendChild(dot); }
    }));
  });
  statusEl.textContent = 'Ready · Camera Off';
}

async function toggleCamera() {
  if (cameraEnabled) { (video.srcObject)?.getTracks().forEach((t) => t.stop()); video.srcObject = null; cameraEnabled = false; statusEl.textContent = 'Camera Off'; return; }
  try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540 } }); video.srcObject = stream; await video.play(); cameraEnabled = true; statusEl.textContent = 'Camera On'; }
  catch { statusEl.textContent = 'Camera permission denied - ambient only'; }
}

function resetSystem() { currentStateIndex = 0; morphEnergy = 0; for (const n of nodes) { n.position.copy(n.base); n.velocity.set(0, 0, 0); } statusEl.textContent = 'Reset to Cube'; }

document.querySelectorAll('#hud [data-action]').forEach((el) => {
  const action = el.dataset.action;
  if (action === 'camera') el.addEventListener('click', async () => { await toggleCamera(); el.textContent = cameraEnabled ? 'Camera Off' : 'Camera On'; });
  if (action === 'debug') el.addEventListener('click', () => { debugMode = !debugMode; el.textContent = debugMode ? 'Debug On' : 'Debug Off'; debugLayer.style.display = debugMode ? 'block' : 'none'; });
  if (action === 'morph') el.addEventListener('input', () => { morphSensitivity = Number(el.value); });
  if (action === 'float') el.addEventListener('input', () => { floatIntensity = Number(el.value); });
  if (action === 'reset') el.addEventListener('click', resetSystem);
  if (action === 'full') el.addEventListener('click', async () => { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); });
});

window.addEventListener('keydown', async (event) => {
  if (event.key.toLowerCase() === 'd') document.querySelector('[data-action="debug"]').click();
  if (event.key.toLowerCase() === 'r') resetSystem();
  if (event.key.toLowerCase() === 'f') { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }
  if (event.key.toLowerCase() === 'c') { showCamera = !showCamera; video.classList.toggle('visible', showCamera); }
  if (['1', '2', '3', '4', '5'].includes(event.key)) { currentStateIndex = Number(event.key) - 1; morphEnergy = currentStateIndex * 20; statusEl.textContent = `Forced state: ${states[currentStateIndex]}`; }
});

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

buildCubeLattice(); setupHands();
let last = performance.now();
async function animate() {
  const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.033); last = now;
  if (cameraEnabled && hands && video.readyState >= 2) await hands.send({ image: video });
  updateState(dt); physicsStep(dt); renderer.render(scene, camera); requestAnimationFrame(animate);
}
animate();
