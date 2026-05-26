import * as THREE from 'three';

/**
 * Procedural canvas textures so the prototype needs zero asset files. Everything
 * uses NearestFilter and no mipmaps for that crunchy, low-res PS1 feel.
 */

function makeCanvas(size = 64): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement, repeat = 1): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 1;
  return tex;
}

/** Grimy London asphalt with painted lane dashes down the middle. */
export function makeRoadTexture(): THREE.Texture {
  const { canvas, ctx } = makeCanvas(64);
  ctx.fillStyle = '#3b3f45';
  ctx.fillRect(0, 0, 64, 64);
  // speckle
  for (let i = 0; i < 220; i++) {
    const v = 40 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgb(${v},${v},${v + 4})`;
    ctx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 1, 1);
  }
  // centre dashes (texture tiles along the road length on V)
  ctx.fillStyle = '#d9d27a';
  ctx.fillRect(30, 6, 4, 22);
  ctx.fillRect(30, 38, 4, 22);
  return finish(canvas);
}

/** Red/white kerb-style hazard stripe for barriers. */
export function makeBarrierTexture(): THREE.Texture {
  const { canvas, ctx } = makeCanvas(32);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#d23b3b' : '#f1efe8';
    ctx.fillRect(i * 8, 0, 8, 32);
  }
  return finish(canvas);
}

/** Generic building front with lit/unlit windows. Colour is tinted per-mesh. */
export function makeBuildingTexture(seed = 0): THREE.Texture {
  const { canvas, ctx } = makeCanvas(64);
  ctx.fillStyle = '#cfc7ba';
  ctx.fillRect(0, 0, 64, 64);
  const rng = mulberry32(0x9e21 + seed * 2654435761);
  for (let y = 6; y < 60; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      ctx.fillStyle = rng() > 0.4 ? '#3a4a63' : '#e7d98a';
      ctx.fillRect(x, y, 7, 8);
    }
  }
  return finish(canvas);
}

/** Overcast British sky gradient for the background. */
export function makeSkyTexture(): THREE.Texture {
  const { canvas, ctx } = makeCanvas(128);
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#c9d2da');
  grad.addColorStop(0.55, '#aab3bd');
  grad.addColorStop(1, '#8d959f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small deterministic PRNG so scenery is varied but stable across reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
