// world.js — systém map: trať, zem, obloha a tematické kulisy podle světa
import * as THREE from 'three';
import { toonMat, GRADIENT } from './toon.js';

// ---------- definice světů ----------
export const MAPS = {
  city: {
    name: '🏙️ Dino City', theme: 'city',
    rx: 60, rz: 38, k: 1.6, laps: 3,
    sky: [0x4ea7ff, 0xcdebff], ground: 0x7fbf6a, road: 0x3a3f4b,
  },
  beach: {
    name: '🏝️ Tropická pláž', theme: 'beach',
    rx: 66, rz: 46, k: 1.25, laps: 3,
    sky: [0x33b5e5, 0xffe7b3], ground: 0xe6d2a0, road: 0x6b5840,
  },
  playground: {
    name: '🧸 Dětské hřiště', theme: 'playground',
    rx: 52, rz: 50, k: 2.4, laps: 3,
    sky: [0xb079ff, 0xffd6f2], ground: 0x86c06a, road: 0x9a6bd6,
  },
};
export const MAP_KEYS = Object.keys(MAPS);

// ---------- helpery ----------
function addOutline(mesh, s = 1.05) {
  const o = new THREE.Mesh(mesh.geometry,
    new THREE.MeshBasicMaterial({ color: 0x10131c, side: THREE.BackSide }));
  o.scale.setScalar(s);
  mesh.add(o);
  return o;
}

function lmPart(geo, color, s = 1.06) {
  const m = new THREE.Mesh(geo, toonMat(color));
  addOutline(m, s);
  return m;
}

// dvoubarevná "speckle" textura země (tráva/písek/…)
function groundTexFor(hex) {
  const base = new THREE.Color(hex);
  const c1 = base.clone().multiplyScalar(0.9).getStyle();
  const c2 = base.clone().lerp(new THREE.Color(0xffffff), 0.14).getStyle();
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base.getStyle(); g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 280; i++) {
    g.fillStyle = Math.random() < 0.5 ? c1 : c2;
    g.fillRect(Math.random() * 64 | 0, Math.random() * 64 | 0, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(80, 80); t.magFilter = THREE.NearestFilter;
  return t;
}

// procedurální fasáda s okny (canvas textura), cache podle barev
const _facadeCache = {};
function facadeTex(wall, win) {
  const key = wall + '_' + win;
  if (!_facadeCache[key]) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#' + wall.toString(16).padStart(6, '0');
    g.fillRect(0, 0, 128, 128);
    const cols = 4, rows = 4, pad = 12, gap = 8;
    const ww = (128 - pad * 2 - gap * (cols - 1)) / cols;
    const wh = (128 - pad * 2 - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) for (let ci = 0; ci < cols; ci++) {
      const x = pad + ci * (ww + gap), y = pad + r * (wh + gap);
      g.fillStyle = '#0e1320'; g.fillRect(x - 2, y - 2, ww + 4, wh + 4);
      g.fillStyle = '#' + win.toString(16).padStart(6, '0'); g.fillRect(x, y, ww, wh);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    _facadeCache[key] = t;
  }
  return _facadeCache[key];
}

// Oválná trať (superellipse) – uzavřená smyčka waypointů.
export function makeTrackPath(rx = 60, rz = 38, k = 1.6, n = 64) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const cx = Math.cos(t), cz = Math.sin(t);
    const x = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / k) * rx;
    const z = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / k) * rz;
    pts.push(new THREE.Vector3(x, 0, z));
  }
  return pts;
}

// ---------- stavba světa ----------
export function buildWorld(scene, mapKey = 'city') {
  const map = MAPS[mapKey] || MAPS.city;
  const group = new THREE.Group();
  scene.add(group);

  // obloha (gradient)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(map.sky[0]) }, bottom: { value: new THREE.Color(map.sky[1]) } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
      void main(){ float h=clamp(vP.y/400.0*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(bottom,top,h),1.0);} `,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat));

  // zem
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshToonMaterial({ color: 0xffffff, map: groundTexFor(map.ground), gradientMap: GRADIENT })
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // silnice (souvislá stuha podél tratě)
  const path = makeTrackPath(map.rx, map.rz, map.k);
  const trackWidth = 12;
  const n = path.length, hw = trackWidth / 2;
  const verts = [];
  for (let i = 0; i < n; i++) {
    const a = path[i], prev = path[(i - 1 + n) % n], next = path[(i + 1) % n];
    const tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    verts.push(a.x + nx * hw, 0.03, a.z + nz * hw, a.x - nx * hw, 0.03, a.z - nz * hw);
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const i0 = i * 2, i1 = i * 2 + 1, j0 = ((i + 1) % n) * 2, j1 = ((i + 1) % n) * 2 + 1;
    idx.push(i0, j0, i1, i1, j0, j1);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  roadGeo.setIndex(idx); roadGeo.computeVertexNormals();
  group.add(new THREE.Mesh(roadGeo, toonMat(map.road)));

  // přerušovaná středová čára
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  for (let i = 0; i < n; i += 2) {
    const a = path[i], b = path[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len * 0.5), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -Math.atan2(b.z - a.z, b.x - a.x) + Math.PI / 2;
    line.position.set((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2);
    group.add(line);
  }

  // startovní/cílová čára
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(trackWidth, 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  finish.rotation.x = -Math.PI / 2;
  finish.position.set(path[0].x, 0.06, path[0].z);
  group.add(finish);

  // tematické kulisy + kolize
  const obstacles = [];
  const rng = mulberry32(1234);
  if (map.theme === 'beach') beachProps(group, obstacles, rng, path, trackWidth);
  else if (map.theme === 'playground') playgroundProps(group, obstacles, rng, path, trackWidth);
  else cityProps(group, obstacles, rng, path, trackWidth);

  // světla
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(40, 80, 20); group.add(sun);
  group.add(new THREE.HemisphereLight(map.sky[1], 0x6a8a5a, 1.1));

  return { group, path, trackWidth, obstacles, laps: map.laps };
}

// ---------- téma: město ----------
function cityProps(group, obstacles, rng, path, trackWidth) {
  const wallPal = [0xe7e2d8, 0xd9b08c, 0xcfd6dd, 0xe9c46a, 0xb6c2a8, 0xd98b7a, 0xa9b7c6];
  const winPal = [0x3a4a6a, 0x6fc2d6, 0xffd86b, 0x2b3550];
  for (let i = 0; i < 80; i++) {
    const ang = rng() * Math.PI * 2;
    const inside = rng() < 0.32;
    const r = inside ? 9 + rng() * 16 : 80 + rng() * 85;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * (r * 0.7);
    if (Math.abs(distToTrack(x, z, path)) < trackWidth) continue;
    const w = 5 + rng() * 8, d = 5 + rng() * 8, h = 7 + rng() * 32;

    const wall = wallPal[(rng() * wallPal.length) | 0];
    const win = winPal[(rng() * winPal.length) | 0];
    const tex = facadeTex(wall, win).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(2, Math.round(h / 4.5)));

    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: GRADIENT }));
    b.position.set(x, h / 2, z);
    b.rotation.y = (rng() * 4 | 0) * Math.PI / 2;
    addOutline(b, 1.045);

    const roofCol = new THREE.Color(wall).multiplyScalar(0.7).getHex();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.7, d * 1.06), toonMat(roofCol));
    roof.position.y = h / 2 + 0.35; addOutline(roof, 1.05); b.add(roof);

    const baseH = 2.4;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, baseH, d * 1.05),
      toonMat(new THREE.Color(wall).multiplyScalar(0.6).getHex()));
    base.position.y = -h / 2 + baseH / 2; addOutline(base, 1.04); b.add(base);
    group.add(b);

    const cr = Math.max(w, d) / 2 + 0.4;
    if (distToTrack(x, z, path) - cr > trackWidth / 2 + 0.8) obstacles.push({ x, z, r: cr });
  }
  addLandmarks(group, obstacles);
}

// ---------- téma: pláž ----------
function palm(x, z, h) {
  const g = new THREE.Group();
  const trunk = lmPart(new THREE.CylinderGeometry(0.45, 0.7, h, 8), 0x9c6b3f);
  trunk.position.y = h / 2; trunk.rotation.z = 0.12; g.add(trunk);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    const frond = lmPart(new THREE.ConeGeometry(0.7, 4.5, 4), 0x4f9d52);
    frond.scale.set(0.5, 1, 0.22);
    frond.position.set(Math.sin(a) * 1.7, h - 0.2, Math.cos(a) * 1.7);
    frond.rotation.x = Math.cos(a) * 0.95; frond.rotation.z = -Math.sin(a) * 0.95;
    g.add(frond);
  }
  for (let i = 0; i < 3; i++) {
    const co = lmPart(new THREE.SphereGeometry(0.32, 8, 8), 0x6b4a2a);
    co.position.set((i - 1) * 0.4, h - 0.6, 0.4); g.add(co);
  }
  g.position.set(x, 0, z);
  return g;
}
function beachProps(group, obstacles, rng, path, trackWidth) {
  for (let i = 0; i < 64; i++) {
    const ang = rng() * Math.PI * 2;
    const inside = rng() < 0.3;
    const r = inside ? 10 + rng() * 14 : 80 + rng() * 80;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * (r * 0.7);
    if (distToTrack(x, z, path) < trackWidth) continue;
    group.add(palm(x, z, 6 + rng() * 7));
    if (distToTrack(x, z, path) - 1.6 > trackWidth / 2 + 0.8) obstacles.push({ x, z, r: 1.5 });
  }
  for (let i = 0; i < 12; i++) { // velké kameny / útesy
    const ang = rng() * Math.PI * 2, r = 84 + rng() * 70;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * (r * 0.7);
    if (distToTrack(x, z, path) < trackWidth) continue;
    const s = 2 + rng() * 3;
    const rock = lmPart(new THREE.DodecahedronGeometry(s), 0x8d8576);
    rock.position.set(x, s * 0.55, z); rock.rotation.y = rng() * 3; group.add(rock);
    obstacles.push({ x, z, r: s + 0.5 });
  }
}

// ---------- téma: dětské hřiště ----------
function playgroundProps(group, obstacles, rng, path, trackWidth) {
  const pal = [0xff5a5a, 0x5ab0ff, 0xffd24a, 0x6ad06a, 0xb46bff, 0xff8a3d];
  for (let i = 0; i < 72; i++) {
    const ang = rng() * Math.PI * 2;
    const inside = rng() < 0.3;
    const r = inside ? 9 + rng() * 15 : 78 + rng() * 80;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * (r * 0.7);
    if (distToTrack(x, z, path) < trackWidth) continue;
    const s = 4 + rng() * 7;
    const block = lmPart(new THREE.BoxGeometry(s, s, s), pal[(rng() * pal.length) | 0]);
    block.position.set(x, s / 2, z); block.rotation.y = rng() * 0.6 - 0.3; group.add(block);
    const cr = s * 0.7 + 0.4;
    if (distToTrack(x, z, path) - cr > trackWidth / 2 + 0.8) obstacles.push({ x, z, r: cr });
  }
  for (let i = 0; i < 9; i++) { // obří míče
    const ang = rng() * Math.PI * 2, r = 80 + rng() * 70;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * (r * 0.7);
    if (distToTrack(x, z, path) < trackWidth) continue;
    const s = 3 + rng() * 3;
    const ball = lmPart(new THREE.SphereGeometry(s, 16, 12), pal[(rng() * pal.length) | 0]);
    ball.position.set(x, s, z); group.add(ball);
    obstacles.push({ x, z, r: s + 0.4 });
  }
}

// ---------- landmarky (jen město) ----------
function clockTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe0'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.strokeStyle = '#10131c'; g.lineWidth = 5; g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    g.beginPath();
    g.moveTo(64 + Math.sin(a) * 52, 64 - Math.cos(a) * 52);
    g.lineTo(64 + Math.sin(a) * 46, 64 - Math.cos(a) * 46);
    g.stroke();
  }
  g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(94, 54); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(58, 24); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function addLandmarks(group, obstacles) {
  obstacles.push(
    { x: -96, z: 26, r: 3.5 }, { x: 99, z: -14, r: 7.5 },
    { x: 8, z: -80, r: 5 }, { x: -34, z: 82, r: 5.5 },
  );
  const pisa = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const ring = lmPart(new THREE.CylinderGeometry(2.4, 2.4, 3.2, 18), 0xeee6d2);
    ring.position.y = 2 + i * 3.2; pisa.add(ring);
  }
  const pcap = lmPart(new THREE.CylinderGeometry(1.9, 1.9, 2, 18), 0xddd3bb);
  pcap.position.y = 2 + 6 * 3.2; pisa.add(pcap);
  pisa.position.set(-96, 0, 26); pisa.rotation.z = 0.17; group.add(pisa);

  const eiff = new THREE.Group();
  const tower = lmPart(new THREE.ConeGeometry(7, 34, 4), 0x8a6b4a);
  tower.position.y = 17; tower.rotation.y = Math.PI / 4; eiff.add(tower);
  const tip = lmPart(new THREE.ConeGeometry(0.7, 3, 4), 0x8a6b4a);
  tip.position.y = 34.5; tip.rotation.y = Math.PI / 4; eiff.add(tip);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xff5252, side: THREE.DoubleSide }));
  flag.position.set(1.2, 35.5, 0); eiff.add(flag);
  eiff.position.set(99, 0, -14); group.add(eiff);

  const big = new THREE.Group();
  const shaft = lmPart(new THREE.BoxGeometry(6, 30, 6), 0xc9b079);
  shaft.position.y = 15; big.add(shaft);
  const broof = lmPart(new THREE.ConeGeometry(4.7, 7, 4), 0x7d5a3a);
  broof.position.y = 33.5; broof.rotation.y = Math.PI / 4; big.add(broof);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(2, 28),
    new THREE.MeshBasicMaterial({ map: clockTex() }));
  clock.position.set(0, 24, 3.05); big.add(clock);
  big.position.set(8, 0, -80); group.add(big);

  const st = new THREE.Group();
  const ped = lmPart(new THREE.BoxGeometry(7, 8, 7), 0x9aa1a8);
  ped.position.y = 4; st.add(ped);
  const bodyc = lmPart(new THREE.CylinderGeometry(2, 2.7, 9, 14), 0x6fae9b);
  bodyc.position.y = 12.5; st.add(bodyc);
  const headc = lmPart(new THREE.SphereGeometry(1.5, 14, 14), 0x6fae9b);
  headc.position.y = 18.5; st.add(headc);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * Math.PI;
    const sp = lmPart(new THREE.ConeGeometry(0.26, 1.3, 5), 0x6fae9b);
    sp.position.set(Math.sin(a) * 1.5, 20, Math.cos(a) * 1.5); st.add(sp);
  }
  const arm = lmPart(new THREE.BoxGeometry(0.9, 4.2, 0.9), 0x6fae9b);
  arm.position.set(2.6, 19.5, 0); arm.rotation.z = -0.5; st.add(arm);
  const torch = lmPart(new THREE.ConeGeometry(0.85, 1.7, 8), 0xffd86b);
  torch.position.set(3.7, 22, 0); st.add(torch);
  st.position.set(-34, 0, 82); st.rotation.y = 0.5; group.add(st);
}

// ---------- util ----------
function distToTrack(x, z, path) {
  let min = Infinity;
  for (const p of path) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < min) min = d;
  }
  return min;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
