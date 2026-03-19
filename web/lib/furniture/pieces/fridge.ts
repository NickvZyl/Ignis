import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'fridge', label: 'Fridge', gridW: 2, gridH: 4,
  spotDx: 2, spotDy: 2, canOverlapWall: false, drawKey: 'fridge',
  category: 'appliance', tags: [],
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Main body
  for (let dy = 0; dy < 30; dy++) for (let dx = 0; dx < 14; dx++) {
    const isEdge = dx === 0 || dx === 13;
    ctx.fillStyle = isEdge ? '#c8c8c8' : '#e0e0e0';
    ctx.fillRect(x + 1 + dx, y + dy, 1, 1);
  }

  // Top section (freezer) - slightly darker
  for (let dy = 0; dy < 10; dy++) for (let dx = 1; dx < 13; dx++) {
    ctx.fillStyle = '#d0d4d8';
    ctx.fillRect(x + 1 + dx, y + dy, 1, 1);
  }

  // Divider between freezer and fridge
  for (let dx = 0; dx < 14; dx++) {
    ctx.fillStyle = '#aaa';
    ctx.fillRect(x + 1 + dx, y + 10, 1, 1);
    ctx.fillRect(x + 1 + dx, y + 11, 1, 1);
  }

  // Freezer handle
  ctx.fillStyle = '#888';
  for (let dy = 3; dy < 8; dy++) {
    ctx.fillRect(x + 12, y + dy, 1, 1);
  }
  ctx.fillStyle = '#999';
  for (let dy = 3; dy < 8; dy++) {
    ctx.fillRect(x + 13, y + dy, 1, 1);
  }

  // Fridge handle
  ctx.fillStyle = '#888';
  for (let dy = 14; dy < 24; dy++) {
    ctx.fillRect(x + 12, y + dy, 1, 1);
  }
  ctx.fillStyle = '#999';
  for (let dy = 14; dy < 24; dy++) {
    ctx.fillRect(x + 13, y + dy, 1, 1);
  }

  // Top edge (slight shadow/depth)
  for (let dx = 0; dx < 14; dx++) {
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(x + 1 + dx, y, 1, 1);
  }

  // Bottom edge / feet
  for (let dx = 0; dx < 14; dx++) {
    ctx.fillStyle = '#a0a0a0';
    ctx.fillRect(x + 1 + dx, y + 29, 1, 1);
  }
  // Feet
  ctx.fillStyle = '#666';
  ctx.fillRect(x + 2, y + 30, 2, 1);
  ctx.fillRect(x + 12, y + 30, 2, 1);

  // Ice maker indicator (tiny blue dot on freezer)
  ctx.fillStyle = '#60a0e0';
  ctx.fillRect(x + 4, y + 2, 1, 1);
}

registry.register(def, draw);
