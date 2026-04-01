import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'front_door', label: 'Front Door', gridW: 2, gridH: 4,
  spotDx: 1, spotDy: 1, canOverlapWall: false, drawKey: 'front_door',
  category: 'structural', tags: [],
  required: true,
  perimeterOnly: true,
  hiResSprites: {
    0: '/furniture/front_door-front-clean.png',
    2: '/furniture/front_door-back-clean.png',
  },
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Door frame (outer)
  for (let dy = 0; dy < 14; dy++) for (let dx = 0; dx < 20; dx++) {
    const isFrame = dx < 2 || dx >= 18 || dy < 2;
    if (isFrame) {
      ctx.fillStyle = dy < 1 ? '#6a4820' : '#7a5828';
      ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
    }
  }

  // Door panel (wood)
  for (let dy = 2; dy < 14; dy++) for (let dx = 2; dx < 18; dx++) {
    const panelBorder = dx === 2 || dx === 17 || dy === 2 || dy === 13;
    ctx.fillStyle = panelBorder ? '#5a3818' : '#8a6038';
    ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
  }

  // Upper panel inset
  for (let dy = 3; dy < 7; dy++) for (let dx = 4; dx < 16; dx++) {
    const border = dx === 4 || dx === 15 || dy === 3 || dy === 6;
    ctx.fillStyle = border ? '#6a4828' : '#9a7048';
    ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
  }

  // Lower panel inset
  for (let dy = 8; dy < 13; dy++) for (let dx = 4; dx < 16; dx++) {
    const border = dx === 4 || dx === 15 || dy === 8 || dy === 12;
    ctx.fillStyle = border ? '#6a4828' : '#9a7048';
    ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
  }

  // Door handle (round knob)
  ctx.fillStyle = '#c0a030';
  ctx.fillRect(x + 16, y + 8, 2, 2);
  ctx.fillStyle = '#d8b840';
  ctx.fillRect(x + 16, y + 8, 1, 1);

  // Keyhole
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(x + 17, y + 10, 1, 1);

  // Threshold / step
  for (let dx = 0; dx < 22; dx++) {
    ctx.fillStyle = dx < 1 || dx > 20 ? '#5a5048' : '#7a7068';
    ctx.fillRect(x + 1 + dx, y + 14, 1, 1);
  }
  for (let dx = 1; dx < 21; dx++) {
    ctx.fillStyle = '#686058';
    ctx.fillRect(x + 1 + dx, y + 15, 1, 1);
  }

  // Welcome mat
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 14; dx++) {
    const border = dx === 0 || dx === 13 || dy === 0 || dy === 2;
    ctx.fillStyle = border ? '#5a6a3a' : ((dx + dy) % 2 === 0 ? '#7a8a4a' : '#6a7a40');
    ctx.fillRect(x + 5 + dx, y + 16 - 1 + dy, 1, 1);
  }
}

registry.register(def, draw);
