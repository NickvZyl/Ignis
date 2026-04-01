import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'cow_pen', label: 'Cow Pen', gridW: 5, gridH: 4,
  spotDx: 2, spotDy: 4, canOverlapWall: false, drawKey: 'cow_pen',
  category: 'nature', tags: ['animals'],
  scene: 'garden',
  hiResSprites: { 0: '/furniture/cow_pen-front-clean.png' },
};

function drawCow(ctx: CanvasRenderingContext2D, cx: number, cy: number, ts: number, seed: number) {
  // Tail swish animation
  const tailSwish = Math.sin(ts * 0.003 + seed * 3) * 2;
  const chew = Math.sin(ts * 0.004 + seed * 5) > 0.6 ? 1 : 0;

  // Shadow under body
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let dx = 0; dx < 8; dx++) ctx.fillRect(cx + dx, cy + 7, 1, 1);

  // Body — spotted brown and white
  const bodyBase = seed === 0 ? '#f0e8d8' : '#e8e0d0';
  for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 8; dx++) {
    ctx.fillStyle = bodyBase;
    ctx.fillRect(cx + dx, cy + dy, 1, 1);
  }
  // Belly highlight
  ctx.fillStyle = '#f8f0e8';
  ctx.fillRect(cx + 2, cy + 3, 4, 1);
  ctx.fillRect(cx + 3, cy + 4, 2, 1);

  // Brown/white spots (larger, more distinct)
  ctx.fillStyle = seed === 0 ? '#6a4020' : '#7a4a28';
  const spots0 = [[1,0],[2,0],[3,0],[1,1],[2,1],[5,2],[6,2],[5,3],[6,3]];
  const spots1 = [[3,0],[4,0],[5,0],[3,1],[4,1],[0,2],[1,2],[0,3],[1,3],[7,1]];
  const spots = seed === 0 ? spots0 : spots1;
  spots.forEach(([sx, sy]) => ctx.fillRect(cx + sx, cy + sy, 1, 1));

  // Spot edge shading
  ctx.fillStyle = seed === 0 ? '#5a3018' : '#6a3a20';
  const edges0 = [[0,0],[3,1],[6,1],[7,2]];
  const edges1 = [[2,0],[5,1],[2,2],[1,3]];
  const edges = seed === 0 ? edges0 : edges1;
  edges.forEach(([sx, sy]) => ctx.fillRect(cx + sx, cy + sy, 1, 1));

  // Head (bigger, more detail)
  ctx.fillStyle = bodyBase;
  ctx.fillRect(cx + 8, cy + 1, 3, 3);
  // Face shading
  ctx.fillStyle = '#e0d0c0';
  ctx.fillRect(cx + 9, cy + 2, 2, 2);
  // Muzzle (pink/tan)
  ctx.fillStyle = '#d0a8a0';
  ctx.fillRect(cx + 10, cy + 3, 1, 1);
  ctx.fillRect(cx + 10, cy + 2, 1, 1);
  // Nostrils
  ctx.fillStyle = '#a08080';
  ctx.fillRect(cx + 10, cy + 3, 1, 1);
  // Eye
  ctx.fillStyle = '#1a0808';
  ctx.fillRect(cx + 9, cy + 1, 1, 1);
  // Eye highlight
  ctx.fillStyle = '#f0f0f0';
  // Ears (floppy)
  ctx.fillStyle = '#e0d0c0';
  ctx.fillRect(cx + 8, cy, 1, 1);
  ctx.fillRect(cx + 10, cy, 1, 1);
  ctx.fillStyle = '#d0b8a8';
  ctx.fillRect(cx + 8, cy - 1, 1, 1);
  ctx.fillRect(cx + 10, cy - 1, 1, 1);
  // Horns (tiny)
  ctx.fillStyle = '#c8c0a0';
  ctx.fillRect(cx + 9, cy - 1, 1, 1);

  // Jaw chewing animation
  if (chew) {
    ctx.fillStyle = '#d0a8a0';
    ctx.fillRect(cx + 10, cy + 4, 1, 1);
  }

  // Legs (thicker, with knee detail)
  ctx.fillStyle = bodyBase;
  ctx.fillRect(cx + 1, cy + 5, 1, 1);
  ctx.fillRect(cx + 2, cy + 5, 1, 1);
  ctx.fillRect(cx + 6, cy + 5, 1, 1);
  ctx.fillRect(cx + 7, cy + 5, 1, 1);
  ctx.fillStyle = '#d8d0c0';
  ctx.fillRect(cx + 1, cy + 6, 1, 1);
  ctx.fillRect(cx + 2, cy + 6, 1, 1);
  ctx.fillRect(cx + 6, cy + 6, 1, 1);
  ctx.fillRect(cx + 7, cy + 6, 1, 1);
  // Hooves
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(cx + 1, cy + 7, 1, 1);
  ctx.fillRect(cx + 2, cy + 7, 1, 1);
  ctx.fillRect(cx + 6, cy + 7, 1, 1);
  ctx.fillRect(cx + 7, cy + 7, 1, 1);

  // Udder (subtle)
  ctx.fillStyle = '#e0b0b0';
  ctx.fillRect(cx + 4, cy + 5, 2, 1);

  // Tail (animated, thicker tuft)
  const tailX = cx - 1 + Math.round(tailSwish);
  ctx.fillStyle = '#d0c0b0';
  ctx.fillRect(tailX, cy + 1, 1, 1);
  ctx.fillRect(tailX, cy + 2, 1, 1);
  ctx.fillStyle = '#8a6040';
  ctx.fillRect(tailX - 1, cy, 1, 1);
  ctx.fillRect(tailX, cy, 1, 1);
  ctx.fillRect(tailX + 1, cy, 1, 1);
}

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Ground — lush grass with variation and dirt patches
  for (let dy = 0; dy < 32; dy++) for (let dx = 0; dx < 40; dx++) {
    const n1 = ((dx * 7 + dy * 13) % 11);
    const n2 = ((dx * 3 + dy * 5) % 7);
    const dirtPatch = ((dx - 20) * (dx - 20) + (dy - 18) * (dy - 18)) < 25;
    if (dirtPatch) {
      ctx.fillStyle = n2 < 2 ? '#7a6a40' : '#8a7a50';
    } else {
      ctx.fillStyle = n1 < 2 ? '#4a8a28' : n1 < 5 ? '#5a9a30' : n1 < 8 ? '#4a8028' : '#5a8a2c';
    }
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Grass tufts scattered inside pen
  for (let i = 0; i < 8; i++) {
    const gx = x + 5 + ((i * 13 + 3) % 30);
    const gy = y + 8 + ((i * 11 + 5) % 20);
    ctx.fillStyle = '#6aaa40';
    ctx.fillRect(gx, gy, 1, 1);
    ctx.fillStyle = '#5a9a30';
    ctx.fillRect(gx - 1, gy + 1, 1, 1);
    ctx.fillRect(gx + 1, gy + 1, 1, 1);
    ctx.fillStyle = '#7aba50';
    ctx.fillRect(gx, gy - 1, 1, 1);
  }

  // === Wooden post-and-rail fence ===
  // Top fence
  for (let dx = 0; dx < 40; dx += 8) {
    // Thick fence posts (dark brown)
    for (let py = 0; py < 6; py++) {
      ctx.fillStyle = py === 0 ? '#4a2a18' : '#5a3a20';
      ctx.fillRect(x + dx, y + py, 2, 1);
      // Post cap highlight
      if (py === 0) {
        ctx.fillStyle = '#6a4a30';
        ctx.fillRect(x + dx, y, 2, 1);
      }
      // Post shadow
      ctx.fillStyle = '#4a2a18';
      ctx.fillRect(x + dx + 2, y + py + 1, 1, 1);
    }
  }
  // Horizontal rails (top fence)
  for (let dx = 0; dx < 40; dx++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + dx, y + 2, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + dx, y + 4, 1, 1);
    // Rail highlight
    if (dx % 4 === 0) {
      ctx.fillStyle = '#9a7a58';
      ctx.fillRect(x + dx, y + 2, 1, 1);
    }
  }

  // Left fence
  for (let dy = 0; dy < 32; dy += 8) {
    for (let py = 0; py < 6 && dy + py < 32; py++) {
      ctx.fillStyle = py === 0 ? '#4a2a18' : '#5a3a20';
      ctx.fillRect(x, y + dy + py, 2, 1);
    }
  }
  for (let dy = 0; dy < 32; dy++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + 2, y + dy, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + 3, y + dy, 1, 1);
  }

  // Right fence
  for (let dy = 0; dy < 32; dy += 8) {
    for (let py = 0; py < 6 && dy + py < 32; py++) {
      ctx.fillStyle = py === 0 ? '#4a2a18' : '#5a3a20';
      ctx.fillRect(x + 38, y + dy + py, 2, 1);
    }
  }
  for (let dy = 0; dy < 32; dy++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + 36, y + dy, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + 37, y + dy, 1, 1);
  }

  // Bottom fence (partial — gate area open in middle)
  for (let dx = 0; dx < 14; dx++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + dx, y + 29, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + dx, y + 31, 1, 1);
  }
  for (let dx = 26; dx < 40; dx++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + dx, y + 29, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + dx, y + 31, 1, 1);
  }
  // Gate posts
  for (let py = 0; py < 4; py++) {
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(x + 13, y + 28 + py, 2, 1);
    ctx.fillRect(x + 25, y + 28 + py, 2, 1);
  }

  // Water trough (more detailed)
  // Trough body
  ctx.fillStyle = '#405058';
  for (let dx = 0; dx < 9; dx++) {
    ctx.fillRect(x + 5 + dx, y + 23, 1, 1);
    ctx.fillRect(x + 5 + dx, y + 26, 1, 1);
  }
  for (let dy = 23; dy < 27; dy++) {
    ctx.fillRect(x + 5, y + dy, 1, 1);
    ctx.fillRect(x + 13, y + dy, 1, 1);
  }
  // Inside darker
  ctx.fillStyle = '#2a3a40';
  for (let dx = 1; dx < 8; dx++) ctx.fillRect(x + 5 + dx, y + 24, 1, 1);
  // Water surface
  ctx.fillStyle = '#3080b0';
  for (let dx = 1; dx < 8; dx++) ctx.fillRect(x + 5 + dx, y + 24, 1, 1);
  // Water highlight/ripple
  const ripple = Math.sin(ts * 0.003) * 0.5;
  ctx.fillStyle = '#50a0d0';
  ctx.fillRect(x + 7 + Math.round(ripple), y + 24, 2, 1);
  // Trough legs
  ctx.fillStyle = '#506068';
  ctx.fillRect(x + 6, y + 27, 1, 1);
  ctx.fillRect(x + 12, y + 27, 1, 1);

  // Hay bale (rounder, more detailed)
  // Main bale body
  ctx.fillStyle = '#c0a040';
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 6; dx++) {
    const round = (dx === 0 || dx === 5) && (dy === 0 || dy === 3);
    if (!round) ctx.fillRect(x + 30 + dx, y + 24 + dy, 1, 1);
  }
  // Bale stripes (binding)
  ctx.fillStyle = '#a08830';
  ctx.fillRect(x + 31, y + 25, 4, 1);
  // Highlight
  ctx.fillStyle = '#d8c060';
  ctx.fillRect(x + 32, y + 24, 2, 1);
  // Straw bits
  ctx.fillStyle = '#d8c860';
  ctx.fillRect(x + 36, y + 26, 1, 1);
  ctx.fillRect(x + 36, y + 25, 1, 1);
  ctx.fillStyle = '#c8b850';
  ctx.fillRect(x + 29, y + 27, 1, 1);
  ctx.fillRect(x + 30, y + 28, 1, 1);

  // Cows (two spotted cows)
  drawCow(ctx, x + 6, y + 8, ts, 0);
  drawCow(ctx, x + 20, y + 13, ts, 1);
}

registry.register(def, draw);
