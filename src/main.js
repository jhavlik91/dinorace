// main.js — herní smyčka prototypu DinoRace (1 hráč i split-screen pro 2)
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

function makeCamera() { return new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600); }
const cams = [makeCamera(), makeCamera()];

const world = buildWorld(scene);
const PATH = world.path;
const N = PATH.length;
const LAPS = 2;
const OBST = world.obstacles;
const DINO_R = 1.2;
const KO_TIME = 3.5;
const AGGRO_CAP = 135;  // hyper boost agresorů (~780 km/h) na vedoucího hráče
const RAPTOR_DELAY = 5; // úvodní spánek raptorů – po startu pár vteřin nečíhají

const P1_COLOR = '#3b82f6', P2_COLOR = '#ef4444'; // modrá / červená

// startovní pole: 6 druhů + 1 navíc + 3 nesmyslně agresivní raptoři = 10
const ROSTER = [
  { species: 'trex' }, { species: 'raptor' }, { species: 'ankylo' }, { species: 'trike' },
  { species: 'stego' }, { species: 'pachy' }, { species: 'trex' },
  { species: 'raptor', aggressive: true }, { species: 'raptor', aggressive: true }, { species: 'raptor', aggressive: true },
];
const TOTAL = ROSTER.length;

// vstupní schémata (boost = turbo)
const SCHEME_WASD = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], boost: ['ShiftLeft'], attack: 'Space' };
const SCHEME_ARROWS = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], boost: ['ShiftRight'], attack: 'Enter' };
const SCHEME_BOTH = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  boost: ['ShiftLeft', 'ShiftRight'], attack: 'Space',
};

// ---------- závodníci ----------
const start = PATH[0], next = PATH[1];
const fwd0 = new THREE.Vector3().subVectors(next, start).normalize();
const side0 = new THREE.Vector3(-fwd0.z, 0, fwd0.x);
const racers = [];
let gridN = 0, aggN = 0;
for (let i = 0; i < TOTAL; i++) {
  const speciesKey = ROSTER[i].species;
  const aggressive = !!ROSTER[i].aggressive;
  const dino = buildDino(speciesKey);
  scene.add(dino.root);

  let pos;
  if (aggressive) {
    // raptoři číhají daleko za startem (mimo view), přiběhnou až po pár vteřinách
    pos = new THREE.Vector3().copy(start)
      .addScaledVector(fwd0, -170 - aggN * 8)
      .addScaledVector(side0, (aggN - 1) * 10);
    aggN++;
  } else {
    const col = gridN % 2, row = (gridN / 2) | 0; // 2 sloupce × řady
    pos = new THREE.Vector3().copy(start)
      .addScaledVector(side0, (col - 0.5) * 4.5)
      .addScaledVector(fwd0, -5 - row * 4.5);
    gridN++;
  }

  racers.push({
    dino, speciesKey, spec: dino.spec,
    isPlayer: false, aggressive, megaBoost: false, rankBonus: 0, scheme: null, hud: null,
    pos, heading: Math.atan2(fwd0.x, fwd0.z),
    speed: 0, wpIndex: 0, lap: 1, armed: false,
    hp: dino.spec.hp, down: 0,
    stamina: 0, boosting: false,           // turbo se získává zásahy, start na nule
    stun: 0, attackTimer: 0, runPhase: Math.random() * 6,
    finished: false, finishTime: 0, offTrack: false,
  });
}
// agresivní raptoři NEJSOU závodníci – do pořadí se počítají jen ostatní
const RACER_COUNT = racers.filter(r => !r.aggressive).length;

let players = [];
let started = false, racing = false, countdown = 3.0, raceTime = 0;
let viewports = [];
window.__dino = { racers, path: PATH, get players() { return players; } };

// plovoucí health bary (jen 1 hráč)
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

// ---------- menu ----------
const STAT_DEFS = [
  ['Rychlost', 'topSpeed'], ['Zrychlení', 'accel'], ['Zatáčení', 'turn'],
  ['Odolnost', 'hp'], ['Výdrž', 'stamina'], ['Útok', 'dmg'],
];
const ranges = {};
for (const [, k] of STAT_DEFS) {
  const vals = SPECIES_KEYS.map(s => SPECIES[s][k]);
  ranges[k] = [Math.min(...vals), Math.max(...vals)];
}
const statPct = (k, v) => { const [lo, hi] = ranges[k]; return 0.15 + 0.85 * ((v - lo) / (hi - lo || 1)); };

let menuMode = 1;
let picks = [];
const promptEl = document.querySelector('[data-prompt]');
const cardsEl = document.getElementById('cards');
const cardByKey = {};

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
  card.addEventListener('click', () => pickDino(key));
  cardsEl.appendChild(card);
  cardByKey[key] = card;
}

for (const btn of document.querySelectorAll('#modes button')) {
  btn.addEventListener('click', () => {
    menuMode = +btn.dataset.mode;
    for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b === btn);
    picks = [];
    for (const k in cardByKey) cardByKey[k].classList.remove('disabled', 'p1', 'p2');
    promptEl.style.color = '#cdd6ff';
    promptEl.textContent = menuMode === 1 ? 'Vyber svého dinosaura' : 'Hráč 1 ①: vyber svého dinosaura';
  });
}

function pickDino(key) {
  if (picks.includes(key)) return;
  const idx = picks.length;     // 0 = P1, 1 = P2
  picks.push(key);
  cardByKey[key].classList.add('disabled', idx === 0 ? 'p1' : 'p2');
  if (picks.length < menuMode) {
    promptEl.style.color = P2_COLOR;
    promptEl.textContent = 'Hráč 2 ②: vyber svého dinosaura';
    return;
  }
  startRace(picks);
}

function startRace(pickKeys) {
  const schemes = menuMode === 1 ? [SCHEME_BOTH] : [SCHEME_WASD, SCHEME_ARROWS];
  players = pickKeys.map((key, i) => {
    // vezmi neagresivního závodníka daného druhu, který ještě není hráč
    const r = racers.find(x => x.speciesKey === key && !x.isPlayer && !x.aggressive)
      || racers.find(x => x.speciesKey === key && !x.isPlayer);
    r.isPlayer = true;
    r.scheme = schemes[i];
    return r;
  });

  if (players.length === 1) {
    // single mode: hráč startuje vždy první (pole-position + drobný náskok v pořadí,
    // který zmizí, jakmile ho někdo doopravdy předjede)
    players[0].pos.copy(start).addScaledVector(fwd0, -2.5);
    players[0].rankBonus = 0.5;
    viewports = [{ cam: cams[0], x: 0, y: 0, w: 1, h: 1 }];
    document.querySelector('[data-species]').textContent = players[0].spec.name;
    document.querySelector('[data-attack]').textContent = 'útok: ' + players[0].spec.attack;
    players[0].ui.box.classList.add('me');
    players[0].ui.tag.textContent = players[0].spec.name + ' (ty)';
    barsLayer.style.display = '';
  } else {
    viewports = [
      { cam: cams[0], x: 0, y: 0, w: 1, h: 0.5 },   // Hráč 1 nahoře
      { cam: cams[1], x: 0, y: 0.5, w: 1, h: 0.5 }, // Hráč 2 dole
    ];
    document.getElementById('divider').style.display = 'block';
    document.getElementById('topleft').style.display = 'none';
    document.getElementById('topright').style.display = 'none';
    document.getElementById('speedo').style.display = 'none';
    buildPanel(players[0], 'top', '①', P1_COLOR);
    buildPanel(players[1], 'bottom', '②', P2_COLOR);
  }

  setAspects();
  document.getElementById('menu').style.display = 'none';
  started = true;
  racing = false; countdown = 3.0; raceTime = 0;  // 3-2-1 start
}

function buildPanel(p, side, badge, color) {
  const el = document.createElement('div');
  el.className = 'pHud ' + side;
  el.style.borderLeft = '4px solid ' + color;
  el.style.paddingLeft = '8px';
  el.innerHTML =
    `<div class="pname" style="color:${color}">${badge} ${p.spec.name}</div>` +
    `<div class="pinfo"></div>` +
    `<div class="pb"><span>HP</span><i><b class="hpb"></b></i></div>` +
    `<div class="pb"><span>Turbo</span><i><b class="stb"></b></i></div>` +
    `<div class="pspeed"><b>0</b> <small>km/h</small></div>`;
  document.body.appendChild(el);
  p.hud = {
    info: el.querySelector('.pinfo'), hp: el.querySelector('.hpb'),
    st: el.querySelector('.stb'), speed: el.querySelector('.pspeed b'),
  };
}

function setAspects() {
  if (viewports.length) {
    for (const vp of viewports) { vp.cam.aspect = (vp.w * innerWidth) / (vp.h * innerHeight); vp.cam.updateProjectionMatrix(); }
  } else { cams[0].aspect = innerWidth / innerHeight; cams[0].updateProjectionMatrix(); }
}

// ---------- vstup ----------
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (racing) for (const p of players) if (e.code === p.scheme.attack) { e.preventDefault(); triggerAttack(p); }
  if (e.code === 'KeyR') location.reload();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  if (started) setAspects();
  else { cams[0].aspect = innerWidth / innerHeight; cams[0].updateProjectionMatrix(); }
});

// ---------- útok (směrové laloky: před/za/vedle) ----------
function triggerAttack(r) {
  if (r.attackTimer > 0 || r.stun > 0 || r.down > 0) return;
  r.attackTimer = 0.45;
  r.attackHitDone = false;
}

function inAttackZone(r, o, slackR, slackA) {
  const dx = o.pos.x - r.pos.x, dz = o.pos.z - r.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > r.spec.reach + slackR) return false;
  const angTo = Math.atan2(dx, dz);
  for (const dir of r.spec.dirs) {
    let da = ((angTo - (r.heading + dir) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(da) < r.spec.arc + slackA) return true;
  }
  return false;
}

function resolveAttackHit(r) {
  for (const o of racers) {
    if (o === r || o.down > 0) continue;
    if (!inAttackZone(r, o, 0, 0)) continue;
    popFx(o);
    r.stamina = Math.min(r.spec.stamina, r.stamina + 1.6); // turbo za povedený útok
    // agresivní raptoři hráče jen otravují: omráčí a odstrčí, ale neknockoutují
    if (r.aggressive && o.isPlayer) { o.stun = 0.9; o.speed *= 0.4; continue; }
    o.hp -= r.spec.dmg;
    if (o.hp <= 0) { o.hp = 0; o.down = KO_TIME; o.stun = 0; o.speed *= 0.2; popFx(o); }
    else { o.stun = 0.9; o.speed *= 0.5; }
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
    const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
    if (d < min) min = d;
  }
  return min;
}

function angTowards(r, x, z) {
  const desired = Math.atan2(x - r.pos.x, z - r.pos.z);
  return ((desired - r.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function maybeAttack(r) {
  if (r.attackTimer > 0) return;
  for (const o of racers) {
    if (o === r || o.down > 0 || (o.isPlayer === r.isPlayer && r.isPlayer)) continue;
    if (inAttackZone(r, o, 0.8, 0.25)) { triggerAttack(r); return; }
  }
}

function followTrack(r, dt) { // jen jede po trati (bez útočení)
  r.megaBoost = false;
  const target = PATH[(r.wpIndex + 3) % N];
  r.heading += THREE.MathUtils.clamp(angTowards(r, target.x, target.z), -1, 1) * r.spec.turn * dt;
  r.speed += (r.spec.topSpeed * 0.86 - r.speed) * 1.5 * dt;
  r.boosting = r.stamina > r.spec.stamina * 0.55;
}

function steerAI(r, dt) {
  followTrack(r, dt);
  maybeAttack(r);
}

function steerAggressive(r, dt) {
  const t = aggroTarget();
  // útočí JEN dokud je první hráč; jinak (i během úvodního spánku) zmizí mimo view a čeká
  if (!t || t === r) { fleeAway(r, dt); return; }
  r.heading += THREE.MathUtils.clamp(angTowards(r, t.pos.x, t.pos.z), -1, 1) * r.spec.turn * 1.8 * dt;
  r.boosting = false;
  const d = Math.hypot(t.pos.x - r.pos.x, t.pos.z - r.pos.z);
  if (r.attackTimer > 0) {
    // útočí → boost je jen na běhání, ne na útok: přibrzdí a netryská
    r.megaBoost = false;
    r.speed += (r.spec.topSpeed * 0.5 - r.speed) * 5 * dt;
    return;
  }
  // HYPER BOOST: řítí se na hráče maximem i blízko (neutečeš); přibrzdí až těsně u něj
  const desired = d > 5 ? AGGRO_CAP : r.spec.topSpeed;
  r.speed += (desired - r.speed) * 9 * dt;
  r.megaBoost = d > 5;
  if (d < r.spec.reach + 0.9) triggerAttack(r);
}

// raptor mimo akci: uteče daleko od dění a čeká, dokud hráč nebude zase první
function fleeAway(r, dt) {
  r.boosting = false;
  const ref = leadRacer() || r;
  const dx = r.pos.x - ref.pos.x, dz = r.pos.z - ref.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 160) { r.megaBoost = false; r.speed *= (1 - 2 * dt); return; } // dost daleko – čeká
  const away = Math.atan2(dx, dz);
  let diff = ((away - r.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  r.heading += THREE.MathUtils.clamp(diff, -1, 1) * r.spec.turn * 1.5 * dt;
  r.speed += (AGGRO_CAP - r.speed) * 6 * dt;
  r.megaBoost = true; // zmizí z view rychle
}

// pole skutečných závodníků (raptoři se nepočítají)
function raceField() { return racers.filter(x => !x.aggressive); }
function leadRacer() { return raceField().sort((a, b) => progressScore(b) - progressScore(a))[0]; }
function aggroTarget() { // jen dokud je první hráč a po úvodním spánku
  if (raceTime < RAPTOR_DELAY) return null;
  const l = leadRacer();
  return l && l.isPlayer ? l : null;
}

function down(list) { for (const k of list) if (keys[k]) return true; return false; }
function controlPlayer(r, dt) {
  const s = r.scheme;
  const accel = down(s.up) ? 1 : 0;
  const brake = down(s.down) ? 1 : 0;
  const turn = (down(s.left) ? 1 : 0) - (down(s.right) ? 1 : 0);
  r.speed += accel * r.spec.accel * dt;
  r.speed -= brake * 30 * dt;
  const grip = THREE.MathUtils.clamp(r.speed / 8, 0, 1);
  r.heading += turn * r.spec.turn * dt * grip;
  r.boosting = down(s.boost) && r.stamina > 0;
}

function integrate(r, dt) {
  if (r.down > 0) {
    r.down -= dt; r.speed *= 0.85;
    if (r.down <= 0) { r.down = 0; r.hp = r.spec.hp; }
  } else if (r.stun > 0) {
    r.stun -= dt; r.heading += dt * 6; r.speed *= 0.96;
  }
  r.speed *= (1 - 0.6 * dt);

  // turbo: krátkodobé zrychlení nad maximum, ujídá výdrž; jinak se pomalu doplňuje
  const boosting = r.boosting && r.stamina > 0 && r.down <= 0;
  if (boosting) { r.speed += r.spec.accel * 0.8 * dt; r.stamina = Math.max(0, r.stamina - 3 * dt); }
  else if (r.down <= 0) r.stamina = Math.min(r.spec.stamina, r.stamina + 0.6 * dt); // pasivní doplnění
  // agresoři v honu mají obří strop (~500 km/h); ostatní normální turbo
  const cap = r.megaBoost ? AGGRO_CAP : boosting ? r.spec.topSpeed * 1.45 : r.spec.topSpeed;
  r.speed = THREE.MathUtils.clamp(r.speed, 0, cap);

  r.offTrack = distToPath(r.pos.x, r.pos.z) > world.trackWidth / 2;
  if (r.offTrack && !r.megaBoost) { r.speed = Math.min(r.speed, r.spec.topSpeed * 0.5); r.speed *= (1 - 1.1 * dt); }

  const fwd = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
  r.pos.addScaledVector(fwd, r.speed * dt);

  for (const o of racers) {
    if (o === r) continue;
    const d = tmp.copy(r.pos).sub(o.pos); d.y = 0;
    const dist = d.length();
    if (dist > 0.001 && dist < 2.6) r.pos.addScaledVector(d.normalize(), (2.6 - dist) * 0.5);
  }
  // kolize s budovami/landmarky
  for (const ob of OBST) {
    const dx = r.pos.x - ob.x, dz = r.pos.z - ob.z;
    const dist = Math.hypot(dx, dz);
    const min = ob.r + DINO_R;
    if (dist < min && dist > 0.001) {
      const push = min - dist;
      r.pos.x += dx / dist * push; r.pos.z += dz / dist * push;
      r.speed *= 0.5;
    }
  }
}

// ---------- kola / pořadí ----------
function updateProgress(r) {
  const prev = r.wpIndex;
  r.wpIndex = nearestWaypoint(r.pos, r.wpIndex);
  if (r.wpIndex > N * 0.4 && r.wpIndex < N * 0.7) r.armed = true;
  if (r.armed && prev > N - 6 && r.wpIndex < 6) {
    r.armed = false; r.lap++;
    if (r.lap > LAPS && !r.finished) { r.finished = true; r.finishTime = performance.now(); }
  }
}
function progressScore(r) { return r.lap * N + r.wpIndex + r.rankBonus; }
function placeOf(r) { // pořadí jen mezi skutečnými závodníky (bez raptorů)
  return raceField().sort((a, b) => progressScore(b) - progressScore(a)).indexOf(r) + 1;
}

// ---------- animace ----------
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
    const w = r.spec.attackPart;
    if (w === 'head' || w === 'both') { d.parts.neck.rotation.x = -swing * 0.6; d.parts.jaw.rotation.x = swing * 0.6; }
    if (w === 'tail' || w === 'both') { d.parts.tail.rotation.y = Math.sin(p * Math.PI * 2) * 1.7; } // švih na obě strany
    if (w === 'arm') { d.parts.arm.rotation.x = -swing * 1.4; }
    if (!r.attackHitDone && p > 0.5) { r.attackHitDone = true; resolveAttackHit(r); }
  } else {
    d.parts.jaw.rotation.x = 0; d.parts.arm.rotation.x = 0; d.parts.neck.rotation.x = 0;
  }

  d.root.position.set(r.pos.x, 0, r.pos.z);
  d.root.rotation.y = r.heading;
  if (r.down > 0) d.body.rotation.z = 1.35;
  else if (r.stun > 0) d.body.rotation.z = Math.sin(performance.now() * 0.02) * 0.3;
  else d.body.rotation.z = 0;
}

// ---------- komiksová bublina (do správného viewportu) ----------
const fxLayer = document.getElementById('fx');
const POW = ['BAM!', 'POW!', 'CHŇAP!', 'PRÁSK!', 'AU!'];
const fxV = new THREE.Vector3();
function popFx(r) {
  const word = POW[(Math.random() * POW.length) | 0];
  for (const vp of viewports) {
    fxV.set(r.pos.x, 2.5, r.pos.z).project(vp.cam);
    if (fxV.z > 1 || Math.abs(fxV.x) > 1 || Math.abs(fxV.y) > 1) continue;
    const el = document.createElement('div');
    el.className = 'pow'; el.textContent = word;
    el.style.left = (vp.x + (fxV.x * 0.5 + 0.5) * vp.w) * innerWidth + 'px';
    el.style.top = (vp.y + (-fxV.y * 0.5 + 0.5) * vp.h) * innerHeight + 'px';
    el.style.setProperty('--r', (Math.random() * 30 - 15) + 'deg');
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 520);
  }
}

// ---------- kamera ----------
function updateCamera(cam, p, dt) {
  const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
  const want = new THREE.Vector3().copy(p.pos).addScaledVector(fwd, -11).add(new THREE.Vector3(0, 7, 0));
  cam.position.lerp(want, Math.min(1, dt * 4));
  cam.lookAt(p.pos.x, 2, p.pos.z);
}

const lineupCenter = new THREE.Vector3().copy(start).addScaledVector(fwd0, -9);
function menuCamera(now) {
  const a = now * 0.00025;
  cams[0].position.set(lineupCenter.x + Math.cos(a) * 22, 11, lineupCenter.z + Math.sin(a) * 22);
  cams[0].lookAt(lineupCenter.x, 3, lineupCenter.z);
}

// ---------- HUD ----------
const elLap = document.querySelector('[data-lap]');
const elPos = document.querySelector('[data-pos]');
const elSpeed = document.querySelector('[data-speed]');
const elStamina = document.querySelector('[data-stamina]');
const banner = document.getElementById('banner');
let bannerLocked = false; // po START / CÍL

function updateHUD1() {
  const p = players[0];
  const place = placeOf(p);
  elLap.textContent = `Kolo ${Math.min(p.lap, LAPS)}/${LAPS}`;
  elPos.textContent = `Pozice ${place}/${RACER_COUNT}`;
  elSpeed.textContent = Math.round(p.speed * 3.6 * 1.6);
  elSpeed.parentElement.style.color = p.offTrack ? '#e3b341' : '#fff';
  elStamina.style.width = Math.max(0, p.stamina / p.spec.stamina) * 100 + '%';
  elStamina.style.background = p.boosting ? '#ffd54a' : '#56d364';
  if (p.finished) showResult(place === 1);
}

function updatePanels() {
  for (const p of players) {
    const h = p.hud;
    h.info.textContent = `Kolo ${Math.min(p.lap, LAPS)}/${LAPS} · Pozice ${placeOf(p)}/${RACER_COUNT}`;
    const hpPct = Math.max(0, p.hp / p.spec.hp);
    h.hp.style.width = hpPct * 100 + '%';
    h.hp.style.background = p.down > 0 ? '#6b7280' : hpPct > 0.5 ? '#56d364' : hpPct > 0.25 ? '#e3b341' : '#f85149';
    h.st.style.width = Math.max(0, p.stamina / p.spec.stamina) * 100 + '%';
    h.st.style.background = p.boosting ? '#ffd54a' : '#56d364';
    h.speed.textContent = Math.round(p.speed * 3.6 * 1.6);
    h.speed.parentElement.style.color = p.offTrack ? '#e3b341' : '#fff';
  }
  const fin = players.find(p => p.finished);
  if (fin) showResult(placeOf(fin) === 1);
}

function showResult(win) {
  if (bannerLocked) return;
  bannerLocked = true;
  banner.textContent = win ? '🏆 VÍTĚZSTVÍ!' : 'CÍL!';
  banner.style.opacity = 1;
}

// ---------- health bary (jen 1 hráč) ----------
const barPos = new THREE.Vector3();
function updateBars() {
  for (const r of racers) {
    const ui = r.ui;
    barPos.set(r.pos.x, 3.6, r.pos.z).project(cams[0]);
    if (barPos.z > 1) { ui.box.style.display = 'none'; continue; }
    ui.box.style.display = 'block';
    ui.box.style.left = (barPos.x * 0.5 + 0.5) * innerWidth + 'px';
    ui.box.style.top = (-barPos.y * 0.5 + 0.5) * innerHeight + 'px';
    const pct = Math.max(0, r.hp / r.spec.hp);
    ui.fill.style.width = (pct * 100) + '%';
    ui.fill.style.background = r.down > 0 ? '#6b7280' : pct > 0.5 ? '#56d364' : pct > 0.25 ? '#e3b341' : '#f85149';
    const ko = r.down > 0;
    ui.box.classList.toggle('ko', ko);
    ui.tag.textContent = ko ? `K.O. ${r.down.toFixed(1)}s`
      : r.spec.name + (r.isPlayer ? ' (ty)' : '') + (r.aggressive ? ' 😡' : '');
  }
}

// ---------- 3-2-1 start ----------
function updateCountdown(dt) {
  countdown -= dt;
  if (countdown > 0) { banner.textContent = String(Math.ceil(countdown)); banner.style.opacity = 1; }
  else {
    racing = true; banner.textContent = 'START!'; banner.style.opacity = 1;
    setTimeout(() => { if (!bannerLocked) banner.style.opacity = 0; }, 700);
  }
}

// ---------- render ----------
function renderViews() {
  if (viewports.length === 1) {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.render(scene, cams[0]);
  } else {
    renderer.setScissorTest(true);
    for (const vp of viewports) {
      const x = vp.x * innerWidth, w = vp.w * innerWidth;
      const h = vp.h * innerHeight, y = (1 - vp.y - vp.h) * innerHeight;
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.render(scene, vp.cam);
    }
    renderer.setScissorTest(false);
  }
}

// ---------- smyčka ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (started) {
    if (!racing) updateCountdown(dt);
    else raceTime += dt;
    for (const r of racers) {
      if (racing) {
        if (r.down > 0) { /* sražený */ }
        else if (r.finished) { r.speed *= 0.9; }
        else if (r.isPlayer) controlPlayer(r, dt);
        else if (r.aggressive) steerAggressive(r, dt);
        else steerAI(r, dt);
        integrate(r, dt);
        if (!r.aggressive) updateProgress(r); // raptoři nezávodí, kola se nepočítají
      }
      animateDino(r, dt);
    }
    for (const vp of viewports) updateCamera(vp.cam, vp.cam === cams[0] ? players[0] : players[1], dt);
    if (players.length === 1) { updateHUD1(); updateBars(); } else updatePanels();
    renderViews();
  } else {
    menuCamera(now);
    for (const r of racers) animateDino(r, dt);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.render(scene, cams[0]);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
