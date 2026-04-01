import { registry } from '../registry';
import type { FurnitureDef } from '../types';

function animateCeilingLight(
  ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number, ts: number,
) {
  // Warm glow from the lantern
  const pulse = Math.sin(ts * 0.0018) * 0.08 + 0.3;
  const cx = dx + dw * 0.45, cy = dy + dh * 0.65, r = dw * 0.18;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5);
  g.addColorStop(0, `rgba(255,225,160,${pulse})`);
  g.addColorStop(0.4, `rgba(255,200,120,${pulse * 0.4})`);
  g.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 2.5, cy - r * 2.5, r * 5, r * 5);
}

export const def: FurnitureDef = {
  id: 'ceiling_light', label: 'Ceiling Light', gridW: 2, gridH: 1,
  spotDx: 1, spotDy: 8, canOverlapWall: true, zone: 'ceiling', drawKey: 'ceiling_light',
  category: 'lighting', tags: [],
  hiResSprites: { 0: '/furniture/ceiling_light-front-clean.png' },
  hiResAnimate: animateCeilingLight,
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Ceiling mount plate (dark iron)
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x + 5, y, 6, 2);
  ctx.fillStyle = '#2e2e2e';
  ctx.fillRect(x + 6, y, 4, 1);

  // Chain / rod
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(x + 7, y + 2, 2, 2);

  // Shade (warm fabric, wider at bottom)
  for (let dy = 0; dy < 5; dy++) {
    const spread = Math.floor(dy * 1.2);
    const w = 6 + spread * 2;
    const sx = 8 - Math.floor(w / 2);
    for (let dx = 0; dx < w; dx++) {
      const isEdge = dx === 0 || dx === w - 1;
      ctx.fillStyle = isEdge ? '#a08050' : dy < 2 ? '#d4ad72' : '#c8a068';
      ctx.fillRect(x + sx + dx, y + 4 + dy, 1, 1);
    }
  }

  // Light glow inside shade
  const pulse = Math.sin(ts * 0.0018) * 0.1 + 0.9;
  ctx.globalAlpha = 0.5 * pulse;
  ctx.fillStyle = '#ffe8a0';
  ctx.fillRect(x + 6, y + 5, 4, 2);
  ctx.globalAlpha = 0.3 * pulse;
  ctx.fillStyle = '#fff0c0';
  ctx.fillRect(x + 7, y + 4, 2, 1);
  ctx.globalAlpha = 1;
}

export function glow(gctx: CanvasRenderingContext2D, x: number, y: number, ts: number, scale: number, isNight: boolean) {
  const intensity = isNight ? 0.3 : 0.1;
  const pulse = Math.sin(ts * 0.0018) * 0.05 + 0.95;
  const gx = (x + 8) * scale, gy = (y + 6) * scale;

  // Wide downward cone of light
  const g = gctx.createRadialGradient(gx, gy, 0, gx, gy + 40, 80);
  g.addColorStop(0, `rgba(255,225,160,${intensity * pulse})`);
  g.addColorStop(0.4, `rgba(255,210,140,${intensity * 0.4 * pulse})`);
  g.addColorStop(1, 'rgba(255,200,120,0)');
  gctx.fillStyle = g;
  gctx.fillRect(gx - 80, gy - 20, 160, 160);
}

registry.register(def, draw, glow);
