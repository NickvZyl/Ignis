import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'hallway_door', label: 'Hallway Door', gridW: 2, gridH: 3,
  spotDx: 1, spotDy: 3, canOverlapWall: true, drawKey: 'hallway_door',
  category: 'structural', tags: [],
  required: true,
  perimeterOnly: true,
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Door frame
  for (let dy = 0; dy < 22; dy++) {
    ctx.fillStyle = '#6a4820';
    ctx.fillRect(x, y + dy, 1, 1);
    ctx.fillRect(x + 15, y + dy, 1, 1);
  }
  // Top frame
  ctx.fillStyle = '#7a5828';
  for (let dx = 0; dx < 16; dx++) ctx.fillRect(x + dx, y, 1, 1);

  // Door panel
  for (let dy = 1; dy < 22; dy++) for (let dx = 1; dx < 15; dx++) {
    const panelBorder = dx === 1 || dx === 14 || dy === 1;
    ctx.fillStyle = panelBorder ? '#5a4020' : '#7a5838';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Upper panel inset
  for (let dy = 3; dy < 9; dy++) for (let dx = 3; dx < 13; dx++) {
    const border = dx === 3 || dx === 12 || dy === 3 || dy === 8;
    ctx.fillStyle = border ? '#6a4828' : '#8a6848';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Lower panel inset
  for (let dy = 11; dy < 20; dy++) for (let dx = 3; dx < 13; dx++) {
    const border = dx === 3 || dx === 12 || dy === 11 || dy === 19;
    ctx.fillStyle = border ? '#6a4828' : '#8a6848';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Door handle
  ctx.fillStyle = '#c0a030';
  ctx.fillRect(x + 12, y + 12, 1, 2);
  ctx.fillStyle = '#d8b840';
  ctx.fillRect(x + 12, y + 12, 1, 1);

  // "BEDROOM" sign (tiny, on upper panel)
  ctx.fillStyle = '#4a3018';
  // Simple pixel dots suggesting a small sign
  ctx.fillRect(x + 6, y + 5, 4, 1);
  ctx.fillRect(x + 5, y + 5, 1, 1);
  ctx.fillRect(x + 11, y + 5, 1, 1);

  // Threshold
  for (let dx = 0; dx < 16; dx++) {
    ctx.fillStyle = '#686058';
    ctx.fillRect(x + dx, y + 22, 1, 1);
    ctx.fillRect(x + dx, y + 23, 1, 1);
  }
}

registry.register(def, draw);
