// toon.js — komiksová stylizace: cel-shaded materiál + černé outline
import * as THREE from 'three';

// Stupňovitý gradient pro MeshToonMaterial → ploché "komiksové" pásy světla.
function makeGradientMap(steps = 3) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round((i / (steps - 1)) * 255);
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

const GRADIENT = makeGradientMap(3);

// Cel-shaded materiál v dané barvě.
export function toonMat(color) {
  return new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT });
}

// Vrátí grupu = původní mesh + černý "obrys" (nafouknutý klon s BackSide).
// Tím dostaneme komiksový inkoustový obrys bez post-processingu.
export function withOutline(mesh, thickness = 0.04) {
  const group = new THREE.Group();
  group.add(mesh);

  const outline = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: 0x10131c, side: THREE.BackSide })
  );
  // nafoukneme podél normál tím, že zvětšíme měřítko o tloušťku obrysu
  const s = 1 + thickness;
  outline.scale.set(s, s, s);
  outline.position.copy(mesh.position);
  outline.quaternion.copy(mesh.quaternion);
  group.add(outline);

  return group;
}

export { GRADIENT };
