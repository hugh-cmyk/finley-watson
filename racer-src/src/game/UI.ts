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
  private needle?: SVGLineElement;

  // Needle sweeps SPEEDO_SWEEP° across the display range [0, SPEEDO_MAX].
  private static readonly SPEEDO_MAX = 180;
  private static readonly SPEEDO_SWEEP = 240;

  constructor(onRestart: () => void) {
    this.restartBtn.addEventListener('click', onRestart);
    this.buildSpeedo();
  }

  /** Build the analog speedo (arc + ticks + needle) into #speedo-gauge. */
  private buildSpeedo(): void {
    const host = document.getElementById('speedo-gauge');
    if (!host) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const cx = 60, cy = 64, r = 46;
    const half = UI.SPEEDO_SWEEP / 2;
    const polar = (deg: number, rad: number) => {
      const a = (deg * Math.PI) / 180;
      return { x: cx + rad * Math.sin(a), y: cy - rad * Math.cos(a) };
    };

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 92');

    // Background arc.
    const a0 = polar(-half, r);
    const a1 = polar(half, r);
    const arc = document.createElementNS(svgNS, 'path');
    arc.setAttribute('d', `M ${a0.x.toFixed(1)} ${a0.y.toFixed(1)} A ${r} ${r} 0 1 1 ${a1.x.toFixed(1)} ${a1.y.toFixed(1)}`);
    arc.setAttribute('class', 'speedo-arc');
    svg.appendChild(arc);

    // Ticks (red near the top end for a bit of menace).
    const ticks = 9;
    for (let i = 0; i < ticks; i++) {
      const deg = -half + (UI.SPEEDO_SWEEP * i) / (ticks - 1);
      const p1 = polar(deg, r - 7);
      const p2 = polar(deg, r);
      const tick = document.createElementNS(svgNS, 'line');
      tick.setAttribute('x1', p1.x.toFixed(1));
      tick.setAttribute('y1', p1.y.toFixed(1));
      tick.setAttribute('x2', p2.x.toFixed(1));
      tick.setAttribute('y2', p2.y.toFixed(1));
      tick.setAttribute('class', i >= ticks - 3 ? 'speedo-tick hot' : 'speedo-tick');
      svg.appendChild(tick);
    }

    // Needle + hub.
    const needle = document.createElementNS(svgNS, 'line');
    needle.setAttribute('x1', String(cx));
    needle.setAttribute('y1', String(cy));
    needle.setAttribute('x2', String(cx));
    needle.setAttribute('y2', String(cy - (r - 6)));
    needle.setAttribute('class', 'speedo-needle');
    svg.appendChild(needle);
    const hub = document.createElementNS(svgNS, 'circle');
    hub.setAttribute('cx', String(cx));
    hub.setAttribute('cy', String(cy));
    hub.setAttribute('r', '4');
    hub.setAttribute('class', 'speedo-hub');
    svg.appendChild(hub);

    host.appendChild(svg);
    this.needle = needle;
    this.speedoCenter = { cx, cy };
  }

  private speedoCenter = { cx: 60, cy: 64 };

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
    const display = Math.round(Math.abs(speed) * 2.4);
    this.speedEl.textContent = display.toString();

    if (this.needle) {
      const frac = Math.min(display / UI.SPEEDO_MAX, 1);
      const deg = -UI.SPEEDO_SWEEP / 2 + frac * UI.SPEEDO_SWEEP;
      this.needle.setAttribute('transform', `rotate(${deg.toFixed(1)} ${this.speedoCenter.cx} ${this.speedoCenter.cy})`);
    }
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
