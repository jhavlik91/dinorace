// world.js — stylizované "dnešní město": trať, bloky budov, komiksová obloha
import * as THREE from 'three';
import { toonMat } from './toon.js';

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

  // --- tráva / zem ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    toonMat(0x7fbf6a)
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // --- silnice jako stuha podél tratě ---
  const path = makeTrackPath();
  const trackWidth = 12;
  const roadGroup = new THREE.Group();
  const roadMat = toonMat(0x3a3f4b);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(trackWidth, len + 0.5), roadMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
    seg.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
    roadGroup.add(seg);
    // přerušovaná středová čára (každý druhý segment)
    if (i % 2 === 0) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len * 0.5), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = seg.rotation.z;
      line.position.set((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2);
      roadGroup.add(line);
    }
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

  // --- bloky budov ("dnešní svět") rozmístěné okolo i uvnitř tratě ---
  const cityGroup = new THREE.Group();
  const palette = [0xe7e2d8, 0xd97b66, 0x6b8fb0, 0xe9c46a, 0x9aa4b2, 0xb0c4a0];
  const rng = mulberry32(1234);
  for (let i = 0; i < 120; i++) {
    const ang = rng() * Math.PI * 2;
    const inside = rng() < 0.35;
    const r = inside ? 8 + rng() * 18 : 78 + rng() * 90;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * (r * 0.7);
    // nestav budovy na silnici
    if (Math.abs(distToTrack(x, z, path)) < trackWidth) continue;
    const w = 4 + rng() * 8, d = 4 + rng() * 8, h = 6 + rng() * 34;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      toonMat(palette[(rng() * palette.length) | 0]));
    b.position.set(x, h / 2, z);
    // komiksový obrys budovy
    const o = new THREE.Mesh(b.geometry,
      new THREE.MeshBasicMaterial({ color: 0x10131c, side: THREE.BackSide }));
    o.scale.setScalar(1.02);
    b.add(o);
    cityGroup.add(b);
  }
  scene.add(cityGroup);

  // --- světla ---
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(40, 80, 20);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcdeBff, 0x6a8a5a, 1.1));

  return { path, trackWidth };
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
