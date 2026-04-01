import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'garden_gate', label: 'Garden Gate', gridW: 3, gridH: 2,
  spotDx: 1, spotDy: -1, canOverlapWall: false, drawKey: 'garden_gate',
  category: 'structural', tags: [],
  required: true,
  perimeterOnly: true,
  scene: 'garden',
  hiResSprites: { 0: '/furniture/garden_gate-front-clean.png' },
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Stone path leading to gate
  for (let dy = 12; dy < 16; dy++) for (let dx = 2; dx < 22; dx++) {
    const stone = ((dx + dy * 3) % 5) < 3;
    ctx.fillStyle = stone ? '#8a8478' : '#7a7468';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Gate posts (left and right)
  for (let dy = 0; dy < 12; dy++) {
    // Left post
    ctx.fillStyle = dy < 1 ? '#6a5030' : '#7a5a38';
    ctx.fillRect(x + 1, y + dy, 3, 1);
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + 2, y + dy, 1, 1);
    // Right post
    ctx.fillStyle = dy < 1 ? '#6a5030' : '#7a5a38';
    ctx.fillRect(x + 20, y + dy, 3, 1);
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + 21, y + dy, 1, 1);
  }

  // Post caps
  ctx.fillStyle = '#5a4028';
  ctx.fillRect(x, y, 5, 1);
  ctx.fillRect(x + 19, y, 5, 1);

  // Gate panels (two swinging doors)
  for (let dy = 2; dy < 10; dy++) for (let dx = 4; dx < 20; dx++) {
    const isHinge = dx === 4 || dx === 19;
    const isMiddle = dx === 11 || dx === 12;
    const isRail = dy === 2 || dy === 5 || dy === 9;
    if (isHinge) {
      ctx.fillStyle = '#a08040';
    } else if (isMiddle) {
      ctx.fillStyle = dy < 6 ? '#6a4a28' : '#604020';
    } else if (isRail) {
      ctx.fillStyle = '#8a6240';
    } else {
      ctx.fillStyle = ((dx + dy) % 2 === 0) ? '#9a7248' : '#8a6840';
    }
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Latch in the middle
  ctx.fillStyle = '#c0a040';
  ctx.fillRect(x + 11, y + 6, 2, 1);
  ctx.fillStyle = '#d8b850';
  ctx.fillRect(x + 11, y + 6, 1, 1);
}

registry.register(def, draw);
