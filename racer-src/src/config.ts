/**
 * Central tuning. Everything that affects "feel" lives here so the game can be
 * balanced without hunting through modules. Values are arcade-y on purpose —
 * we want responsive and silly, not a simulator.
 */

export const CONFIG = {
  race: {
    laps: 3,
    countdownSeconds: 3,
  },

  track: {
    halfWidth: 9, // metres from centreline to each barrier
    samples: 600, // polyline resolution used for road mesh + nearest-point queries
    roadTextureRepeat: 90,
  },

  kart: {
    radius: 1.3, // collision radius; kart stops a touch before the visual wall
    groundOffset: 0.55, // ride height above the road surface

    maxSpeed: 44,
    boostSpeed: 70,
    reverseSpeed: 14,

    accel: 36, // units/s^2 while accelerating
    brakeDecel: 64, // units/s^2 while braking from forward motion
    coastDecel: 16, // units/s^2 natural slow-down when off the gas

    turnRate: 2.0, // rad/s of facing change at full effect
    driftTurnBonus: 1.55, // extra turn multiplier while drifting
    grip: 7.5, // how fast travel direction snaps to facing (higher = stickier)
    driftGrip: 2.0, // lower grip while drifting => the back end slides out

    boostMax: 100,
    boostDrainPerSec: 42,
    boostRefillPerSec: 11,
    boostMinToFire: 6, // need at least this much to start a boost
    miniTurboCharge: 60, // drift long enough and you bank this much boost on release
    miniTurboChargeRate: 42, // boost charge accumulated per second of hard drifting
    miniTurboThreshold: 55, // charge needed to actually reward a mini-turbo

    wallScrub: 0.55, // speed kept after clipping a barrier (0..1)
    obstacleScrub: 0.4, // speed kept after thumping an obstacle
  },

  camera: {
    distance: 11.5,
    height: 5.5,
    lookAhead: 7,
    followLerp: 5.5, // higher = snappier camera
    baseFov: 72,
    boostFov: 86,
  },

  render: {
    // PS1 crunch: render into a small buffer and upscale with nearest filtering.
    pixelScale: 0.45,
    pixelScaleMobile: 0.34,
    fogColor: 0x9fa7b0,
    fogNear: 45,
    fogFar: 230,
    clearColor: 0xb7bec6,
  },
} as const;

export const STORAGE_BEST_LAP = 'finley-racer-best-lap-ms';

/** Unified control state. Network/AI drivers can produce the same shape later. */
export interface InputState {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  boost: boolean;
  restart: boolean;
}

export function createInputState(): InputState {
  return {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    drift: false,
    boost: false,
    restart: false,
  };
}
