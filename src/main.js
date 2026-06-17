// main.js — herní smyčka prototypu DinoRace
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { buildDino, SPECIES, SPECIES_KEYS } from './dino.js';

// ---------- scéna ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcdebff, 120, 340);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

const world = buildWorld(scene);
const PATH = world.path;
const N = PATH.length;
const LAPS = 2;

const KO_TIME = 3.5;                 // jak dlouho je sražený dino "dole" (s)
const TOTAL = SPECIES_KEYS.length;   // 6 závodníků (jeden za každý druh)

// ---------- závodníci (staví se rovnou — slouží i jako pozadí menu) ----------
const start = PATH[0], next = PATH[1];
const fwd0 = new THREE.Vector3().subVectors(next, start).normalize();
const side0 = new THREE.Vector3(-fwd0.z, 0, fwd0.x);
const racers = [];
for (let i = 0; i < TOTAL; i++) {
  const speciesKey = SPECIES_KEYS[i];
  const dino = buildDino(speciesKey);
  scene.add(dino.root);

  // startovní rošt 2 sloupce × 3 řady za startovní čárou
  const col = i % 2, row = (i / 2) | 0;
  const pos = new THREE.Vector3().copy(start)
    .addScaledVector(side0, (col - 0.5) * 4.5)
    .addScaledVector(fwd0, -5 - row * 4.5);

  racers.push({
    dino, speciesKey, spec: dino.spec,
    isPlayer: false,
    pos, heading: Math.atan2(fwd0.x, fwd0.z),
    speed: 0, wpIndex: 0, lap: 1, armed: false,
    hp: dino.spec.hp, down: 0,
    stamina: dino.spec.stamina, tired: false,
    stun: 0, attackTimer: 0, runPhase: Math.random() * 6,
    finished: false, finishTime: 0, offTrack: false,
  });
}
let player = null;     // nastaví se výběrem v menu
let started = false;
// ladicí přístup z konzole: window.__dino.racers[0].down = 3.5  apod.
window.__dino = { racers, get player() { return player; } };

// plovoucí health bar nad každým dinosaurem (skryté do startu závodu)
const barsLayer = document.getElementById('bars');
for (const r of racers) {
  const box = document.createElement('div'); box.className = 'hpbox';
  const tag = document.createElement('div'); tag.className = 'hptag'; tag.textContent = r.spec.name;
  const bar = document.createElement('div'); bar.className = 'hpbar';
  const fill = document.createElement('div'); fill.className = 'hpfill';
  bar.appendChild(fill); box.appendChild(tag); box.appendChild(bar);
  barsLayer.appendChild(box);
  r.ui = { box, tag, fill };
}
barsLayer.style.display = 'none';

// ---------- menu výběru ----------
const STAT_DEFS = [
  ['Rychlost', 'topSpeed'], ['Zrychlení', 'accel'], ['Zatáčení', 'turn'],
  ['Odolnost', 'hp'], ['Výdrž', 'stamina'], ['Útok', 'dmg'],
];
const ranges = {};
for (const [, k] of STAT_DEFS) {
  const vals = SPECIES_KEYS.map(s => SPECIES[s][k]);
  ranges[k] = [Math.min(...vals), Math.max(...vals)];
}
function statPct(k, v) {
  const [lo, hi] = ranges[k];
  return 0.15 + 0.85 * ((v - lo) / (hi - lo || 1)); // i nejslabší stat má kousek
}
const cardsEl = document.getElementById('cards');
for (const key of SPECIES_KEYS) {
  const s = SPECIES[key];
  const card = document.createElement('button');
  card.className = 'card';
  const sw = '#' + new THREE.Color(s.color).getHexString();
  let stats = '';
  for (const [label, k] of STAT_DEFS) {
    stats += `<div class="st"><span>${label}</span><i><b style="width:${(statPct(k, s[k]) * 100).toFixed(0)}%"></b></i></div>`;
  }
  card.innerHTML =
    `<div class="chead"><span class="dot" style="background:${sw}"></span>${s.name}</div>` +
    `<div class="catk">⚔ ${s.attack}</div><div>${stats}</div>`;
  card.addEventListener('click', () => selectDino(key));
  cardsEl.appendChild(card);
}

function selectDino(key) {
  player = racers.find(r => r.speciesKey === key);
  player.isPlayer = true;
  document.querySelector('[data-species]').textContent = player.spec.name;
  document.querySelector('[data-attack]').textContent = 'útok: ' + player.spec.attack;
  player.ui.box.classList.add('me');
  player.ui.tag.textContent = player.spec.name + ' (ty)';
  document.getElementById('menu').style.display = 'none';
  barsLayer.style.display = '';
  started = true;
}

// ---------- vstup ----------
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (started && player) triggerAttack(player); }
  if (e.code === 'KeyR') location.reload();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- útok ----------
function triggerAttack(r) {
  if (r.attackTimer > 0 || r.stun > 0 || r.down > 0) return; // sražený neútočí
  r.attackTimer = 0.45;
  r.attackHitDone = false;
}

function resolveAttackHit(r) {
  const fwd = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
  for (const o of racers) {
    if (o === r || o.down > 0) continue;
    const to = new THREE.Vector3().subVectors(o.pos, r.pos);
    const dist = to.length();
    if (dist > r.spec.reach) continue;
    to.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(fwd.dot(to), -1, 1));
    if (ang < r.spec.arc) {
      o.hp -= r.spec.dmg;            // síla útoku dle druhu
      popFx(o, r.spec.attack);
      if (o.hp <= 0) {              // moc zásahů → k zemi
        o.hp = 0; o.down = KO_TIME; o.stun = 0; o.speed *= 0.2;
        popFx(o, 'K.O.');
      } else {
        o.stun = 0.9; o.speed *= 0.5;
      }
    }
  }
}

// ---------- pohyb + AI ----------
const tmp = new THREE.Vector3();
function nearestWaypoint(pos, fromIdx) {
  let best = fromIdx, bestD = Infinity;
  for (let k = -2; k <= 6; k++) {
    const idx = (fromIdx + k + N) % N;
    const d = tmp.copy(PATH[idx]).sub(pos).lengthSq();
    if (d < bestD) { bestD = d; best = idx; }
  }
  return best;
}

function distToPath(x, z) {
  let min = Infinity;
  for (let i = 0; i < N; i++) {
    const a = PATH[i], b = PATH[(i + 1) % N];
    const abx = b.x - a.x, abz = b.z - a.z;
    const apx = x - a.x, apz = z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    const t = THREE.MathUtils.clamp((apx * abx + apz * abz) / len2, 0, 1);
    const cx = a.x + abx * t, cz = a.z + abz * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < min) min = d;
  }
  return min;
}

function steerAI(r, dt) {
  const look = (r.wpIndex + 3) % N;
  const target = PATH[look];
  const desired = Math.atan2(target.x - r.pos.x, target.z - r.pos.z);
  let diff = ((desired - r.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  r.heading += THREE.MathUtils.clamp(diff, -1, 1) * r.spec.turn * dt;
  const targetSpeed = r.spec.topSpeed * 0.82; // ať je hráč může dohnat
  r.speed += (targetSpeed - r.speed) * 1.5 * dt;
  if (Math.random() < 0.6 * dt) triggerAttack(r);
}

function controlPlayer(r, dt) {
  const accel = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  const brake = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const turn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  r.speed += accel * r.spec.accel * dt;
  r.speed -= brake * 30 * dt;
  const grip = THREE.MathUtils.clamp(r.speed / 8, 0, 1); // zatáčení až za jízdy
  r.heading += turn * r.spec.turn * dt * grip;
}

function integrate(r, dt) {
  if (r.down > 0) {
    r.down -= dt;
    r.speed *= 0.85;
    if (r.down <= 0) { r.down = 0; r.hp = r.spec.hp; } // zvedne se s plným zdravím
  } else if (r.stun > 0) {
    r.stun -= dt;
    r.heading += dt * 6;
    r.speed *= 0.96;
  }
  r.speed *= (1 - 0.6 * dt);
  r.speed = THREE.MathUtils.clamp(r.speed, 0, r.spec.topSpeed);

  // výdrž: ostré tempo ji ubírá, mírné doplňuje; po vyčerpání dino umdlí a zpomalí
  const maxSt = r.spec.stamina;
  const hard = r.speed > r.spec.topSpeed * 0.6;
  r.stamina = THREE.MathUtils.clamp(r.stamina + (hard ? -dt : dt * 0.6), 0, maxSt);
  if (r.stamina <= 0) r.tired = true;
  else if (r.stamina > maxSt * 0.3) r.tired = false; // zotaví se až po doplnění ~30 %
  if (r.tired) r.speed = Math.min(r.speed, r.spec.topSpeed * 0.6);

  // mimo trať = pomalejší
  r.offTrack = distToPath(r.pos.x, r.pos.z) > world.trackWidth / 2;
  if (r.offTrack) {
    r.speed = Math.min(r.speed, r.spec.topSpeed * 0.5);
    r.speed *= (1 - 1.1 * dt);
  }

  const fwd = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
  r.pos.addScaledVector(fwd, r.speed * dt);

  // odstrkávání závodníků od sebe
  for (const o of racers) {
    if (o === r) continue;
    const d = tmp.copy(r.pos).sub(o.pos); d.y = 0;
    const dist = d.length();
    if (dist > 0.001 && dist < 2.6) {
      r.pos.addScaledVector(d.normalize(), (2.6 - dist) * 0.5);
    }
  }
}

// ---------- kola / pořadí ----------
function updateProgress(r) {
  const prev = r.wpIndex;
  r.wpIndex = nearestWaypoint(r.pos, r.wpIndex);
  if (r.wpIndex > N * 0.4 && r.wpIndex < N * 0.7) r.armed = true;
  if (r.armed && prev > N - 6 && r.wpIndex < 6) {
    r.armed = false;
    r.lap++;
    if (r.lap > LAPS && !r.finished) { r.finished = true; r.finishTime = performance.now(); }
  }
}
function progressScore(r) { return r.lap * N + r.wpIndex; }

// ---------- vizuální animace dina ----------
function animateDino(r, dt) {
  const d = r.dino;
  r.runPhase += dt * (4 + r.speed * 0.5);
  const gait = Math.sin(r.runPhase);
  const run = Math.min(1, r.speed / 6);
  d.body.position.y = Math.abs(gait) * 0.12 * run;
  d.parts.legs[0].rotation.x = gait * 0.7 * run;
  d.parts.legs[1].rotation.x = -gait * 0.7 * run;
  d.parts.tail.rotation.y = Math.sin(r.runPhase * 0.5) * 0.15;

  if (r.attackTimer > 0) {
    r.attackTimer -= dt;
    const p = 1 - r.attackTimer / 0.45;
    const swing = Math.sin(p * Math.PI);
    const which = r.spec.attackPart;
    if (which === 'head') {
      d.parts.neck.rotation.x = -swing * 0.6;
      d.parts.jaw.rotation.x = swing * 0.6;
    } else if (which === 'tail') {
      d.parts.tail.rotation.y = swing * 1.6;
    } else if (which === 'arm') {
      d.parts.arm.rotation.x = -swing * 1.4;
    }
    if (!r.attackHitDone && p > 0.5) { r.attackHitDone = true; resolveAttackHit(r); }
  } else {
    d.parts.jaw.rotation.x = 0;
    d.parts.arm.rotation.x = 0;
  }

  d.root.position.set(r.pos.x, 0, r.pos.z);
  d.root.rotation.y = r.heading;
  if (r.down > 0) d.body.rotation.z = 1.35;
  else if (r.stun > 0) d.body.rotation.z = Math.sin(performance.now() * 0.02) * 0.3;
  else d.body.rotation.z = 0;
}

// ---------- komiksová bublina ----------
const fxLayer = document.getElementById('fx');
const POW = ['BAM!', 'POW!', 'CHŇAP!', 'PRÁSK!', 'AU!'];
function popFx(r) {
  const v = r.pos.clone().setY(2.5).project(camera);
  if (v.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pow';
  el.textContent = POW[(Math.random() * POW.length) | 0];
  el.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px';
  el.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px';
  el.style.setProperty('--r', (Math.random() * 30 - 15) + 'deg');
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 520);
}

// ---------- kamera ----------
function updateCamera(dt) {
  const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const want = new THREE.Vector3().copy(player.pos)
    .addScaledVector(fwd, -11).add(new THREE.Vector3(0, 7, 0));
  camera.position.lerp(want, Math.min(1, dt * 4));
  camera.lookAt(player.pos.x, 2, player.pos.z);
}

// kamera v menu: pomalý oblet startovního roštu
const lineupCenter = new THREE.Vector3().copy(start).addScaledVector(fwd0, -9);
function menuCamera(now) {
  const a = now * 0.00025;
  camera.position.set(lineupCenter.x + Math.cos(a) * 20, 10, lineupCenter.z + Math.sin(a) * 20);
  camera.lookAt(lineupCenter.x, 3, lineupCenter.z);
}

// ---------- HUD ----------
const elLap = document.querySelector('[data-lap]');
const elPos = document.querySelector('[data-pos]');
const elSpeed = document.querySelector('[data-speed]');
const elStamina = document.querySelector('[data-stamina]');
const banner = document.getElementById('banner');
function updateHUD() {
  const sorted = [...racers].sort((a, b) => progressScore(b) - progressScore(a));
  const place = sorted.indexOf(player) + 1;
  elLap.textContent = `Kolo ${Math.min(player.lap, LAPS)}/${LAPS}`;
  elPos.textContent = `Pozice ${place}/${TOTAL}`;
  elSpeed.textContent = Math.round(player.speed * 3.6 * 1.6);
  elSpeed.parentElement.style.color = player.offTrack ? '#e3b341' : '#fff';
  // výdrž: zelená → při umdlení červená
  elStamina.style.width = Math.max(0, player.stamina / player.spec.stamina) * 100 + '%';
  elStamina.style.background = player.tired ? '#f85149' : '#56d364';
  if (player.finished) {
    banner.textContent = place === 1 ? '🏆 VÍTĚZSTVÍ!' : 'CÍL!';
    banner.style.opacity = 1;
  }
}

// ---------- health bary ----------
const barPos = new THREE.Vector3();
function updateBars() {
  for (const r of racers) {
    const ui = r.ui;
    barPos.set(r.pos.x, 3.6, r.pos.z).project(camera);
    if (barPos.z > 1) { ui.box.style.display = 'none'; continue; }
    ui.box.style.display = 'block';
    ui.box.style.left = (barPos.x * 0.5 + 0.5) * innerWidth + 'px';
    ui.box.style.top = (-barPos.y * 0.5 + 0.5) * innerHeight + 'px';
    const pct = Math.max(0, r.hp / r.spec.hp);
    ui.fill.style.width = (pct * 100) + '%';
    ui.fill.style.background =
      r.down > 0 ? '#6b7280' : pct > 0.5 ? '#56d364' : pct > 0.25 ? '#e3b341' : '#f85149';
    const ko = r.down > 0;
    ui.box.classList.toggle('ko', ko);
    ui.tag.textContent = ko ? `K.O. ${r.down.toFixed(1)}s`
      : r.spec.name + (r.isPlayer ? ' (ty)' : '');
  }
}

// ---------- smyčka ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (started) {
    for (const r of racers) {
      if (r.down > 0) { /* sražený – řídí jen integrate */ }
      else if (r.finished) { r.speed *= 0.9; }
      else if (r.isPlayer) controlPlayer(r, dt);
      else steerAI(r, dt);
      integrate(r, dt);
      updateProgress(r);
      animateDino(r, dt);
    }
    updateCamera(dt);
    updateHUD();
    updateBars();
  } else {
    menuCamera(now);
    for (const r of racers) animateDino(r, dt); // jemné "dýchání" v lineupu
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
