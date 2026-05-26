import * as THREE from 'three';
import { Track } from './Track';

/**
 * Top-down minimap. Draws the track loop once-per-frame onto a small canvas and
 * plots the kart as a heading arrow. Cheap (a ~100-point polyline on a 150px
 * canvas) so redrawing every frame is fine.
 *
 * Future: drop in markers for rival karts, gadgets or checkpoints here.
 */
export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private pts: Array<{ x: number; y: number }> = []; // track points in canvas space
  private finish = { x: 0, y: 0 };
  private toCanvas: (x: number, z: number) => { x: number; y: number };
  private w: number;
  private h: number;

  constructor(canvas: HTMLCanvasElement, track: Track) {
    this.ctx = canvas.getContext('2d')!;
    this.w = canvas.width;
    this.h = canvas.height;

    const { points, finish } = track.minimapData();
    const pad = 12;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const spanX = maxX - minX || 1;
    const spanZ = maxZ - minZ || 1;
    const scale = Math.min((this.w - pad * 2) / spanX, (this.h - pad * 2) / spanZ);
    const offX = (this.w - spanX * scale) / 2;
    const offY = (this.h - spanZ * scale) / 2;
    this.toCanvas = (x, z) => ({ x: offX + (x - minX) * scale, y: offY + (z - minZ) * scale });

    this.pts = points.map((p) => this.toCanvas(p.x, p.z));
    this.finish = this.toCanvas(finish.x, finish.z);
  }

  update(kartPos: THREE.Vector3, heading: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Track ribbon.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 9;
    this.strokePath();
    ctx.strokeStyle = '#3b3f45';
    ctx.lineWidth = 6;
    this.strokePath();

    // Finish line marker.
    ctx.fillStyle = '#ffd23b';
    ctx.beginPath();
    ctx.arc(this.finish.x, this.finish.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Kart as a heading arrow. World forward is (sin h, cos h); z maps to canvas Y.
    const c = this.toCanvas(kartPos.x, kartPos.z);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const ang = Math.atan2(fx, fz); // canvas: x from sin, y from cos
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(ang);
    ctx.fillStyle = '#ff4136';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -6); // nose (points along +forward)
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private strokePath(): void {
    const ctx = this.ctx;
    ctx.beginPath();
    this.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }
}
