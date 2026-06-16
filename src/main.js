// main.js — herní smyčka prototypu DinoRace
import * as THREE from 'three';
import { buildWorld, makeTrackPath } from './world.js';
import { buildDino, SPECIES_KEYS } from './dino.js';

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

// ---------- závodníci ----------
const MAX_HP = 100;   // plné zdraví
const HIT_DMG = 22;   // poškození za jeden zásah (~5 zásahů = K.O.)
const KO_TIME = 3.5;  // jak dlouho je sražený dino "dole" (s)

const TOTAL = 4;
const racers = [];
for (let i = 0; i < TOTAL; i++) {
  const speciesKey = SPECIES_KEYS[i % SPECIES_KEYS.length];
  const dino = buildDino(speciesKey);
  scene.add(dino.root);

  // start v řadě těsně před startovní čárou
  const start = PATH[0];
  const next = PATH[1];
  const fwd = new THREE.Vector3().subVectors(next, start).normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const pos = new THREE.Vector3()
    .copy(start)
    .addScaledVector(side, (i - (TOTAL - 1) / 2) * 3)
    .addScaledVector(fwd, -4 - (i % 2) * 2);

  racers.push({
    dino, speciesKey, spec: dino.spec,
    isPlayer: i === 0,
    pos, heading: Math.atan2(fwd.x, fwd.z),
    speed: 0,
    wpIndex: 0, lap: 1, armed: false,
    hp: MAX_HP, down: 0,
    stun: 0, attackTimer: 0, runPhase: Math.random() * 6,
    finished: false, finishTime: 0,
  });
}
const player = racers[0];

// ladicí přístup z konzole: window.__dino.racers[1].down = 3.5  apod.
window.__dino = { racers, player };

// HUD vazby na druh hráče
document.querySelector('[data-species]').textContent = player.spec.name;
document.querySelector('[data-attack]').textContent = 'útok: ' + player.spec.attack;

// plovoucí health bar nad každým dinosaurem
const barsLayer = document.getElementById('bars');
for (const r of racers) {
  const box = document.createElement('div');
  box.className = 'hpbox' + (r.isPlayer ? ' me' : '');
  const tag = document.createElement('div'); tag.className = 'hptag';
  tag.textContent = r.spec.name + (r.isPlayer ? ' (ty)' : '');
  const bar = document.createElement('div'); bar.className = 'hpbar';
  const fill = document.createElement('div'); fill.className = 'hpfill';
  bar.appendChild(fill); box.appendChild(tag); box.appendChild(bar);
  barsLayer.appendChild(box);
  r.ui = { box, tag, fill };
}

// ---------- vstup ----------
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); triggerAttack(player); }
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
  r.attackTimer = 0.45; // délka animace útoku
  r.attackHitDone = false;
}

function resolveAttackHit(r) {
  const fwd = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
  for (const o of racers) {
    if (o === r || o.down > 0) continue; // už ležícího nemlátíme
    const to = new THREE.Vector3().subVectors(o.pos, r.pos);
    const dist = to.length();
    if (dist > r.spec.reach) continue;
    to.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(fwd.dot(to), -1, 1));
    if (ang < r.spec.arc) {
      o.hp -= HIT_DMG;
      popFx(o, r.spec.attack);      // komiksová bublina
      if (o.hp <= 0) {              // moc zásahů → k zemi
        o.hp = 0;
        o.down = KO_TIME;
        o.stun = 0;
        o.speed *= 0.2;
        popFx(o, 'K.O.');
      } else {
        o.stun = 0.9;              // krátké omráčení po zásahu
        o.speed *= 0.5;
      }
    }
  }
}

// ---------- pohyb + AI ----------
const tmp = new THREE.Vector3();
function nearestWaypoint(pos, fromIdx) {
  // hledáme nejbližší index v okně kolem aktuálního (trať je smyčka)
  let best = fromIdx, bestD = Infinity;
  for (let k = -2; k <= 6; k++) {
    const idx = (fromIdx + k + N) % N;
    const d = tmp.copy(PATH[idx]).sub(pos).lengthSq();
    if (d < bestD) { bestD = d; best = idx; }
  }
  return best;
}

function steerAI(r, dt) {
  // míří na bod o kus dál po trati (lookahead) + drobné kličkování
  const look = (r.wpIndex + 3) % N;
  const target = PATH[look];
  const desired = Math.atan2(target.x - r.pos.x, target.z - r.pos.z);
  let diff = ((desired - r.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  r.heading += THREE.MathUtils.clamp(diff, -1, 1) * 2.2 * dt;
  // plyn (AI jezdí o něco pomaleji než maximum, ať je hráč může dohnat)
  const targetSpeed = r.spec.topSpeed * 0.82;
  r.speed += (targetSpeed - r.speed) * 1.5 * dt;
  // občas zaútočí, když má někoho před sebou
  if (Math.random() < 0.6 * dt) triggerAttack(r);
}

function controlPlayer(r, dt) {
  const accel = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  const brake = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const turn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);

  r.speed += accel * r.spec.accel * dt;
  r.speed -= brake * 30 * dt;
  // zatáčení je účinnější při vyšší rychlosti, ale ne při stání
  const grip = THREE.MathUtils.clamp(r.speed / 8, 0, 1);
  r.heading += turn * 2.4 * dt * grip;
}

function integrate(r, dt) {
  if (r.down > 0) {                // sražený k zemi: leží a nehýbe se
    r.down -= dt;
    r.speed *= 0.85;
    if (r.down <= 0) { r.down = 0; r.hp = MAX_HP; } // zvedne se a doplní život
  } else if (r.stun > 0) {
    r.stun -= dt;
    r.heading += dt * 6;           // omráčený dino se zatočí dokola
    r.speed *= 0.96;
  }
  // valivý odpor
  r.speed *= (1 - 0.6 * dt);
  r.speed = THREE.MathUtils.clamp(r.speed, 0, r.spec.topSpeed);

  const fwd = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
  r.pos.addScaledVector(fwd, r.speed * dt);

  // mírné odstrkávání závodníků od sebe (žádné prolínání)
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
  // "natažení" v druhé půlce tratě — bez toho se přejezd startu nepočítá
  if (r.wpIndex > N * 0.4 && r.wpIndex < N * 0.7) r.armed = true;
  // přechod přes startovní čáru (z konce smyčky na začátek) = nové kolo
  if (r.armed && prev > N - 6 && r.wpIndex < 6) {
    r.armed = false;
    r.lap++;
    if (r.lap > LAPS && !r.finished) {
      r.finished = true;
      r.finishTime = performance.now();
    }
  }
}
function progressScore(r) { return r.lap * N + r.wpIndex; }

// ---------- vizuální animace dina ----------
function animateDino(r, dt) {
  const d = r.dino;
  // běh: kývání těla a "kroky" nohou podle rychlosti
  r.runPhase += dt * (4 + r.speed * 0.5);
  const gait = Math.sin(r.runPhase);
  d.body.position.y = Math.abs(gait) * 0.12 * Math.min(1, r.speed / 6);
  d.parts.legs[0].rotation.x = gait * 0.7 * Math.min(1, r.speed / 6);
  d.parts.legs[1].rotation.x = -gait * 0.7 * Math.min(1, r.speed / 6);
  d.parts.tail.rotation.y = Math.sin(r.runPhase * 0.5) * 0.15;

  // útok: animace správné části + zásah uprostřed animace
  if (r.attackTimer > 0) {
    r.attackTimer -= dt;
    const p = 1 - r.attackTimer / 0.45;          // 0→1
    const swing = Math.sin(p * Math.PI);          // náběh a návrat
    const which = r.spec.attackPart;
    if (which === 'head') {
      d.parts.neck.rotation.x = -swing * 0.6;     // hlava vyrazí vpřed
      d.parts.jaw.rotation.x = swing * 0.6;       // čelist se otevře
    } else if (which === 'tail') {
      d.parts.tail.rotation.y = swing * 1.6;      // mrsknutí ocasem
    } else if (which === 'arm') {
      d.parts.arm.rotation.x = -swing * 1.4;      // sek drápem
    }
    if (!r.attackHitDone && p > 0.5) { r.attackHitDone = true; resolveAttackHit(r); }
  } else {
    d.parts.jaw.rotation.x = 0;
    d.parts.arm.rotation.x = 0;
  }

  // aplikace transformace na root
  d.root.position.set(r.pos.x, 0, r.pos.z);
  d.root.rotation.y = r.heading;
  // sražený leží na boku; omráčený se kýve (komiksové "zatočí se mu hlava")
  if (r.down > 0) d.body.rotation.z = 1.35;
  else if (r.stun > 0) d.body.rotation.z = Math.sin(performance.now() * 0.02) * 0.3;
  else d.body.rotation.z = 0;
}

// ---------- komiksová bublina (DOM overlay) ----------
const fxLayer = document.getElementById('fx');
const POW = ['BAM!', 'POW!', 'CHŇAP!', 'PRÁSK!', 'AU!'];
function popFx(r, label) {
  const v = r.pos.clone().setY(2.5).project(camera);
  if (v.z > 1) return; // za kamerou
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
  const want = new THREE.Vector3()
    .copy(player.pos)
    .addScaledVector(fwd, -11)
    .add(new THREE.Vector3(0, 7, 0));
  camera.position.lerp(want, Math.min(1, dt * 4));
  camera.lookAt(player.pos.x, 2, player.pos.z);
}

// ---------- HUD ----------
const elLap = document.querySelector('[data-lap]');
const elPos = document.querySelector('[data-pos]');
const elSpeed = document.querySelector('[data-speed]');
const banner = document.getElementById('banner');
function updateHUD() {
  const sorted = [...racers].sort((a, b) => progressScore(b) - progressScore(a));
  const place = sorted.indexOf(player) + 1;
  elLap.textContent = `Kolo ${Math.min(player.lap, LAPS)}/${LAPS}`;
  elPos.textContent = `Pozice ${place}/${TOTAL}`;
  elSpeed.textContent = Math.round(player.speed * 3.6 * 1.6); // ~"km/h" pro pocit
  if (player.finished) {
    banner.textContent = place === 1 ? '🏆 VÍTĚZSTVÍ!' : 'CÍL!';
    banner.style.opacity = 1;
  }
}

// ---------- health bary (DOM nad hlavou) ----------
const barPos = new THREE.Vector3();
function updateBars() {
  for (const r of racers) {
    const ui = r.ui;
    barPos.set(r.pos.x, 3.6, r.pos.z).project(camera);
    if (barPos.z > 1) { ui.box.style.display = 'none'; continue; } // za kamerou
    ui.box.style.display = 'block';
    ui.box.style.left = (barPos.x * 0.5 + 0.5) * innerWidth + 'px';
    ui.box.style.top = (-barPos.y * 0.5 + 0.5) * innerHeight + 'px';

    const pct = Math.max(0, r.hp / MAX_HP);
    ui.fill.style.width = (pct * 100) + '%';
    ui.fill.style.background =
      r.down > 0 ? '#6b7280' : pct > 0.5 ? '#56d364' : pct > 0.25 ? '#e3b341' : '#f85149';

    const ko = r.down > 0;
    ui.box.classList.toggle('ko', ko);
    const nameLabel = r.spec.name + (r.isPlayer ? ' (ty)' : '');
    ui.tag.textContent = ko ? `K.O. ${r.down.toFixed(1)}s` : nameLabel;
  }
}

// ---------- smyčka ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

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

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
