import { InputState, createInputState } from '../config';

/**
 * Unifies keyboard and on-screen touch controls into a single InputState that
 * the game reads each frame. Keeping input behind this interface means AI or
 * networked drivers can later feed the same shape without touching game logic.
 */
export class InputController {
  readonly state: InputState = createInputState();
  onRestart?: () => void;

  private boundKeyDown = (e: KeyboardEvent) => this.onKey(e, true);
  private boundKeyUp = (e: KeyboardEvent) => this.onKey(e, false);

  constructor() {
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    this.bindTouch();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.state.accelerate = down;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.state.brake = down;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.state.left = down;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.state.right = down;
        break;
      case 'Space':
        this.state.drift = down;
        e.preventDefault();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.state.boost = down;
        break;
      case 'KeyR':
        if (down) this.onRestart?.();
        break;
      default:
        return;
    }
  }

  private bindTouch(): void {
    const controls = document.getElementById('touch-controls');
    if (!controls) return;

    // Show on-screen controls for touch-capable devices.
    const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouch) controls.classList.remove('hidden');

    const hold = (id: string, key: keyof InputState) => {
      const el = document.getElementById(id);
      if (!el) return;
      const set = (v: boolean) => (e: Event) => {
        e.preventDefault();
        (this.state[key] as boolean) = v;
      };
      el.addEventListener('pointerdown', set(true));
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('pointerleave', set(false));
    };

    hold('btn-accel', 'accelerate');
    hold('btn-brake', 'brake');
    hold('btn-left', 'left');
    hold('btn-right', 'right');
    hold('btn-drift', 'drift');
    hold('btn-boost', 'boost');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
  }
}
