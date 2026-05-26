import * as THREE from 'three';
import { CONFIG, InputState } from '../config';
import { KartState, createKartState, stepKart, resolveCollisions } from './Physics';
import { Track } from './Track';

/**
 * The ridiculous British racing machine: a low-poly shopping-trolley-meets-go-kart
 * with a tea crate strapped on the back and a little Union-ish flag. Owns its
 * mesh and the physics state, plus cosmetic flourishes (wheel spin, drift lean).
 *
 * Future: this is the natural unit to duplicate for AI/remote racers — give each
 * one its own InputState source and KartState.
 */
export class PlayerKart {
  readonly group = new THREE.Group();
  /** Flat ground shadow, kept on the road surface so jumps read clearly.
   *  Lives in the scene (not the kart group) so it stays put while the kart rises. */
  readonly shadow: THREE.Mesh;
  state: KartState;

  private frontWheels: THREE.Mesh[] = [];
  private rearWheels: THREE.Mesh[] = [];
  private body = new THREE.Group();
  private flame: THREE.Mesh;

  constructor(private track: Track) {
    const start = track.getStartPose();
    this.state = createKartState(start.position, start.heading);
    this.flame = this.buildMesh();

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;

    this.syncTransform(0);
  }

  private buildMesh(): THREE.Mesh {
    const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

    // Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 3.2), mat(0xd23b3b));
    chassis.position.y = 0.55;
    // Nose wedge
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.0), mat(0xe8a23b));
    nose.position.set(0, 0.5, 1.9);
    // Seat / driver box
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.0), mat(0x2c3e50));
    seat.position.set(0, 0.95, -0.3);
    // Driver (flat cap energy)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat(0xf1c27d));
    head.position.set(0, 1.55, -0.3);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.8), mat(0x394b59));
    cap.position.set(0, 1.9, -0.25);
    // Tea crate on the back (chaotic British cargo)
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), mat(0x8d6e3a));
    crate.position.set(0, 1.05, -1.4);
    // Flag pole + flag
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), mat(0x333333));
    pole.position.set(0, 1.9, -1.85);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ color: 0x2b3a8c, side: THREE.DoubleSide }));
    flag.position.set(0.5, 2.3, -1.85);

    this.body.add(chassis, nose, seat, head, cap, crate, pole, flag);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 10);
    const wheelMat = mat(0x1a1a1a);
    const makeWheel = (x: number, z: number): THREE.Mesh => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.5, z);
      this.body.add(w);
      return w;
    };
    this.frontWheels = [makeWheel(-1.05, 1.2), makeWheel(1.05, 1.2)];
    this.rearWheels = [makeWheel(-1.1, -1.2), makeWheel(1.1, -1.2)];

    // Boost flame (hidden unless boosting)
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.6, 8),
      new THREE.MeshBasicMaterial({ color: 0x4ec3ff }),
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(0, 0.6, -2.1);
    flame.visible = false;
    this.body.add(flame);

    this.group.add(this.body);
    return flame;
  }

  reset(): void {
    const start = this.track.getStartPose();
    this.state = createKartState(start.position, start.heading);
    this.syncTransform(0);
  }

  update(input: InputState, dt: number): void {
    stepKart(this.state, input, dt);
    resolveCollisions(this.state, this.track, dt);
    this.syncTransform(dt);
  }

  private syncTransform(dt: number): void {
    const s = this.state;
    this.group.position.copy(s.position);
    this.group.rotation.y = s.heading;

    // Drift lean: tilt the body into the slide for character.
    const slip = ((s.travelHeading - s.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const targetRoll = s.drifting ? THREE.MathUtils.clamp(-slip * 1.4, -0.35, 0.35) : 0;
    this.body.rotation.z += (targetRoll - this.body.rotation.z) * Math.min(1, 10 * dt);
    // Pitch: nose-up as it leaps, nose-down as it falls (reads as a proper jump);
    // a slight nose-up while boosting on the ground.
    const targetPitch = s.airborne
      ? THREE.MathUtils.clamp(-s.vy * 0.02, -0.4, 0.4)
      : s.boosting
        ? -0.06
        : 0;
    this.body.rotation.x += (targetPitch - this.body.rotation.x) * Math.min(1, 9 * dt);

    // Wheel spin (all four roll with forward speed).
    const spin = s.speed * dt * 1.8;
    for (const w of this.rearWheels) w.rotation.x += spin;
    for (const w of this.frontWheels) w.rotation.x += spin;

    this.flame.visible = s.boosting;
    if (s.boosting) {
      const f = 0.8 + Math.random() * 0.5;
      this.flame.scale.set(1, f, 1);
    }

    // Ground shadow stays pinned to the road surface; it shrinks and fades as the
    // kart climbs, so the gap between kart and shadow reads as jump height.
    const airGap = Math.max(0, s.position.y - (s.surfaceHeight + CONFIG.kart.groundOffset));
    this.shadow.position.set(s.position.x, s.surfaceHeight + 0.05, s.position.z);
    const shrink = THREE.MathUtils.clamp(1 - airGap * 0.07, 0.45, 1);
    this.shadow.scale.setScalar(shrink);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * shrink;
  }

  /** Convenience accessors for camera / UI / lap logic. */
  get position(): THREE.Vector3 {
    return this.state.position;
  }
  get heading(): number {
    return this.state.heading;
  }
  get speedRatio(): number {
    return THREE.MathUtils.clamp(Math.abs(this.state.speed) / CONFIG.kart.maxSpeed, 0, 1.5);
  }
}
