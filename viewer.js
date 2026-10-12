// Mebel QR ko'ruvchisi: ?o=<buyurtma kodi>&d=<detal raqami>
// models/<kod>.json faylini (SketchUp extension yuklaydi) o'qiydi va
// tanlangan detalni butun mebel ichida ajratib ko'rsatadi.
// Koordinatalar SketchUp'dagidek: mm, Z yuqoriga, old tomon -Y.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const HIGHLIGHT = new THREE.Color('#ff6a00');
const DEFAULT_COLOR = '#d8c9ae';
const CONTEXT_COLOR = '#9aa0a6';
const GHOST_TINT = new THREE.Color('#ffffff');

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const orderId = (params.get('o') || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');

let parts = [];          // { n, name, size, m, mesh, lines, base, box }
let modules = [];
let moduleBoxes = new Map();
let modelBox = new THREE.Box3();
let current = null;
let lastView = 'all';
const label = n => String(n); // ABF yorlig'idagi kabi oddiy raqam

function showMsg(text, isError = false) {
  const el = $('msg');
  el.textContent = text;
  el.classList.toggle('err', isError);
  el.classList.remove('hidden');
}

// --- sahna ---------------------------------------------------------------------

const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  showMsg("Bu brauzer 3D ko'rinishni qo'llab-quvvatlamaydi. Chrome yoki Safari'da oching.", true);
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color('#eef0f2');
const camera = new THREE.PerspectiveCamera(35, 1, 1, 100000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;

const hemi = new THREE.HemisphereLight(0xffffff, 0xaeb4ba, 2.2);
hemi.position.set(0, 0, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-0.6, -1, 1.6);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(1, 0.8, 0.4);
scene.add(fill);

const world = new THREE.Group();
scene.add(world);

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
resize();

// --- yuklash -------------------------------------------------------------------

if (!orderId) {
  showMsg('Detaldagi QR kodni telefon kamerasi bilan skanerlang.');
} else {
  load();
}

async function load() {
  let data;
  try {
    const res = await fetch(`models/${encodeURIComponent(orderId)}.json`, { cache: 'no-cache' });
    if (res.status === 404) {
      showMsg(`Buyurtma topilmadi: ${orderId}. Model hali saytga yuklanmagan bo'lishi mumkin.`, true);
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (e) {
    showMsg("Modelni yuklab bo'lmadi. Internetni tekshirib, sahifani yangilang.", true);
    return;
  }
  build(data);
  const n = parseInt(params.get('d'), 10);
  select(Number.isFinite(n) ? n : null, false);
  if (Number.isFinite(n) && !current) showToastInCard(`${n}-raqamli detal bu buyurtmada yo'q.`);
  setView('all', false);
  $('msg').classList.add('hidden');
  $('views').classList.remove('hidden');
  $('card').classList.remove('hidden');
  $('list-btn').classList.remove('hidden');
  requestAnimationFrame(resize);
}

function makeLines(arr, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true }));
}

function makeMesh(v, i, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(i);
  g.computeVertexNormals();
  g.computeBoundingBox();
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
  return new THREE.Mesh(g, m);
}

function build(data) {
  const order = data.order || {};
  $('order-title').textContent = order.title || 'Mebel yig\'ish';
  $('order-sub').textContent = [order.id, `${data.parts.length} ta detal`].filter(Boolean).join(' · ');
  document.title = `${order.title || order.id} — Akosh design`;
  modules = data.modules || [];


  parts = data.parts.slice().sort((a, b) => a.n - b.n).map(p => {
    const base = new THREE.Color(p.color || DEFAULT_COLOR);
    const mesh = makeMesh(p.v, p.i, base.clone());
    const lines = makeLines(p.e, 0x2b2f33);
    const part = { n: p.n, name: p.name, size: p.size, m: p.m, mesh, lines, base,
                   box: mesh.geometry.boundingBox.clone() };
    mesh.userData.part = part;
    world.add(mesh, lines);
    modelBox.union(part.box);
    if (p.m != null) {
      if (!moduleBoxes.has(p.m)) moduleBoxes.set(p.m, { box: new THREE.Box3(), count: 0 });
      const mb = moduleBoxes.get(p.m);
      mb.box.union(part.box);
      mb.count++;
    }
    return part;
  });

  for (const c of data.context || []) {
    if (c.v && c.v.length) {
      const mesh = makeMesh(c.v, c.i, new THREE.Color(c.color || CONTEXT_COLOR));
      mesh.userData.context = true;
      world.add(mesh);
      modelBox.union(mesh.geometry.boundingBox);
    }
    if (c.e && c.e.length) {
      const lines = makeLines(c.e, 0x50565c);
      lines.userData.context = true;
      world.add(lines);
    }
  }

  addFloor();
  buildList();
}

// Pol to'ri va "OLD TOMON" belgisi — ishchi mebelning qaysi tomoni old ekanini bilishi uchun.
function addFloor() {
  const size = modelBox.getSize(new THREE.Vector3());
  const center = modelBox.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, 600) * 2.2;
  const grid = new THREE.GridHelper(span, 22, 0xc9ced3, 0xdde0e3);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(center.x, center.y, modelBox.min.z - 0.5);
  scene.add(grid);

  const w = Math.max(size.x * 0.6, 320);
  const h = w / 4;
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#5b636b';
  ctx.font = 'bold 120px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('▲  OLD TOMON  ▲', 512, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  sign.position.set(center.x, modelBox.min.y - h * 0.9, modelBox.min.z + 0.5);
  scene.add(sign);
}

// --- tanlash va ajratib ko'rsatish ---------------------------------------------

function select(n, fly = true) {
  current = n == null ? null : parts.find(p => p.n === n) || null;
  applyHighlight();
  updateCard();
  updateListSelection();
  const url = new URL(location.href);
  if (current) url.searchParams.set('d', current.n); else url.searchParams.delete('d');
  history.replaceState(null, '', url);
  if (fly && current && lastView === 'part') setView('part');
}

function applyHighlight() {
  for (const p of parts) {
    const mat = p.mesh.material;
    const lm = p.lines.material;
    if (!current) {
      mat.color.copy(p.base);
      mat.emissive.setRGB(0, 0, 0);
      mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
      lm.color.set(0x2b2f33); lm.opacity = 1;
    } else if (p === current) {
      mat.color.copy(HIGHLIGHT);
      mat.emissive.copy(HIGHLIGHT);
      mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
      lm.color.set(0x6b2400); lm.opacity = 1;
    } else {
      const sameModule = current.m != null && p.m === current.m;
      mat.color.copy(p.base).lerp(GHOST_TINT, 0.45);
      mat.emissive.setRGB(0, 0, 0);
      mat.transparent = true; mat.opacity = sameModule ? 0.32 : 0.14; mat.depthWrite = false;
      lm.color.set(0x2b2f33); lm.opacity = sameModule ? 0.55 : 0.22;
    }
    mat.needsUpdate = true;
  }
  world.traverse(o => {
    if (!o.userData.context) return;
    const mat = o.material;
    mat.transparent = !!current;
    mat.opacity = current ? 0.25 : 1;
    mat.depthWrite = !current;
    mat.needsUpdate = true;
  });
}

function referenceBox(p) {
  const mb = p.m != null && moduleBoxes.get(p.m);
  return mb && mb.count > 1 ? mb.box : modelBox;
}

// Detal o'z moduliga (yoki butun mebelga) nisbatan qayerda turishi.
function describeWhere(p) {
  const ref = referenceBox(p);
  const c = p.box.getCenter(new THREE.Vector3());
  const s = ref.getSize(new THREE.Vector3());
  const t = k => (s[k] > 1 ? (c[k] - ref.min[k]) / s[k] : 0.5);
  const where = [];
  if (t('z') > 0.7) where.push('yuqorida'); else if (t('z') < 0.3) where.push('pastda');
  if (t('x') < 0.3) where.push('chapda'); else if (t('x') > 0.7) where.push("o'ngda");
  if (t('y') < 0.3) where.push('oldda'); else if (t('y') > 0.7) where.push('orqada');
  return where.length ? where.join(', ') : "o'rtada";
}

function describeOrientation(p) {
  const s = p.box.getSize(new THREE.Vector3());
  const dims = [['x', s.x], ['y', s.y], ['z', s.z]].sort((a, b) => a[1] - b[1]);
  if (dims[0][1] > dims[1][1] * 0.35) return '—';
  return {
    x: 'tik, yonga qaragan',
    y: 'tik, oldga qaragan',
    z: 'yotiq (gorizontal)'
  }[dims[0][0]];
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

function updateCard() {
  const idx = current ? parts.indexOf(current) : -1;
  $('prev').disabled = parts.length === 0;
  $('next').disabled = parts.length === 0;
  $('facts').classList.toggle('hidden', !current);
  const badge = $('badge');
  badge.classList.toggle('none', !current);
  if (!current) {
    badge.textContent = '—';
    $('name').textContent = 'Detalni tanlang';
    $('count').textContent = "3D ko'rinishda detalga bosing yoki ro'yxatdan tanlang";
    return;
  }
  const p = current;
  badge.textContent = label(p.n);
  $('name').textContent = p.name || 'Detal';
  $('count').textContent = `${idx + 1} / ${parts.length}`;
  $('size').textContent = p.size.map(fmt).join(' × ') + ' mm';
  $('where').textContent = describeWhere(p);
  $('orient').textContent = describeOrientation(p);
  $('height').textContent = `${Math.round(p.box.min.z - referenceBox(p).min.z)} mm`;
  const mod = p.m != null ? (modules[p.m] && modules[p.m].name) || `Modul ${p.m + 1}` : '—';
  $('module').textContent = mod;
}

function showToastInCard(text) {
  $('count').textContent = text;
}

function step(delta) {
  if (!parts.length) return;
  const idx = current ? parts.indexOf(current) : -1;
  const next = parts[(idx + delta + parts.length) % parts.length];
  select(next.n);
}
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);

// --- ro'yxat -------------------------------------------------------------------

function buildList() {
  const ul = $('list');
  ul.textContent = '';
  const groups = new Map();
  for (const p of parts) {
    const key = p.m == null ? -1 : p.m;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const [key, items] of groups) {
    if (groups.size > 1) {
      const g = document.createElement('li');
      g.className = 'group';
      g.textContent = key === -1 ? 'Boshqa' : (modules[key] && modules[key].name) || `Modul ${key + 1}`;
      ul.append(g);
    }
    for (const p of items) {
      const li = document.createElement('li');
      li.className = 'item';
      li.dataset.n = p.n;
      const b = document.createElement('b'); b.textContent = label(p.n);
      const s = document.createElement('span'); s.textContent = p.name || 'Detal';
      const sm = document.createElement('small'); sm.textContent = p.size.map(fmt).join('×');
      li.append(b, s, sm);
      li.onclick = () => { select(p.n); $('sheet').classList.add('hidden'); };
      ul.append(li);
    }
  }
}

function updateListSelection() {
  for (const li of $('list').querySelectorAll('li.item')) {
    li.classList.toggle('on', current && Number(li.dataset.n) === current.n);
  }
}

$('list-btn').onclick = () => {
  $('sheet').classList.remove('hidden');
  const on = $('list').querySelector('li.on');
  if (on) on.scrollIntoView({ block: 'center' });
};
$('sheet-close').onclick = () => $('sheet').classList.add('hidden');
$('sheet').addEventListener('click', e => { if (e.target === $('sheet')) $('sheet').classList.add('hidden'); });

// --- kamera ko'rinishlari ------------------------------------------------------

let anim = null;

// Qutining 8 burchagi ham kadrga sig'adigan eng kichik masofa (dir — kameradan
// markazga emas, markazdan kameraga yo'nalish).
function fitDistance(box, dir) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * camera.aspect;
  const fwd = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);
  const center = box.getCenter(new THREE.Vector3());
  let dist = 0;
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z
    ).sub(center);
    const depth = c.dot(fwd);
    dist = Math.max(dist, Math.abs(c.dot(right)) / tanH - depth, Math.abs(c.dot(up)) / tanV - depth);
  }
  return dist;
}

function sideSign() {
  if (!current) return 1;
  const c = modelBox.getCenter(new THREE.Vector3());
  return current.box.getCenter(new THREE.Vector3()).x >= c.x ? 1 : -1;
}

function setView(name, animate = true) {
  lastView = name;
  for (const b of document.querySelectorAll('.views button')) b.classList.toggle('on', b.dataset.view === name);
  let box = modelBox;
  const sx = sideSign();
  let dir;
  switch (name) {
    case 'part':
      // Detal atrofidagi qo'shnilar ham ko'rinsin.
      if (current) box = current.box.clone().expandByScalar(Math.max(current.box.getSize(new THREE.Vector3()).length() * 0.35, 150));
      dir = new THREE.Vector3(0.65 * sx, -1, 0.6);
      break;
    case 'front': dir = new THREE.Vector3(0, -1, 0.02); break;
    case 'side': dir = new THREE.Vector3(sx, -0.02, 0.02); break;
    case 'top': dir = new THREE.Vector3(0, -0.06, 1); break;
    default: dir = new THREE.Vector3(0.65 * sx, -1, 0.6);
  }
  dir.normalize();
  const center = box.getCenter(new THREE.Vector3());
  const dist = Math.max(fitDistance(box, dir) * 1.08, 300);
  const to = center.clone().addScaledVector(dir, dist);
  const span = modelBox.getBoundingSphere(new THREE.Sphere()).radius;
  camera.near = Math.max(1, dist / 200);
  camera.far = dist + span * 20;
  camera.updateProjectionMatrix();
  controls.maxDistance = span * 12;
  if (!animate) {
    camera.position.copy(to);
    controls.target.copy(center);
    controls.update();
    return;
  }
  anim = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: center.clone(),
           start: performance.now(), ms: 550 };
}

for (const b of document.querySelectorAll('.views button')) b.onclick = () => setView(b.dataset.view);

// --- detalga bosib tanlash -----------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const activePointers = new Set();
let down = null;

canvas.addEventListener('pointerdown', e => {
  activePointers.add(e.pointerId);
  down = activePointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
canvas.addEventListener('pointerup', e => {
  activePointers.delete(e.pointerId);
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 400;
  down = null;
  if (moved > 8 || !quick) return;
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(parts.map(p => p.mesh), false)[0];
  if (hit) select(hit.object.userData.part.n);
});
canvas.addEventListener('pointercancel', e => { activePointers.delete(e.pointerId); down = null; });

// --- chizish sikli -------------------------------------------------------------

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

renderer.setAnimationLoop(now => {
  if (anim) {
    const t = Math.min(1, (now - anim.start) / anim.ms);
    const k = ease(t);
    camera.position.lerpVectors(anim.from, anim.to, k);
    controls.target.lerpVectors(anim.tFrom, anim.tTo, k);
    if (t === 1) anim = null;
  }
  if (current) current.mesh.material.emissiveIntensity = 0.22 + 0.18 * Math.sin(now * 0.004);
  controls.update();
  renderer.render(scene, camera);
});
