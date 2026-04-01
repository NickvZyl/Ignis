import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'plant', label: 'Plant', gridW: 2, gridH: 2,
  spotDx: 2, spotDy: 1, canOverlapWall: false, drawKey: 'plant',
  category: 'nature', tags: [],
  hiResSprites: { 0: '/furniture/plant-front-clean.png' },
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Pot
  for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 10; dx++) {
    // Tapered pot shape
    const taper = Math.floor(dy / 2);
    if (dx < taper || dx >= 10 - taper) continue;
    const isEdge = dx === taper || dx === 9 - taper;
    ctx.fillStyle = isEdge ? '#8a4a2a' : '#a06030';
    ctx.fillRect(x + 3 + dx, y + 8 + dy, 1, 1);
  }
  // Pot rim
  for (let dx = 0; dx < 12; dx++) {
    ctx.fillStyle = dx === 0 || dx === 11 ? '#7a4020' : '#b06838';
    ctx.fillRect(x + 2 + dx, y + 7, 1, 1);
  }
  // Soil
  for (let dx = 1; dx < 11; dx++) {
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x + 3 + dx - 1, y + 8, 1, 1);
  }

  // Leaves — organic pixel shapes with gentle sway
  const sway = Math.sin(ts * 0.001) * 0.3;
  const leafColor1 = '#2a7a2a';
  const leafColor2 = '#3a9a3a';
  const leafColor3 = '#1a6020';

  // Center stem
  ctx.fillStyle = '#2a5a18';
  for (let dy = 0; dy < 5; dy++) {
    ctx.fillRect(x + 8, y + 3 + dy, 1, 1);
  }

  // Left branch
  ctx.fillStyle = '#2a5a18';
  ctx.fillRect(x + 6, y + 4, 1, 1);
  ctx.fillRect(x + 7, y + 4, 1, 1);

  // Right branch
  ctx.fillRect(x + 9, y + 5, 1, 1);
  ctx.fillRect(x + 10, y + 5, 1, 1);

  // Leaf cluster top
  const leaves: [number, number, string][] = [
    [7, 0, leafColor2], [8, 0, leafColor1], [9, 0, leafColor2],
    [6, 1, leafColor1], [7, 1, leafColor2], [8, 1, leafColor3], [9, 1, leafColor2], [10, 1, leafColor1],
    [6, 2, leafColor2], [7, 2, leafColor1], [8, 2, leafColor2], [9, 2, leafColor1], [10, 2, leafColor2],
    [7, 3, leafColor1], [9, 3, leafColor2],
  ];
  leaves.forEach(([lx, ly, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + lx + Math.round(sway), y + ly, 1, 1);
  });

  // Left leaf cluster
  const leftLeaves: [number, number, string][] = [
    [3, 2, leafColor2], [4, 2, leafColor1], [5, 2, leafColor2],
    [3, 3, leafColor1], [4, 3, leafColor2], [5, 3, leafColor1],
    [4, 4, leafColor2],
  ];
  leftLeaves.forEach(([lx, ly, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + lx + Math.round(-sway), y + ly, 1, 1);
  });

  // Right leaf cluster
  const rightLeaves: [number, number, string][] = [
    [10, 3, leafColor2], [11, 3, leafColor1], [12, 3, leafColor2],
    [10, 4, leafColor1], [11, 4, leafColor2], [12, 4, leafColor1],
    [11, 5, leafColor2],
  ];
  rightLeaves.forEach(([lx, ly, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + lx + Math.round(sway * 0.7), y + ly, 1, 1);
  });
}

registry.register(def, draw);
