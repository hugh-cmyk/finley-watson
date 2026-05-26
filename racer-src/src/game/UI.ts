import { CONFIG } from '../config';

/** Format milliseconds as M:SS.t */
export function formatTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '--:--.-';
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const tenths = Math.floor((total * 10) % 10);
  return `${m}:${s.toString().padStart(2, '0')}.${tenths}`;
}

/** A few cheeky British lap call-outs. */
const LAP_QUIPS = ['Smashing!', 'Proper job!', 'Lovely stuff!', 'Get in!', 'Bostin!'];

/**
 * Owns the HUD overlay DOM. Pure presentation — the Game pushes values in.
 */
export class UI {
  private hud = document.getElementById('hud')!;
  private lapEl = document.getElementById('lap')!;
  private timeEl = document.getElementById('time')!;
  private bestEl = document.getElementById('best')!;
  private speedEl = document.getElementById('speed')!;
  private boostFill = document.getElementById('boost-fill')!;
  private messageEl = document.getElementById('message')!;
  private restartBtn = document.getElementById('restart') as HTMLButtonElement;

  constructor(onRestart: () => void) {
    this.restartBtn.addEventListener('click', onRestart);
  }

  showHud(): void {
    this.hud.classList.remove('hidden');
    this.restartBtn.classList.remove('hidden');
  }

  setLap(lap: number): void {
    this.lapEl.textContent = `${Math.min(lap, CONFIG.race.laps)}/${CONFIG.race.laps}`;
  }

  setTime(ms: number): void {
    this.timeEl.textContent = formatTime(ms);
  }

  setBest(ms: number | null): void {
    this.bestEl.textContent = ms == null ? '--:--.-' : formatTime(ms);
  }

  setSpeed(speed: number): void {
    // Pure arcade vanity number, not real mph.
    this.speedEl.textContent = Math.round(Math.abs(speed) * 2.4).toString();
  }

  setBoost(meter: number): void {
    const pct = (meter / CONFIG.kart.boostMax) * 100;
    this.boostFill.style.width = `${pct}%`;
    this.boostFill.classList.toggle('full', meter >= CONFIG.kart.boostMax - 0.5);
  }

  showMessage(html: string, kind: 'count' | 'info' = 'info'): void {
    this.messageEl.innerHTML = html;
    this.messageEl.className = `msg-${kind}`;
    this.messageEl.classList.remove('hidden');
  }

  hideMessage(): void {
    this.messageEl.classList.add('hidden');
  }

  lapQuip(): string {
    return LAP_QUIPS[Math.floor(Math.random() * LAP_QUIPS.length)];
  }
}
