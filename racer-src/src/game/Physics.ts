import * as THREE from 'three';
import { CONFIG, InputState } from '../config';
import { Track } from './Track';

// ─── Arcade gameplay tuning ──────────────────────────────────────────────────
// These shape how the kart *feels*. Kept at the top of the physics file so
// they're quick to find and tweak after play-testing. Fun and flow over realism.

const JUMP_FORCE = 22; // upward velocity of the first (grounded) jump — apex ~8m, lifts the whole kart well clear
const DOUBLE_JUMP_FORCE = 19; // upward velocity of the mid-air second leap
const GRAVITY = 30; // downward acceleration while airborne (lower = floatier hang time)
const MAX_JUMPS = 2; // hops allowed before touching the track again
const AIR_STEER_SCALE = 0.6; // steering authority kept while airborne (0..1)

const COLLISION_SPEED_RETAINED = 0.82; // speed kept on a fully head-on impact (0..1)
const COLLISION_BOUNCE_FORCE = 7; // outward shove off a surface on impact
const WALL_SLIDE_FACTOR = 0.85; // how strongly travel is redirected ALONG a wall
const OBSTACLE_DEFLECT = 0.4; // how much an obstacle hit nudges you aside (0..1)

/**
 * Arcade kart physics. Deliberately not realistic: we track a *facing* heading
 * and a separate *travel* heading, then let "grip" pull travel toward facing.
 * Drifting lowers grip so the back end slides wide — easy to read, fun to chuck
 * around, and the basis of the mini-turbo boost reward.
 */
export interface KartState {
  position: THREE.Vector3;
  heading: number; // facing direction (radians, 0 => +Z)
  travelHeading: number; // direction the kart is actually moving
  speed: number; // signed forward speed
  boostMeter: number; // 0..boostMax
  boosting: boolean;
  drifting: boolean;
  driftCharge: number;
  driftDir: number; // -1/0/1 steer direction locked in at drift start
  lastMiniTurbo: boolean; // true on the frame a mini-turbo fires (for FX/SFX)
  airborne: boolean;
  vy: number; // vertical velocity (jumping / falling)
  jumpsRemaining: number; // hops left before landing (see MAX_JUMPS)
  jumpHeld: boolean; // previous-frame jump state, for rising-edge detection
  surfaceHeight: number; // road height directly beneath the kart (for the shadow)
}

export function createKartState(position: THREE.Vector3, heading: number): KartState {
  return {
    position: position.clone(),
    heading,
    travelHeading: heading,
    speed: 0,
    boostMeter: CONFIG.kart.boostMax,
    boosting: false,
    drifting: false,
    driftCharge: 0,
    driftDir: 0,
    lastMiniTurbo: false,
    airborne: false,
    vy: 0,
    jumpsRemaining: MAX_JUMPS,
    jumpHeld: false,
    surfaceHeight: position.y - CONFIG.kart.groundOffset,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const approach = (v: number, target: number, maxDelta: number) => {
  if (v < target) return Math.min(v + maxDelta, target);
  if (v > target) return Math.max(v - maxDelta, target);
  return v;
};

/** Shortest signed angle difference a->b in (-PI, PI]. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Advance the kart one step: longitudinal, steering, drift, boost, jump, integrate. */
export function stepKart(k: KartState, input: InputState, dt: number): void {
  const C = CONFIG.kart;
  k.lastMiniTurbo = false;

  // --- boost meter / boosting state ---
  const wantsBoost = input.boost && k.boostMeter > C.boostMinToFire && k.speed > 5;
  k.boosting = wantsBoost;
  if (k.boosting) {
    k.boostMeter = Math.max(0, k.boostMeter - C.boostDrainPerSec * dt);
  } else {
    k.boostMeter = Math.min(C.boostMax, k.boostMeter + C.boostRefillPerSec * dt);
  }
  const topSpeed = k.boosting ? C.boostSpeed : C.maxSpeed;

  // --- longitudinal ---
  if (input.accelerate) {
    k.speed += C.accel * dt;
  } else if (input.brake) {
    if (k.speed > 0.5) k.speed -= C.brakeDecel * dt; // braking
    else k.speed -= C.accel * 0.7 * dt; // into reverse
  } else {
    k.speed = approach(k.speed, 0, C.coastDecel * dt);
  }
  // Boost gives an extra shove so you actually reach the higher cap quickly.
  if (k.boosting && k.speed < C.boostSpeed) k.speed += C.accel * 0.8 * dt;
  k.speed = clamp(k.speed, -C.reverseSpeed, topSpeed);

  // --- steering ---
  // Keyboard/touch take priority; the analog mouse axis (+1 left .. -1 right) is
  // only used when no steering key is held, so a resting cursor never fights you.
  const keySteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steer = clamp(keySteer !== 0 ? keySteer : input.steerAxis, -1, 1);
  const moving = Math.abs(k.speed) > 0.5;

  // Drift engages while held, you're moving with intent, and turning.
  const canDrift = input.drift && Math.abs(k.speed) > 10;
  if (canDrift && !k.drifting) {
    k.drifting = true;
    k.driftDir = Math.abs(steer) > 0.15 ? Math.sign(steer) : k.driftDir;
    k.driftCharge = 0;
  } else if (!input.drift && k.drifting) {
    // Release: reward a banked mini-turbo if we held a long enough slide.
    if (k.driftCharge >= C.miniTurboThreshold) {
      k.boostMeter = Math.min(C.boostMax, k.boostMeter + C.miniTurboCharge);
      k.lastMiniTurbo = true;
    }
    k.drifting = false;
    k.driftCharge = 0;
    k.driftDir = 0;
  }

  let turn = C.turnRate * steer;
  if (k.drifting) {
    turn *= C.driftTurnBonus;
    if (Math.abs(steer) > 0.15) k.driftCharge += C.miniTurboChargeRate * dt;
  }
  // Hard to turn at a standstill; reversing inverts the steering; less bite midair.
  turn *= clamp(Math.abs(k.speed) / 8, 0, 1);
  if (k.airborne) turn *= AIR_STEER_SCALE;
  if (moving) k.heading += turn * dt * Math.sign(k.speed);

  // --- grip: pull travel direction toward facing ---
  const gripRate = k.drifting ? C.driftGrip : C.grip;
  const blend = 1 - Math.exp(-gripRate * dt);
  k.travelHeading += angleDelta(k.travelHeading, k.heading) * blend;

  // --- jump / double-jump (rising-edge triggered) ---
  // One press = one hop. A press while airborne spends the second hop as a fresh
  // leap. After MAX_JUMPS, further presses are ignored until we land (see
  // resolveCollisions, which refills jumpsRemaining on touchdown).
  const jumpEdge = input.jump && !k.jumpHeld;
  k.jumpHeld = input.jump;
  if (jumpEdge && k.jumpsRemaining > 0) {
    k.vy = k.airborne ? DOUBLE_JUMP_FORCE : JUMP_FORCE;
    k.airborne = true;
    k.jumpsRemaining -= 1;
  }

  // --- integrate position ---
  k.position.x += Math.sin(k.travelHeading) * k.speed * dt;
  k.position.z += Math.cos(k.travelHeading) * k.speed * dt;
  if (k.airborne) {
    k.position.y += k.vy * dt;
    k.vy -= GRAVITY * dt;
  }
}

/**
 * Arcade collision response — flow over accuracy. Barriers and obstacles push
 * the kart gently away and bleed speed *in proportion to how head-on the hit
 * was*, so a graze barely slows you and nothing compounds frame-to-frame (which
 * is what made it feel glued before). Also glues the kart to the road surface
 * height so it climbs onto the rooftops and back down, and lands jumps.
 */
export function resolveCollisions(k: KartState, track: Track, dt: number): void {
  const C = CONFIG.kart;
  const s = track.project(k.position);

  // --- side barriers: deflect + scrape along, never stick ---
  const limit = track.halfWidth - C.radius;
  const over = Math.abs(s.lateralOffset) - limit;
  if (over > 0) {
    const dir = Math.sign(s.lateralOffset); // +1: kart is left of the centreline
    // Outward normal points from the wall back toward the track centre.
    const outX = -s.normal.x * dir;
    const outZ = -s.normal.y * dir;

    // How square is the hit? (component of travel heading into the wall, 0..1)
    const tdx = Math.sin(k.travelHeading);
    const tdz = Math.cos(k.travelHeading);
    const into = clamp(-(tdx * outX + tdz * outZ), 0, 1);

    // Resolve the penetration, plus a small outward bounce that scales with the
    // head-on component so a scrape doesn't drift you off the wall.
    k.position.x += outX * (over + COLLISION_BOUNCE_FORCE * into * dt);
    k.position.z += outZ * (over + COLLISION_BOUNCE_FORCE * into * dt);

    // Redirect travel to slide ALONG the wall. Pick the tangent direction that
    // best matches where we were already heading so we keep our momentum.
    let tangentHeading = Math.atan2(s.forward.x, s.forward.y);
    if (Math.abs(angleDelta(k.travelHeading, tangentHeading)) > Math.PI / 2) {
      tangentHeading += Math.PI;
    }
    k.travelHeading += angleDelta(k.travelHeading, tangentHeading) * WALL_SLIDE_FACTOR;

    // Bleed speed only in proportion to the head-on component — no compounding.
    k.speed *= 1 - (1 - COLLISION_SPEED_RETAINED) * into;
  }

  // --- round obstacles: slow + nudge aside (unless jumped clear) ---
  for (const o of track.obstacles) {
    if (k.position.y - o.position.y > o.height) continue; // sailed over the top
    const dx = k.position.x - o.position.x;
    const dz = k.position.z - o.position.z;
    const minDist = o.radius + C.radius;
    const dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < minDist) {
      const nx = dx / dist; // unit direction away from the obstacle centre
      const nz = dz / dist;
      const overlap = minDist - dist;

      const tdx = Math.sin(k.travelHeading);
      const tdz = Math.cos(k.travelHeading);
      const into = clamp(-(tdx * nx + tdz * nz), 0, 1);

      // Push out of the overlap + a bounce away from the centre.
      k.position.x += nx * (overlap + COLLISION_BOUNCE_FORCE * into * dt);
      k.position.z += nz * (overlap + COLLISION_BOUNCE_FORCE * into * dt);

      // Glance the travel direction aside so you flow around rather than halt.
      const awayHeading = Math.atan2(nx, nz);
      k.travelHeading += angleDelta(k.travelHeading, awayHeading) * OBSTACLE_DEFLECT * into;

      // Slow proportional to how square the hit was; keep moving otherwise.
      k.speed *= 1 - (1 - COLLISION_SPEED_RETAINED) * into;
      // Future: trigger destructible damage / gadget effects here.
    }
  }

  // --- vertical: land jumps, otherwise follow the road surface ---
  k.surfaceHeight = s.height; // remembered so the shadow can sit on the ground
  const targetY = s.height + C.groundOffset;
  if (k.airborne) {
    if (k.vy <= 0 && k.position.y <= targetY) {
      k.position.y = targetY;
      k.vy = 0;
      k.airborne = false;
      k.jumpsRemaining = MAX_JUMPS; // refill only on touchdown
    }
  } else {
    k.position.y += (targetY - k.position.y) * Math.min(1, 9 * dt);
    k.jumpsRemaining = MAX_JUMPS; // stay topped up while grounded
  }
}
