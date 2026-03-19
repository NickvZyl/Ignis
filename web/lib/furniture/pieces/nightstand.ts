import { registry } from '../registry';
import type { FurnitureDef, FurnitureGlowFn } from '../types';

export const def: FurnitureDef = {
  id: 'nightstand', label: 'Nightstand', gridW: 2, gridH: 2,
  spotDx: 1, spotDy: 2, canOverlapWall: false, drawKey: 'nightstand',
  category: 'surface', tags: ['sleep'],
  scene: 'bedroom',
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Table body (dark wood)
  for (let dy = 4; dy < 14; dy++) for (let dx = 0; dx < 16; dx++) {
    const front = dy >= 12;
    const side = dx < 1 || dx > 14;
    ctx.fillStyle = front ? '#5a3a1c' : side ? '#6a4420' : '#7a5430';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Table top
  for (let dx = -1; dx < 17; dx++) {
    ctx.fillStyle = '#8a6438';
    ctx.fillRect(x + dx, y + 3, 1, 1);
    ctx.fillStyle = '#7a5830';
    ctx.fillRect(x + dx, y + 4, 1, 1);
  }

  // Drawer
  for (let dy = 7; dy < 11; dy++) for (let dx = 2; dx < 14; dx++) {
    const border = dx === 2 || dx === 13 || dy === 7 || dy === 10;
    ctx.fillStyle = border ? '#5a3a1c' : '#6a4828';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Drawer knob
  ctx.fillStyle = '#c0a040';
  ctx.fillRect(x + 7, y + 8, 2, 2);
  ctx.fillStyle = '#d8b850';
  ctx.fillRect(x + 7, y + 8, 1, 1);

  // Legs
  ctx.fillStyle = '#5a3a1c';
  ctx.fillRect(x + 1, y + 14, 1, 2);
  ctx.fillRect(x + 14, y + 14, 1, 2);

  // Lamp on top
  // Lamp base
  ctx.fillStyle = '#a08050';
  ctx.fillRect(x + 5, y + 2, 6, 1);
  // Lamp stem
  ctx.fillStyle = '#b09060';
  ctx.fillRect(x + 7, y + 0, 2, 2);
  // Lampshade
  const lampGlow = Math.sin(ts * 0.002) * 0.1 + 0.9;
  ctx.fillStyle = `rgba(240,220,170,${lampGlow})`;
  ctx.fillRect(x + 4, y - 3, 8, 3);
  ctx.fillStyle = `rgba(250,235,190,${lampGlow})`;
  ctx.fillRect(x + 5, y - 2, 6, 1);
  // Shade top rim
  ctx.fillStyle = '#c8b080';
  ctx.fillRect(x + 5, y - 3, 6, 1);
}

export const glow: FurnitureGlowFn = (gctx, x, y, ts, scale, isNight) => {
  // Warm reading lamp glow
  const intensity = isNight ? 0.25 : 0.08;
  const pulse = 0.9 + 0.1 * Math.sin(ts * 0.002);
  const lx = (x + 8) * scale, ly = (y + 2) * scale;
  const g = gctx.createRadialGradient(lx, ly, 0, lx, ly, 50);
  g.addColorStop(0, `rgba(255,210,130,${intensity * pulse})`);
  g.addColorStop(0.5, `rgba(255,180,80,${intensity * 0.4 * pulse})`);
  g.addColorStop(1, 'rgba(255,150,50,0)');
  gctx.fillStyle = g;
  gctx.fillRect(lx - 50, ly - 30, 100, 80);
};

registry.register(def, draw, glow);
