import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'bedroom_door', label: 'Bedroom Door', gridW: 3, gridH: 2,
  spotDx: 1, spotDy: -1, canOverlapWall: false, drawKey: 'bedroom_door',
  category: 'structural', tags: [],
  required: true,
  perimeterOnly: true,
  scene: 'bedroom',
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Door frame
  for (let dy = 0; dy < 14; dy++) for (let dx = 0; dx < 20; dx++) {
    const isFrame = dx < 2 || dx >= 18 || dy < 2;
    if (isFrame) {
      ctx.fillStyle = dy < 1 ? '#5a4028' : '#6a4a30';
      ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
    }
  }

  // Door panel (lighter wood than front door — interior)
  for (let dy = 2; dy < 14; dy++) for (let dx = 2; dx < 18; dx++) {
    const panelBorder = dx === 2 || dx === 17 || dy === 2 || dy === 13;
    ctx.fillStyle = panelBorder ? '#6a5030' : '#a08050';
    ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
  }

  // Upper panel inset
  for (let dy = 3; dy < 7; dy++) for (let dx = 4; dx < 16; dx++) {
    const border = dx === 4 || dx === 15 || dy === 3 || dy === 6;
    ctx.fillStyle = border ? '#7a5838' : '#b09060';
    ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
  }

  // Lower panel inset
  for (let dy = 8; dy < 13; dy++) for (let dx = 4; dx < 16; dx++) {
    const border = dx === 4 || dx === 15 || dy === 8 || dy === 12;
    ctx.fillStyle = border ? '#7a5838' : '#b09060';
    ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
  }

  // Door handle (round knob — brass)
  ctx.fillStyle = '#c0a040';
  ctx.fillRect(x + 16, y + 8, 2, 2);
  ctx.fillStyle = '#d8b850';
  ctx.fillRect(x + 16, y + 8, 1, 1);

  // Threshold
  for (let dx = 0; dx < 22; dx++) {
    ctx.fillStyle = dx < 1 || dx > 20 ? '#5a5048' : '#7a7068';
    ctx.fillRect(x + 1 + dx, y + 14, 1, 1);
  }
  for (let dx = 1; dx < 21; dx++) {
    ctx.fillStyle = '#686058';
    ctx.fillRect(x + 1 + dx, y + 15, 1, 1);
  }
}

registry.register(def, draw);
