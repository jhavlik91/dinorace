// world.js — stylizované "dnešní město": trať, bloky budov, komiksová obloha
import * as THREE from 'three';
import { toonMat, GRADIENT } from './toon.js';

// širší komiksový obrys pro libovolný mesh (nafouknutý klon s BackSide)
function addOutline(mesh, s = 1.05) {
  const o = new THREE.Mesh(mesh.geometry,
    new THREE.MeshBasicMaterial({ color: 0x10131c, side: THREE.BackSide }));
  o.scale.setScalar(s);
  mesh.add(o);
  return o;
}

// jemná tráva (dva odstíny zelené) – ať velká plocha není mrtvě plochá
let _grassTex = null;
function grassTex() {
  if (_grassTex) return _grassTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#7fbf6a'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 280; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#76b461' : '#8acb74';
    g.fillRect(Math.random() * 64 | 0, Math.random() * 64 | 0, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(80, 80);
  t.magFilter = THREE.NearestFilter;
  _grassTex = t;
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
      g.fillStyle = '#0e1320'; g.fillRect(x - 2, y - 2, ww + 4, wh + 4); // rámeček
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

// Oválná trať jako uzavřená smyčka waypointů (zaoblený obdélník).
export function makeTrackPath(rx = 60, rz = 38, n = 64) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    // superellipse → "zaoblený obdélník", hezčí závodní ovál než kruh
    const cx = Math.cos(t), cz = Math.sin(t);
    const k = 1.6;
    const x = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / k) * rx;
    const z = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / k) * rz;
    pts.push(new THREE.Vector3(x, 0, z));
  }
  return pts;
}

export function buildWorld(scene) {
  // --- komiksová obloha (gradient) ---
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top:    { value: new THREE.Color(0x4ea7ff) },
      bottom: { value: new THREE.Color(0xcdeBff) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
      void main(){ float h=clamp(vP.y/400.0*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(bottom,top,h),1.0);} `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // --- tráva / zem (velká plocha, ať navazuje až k obzoru) ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshToonMaterial({ color: 0xffffff, map: grassTex(), gradientMap: GRADIENT })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // --- silnice jako jedna souvislá stuha podél tratě (žádné mezery v zatáčkách) ---
  const path = makeTrackPath();
  const trackWidth = 12;
  const roadGroup = new THREE.Group();
  const roadMat = toonMat(0x3a3f4b);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  const n = path.length;
  const hw = trackWidth / 2;
  const verts = [];
  for (let i = 0; i < n; i++) {
    const a = path[i];
    const prev = path[(i - 1 + n) % n];
    const next = path[(i + 1) % n];
    // tečna ze sousedních bodů → kolmice = okraj silnice
    const tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    verts.push(a.x + nx * hw, 0.03, a.z + nz * hw);  // levý okraj
    verts.push(a.x - nx * hw, 0.03, a.z - nz * hw);  // pravý okraj
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const i0 = i * 2, i1 = i * 2 + 1, j0 = ((i + 1) % n) * 2, j1 = ((i + 1) % n) * 2 + 1;
    idx.push(i0, j0, i1, i1, j0, j1);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  roadGeo.setIndex(idx);
  roadGeo.computeVertexNormals();
  roadGroup.add(new THREE.Mesh(roadGeo, roadMat));

  // přerušovaná středová čára (krátké dílky podél osy)
  for (let i = 0; i < n; i += 2) {
    const a = path[i], b = path[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len * 0.5), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -Math.atan2(b.z - a.z, b.x - a.x) + Math.PI / 2;
    line.position.set((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2);
    roadGroup.add(line);
  }
  scene.add(roadGroup);

  // --- startovní/cílová čára ---
  const start = path[0];
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(trackWidth, 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  finish.rotation.x = -Math.PI / 2;
  finish.position.set(start.x, 0.06, start.z);
  scene.add(finish);

  // --- bloky budov ("dnešní svět") s fasádami a střechami ---
  const cityGroup = new THREE.Group();
  const obstacles = []; // {x,z,r} – kruhové kolize, ať dino neprobíhá skrz
  const wallPal = [0xe7e2d8, 0xd9b08c, 0xcfd6dd, 0xe9c46a, 0xb6c2a8, 0xd98b7a, 0xa9b7c6];
  const winPal = [0x3a4a6a, 0x6fc2d6, 0xffd86b, 0x2b3550]; // sklo / rozsvícená okna
  const rng = mulberry32(1234);
  for (let i = 0; i < 80; i++) {
    const ang = rng() * Math.PI * 2;
    const inside = rng() < 0.32;
    const r = inside ? 9 + rng() * 16 : 80 + rng() * 85;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * (r * 0.7);
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
    b.rotation.y = (rng() * 4 | 0) * Math.PI / 2; // natočení po 90°
    addOutline(b, 1.045);                          // širší obrys

    // střecha (skryje okna na horní ploše + přidá detail)
    const roofCol = new THREE.Color(wall).multiplyScalar(0.7).getHex();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.7, d * 1.06), toonMat(roofCol));
    roof.position.y = h / 2 + 0.35;
    addOutline(roof, 1.05);
    b.add(roof);

    // sokl / přízemí – zřetelná spodní část domu opřená o trávu
    const baseH = 2.4;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.05, baseH, d * 1.05),
      toonMat(new THREE.Color(wall).multiplyScalar(0.6).getHex()));
    base.position.y = -h / 2 + baseH / 2;
    addOutline(base, 1.04);
    b.add(base);

    cityGroup.add(b);

    // kolize: kruh kolem budovy – přidáme jen pokud nezasahuje na silnici
    const cr = Math.max(w, d) / 2 + 0.4;
    if (distToTrack(x, z, path) - cr > trackWidth / 2 + 0.8) {
      obstacles.push({ x, z, r: cr });
    }
  }
  addLandmarks(cityGroup, obstacles); // parodické "kulisy" reálných staveb
  scene.add(cityGroup);

  // --- světla ---
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(40, 80, 20);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcdeBff, 0x6a8a5a, 1.1));

  return { path, trackWidth, obstacles };
}

// jeden díl landmarku = toon mesh + širší obrys
function lmPart(geo, color, s = 1.06) {
  const m = new THREE.Mesh(geo, toonMat(color));
  addOutline(m, s);
  return m;
}

// ciferník pro hodinovou věž
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

// parodické "kulisy" reálných staveb (komiksová verze slavných památek)
function addLandmarks(group, obstacles) {
  // kruhové kolize pod landmarky (ať se skrz ně neproběhne)
  obstacles.push(
    { x: -96, z: 26, r: 3.5 },   // šikmá věž
    { x: 99, z: -14, r: 7.5 },   // Eiffelka
    { x: 8, z: -80, r: 5 },      // hodinová věž
    { x: -34, z: 82, r: 5.5 },   // socha
  );
  // 1) Šikmá věž (parodie Pisy)
  const pisa = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const ring = lmPart(new THREE.CylinderGeometry(2.4, 2.4, 3.2, 18), 0xeee6d2);
    ring.position.y = 2 + i * 3.2; pisa.add(ring);
  }
  const pcap = lmPart(new THREE.CylinderGeometry(1.9, 1.9, 2, 18), 0xddd3bb);
  pcap.position.y = 2 + 6 * 3.2; pisa.add(pcap);
  pisa.position.set(-96, 0, 26); pisa.rotation.z = 0.17; // nakloněná
  group.add(pisa);

  // 2) Železná věž (parodie Eiffelovky)
  const eiff = new THREE.Group();
  const tower = lmPart(new THREE.ConeGeometry(7, 34, 4), 0x8a6b4a);
  tower.position.y = 17; tower.rotation.y = Math.PI / 4; eiff.add(tower);
  const tip = lmPart(new THREE.ConeGeometry(0.7, 3, 4), 0x8a6b4a);
  tip.position.y = 34.5; tip.rotation.y = Math.PI / 4; eiff.add(tip);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xff5252, side: THREE.DoubleSide }));
  flag.position.set(1.2, 35.5, 0); eiff.add(flag);
  eiff.position.set(99, 0, -14); group.add(eiff);

  // 3) Hodinová věž (parodie Big Benu)
  const big = new THREE.Group();
  const shaft = lmPart(new THREE.BoxGeometry(6, 30, 6), 0xc9b079);
  shaft.position.y = 15; big.add(shaft);
  const broof = lmPart(new THREE.ConeGeometry(4.7, 7, 4), 0x7d5a3a);
  broof.position.y = 33.5; broof.rotation.y = Math.PI / 4; big.add(broof);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(2, 28),
    new THREE.MeshBasicMaterial({ map: clockTex() }));
  clock.position.set(0, 24, 3.05); big.add(clock);
  big.position.set(8, 0, -80); group.add(big);

  // 4) Zelená socha (parodie Sochy svobody)
  const st = new THREE.Group();
  const ped = lmPart(new THREE.BoxGeometry(7, 8, 7), 0x9aa1a8);
  ped.position.y = 4; st.add(ped);
  const bodyc = lmPart(new THREE.CylinderGeometry(2, 2.7, 9, 14), 0x6fae9b);
  bodyc.position.y = 12.5; st.add(bodyc);
  const headc = lmPart(new THREE.SphereGeometry(1.5, 14, 14), 0x6fae9b);
  headc.position.y = 18.5; st.add(headc);
  for (let i = 0; i < 7; i++) {       // koruna z paprsků
    const a = (i / 6 - 0.5) * Math.PI;
    const sp = lmPart(new THREE.ConeGeometry(0.26, 1.3, 5), 0x6fae9b);
    sp.position.set(Math.sin(a) * 1.5, 20, Math.cos(a) * 1.5);
    st.add(sp);
  }
  const arm = lmPart(new THREE.BoxGeometry(0.9, 4.2, 0.9), 0x6fae9b);
  arm.position.set(2.6, 19.5, 0); arm.rotation.z = -0.5; st.add(arm);
  const torch = lmPart(new THREE.ConeGeometry(0.85, 1.7, 8), 0xffd86b);
  torch.position.set(3.7, 22, 0); st.add(torch);
  st.position.set(-34, 0, 82); st.rotation.y = 0.5; group.add(st);
}

// nejkratší vzdálenost bodu k polyčáře tratě (pro umístění budov)
function distToTrack(x, z, path) {
  let min = Infinity;
  for (const p of path) {
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < min) min = d;
  }
  return min;
}

// deterministický PRNG, ať město vypadá pokaždé stejně
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
