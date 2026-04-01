import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'wardrobe', label: 'Wardrobe', gridW: 5, gridH: 2,
  spotDx: 2.5, spotDy: 2.25, canOverlapWall: false, drawKey: 'wardrobe',
  category: 'storage', tags: [],
  scene: 'bedroom',
  hiResSprites: { 0: '/furniture/wardrobe-front-clean.png' },
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Main body (tall dark wood cabinet)
  for (let dy = 0; dy < 30; dy++) for (let dx = 0; dx < 24; dx++) {
    const side = dx < 1 || dx > 22;
    const top = dy < 1;
    ctx.fillStyle = top ? '#5a3a1c' : side ? '#5a3a20' : '#6a4828';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Crown molding (top decorative trim)
  for (let dx = -1; dx < 25; dx++) {
    ctx.fillStyle = '#7a5838';
    ctx.fillRect(x + dx, y, 1, 1);
    ctx.fillStyle = '#8a6848';
    ctx.fillRect(x + dx, y + 1, 1, 1);
  }

  // Left door panel
  for (let dy = 3; dy < 28; dy++) for (let dx = 2; dx < 11; dx++) {
    const border = dx === 2 || dx === 10 || dy === 3 || dy === 27;
    ctx.fillStyle = border ? '#5a3a1c' : '#7a5838';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Left door upper inset
  for (let dy = 5; dy < 14; dy++) for (let dx = 3; dx < 10; dx++) {
    const border = dx === 3 || dx === 9 || dy === 5 || dy === 13;
    ctx.fillStyle = border ? '#6a4828' : '#8a6848';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Left door lower inset
  for (let dy = 16; dy < 26; dy++) for (let dx = 3; dx < 10; dx++) {
    const border = dx === 3 || dx === 9 || dy === 16 || dy === 25;
    ctx.fillStyle = border ? '#6a4828' : '#8a6848';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Right door panel
  for (let dy = 3; dy < 28; dy++) for (let dx = 13; dx < 22; dx++) {
    const border = dx === 13 || dx === 21 || dy === 3 || dy === 27;
    ctx.fillStyle = border ? '#5a3a1c' : '#7a5838';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Right door upper inset
  for (let dy = 5; dy < 14; dy++) for (let dx = 14; dx < 21; dx++) {
    const border = dx === 14 || dx === 20 || dy === 5 || dy === 13;
    ctx.fillStyle = border ? '#6a4828' : '#8a6848';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Right door lower inset
  for (let dy = 16; dy < 26; dy++) for (let dx = 14; dx < 21; dx++) {
    const border = dx === 14 || dx === 20 || dy === 16 || dy === 25;
    ctx.fillStyle = border ? '#6a4828' : '#8a6848';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Center divider
  for (let dy = 3; dy < 28; dy++) {
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(x + 11, y + dy, 2, 1);
  }

  // Door knobs
  ctx.fillStyle = '#c0a040';
  ctx.fillRect(x + 10, y + 15, 1, 2);
  ctx.fillRect(x + 13, y + 15, 1, 2);
  ctx.fillStyle = '#d8b850';
  ctx.fillRect(x + 10, y + 15, 1, 1);
  ctx.fillRect(x + 13, y + 15, 1, 1);

  // Base/feet
  for (let dx = 0; dx < 24; dx++) {
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(x + dx, y + 30, 1, 1);
    ctx.fillRect(x + dx, y + 31, 1, 1);
  }
  // Little feet
  ctx.fillStyle = '#4a2a10';
  ctx.fillRect(x + 1, y + 31, 2, 1);
  ctx.fillRect(x + 21, y + 31, 2, 1);
}

registry.register(def, draw);
