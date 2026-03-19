import { registry } from '../registry';
import type { FurnitureDef, FurnitureGlowFn } from '../types';

export const def: FurnitureDef = {
  id: 'bedroom_window', label: 'Window', gridW: 4, gridH: 3,
  spotDx: 2, spotDy: 4, canOverlapWall: true, zone: 'wall', drawKey: 'bedroom_window',
  category: 'structural', tags: [],
  scene: 'bedroom',
};

// The actual sky rendering is done in IgnisScene via drawBedroomWindow()
// This draw function renders just the frame and a placeholder interior
export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  const ww = 28, wh = 22;
  const ox = x + 2, oy = y;

  // Frame outer
  for (let dy = -1; dy < wh + 1; dy++) for (let dx = -1; dx < ww + 1; dx++) {
    if (dx >= 2 && dx < ww - 2 && dy >= 2 && dy < wh - 2) continue;
    ctx.fillStyle = (dy === -1 || dy === wh) ? '#7a5838' : '#5a4028';
    ctx.fillRect(ox + dx, oy + dy, 1, 1);
  }

  // Glass area (will be drawn over by scene renderer with sky)
  for (let dy = 2; dy < wh - 2; dy++) for (let dx = 2; dx < ww - 2; dx++) {
    const midX = Math.floor(ww / 2) - 1;
    const midY = Math.floor(wh / 2) - 1;
    if (dx === midX || dx === midX + 1) continue;
    if (dy === midY || dy === midY + 1) continue;
    ctx.fillStyle = '#607090';
    ctx.fillRect(ox + dx, oy + dy, 1, 1);
  }

  // Dividers
  const midX = Math.floor(ww / 2) - 1;
  const midY = Math.floor(wh / 2) - 1;
  for (let dy = 2; dy < wh - 2; dy++) { ctx.fillStyle = '#5a4028'; ctx.fillRect(ox + midX, oy + dy, 2, 1); }
  for (let dx = 2; dx < ww - 2; dx++) { ctx.fillStyle = '#5a4028'; ctx.fillRect(ox + dx, oy + midY, 1, 2); }

  // Sill
  for (let dx = -2; dx < ww + 2; dx++) {
    ctx.fillStyle = '#6a4828';
    ctx.fillRect(ox + dx, oy + wh - 2, 1, 1);
    ctx.fillStyle = '#7a5838';
    ctx.fillRect(ox + dx, oy + wh - 1, 1, 1);
  }

  // Sheer curtains (light, airy)
  for (let dy = 0; dy < wh; dy++) {
    const wave = Math.sin(dy * 0.5 + ts * 0.001) * 0.8;
    ctx.globalAlpha = 0.25;
    // Left curtain
    ctx.fillStyle = '#e8e0d8';
    for (let dx = 0; dx < 3; dx++) {
      ctx.fillRect(ox + dx + Math.round(wave), oy + dy, 1, 1);
    }
    // Right curtain
    for (let dx = 0; dx < 3; dx++) {
      ctx.fillStyle = '#e8e0d8';
      ctx.fillRect(ox + ww - 3 + dx - Math.round(wave), oy + dy, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

export const glow: FurnitureGlowFn = (gctx, x, y, ts, scale, isNight) => {
  // Moonlight / daylight through bedroom window
  const cx = (x + 16) * scale, cy = (y + 20) * scale;
  if (isNight) {
    const g = gctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
    g.addColorStop(0, 'rgba(120,140,200,0.08)');
    g.addColorStop(1, 'rgba(100,120,180,0)');
    gctx.fillStyle = g;
    gctx.fillRect(cx - 60, cy - 30, 120, 90);
  } else {
    const g = gctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
    g.addColorStop(0, 'rgba(200,220,255,0.10)');
    g.addColorStop(1, 'rgba(200,220,255,0)');
    gctx.fillStyle = g;
    gctx.fillRect(cx - 70, cy - 35, 140, 105);
  }
};

registry.register(def, draw, glow);
