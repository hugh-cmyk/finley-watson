import * as THREE from 'three';
import { CONFIG, STORAGE_BEST_LAP } from '../config';
import { makeSkyTexture } from './textures';
import { Track } from './Track';
import { PlayerKart } from './PlayerKart';
import { CameraController } from './CameraController';
import { InputController } from './InputController';
import { UI } from './UI';
import { Minimap } from './Minimap';

type Phase = 'countdown' | 'racing' | 'finished';

/**
 * Top-level orchestration: renderer/scene setup, the fixed game loop, and race
 * state (countdown, lap/checkpoint tracking, timing, restart).
 *
 * Future hooks:
 *  - `karts: PlayerKart[]` instead of one, fed by AI/remote InputControllers.
 *  - gadget/sabotage systems update alongside the kart in `step()`.
 *  - leaderboards: best lap is persisted to localStorage now; swap for a service.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;

  private track: Track;
  private kart: PlayerKart;
  private cameraCtrl: CameraController;
  private input: InputController;
  private ui: UI;
  private minimap?: Minimap;

  private phase: Phase = 'countdown';
  private clock = new THREE.Clock();
  private pixelScale: number;

  // race state
  private raceTimeMs = 0;
  private lapStartMs = 0;
  private lap = 1;
  private currentSector = 0;
  private bestLapMs: number | null = null;
  private countdownRemaining = CONFIG.race.countdownSeconds;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(CONFIG.render.clearColor);
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.baseFov, 1, 0.1, 1000);

    // Overcast scene + fog hides pop-in and sells the era.
    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(CONFIG.render.fogColor, CONFIG.render.fogNear, CONFIG.render.fogFar);

    const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x4a4030, 1.05);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 0.8);
    sun.position.set(60, 120, 40);
    this.scene.add(sun);

    this.track = new Track();
    this.scene.add(this.track.group);

    this.kart = new PlayerKart(this.track);
    this.scene.add(this.kart.group);
    this.scene.add(this.kart.shadow);

    this.cameraCtrl = new CameraController(this.camera);

    const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement | null;
    if (minimapCanvas) this.minimap = new Minimap(minimapCanvas, this.track);

    this.ui = new UI(() => this.restart());
    this.input = new InputController();
    this.input.onRestart = () => this.restart();

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    this.pixelScale = isMobile ? CONFIG.render.pixelScaleMobile : CONFIG.render.pixelScale;

    this.bestLapMs = this.loadBest();
    this.ui.setBest(this.bestLapMs);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.startCountdown();
    this.ui.showHud();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // --- race flow ----------------------------------------------------------

  private startCountdown(): void {
    this.phase = 'countdown';
    this.countdownRemaining = CONFIG.race.countdownSeconds;
    this.ui.showMessage(`${Math.ceil(this.countdownRemaining)}`, 'count');
  }

  restart(): void {
    this.kart.reset();
    this.cameraCtrl.reset();
    this.raceTimeMs = 0;
    this.lapStartMs = 0;
    this.lap = 1;
    this.currentSector = 0;
    this.ui.setLap(this.lap);
    this.ui.setTime(0);
    this.startCountdown();
  }

  private finish(): void {
    this.phase = 'finished';
    const quip = this.bestLapMs != null ? this.ui.lapQuip() : 'Done!';
    this.ui.showMessage(
      `<div class="big">FINISH 🏁</div><div class="sub">${quip} Best lap ${this.formatBest()}</div><div class="hint">Press R to race again</div>`,
      'info',
    );
  }

  private formatBest(): string {
    return this.bestLapMs == null ? '--' : (this.bestLapMs / 1000).toFixed(1) + 's';
  }

  // --- lap / checkpoint tracking -----------------------------------------

  private updateLap(): void {
    const C = this.track.checkpointCount;
    const t = this.track.project(this.kart.position).t;
    const sector = Math.floor(t * C) % C;

    const next = (this.currentSector + 1) % C;
    const prev = (this.currentSector - 1 + C) % C;

    if (sector === next) {
      this.currentSector = sector;
      // Crossing the finish line (sector wraps to 0) going forward = a lap done.
      if (sector === 0) this.completeLap();
    } else if (sector === prev) {
      // Allow going backwards without falsely counting laps.
      this.currentSector = sector;
    }
  }

  private completeLap(): void {
    const lapMs = this.raceTimeMs - this.lapStartMs;
    this.lapStartMs = this.raceTimeMs;
    if (lapMs > 1000 && (this.bestLapMs == null || lapMs < this.bestLapMs)) {
      this.bestLapMs = lapMs;
      this.saveBest(lapMs);
      this.ui.setBest(this.bestLapMs);
    }

    this.lap += 1;
    if (this.lap > CONFIG.race.laps) {
      this.finish();
    } else {
      this.ui.setLap(this.lap);
      this.flashMessage(`LAP ${this.lap} — ${this.ui.lapQuip()}`);
    }
  }

  private flashTimer = 0;
  private flashMessage(text: string): void {
    this.ui.showMessage(`<div class="flash">${text}</div>`, 'info');
    this.flashTimer = 1.4;
  }

  // --- main loop ----------------------------------------------------------

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 1 / 20); // clamp big stalls

    if (this.phase === 'countdown') {
      this.countdownRemaining -= dt;
      if (this.countdownRemaining <= 0) {
        this.phase = 'racing';
        this.ui.showMessage('<div class="big go">GO! 🏎️</div>', 'count');
        this.flashTimer = 0.8;
        this.clock.getDelta(); // reset delta so timing starts clean
      } else {
        this.ui.showMessage(`${Math.ceil(this.countdownRemaining)}`, 'count');
      }
      // Hold the kart still on the line, but keep the camera framed.
      this.minimap?.update(this.kart.position, this.kart.heading);
      this.cameraCtrl.update(this.kart.position, this.kart.heading, 0, dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'racing') {
      this.raceTimeMs += dt * 1000;
      this.kart.update(this.input.state, dt);
      this.updateLap();
      this.ui.setTime(this.raceTimeMs);
    }

    // Fade transient flash messages.
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0 && this.phase === 'racing') this.ui.hideMessage();
    }

    this.ui.setSpeed(this.kart.state.speed);
    this.ui.setBoost(this.kart.state.boostMeter);
    this.minimap?.update(this.kart.position, this.kart.heading);

    this.cameraCtrl.update(this.kart.position, this.kart.heading, this.kart.speedRatio, dt);
    this.renderer.render(this.scene, this.camera);
  }

  // --- plumbing -----------------------------------------------------------

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Render into a low-res buffer; CSS upscales the canvas with nearest filtering.
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.max(1, Math.floor(w * this.pixelScale)), Math.max(1, Math.floor(h * this.pixelScale)), false);
  }

  private loadBest(): number | null {
    try {
      const v = localStorage.getItem(STORAGE_BEST_LAP);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  }

  private saveBest(ms: number): void {
    try {
      localStorage.setItem(STORAGE_BEST_LAP, String(Math.round(ms)));
    } catch {
      /* storage unavailable — best lap just won't persist */
    }
  }
}
