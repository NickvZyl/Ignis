import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'bed', label: 'Bed', gridW: 5, gridH: 3,
  spotDx: 2, spotDy: 3, canOverlapWall: false, drawKey: 'bed',
  category: 'decor', tags: ['sleep', 'rest'],
  scene: 'bedroom',
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Headboard (dark wood)
  for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 40; dx++) {
    const post = dx < 2 || dx >= 38;
    const topCurve = dy === 0 && (dx < 4 || dx >= 36);
    if (topCurve) continue;
    ctx.fillStyle = post ? '#5a3a1c' : dy < 1 ? '#6a4828' : '#7a5838';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Headboard detail (carved panel)
  for (let dy = 2; dy < 5; dy++) for (let dx = 4; dx < 36; dx++) {
    const border = dx === 4 || dx === 35 || dy === 2 || dy === 4;
    ctx.fillStyle = border ? '#6a4828' : '#8a6848';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Mattress
  for (let dy = 6; dy < 20; dy++) for (let dx = 1; dx < 39; dx++) {
    ctx.fillStyle = '#e8e0d8';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Blanket/duvet (cozy blue-gray)
  for (let dy = 8; dy < 18; dy++) for (let dx = 2; dx < 38; dx++) {
    const fold = dy === 8;
    const edgeL = dx < 3;
    const edgeR = dx > 36;
    ctx.fillStyle = fold ? '#7888a0' : edgeL || edgeR ? '#687890' : '#8898b0';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Blanket fold shadow
  for (let dx = 2; dx < 38; dx++) {
    ctx.fillStyle = '#607088';
    ctx.fillRect(x + dx, y + 9, 1, 1);
  }
  // Blanket bottom edge (tucked)
  for (let dx = 2; dx < 38; dx++) {
    ctx.fillStyle = '#586880';
    ctx.fillRect(x + dx, y + 18, 1, 1);
  }

  // Pillows (two, white/cream)
  // Left pillow
  for (let dy = 6; dy < 9; dy++) for (let dx = 4; dx < 16; dx++) {
    const edge = dx === 4 || dx === 15 || dy === 6 || dy === 8;
    ctx.fillStyle = edge ? '#d0c8c0' : '#f0ece4';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Right pillow
  for (let dy = 6; dy < 9; dy++) for (let dx = 18; dx < 30; dx++) {
    const edge = dx === 18 || dx === 29 || dy === 6 || dy === 8;
    ctx.fillStyle = edge ? '#d0c8c0' : '#f0ece4';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Bed frame sides
  for (let dy = 6; dy < 20; dy++) {
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(x, y + dy, 1, 1);
    ctx.fillRect(x + 39, y + dy, 1, 1);
  }

  // Footboard (shorter)
  for (let dy = 19; dy < 24; dy++) for (let dx = 0; dx < 40; dx++) {
    const post = dx < 2 || dx >= 38;
    ctx.fillStyle = post ? '#5a3a1c' : '#6a4828';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Footboard cap
  for (let dx = 0; dx < 40; dx++) {
    ctx.fillStyle = '#7a5838';
    ctx.fillRect(x + dx, y + 19, 1, 1);
  }
}

registry.register(def, draw);
