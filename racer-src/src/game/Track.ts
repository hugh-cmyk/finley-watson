import * as THREE from 'three';
import { CONFIG } from '../config';
import {
  makeBarrierTexture,
  makeBuildingTexture,
  makeRoadTexture,
  mulberry32,
} from './textures';

/** Result of projecting a world position onto the track centreline. */
export interface TrackSample {
  t: number; // 0..1 around the loop
  height: number; // road surface y at that point
  lateralOffset: number; // signed metres from centreline (+left / -right of travel)
  normal: THREE.Vector2; // unit XZ normal pointing "left" of travel direction
  forward: THREE.Vector2; // unit XZ travel direction
  point: THREE.Vector3;
}

/** A simple round obstacle the kart can thump into (buses, cones, bins...). */
export interface Obstacle {
  position: THREE.Vector3;
  radius: number;
  height: number; // clear this much vertical height (by jumping) to pass over it
  // Future: health/destructible flag, gadget triggers, AI traffic movement.
}

/**
 * The whole circuit. A closed Catmull-Rom curve defines the centreline (with
 * elevation for the rooftop stretch); everything else — road ribbon, barriers,
 * scenery, obstacles, checkpoints — is generated from it.
 */
export class Track {
  readonly group = new THREE.Group();
  readonly halfWidth = CONFIG.track.halfWidth;
  readonly obstacles: Obstacle[] = [];
  readonly checkpointCount = 8; // sectors used for lap validation
  readonly startT = 0.012; // kart starts just past the finish line

  private readonly curve: THREE.CatmullRomCurve3;
  private readonly samplePoints: THREE.Vector3[] = [];
  private readonly sampleForward: THREE.Vector2[] = [];

  constructor() {
    // Centreline control points (x, y, z). y rises for the rooftop section and
    // ramps back down — that gives the elevated bit, a couple of ramps and a drop.
    const pts = [
      [0, 0, 95],
      [72, 0, 74],
      [99, 0, 4],
      [84, 9, -58],
      [42, 14, -96],
      [-28, 14, -101],
      [-86, 6, -70],
      [-101, 0, -8],
      [-80, 0, 62],
      [-30, 0, 97],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));

    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.curve.arcLengthDivisions = 2000;

    this.buildSamples();
    this.buildRoad();
    this.buildBarriers();
    this.buildScenery();
    this.buildObstacles();
    this.buildFinishLine();
    this.buildGroundAndSky();
  }

  /** Where the kart should spawn, and which way it should face. */
  getStartPose(): { position: THREE.Vector3; heading: number } {
    const p = this.curve.getPointAt(this.startT);
    const tan = this.curve.getTangentAt(this.startT);
    const heading = Math.atan2(tan.x, tan.z);
    return {
      position: new THREE.Vector3(p.x, p.y + CONFIG.kart.groundOffset, p.z),
      heading,
    };
  }

  // --- sampling -----------------------------------------------------------

  private buildSamples(): void {
    const n = CONFIG.track.samples;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      this.samplePoints.push(p);
      this.sampleForward.push(new THREE.Vector2(tan.x, tan.z).normalize());
    }
  }

  /**
   * Project a world position onto the nearest centreline sample. Used every
   * frame for collision, surface height and lap progress. A linear scan over a
   * few hundred points is plenty fast and avoids any curve maths per frame.
   */
  project(pos: THREE.Vector3): TrackSample {
    const n = this.samplePoints.length;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const sp = this.samplePoints[i];
      const dx = pos.x - sp.x;
      const dz = pos.z - sp.z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }

    const sp = this.samplePoints[best];
    const fwd = this.sampleForward[best];
    // Left-hand normal in XZ.
    const normal = new THREE.Vector2(-fwd.y, fwd.x);
    const lateralOffset = (pos.x - sp.x) * normal.x + (pos.z - sp.z) * normal.y;

    return {
      t: best / n,
      height: sp.y,
      lateralOffset,
      normal,
      forward: fwd,
      point: sp,
    };
  }

  // --- geometry -----------------------------------------------------------

  private edges(t: number): { left: THREE.Vector3; right: THREE.Vector3 } {
    const p = this.curve.getPointAt(t);
    const tan = this.curve.getTangentAt(t);
    const nx = -tan.z;
    const nz = tan.x;
    const len = Math.hypot(nx, nz) || 1;
    const hw = this.halfWidth;
    return {
      left: new THREE.Vector3(p.x + (nx / len) * hw, p.y, p.z + (nz / len) * hw),
      right: new THREE.Vector3(p.x - (nx / len) * hw, p.y, p.z - (nz / len) * hw),
    };
  }

  private buildRoad(): void {
    const segs = CONFIG.track.samples;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segs; i++) {
      const t = (i % segs) / segs;
      const { left, right } = this.edges(t);
      positions.push(left.x, left.y + 0.02, left.z);
      positions.push(right.x, right.y + 0.02, right.z);
      const v = (i / segs) * CONFIG.track.roadTextureRepeat;
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ map: makeRoadTexture() });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'road';
    this.group.add(mesh);
  }

  private buildBarriers(): void {
    const segs = CONFIG.track.samples;
    const height = 1.3;
    const tex = makeBarrierTexture();

    for (const side of [1, -1] as const) {
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = (i % segs) / segs;
        const e = this.edges(t);
        const edge = side === 1 ? e.left : e.right;
        positions.push(edge.x, edge.y, edge.z);
        positions.push(edge.x, edge.y + height, edge.z);
        const u = (i / segs) * CONFIG.track.roadTextureRepeat * 0.5;
        uvs.push(u, 0, u, 1);
      }
      for (let i = 0; i < segs; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({
        map: tex.clone(),
        side: THREE.DoubleSide,
      });
      (mat.map as THREE.Texture).needsUpdate = true;
      this.group.add(new THREE.Mesh(geo, mat));
    }
  }

  /** Buildings lining the streets + a couple of parody London landmarks. */
  private buildScenery(): void {
    const rng = mulberry32(1337);
    const palette = [0x9a4b3f, 0xb98a5e, 0xd8d2c4, 0x6f7c8a, 0xa83f3f];
    const segs = CONFIG.track.samples;

    for (let i = 0; i < segs; i += 11) {
      const t = i / segs;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const nx = -tan.z;
      const nz = tan.x;
      const nlen = Math.hypot(nx, nz) || 1;

      for (const side of [1, -1]) {
        if (rng() > 0.72) continue;
        const dist = this.halfWidth + 7 + rng() * 9;
        const bx = p.x + (nx / nlen) * dist * side;
        const bz = p.z + (nz / nlen) * dist * side;
        const w = 6 + rng() * 6;
        const d = 6 + rng() * 6;

        // Under the elevated rooftop stretch, grow a tall block up to the road
        // so the track reads as if it's running across the rooftops.
        const supportTop = p.y > 3 ? p.y - 0.6 : 0;
        const h = supportTop > 0 ? supportTop + 4 + rng() * 14 : 8 + rng() * 26;

        const tex = makeBuildingTexture(i + (side > 0 ? 0 : 99));
        tex.repeat.set(Math.round(w / 4), Math.round(h / 4));
        const mat = new THREE.MeshLambertMaterial({
          map: tex,
          color: palette[Math.floor(rng() * palette.length)],
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(bx, h / 2, bz);
        mesh.rotation.y = Math.atan2(tan.x, tan.z);
        this.group.add(mesh);
      }
    }

    this.addLandmarks();
  }

  private addLandmarks(): void {
    // Parody clock tower ("Big Den") near the start straight.
    const tower = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(7, 46, 7),
      new THREE.MeshLambertMaterial({ color: 0xb8a06a }),
    );
    body.position.y = 23;
    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 12),
      new THREE.MeshLambertMaterial({ color: 0xf3efe0 }),
    );
    clock.position.set(0, 38, 3.55);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(5.5, 9, 4),
      new THREE.MeshLambertMaterial({ color: 0x4f5b3c }),
    );
    roof.position.y = 50;
    roof.rotation.y = Math.PI / 4;
    tower.add(body, clock, roof);
    tower.position.set(40, 0, 120);
    this.group.add(tower);

    // Parody big wheel ("The London Pie") on the far side.
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(18, 1.1, 6, 20),
      new THREE.MeshLambertMaterial({ color: 0xdadfe6 }),
    );
    wheel.position.set(-120, 18, 40);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 36, 0.5),
        new THREE.MeshLambertMaterial({ color: 0xc4cad2 }),
      );
      spoke.rotation.z = (i / 8) * Math.PI * 2;
      wheel.add(spoke);
    }
    this.group.add(wheel);
  }

  /** Traffic-style obstacles: parody buses and cones placed on the track. */
  private buildObstacles(): void {
    const busPlacements: Array<[number, number]> = [
      [0.18, 3.5],
      [0.46, -3.8],
      [0.7, 2.5],
    ];
    for (const [t, lateral] of busPlacements) {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const nx = -tan.z;
      const nz = tan.x;
      const nlen = Math.hypot(nx, nz) || 1;
      const x = p.x + (nx / nlen) * lateral;
      const z = p.z + (nz / nlen) * lateral;

      const bus = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 4, 7),
        new THREE.MeshLambertMaterial({ color: 0xc0392b }),
      );
      bus.position.set(x, p.y + 2, z);
      bus.rotation.y = Math.atan2(tan.x, tan.z);
      // Cheeky upper deck so it reads as a double-decker.
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 0.4, 6.6),
        new THREE.MeshLambertMaterial({ color: 0x922b21 }),
      );
      top.position.y = 2.1;
      bus.add(top);
      this.group.add(bus);

      // Future: mark as destructible / movable AI traffic here.
      // Tall: only a well-timed jump clears a bus.
      this.obstacles.push({
        position: new THREE.Vector3(x, p.y, z),
        radius: 3.4,
        height: 4.2,
      });
    }

    // A scatter of traffic cones to nudge around.
    const conePlacements: Array<[number, number]> = [
      [0.31, 1.5],
      [0.33, -1.0],
      [0.58, 0],
      [0.86, 2.0],
      [0.88, -2.2],
    ];
    for (const [t, lateral] of conePlacements) {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const nx = -tan.z;
      const nz = tan.x;
      const nlen = Math.hypot(nx, nz) || 1;
      const x = p.x + (nx / nlen) * lateral;
      const z = p.z + (nz / nlen) * lateral;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 1.6, 8),
        new THREE.MeshLambertMaterial({ color: 0xe8772e }),
      );
      cone.position.set(x, p.y + 0.8, z);
      this.group.add(cone);
      // Short: any decent hop sends you sailing over a cone.
      this.obstacles.push({ position: new THREE.Vector3(x, p.y, z), radius: 1.1, height: 1.6 });
    }
  }

  private buildFinishLine(): void {
    const { left, right } = this.edges(0);
    const mid = left.clone().add(right).multiplyScalar(0.5);
    const width = left.distanceTo(right);
    const tan = this.curve.getTangentAt(0);

    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 8;
    const ctx = c.getContext('2d')!;
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 8; y++) {
        ctx.fillStyle = (Math.floor(x / 8) + y) % 2 === 0 ? '#111' : '#eee';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 3),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.rotation.z = Math.atan2(tan.z, tan.x);
    stripe.position.set(mid.x, mid.y + 0.05, mid.z);
    this.group.add(stripe);
  }

  private buildGroundAndSky(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshLambertMaterial({ color: 0x5d6b54 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.4;
    this.group.add(ground);
  }
}
