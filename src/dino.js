// dino.js — stavba dinosaurů z primitiv + definice druhů a jejich útoků
import * as THREE from 'three';
import { toonMat } from './toon.js';

// Jeden "díl" těla = mesh s komiksovým obrysem (obrys je child, takže drží transform).
function part(geometry, color, thickness = 0.06) {
  const mesh = new THREE.Mesh(geometry, toonMat(color));
  const outline = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x10131c, side: THREE.BackSide })
  );
  const s = 1 + thickness;
  outline.scale.set(s, s, s);
  mesh.add(outline);
  return mesh;
}

// Definice druhů: barva + typ útoku + dosah/úhel.
// reach = jak daleko útok zasáhne, arc = poloviční úhel kužele zásahu (rad).
export const SPECIES = {
  trex: {
    name: 'T-Rex',        color: 0x6fae5a, attack: 'Kousnutí',
    attackPart: 'head',   reach: 4.2, arc: 0.5,  topSpeed: 33, accel: 22,
  },
  raptor: {
    name: 'Raptor',       color: 0xd9a441, attack: 'Sek drápem',
    attackPart: 'arm',    reach: 3.4, arc: 0.7,  topSpeed: 38, accel: 27,
  },
  ankylo: {
    name: 'Ankylosaurus', color: 0x5a83ae, attack: 'Úder ocasem',
    attackPart: 'tail',   reach: 4.6, arc: 0.9,  topSpeed: 28, accel: 18,
  },
  trike: {
    name: 'Triceratops',  color: 0xb56ab0, attack: 'Náraz rohem',
    attackPart: 'head',   reach: 3.8, arc: 0.45, topSpeed: 31, accel: 24,
  },
};

export const SPECIES_KEYS = Object.keys(SPECIES);

// Postaví dinosaura daného druhu. Vrací { root, parts } pro animaci útoku.
export function buildDino(speciesKey) {
  const spec = SPECIES[speciesKey];
  const c = spec.color;
  const root = new THREE.Group();
  const body = new THREE.Group(); // vše kromě stínu, kýve se při běhu
  root.add(body);

  // trup
  const torso = part(new THREE.BoxGeometry(1.3, 1.1, 2.2), c);
  torso.position.y = 1.2;
  body.add(torso);

  // krk + hlava (pivot na krku kvůli kousnutí)
  const neck = new THREE.Group();
  neck.position.set(0, 1.7, 1.0);
  body.add(neck);
  const head = part(new THREE.BoxGeometry(0.9, 0.85, 1.1), c);
  head.position.z = 0.7;
  neck.add(head);
  // čelist
  const jaw = part(new THREE.BoxGeometry(0.8, 0.3, 0.9), 0xefe2c0);
  jaw.position.set(0, -0.35, 0.85);
  neck.add(jaw);
  // oči (komiksové bílé + černé)
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(sx * 0.28, 0.22, 1.15);
    neck.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x101013 }));
    pupil.position.set(sx * 0.28, 0.22, 1.26);
    neck.add(pupil);
  }
  // roh pro Triceratops
  if (speciesKey === 'trike') {
    const horn = part(new THREE.ConeGeometry(0.18, 1.0, 8), 0xefe2c0);
    horn.position.set(0, 0.4, 1.4);
    horn.rotation.x = Math.PI / 2.2;
    neck.add(horn);
  }

  // ocas (pivot u trupu, kýve se / mlátí)
  const tail = new THREE.Group();
  tail.position.set(0, 1.3, -1.1);
  body.add(tail);
  const tailGeo = part(new THREE.BoxGeometry(0.5, 0.5, 1.8), c);
  tailGeo.position.z = -0.9;
  tail.add(tailGeo);
  if (speciesKey === 'ankylo') { // kyj na konci ocasu
    const club = part(new THREE.SphereGeometry(0.55, 10, 10), 0x9aa7b5);
    club.position.z = -1.9;
    tail.add(club);
  }

  // přední pacičky / drápy (pivot na rameni)
  const arm = new THREE.Group();
  arm.position.set(0.55, 1.5, 0.9);
  body.add(arm);
  const armGeo = part(new THREE.BoxGeometry(0.25, 0.7, 0.25), c);
  armGeo.position.y = -0.35;
  arm.add(armGeo);
  const claw = part(new THREE.ConeGeometry(0.12, 0.5, 6), 0xefe2c0);
  claw.position.set(0, -0.75, 0.2);
  claw.rotation.x = Math.PI / 2;
  arm.add(claw);

  // nohy (animované při běhu)
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = part(new THREE.BoxGeometry(0.4, 1.2, 0.5), c);
    leg.position.set(sx * 0.45, 0.6, -0.2);
    body.add(leg);
    legs.push(leg);
  }

  // měkký stín pod dinem
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 24),
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
