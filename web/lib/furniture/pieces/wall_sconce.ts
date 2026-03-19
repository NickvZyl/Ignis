import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'wall_sconce', label: 'Wall Sconce', gridW: 1, gridH: 2,
  spotDx: 0, spotDy: 4, canOverlapWall: true, zone: 'wall', drawKey: 'wall_sconce',
  category: 'lighting', tags: [],
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Mounting plate
  ctx.fillStyle = '#6a5a4a';
  ctx.fillRect(x + 2, y + 2, 4, 3);
  ctx.fillStyle = '#7a6a5a';
  ctx.fillRect(x + 3, y + 3, 2, 1);

  // Arm
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(x + 3, y + 5, 2, 3);

  // Shade (small, warm)
  for (let dy = 0; dy < 4; dy++) {
    const w = 4 + dy;
    const sx = 4 - Math.floor(w / 2);
    for (let dx = 0; dx < w; dx++) {
      const isEdge = dx === 0 || dx === w - 1;
      ctx.fillStyle = isEdge ? '#a08050' : '#c09a68';
      ctx.fillRect(x + sx + dx, y + 8 + dy, 1, 1);
    }
  }

  // Bulb glow
  const pulse = Math.sin(ts * 0.0025) * 0.15 + 0.85;
  ctx.globalAlpha = 0.5 * pulse;
  ctx.fillStyle = '#ffd880';
  ctx.fillRect(x + 3, y + 9, 2, 2);
  ctx.globalAlpha = 1;
}

export function glow(gctx: CanvasRenderingContext2D, x: number, y: number, ts: number, scale: number, isNight: boolean) {
  const intensity = isNight ? 0.2 : 0.06;
  const pulse = Math.sin(ts * 0.0025) * 0.05 + 0.95;
  const gx = (x + 4) * scale, gy = (y + 10) * scale;
  const g = gctx.createRadialGradient(gx, gy, 0, gx, gy, 40);
  g.addColorStop(0, `rgba(255,216,128,${intensity * pulse})`);
  g.addColorStop(0.6, `rgba(255,200,100,${intensity * 0.2 * pulse})`);
  g.addColorStop(1, 'rgba(255,180,80,0)');
  gctx.fillStyle = g;
  gctx.fillRect(gx - 40, gy - 40, 80, 80);
}

registry.register(def, draw, glow);
