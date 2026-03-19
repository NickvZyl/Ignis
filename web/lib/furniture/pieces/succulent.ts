import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'succulent', label: 'Succulent', gridW: 1, gridH: 1,
  spotDx: 1, spotDy: 0, canOverlapWall: false, drawKey: 'succulent',
  category: 'nature', tags: [],
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Tiny ceramic pot
  ctx.fillStyle = '#d0c0a8';
  ctx.fillRect(x + 1, y + 5, 6, 1); // rim
  ctx.fillStyle = '#c0b098';
  for (let dy = 0; dy < 3; dy++) {
    const t = Math.floor(dy / 2);
    for (let dx = t; dx < 6 - t; dx++) {
      ctx.fillRect(x + 1 + dx, y + 6 + dy, 1, 1);
    }
  }

  // Rosette leaves (top-down succulent shape)
  const c1 = '#5a9a5a', c2 = '#4a8a4a', c3 = '#6aaa6a', c4 = '#3a7a3a';
  // Center
  ctx.fillStyle = c3; ctx.fillRect(x + 3, y + 3, 2, 2);
  // Petals around
  ctx.fillStyle = c1;
  ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + 5, y + 2, 1, 1);
  ctx.fillRect(x + 2, y + 5, 1, 1); ctx.fillRect(x + 5, y + 5, 1, 1);
  ctx.fillStyle = c2;
  ctx.fillRect(x + 3, y + 1, 2, 1); ctx.fillRect(x + 3, y + 5, 2, 1);
  ctx.fillRect(x + 1, y + 3, 1, 2); ctx.fillRect(x + 6, y + 3, 1, 2);
  ctx.fillStyle = c4;
  ctx.fillRect(x + 2, y + 3, 1, 1); ctx.fillRect(x + 5, y + 3, 1, 1);
  ctx.fillRect(x + 3, y + 2, 1, 1); ctx.fillRect(x + 4, y + 4, 1, 1);
}

registry.register(def, draw);
