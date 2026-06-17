// dino.js — stavba dinosaurů z primitiv + definice druhů a jejich útoků
import * as THREE from 'three';
import { toonMat, GRADIENT } from './toon.js';

const OUTLINE = 0.11; // širší komiksový obrys

// --- procedurální "kůže": canvas textura (skvrny / pruhy) v barvě druhu ---
function makeSkin(baseCss, darkCss, mode) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = baseCss; g.fillRect(0, 0, 128, 128);
  g.fillStyle = darkCss;
  if (mode === 'stripes') {
    for (let i = -3; i < 9; i++) {
      g.save(); g.translate(i * 20, 0); g.rotate(0.45);
      g.fillRect(0, -30, 9, 220); g.restore();
    }
  } else { // skvrny
    for (let i = 0; i < 48; i++) {
      const r = 4 + Math.random() * 8;
      g.beginPath();
      g.ellipse(Math.random() * 128, Math.random() * 128, r, r * 0.7, 0, 0, 7);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Jeden "díl" těla = mesh s komiksovým obrysem. `mat` je barva (číslo) nebo materiál.
function part(geometry, mat, thickness = OUTLINE) {
  const material = mat && mat.isMaterial ? mat : toonMat(mat);
  const mesh = new THREE.Mesh(geometry, material);
  const outline = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x10131c, side: THREE.BackSide })
  );
  outline.scale.setScalar(1 + thickness);
  mesh.add(outline);
  return mesh;
}

// Definice druhů: barva + typ útoku + dosah/úhel + vzor kůže.
// Staty: topSpeed, accel (zrychlení), turn (zatáčení), hp (výdrž), dmg (síla útoku),
// reach/arc (dosah a úhel zásahu). Každý druh hraje trochu jinak.
export const SPECIES = {
  trex: {
    name: 'T-Rex',        color: 0x6fae5a, attack: 'Kousnutí',  skin: 'stripes',
    attackPart: 'head',   reach: 4.2, arc: 0.5,
    topSpeed: 33, accel: 22, turn: 2.2, hp: 120, dmg: 26,
  },
  raptor: {
    name: 'Raptor',       color: 0xd9a441, attack: 'Sek drápem', skin: 'stripes',
    attackPart: 'arm',    reach: 3.4, arc: 0.7,
    topSpeed: 40, accel: 30, turn: 3.0, hp: 70,  dmg: 16,
  },
  ankylo: {
    name: 'Ankylosaurus', color: 0x5a83ae, attack: 'Úder ocasem', skin: 'spots',
    attackPart: 'tail',   reach: 4.6, arc: 0.9,
    topSpeed: 27, accel: 17, turn: 1.8, hp: 150, dmg: 24,
  },
  trike: {
    name: 'Triceratops',  color: 0xb56ab0, attack: 'Náraz rohem', skin: 'spots',
    attackPart: 'head',   reach: 3.8, arc: 0.45,
    topSpeed: 32, accel: 24, turn: 2.0, hp: 120, dmg: 24,
  },
  stego: {
    name: 'Stegosaurus',  color: 0x9c7b4a, attack: 'Ostny ocasu', skin: 'spots',
    attackPart: 'tail',   reach: 5.0, arc: 1.0,
    topSpeed: 28, accel: 18, turn: 1.9, hp: 135, dmg: 22,
  },
  pachy: {
    name: 'Pachycefalosaurus', color: 0xc9925a, attack: 'Náraz hlavou', skin: 'stripes',
    attackPart: 'head',   reach: 3.6, arc: 0.5,
    topSpeed: 36, accel: 26, turn: 2.6, hp: 95,  dmg: 20,
  },
};

export const SPECIES_KEYS = Object.keys(SPECIES);

const BONE = 0xefe2c0; // barva zubů / rohů / drápů

// Postaví dinosaura daného druhu. Vrací { root, parts } pro animaci útoku.
export function buildDino(speciesKey) {
  const spec = SPECIES[speciesKey];
  const base = new THREE.Color(spec.color);
  const dark = base.clone().multiplyScalar(0.55);
  const belly = base.clone().lerp(new THREE.Color(0xffffff), 0.45);
  const darkHex = dark.getHex();

  // materiál kůže s texturou (skvrny/pruhy)
  const skinTex = makeSkin('#' + base.getHexString(), '#' + dark.getHexString(), spec.skin);
  const skinMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: skinTex, gradientMap: GRADIENT });

  const root = new THREE.Group();
  const body = new THREE.Group(); // vše kromě stínu, kýve se při běhu
  root.add(body);

  // trup + světlé břicho
  const torso = part(new THREE.BoxGeometry(1.3, 1.1, 2.2), skinMat);
  torso.position.y = 1.2;
  body.add(torso);
  const bellyMesh = part(new THREE.BoxGeometry(1.0, 0.5, 1.9), belly.getHex());
  bellyMesh.position.set(0, 0.85, 0.05);
  body.add(bellyMesh);

  // hřbet: Stegosaurus má velké desky, ostatní řadu menších ostnů
  if (speciesKey === 'stego') {
    for (let i = 0; i < 6; i++) {
      const plate = part(new THREE.ConeGeometry(0.55, 0.9, 3), darkHex);
      plate.scale.x = 0.22;                 // zploštění → deska
      plate.position.set(0, 2.0, 0.95 - i * 0.42);
      body.add(plate);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const sp = part(new THREE.ConeGeometry(0.13, 0.42, 6), darkHex);
      sp.position.set(0, 1.85, 0.75 - i * 0.42);
      body.add(sp);
    }
  }

  // krk + hlava (pivot na krku kvůli kousnutí)
  const neck = new THREE.Group();
  neck.position.set(0, 1.7, 1.0);
  body.add(neck);
  const head = part(new THREE.BoxGeometry(0.9, 0.85, 1.1), skinMat);
  head.position.z = 0.7;
  neck.add(head);
  // čenich (zúžení vpředu)
  const snout = part(new THREE.BoxGeometry(0.6, 0.5, 0.5), skinMat);
  snout.position.set(0, -0.05, 1.3);
  neck.add(snout);
  // čelist
  const jaw = part(new THREE.BoxGeometry(0.7, 0.28, 0.85), belly.getHex());
  jaw.position.set(0, -0.38, 0.95);
  neck.add(jaw);
  // oči (komiksové bílé + černá panenka)
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(sx * 0.3, 0.26, 1.15);
    neck.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x101013 }));
    pupil.position.set(sx * 0.3, 0.26, 1.28);
    neck.add(pupil);
  }
  // zuby pro masožravce
  if (speciesKey === 'trex' || speciesKey === 'raptor') {
    for (const sx of [-0.22, 0, 0.22]) {
      const tooth = part(new THREE.ConeGeometry(0.06, 0.2, 5), BONE, 0.06);
      tooth.position.set(sx, -0.18, 1.45);
      tooth.rotation.x = Math.PI;
      neck.add(tooth);
    }
  }
  // hřeben pro raptora
  if (speciesKey === 'raptor') {
    const crest = part(new THREE.BoxGeometry(0.1, 0.35, 0.8), darkHex);
    crest.position.set(0, 0.55, 0.6);
    neck.add(crest);
  }
  // kostěná kopule lebky + hrbolky pro Pachycefalosaura
  if (speciesKey === 'pachy') {
    const dome = part(new THREE.SphereGeometry(0.6, 14, 12), skinMat);
    dome.scale.set(1, 0.8, 1);
    dome.position.set(0, 0.5, 0.45);
    neck.add(dome);
    for (let a = 0; a < 7; a++) {
      const ang = a / 6 * Math.PI - Math.PI / 2;
      const nub = part(new THREE.ConeGeometry(0.08, 0.2, 5), BONE, 0.07);
      nub.position.set(Math.sin(ang) * 0.55, 0.32, 0.45 + Math.cos(ang) * 0.35);
      nub.rotation.x = -Math.PI / 3;
      neck.add(nub);
    }
  }
  // límec (frill) + nadočnicové rohy pro Triceratopse
  if (speciesKey === 'trike') {
    const frill = part(new THREE.CylinderGeometry(1.05, 1.05, 0.2, 16, 1, false, 0, Math.PI),
      belly.getHex());
    frill.rotation.x = Math.PI / 2;
    frill.rotation.z = Math.PI;
    frill.position.set(0, 0.35, 0.1);
    neck.add(frill);
    for (const sx of [-0.32, 0.32]) {
      const horn = part(new THREE.ConeGeometry(0.13, 0.8, 7), BONE);
      horn.position.set(sx, 0.45, 1.05);
      horn.rotation.x = Math.PI / 2.3;
      neck.add(horn);
    }
  }
  // střední roh na čenichu pro Triceratopse
  if (speciesKey === 'trike') {
    const horn = part(new THREE.ConeGeometry(0.18, 0.9, 8), BONE);
    horn.position.set(0, 0.1, 1.6);
    horn.rotation.x = Math.PI / 2.1;
    neck.add(horn);
  }

  // ocas (pivot u trupu, kýve se / mlátí) + ostny
  const tail = new THREE.Group();
  tail.position.set(0, 1.3, -1.1);
  body.add(tail);
  const tailGeo = part(new THREE.BoxGeometry(0.5, 0.5, 1.8), skinMat);
  tailGeo.position.z = -0.9;
  tail.add(tailGeo);
  for (let i = 0; i < 3; i++) {
    const sp = part(new THREE.ConeGeometry(0.1, 0.3, 6), darkHex);
    sp.position.set(0, 0.3, -0.3 - i * 0.5);
    tail.add(sp);
  }
  if (speciesKey === 'stego') { // thagomizer – čtyři ostny na konci ocasu
    for (const sx of [-0.4, 0.4]) for (const yy of [0.0, 0.45]) {
      const sp = part(new THREE.ConeGeometry(0.11, 0.7, 6), BONE, 0.07);
      sp.position.set(sx, 0.2 + yy, -1.95);
      sp.rotation.x = -Math.PI / 2 - 0.3;
      sp.rotation.z = sx > 0 ? 0.35 : -0.35;
      tail.add(sp);
    }
  }
  if (speciesKey === 'ankylo') { // velký kostěný kyj
    const club = part(new THREE.SphereGeometry(0.6, 12, 10), 0x9aa7b5);
    club.position.z = -2.0;
    tail.add(club);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const spike = part(new THREE.ConeGeometry(0.14, 0.4, 6), 0xc9d3df, 0.08);
      spike.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, -2.0);
      spike.rotation.z = -a + Math.PI / 2;
      tail.add(spike);
    }
  }
  // pancéřové hrboly na hřbetě pro Ankylosaura
  if (speciesKey === 'ankylo') {
    for (let i = 0; i < 4; i++) {
      const bump = part(new THREE.SphereGeometry(0.26, 8, 8), 0x9aa7b5, 0.07);
      bump.scale.y = 0.55;
      bump.position.set(i % 2 ? 0.35 : -0.35, 1.75, 0.5 - i * 0.45);
      body.add(bump);
    }
  }

  // přední pacičky / drápy (pivot na rameni)
  const arm = new THREE.Group();
  arm.position.set(0.55, 1.5, 0.9);
  body.add(arm);
  const armGeo = part(new THREE.BoxGeometry(0.25, 0.7, 0.25), skinMat);
  armGeo.position.y = -0.35;
  arm.add(armGeo);
  for (const sx of [-0.08, 0.08]) {
    const claw = part(new THREE.ConeGeometry(0.08, 0.4, 6), BONE, 0.07);
    claw.position.set(sx, -0.75, 0.18);
    claw.rotation.x = Math.PI / 2;
    arm.add(claw);
  }

  // nohy (animované při běhu) + prsty s drápy
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = part(new THREE.BoxGeometry(0.42, 1.2, 0.5), skinMat);
    leg.position.set(sx * 0.45, 0.6, -0.2);
    for (const tx of [-0.12, 0.12]) {
      const toe = part(new THREE.ConeGeometry(0.07, 0.28, 5), BONE, 0.07);
      toe.position.set(tx, -0.6, 0.28);
      toe.rotation.x = Math.PI / 2;
      leg.add(toe);
    }
    // srpovitý dráp raptora
    if (speciesKey === 'raptor') {
      const sickle = part(new THREE.ConeGeometry(0.1, 0.5, 6), BONE, 0.07);
      sickle.position.set(0, -0.55, 0.4);
      sickle.rotation.x = Math.PI / 1.4;
      leg.add(sickle);
    }
    body.add(leg);
    legs.push(leg);
  }

  // měkký stín pod dinem
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  return {
    root, body,
    parts: { neck, head, jaw, tail, arm, legs },
    spec, speciesKey,
  };
}
