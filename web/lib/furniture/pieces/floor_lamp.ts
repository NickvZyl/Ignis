import { registry } from '../registry';
import type { FurnitureDef } from '../types';

function animateFloorLamp(
  ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number, ts: number,
) {
  // Warm glow from shade area
  const pulse = Math.sin(ts * 0.002) * 0.08 + 0.35;
  const cx = dx + dw * 0.48, cy = dy + dh * 0.15, r = dw * 0.2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
  g.addColorStop(0, `rgba(255,220,150,${pulse})`);
  g.addColorStop(0.5, `rgba(255,200,120,${pulse * 0.4})`);
  g.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
}

export const def: FurnitureDef = {
  id: 'floor_lamp', label: 'Floor Lamp', gridW: 2, gridH: 3,
  spotDx: 2, spotDy: 2, canOverlapWall: false, drawKey: 'floor_lamp',
  category: 'lighting', tags: [],
  hiResSprites: { 0: '/furniture/floor_lamp-front-clean.png' },
  hiResAnimate: animateFloorLamp,
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Base (round, dark metal)
  for (let dx = 0; dx < 8; dx++) {
    ctx.fillStyle = dx === 0 || dx === 7 ? '#3a3a3a' : '#4a4a4a';
    ctx.fillRect(x + 4 + dx, y + 20, 1, 1);
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 4 + dx, y + 21, 1, 1);
  }
  for (let dx = 1; dx < 7; dx++) {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x + 4 + dx, y + 22, 1, 1);
  }

  // Pole
  ctx.fillStyle = '#555';
  for (let dy = 0; dy < 14; dy++) {
    ctx.fillRect(x + 7, y + 6 + dy, 2, 1);
  }
  ctx.fillStyle = '#4a4a4a';
  for (let dy = 0; dy < 14; dy++) {
    ctx.fillRect(x + 7, y + 6 + dy, 1, 1);
  }

  // Lampshade (fabric, warm color)
  for (let dy = 0; dy < 6; dy++) {
    const spread = Math.floor(dy * 0.8);
    const w = 8 + spread * 2;
    const sx = 8 - Math.floor(w / 2);
    for (let dx = 0; dx < w; dx++) {
      const isEdge = dx === 0 || dx === w - 1;
      ctx.fillStyle = isEdge ? '#b08858' : dy < 2 ? '#d0a870' : '#c89860';
      ctx.fillRect(x + sx + dx, y + dy, 1, 1);
    }
  }

  // Light glow on shade (warm spot)
  const pulse = Math.sin(ts * 0.002) * 0.1 + 0.9;
  ctx.globalAlpha = 0.4 * pulse;
  ctx.fillStyle = '#ffe8a0';
  ctx.fillRect(x + 6, y + 2, 4, 2);
  ctx.globalAlpha = 1;
}

export function glow(gctx: CanvasRenderingContext2D, x: number, y: number, ts: number, scale: number, isNight: boolean) {
  const intensity = isNight ? 0.25 : 0.08;
  const pulse = Math.sin(ts * 0.002) * 0.05 + 0.95;
  const gx = (x + 8) * scale, gy = (y + 3) * scale;
  const g = gctx.createRadialGradient(gx, gy, 0, gx, gy, 50);
  g.addColorStop(0, `rgba(255,220,150,${intensity * pulse})`);
  g.addColorStop(0.5, `rgba(255,200,120,${intensity * 0.3 * pulse})`);
  g.addColorStop(1, 'rgba(255,180,100,0)');
  gctx.fillStyle = g;
  gctx.fillRect(gx - 50, gy - 50, 100, 100);
}

registry.register(def, draw, glow);
