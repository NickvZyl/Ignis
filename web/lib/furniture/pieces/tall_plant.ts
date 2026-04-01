import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'tall_plant', label: 'Tall Plant', gridW: 2, gridH: 3,
  spotDx: 2, spotDy: 2, canOverlapWall: false, drawKey: 'tall_plant',
  category: 'nature', tags: [],
  hiResSprites: { 0: '/furniture/tall_plant-front-clean.png' },
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  const sway = Math.sin(ts * 0.0008) * 0.4;

  // Pot (larger terracotta)
  for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 12; dx++) {
    const taper = Math.floor(dy / 3);
    if (dx < taper || dx >= 12 - taper) continue;
    const isEdge = dx === taper || dx === 11 - taper;
    ctx.fillStyle = isEdge ? '#7a4020' : '#9a5830';
    ctx.fillRect(x + 2 + dx, y + 14 + dy, 1, 1);
  }
  // Pot rim
  for (let dx = 0; dx < 14; dx++) {
    ctx.fillStyle = dx === 0 || dx === 13 ? '#6a3818' : '#aa6838';
    ctx.fillRect(x + 1 + dx, y + 13, 1, 1);
  }
  // Soil
  for (let dx = 1; dx < 13; dx++) {
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x + 1 + dx, y + 14, 1, 1);
  }

  // Trunk
  ctx.fillStyle = '#4a3018';
  for (let dy = 0; dy < 10; dy++) {
    ctx.fillRect(x + 7, y + 4 + dy, 2, 1);
  }
  // Trunk texture
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(x + 7, y + 6, 1, 1);
  ctx.fillRect(x + 8, y + 9, 1, 1);
  ctx.fillRect(x + 7, y + 12, 1, 1);

  // Branches
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(x + 5, y + 6, 2, 1);
  ctx.fillRect(x + 9, y + 8, 2, 1);
  ctx.fillRect(x + 4, y + 10, 3, 1);

  // Large leaf clusters — fiddle leaf style
  const leaves = [
    // Top crown
    { cx: 8, cy: 1, r: [[0,0],[1,0],[2,0],[-1,1],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2]] },
    // Left branch
    { cx: 3, cy: 4, r: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[1,2]] },
    // Right branch
    { cx: 10, cy: 6, r: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2]] },
    // Lower left
    { cx: 2, cy: 9, r: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]] },
  ];

  const colors = ['#2a7a2a', '#3a9a3a', '#1a6020', '#2a8830'];
  leaves.forEach((leaf, li) => {
    const lsway = Math.round(sway * (li % 2 === 0 ? 1 : -0.7));
    leaf.r.forEach(([dx, dy], pi) => {
      ctx.fillStyle = colors[(pi + li) % colors.length];
      ctx.fillRect(x + leaf.cx + dx + lsway, y + leaf.cy + dy, 1, 1);
    });
  });
}

registry.register(def, draw);
