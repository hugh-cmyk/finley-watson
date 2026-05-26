import * as THREE from 'three';
import { CONFIG, InputState } from '../config';
import { Track } from './Track';

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

/** Advance the kart one step: longitudinal, steering, drift, boost, integrate. */
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
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const moving = Math.abs(k.speed) > 0.5;

  // Drift engages while held, you're moving with intent, and turning.
  const canDrift = input.drift && Math.abs(k.speed) > 10;
  if (canDrift && !k.drifting) {
    k.drifting = true;
    k.driftDir = steer !== 0 ? steer : k.driftDir;
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
    if (steer !== 0) k.driftCharge += C.miniTurboChargeRate * dt;
  }
  // Hard to turn at a standstill; reversing inverts the steering.
  turn *= clamp(Math.abs(k.speed) / 8, 0, 1);
  if (moving) k.heading += turn * dt * Math.sign(k.speed);

  // --- grip: pull travel direction toward facing ---
  const gripRate = k.drifting ? C.driftGrip : C.grip;
  const blend = 1 - Math.exp(-gripRate * dt);
  k.travelHeading += angleDelta(k.travelHeading, k.heading) * blend;

  // --- integrate position in XZ ---
  const dx = Math.sin(k.travelHeading) * k.speed * dt;
  const dz = Math.cos(k.travelHeading) * k.speed * dt;
  k.position.x += dx;
  k.position.z += dz;
}

/**
 * Keep the kart on the track and bounce it off obstacles. Also glues it to the
 * road surface height so it climbs onto the rooftops and back down.
 */
export function resolveCollisions(k: KartState, track: Track, dt: number): void {
  const C = CONFIG.kart;
  const s = track.project(k.position);

  // Barriers: clamp lateral offset to the road width.
  const limit = track.halfWidth - C.radius;
  const over = Math.abs(s.lateralOffset) - limit;
  if (over > 0) {
    const dir = Math.sign(s.lateralOffset);
    k.position.x -= s.normal.x * dir * over;
    k.position.z -= s.normal.y * dir * over;
    k.speed *= C.wallScrub;
    // Nudge travel back toward the wall tangent so you scrape along, not stop dead.
    const tangentHeading = Math.atan2(s.forward.x, s.forward.y);
    k.travelHeading += angleDelta(k.travelHeading, tangentHeading) * 0.5;
  }

  // Round obstacles.
  for (const o of track.obstacles) {
    const dx = k.position.x - o.position.x;
    const dz = k.position.z - o.position.z;
    const minDist = o.radius + C.radius;
    const dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < minDist) {
      const push = (minDist - dist) / dist;
      k.position.x += dx * push;
      k.position.z += dz * push;
      k.speed *= C.obstacleScrub;
      // Future: trigger destructible damage / gadget effects here.
    }
  }

  // Follow the road surface (smoothed so ramps feel like little launches).
  const targetY = s.height + C.groundOffset;
  k.position.y += (targetY - k.position.y) * Math.min(1, 9 * dt);
  k.airborne = k.position.y > targetY + 0.6;
}
