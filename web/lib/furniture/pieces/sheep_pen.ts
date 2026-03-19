import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'sheep_pen', label: 'Sheep Pen', gridW: 4, gridH: 3,
  spotDx: 2, spotDy: 3, canOverlapWall: false, drawKey: 'sheep_pen',
  category: 'nature', tags: ['animals'],
  scene: 'garden',
};

function drawSheep(ctx: CanvasRenderingContext2D, cx: number, cy: number, ts: number, seed: number, flip: boolean) {
  // Wool puff animation — body grows/shrinks slightly
  const puff = Math.sin(ts * 0.002 + seed * 4) * 0.5;
  const woolSize = puff > 0 ? 1 : 0;
  const dir = flip ? -1 : 1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let dx = 0; dx < 7; dx++) ctx.fillRect(cx + dx, cy + 6 + woolSize, 1, 1);

  // Wool body (fluffy cloud shape) — richer texture
  for (let dy = 0; dy < 4 + woolSize; dy++) for (let dx = 0; dx < 7; dx++) {
    const isCorner = (dx === 0 || dx === 6) && (dy === 0 || dy === 3 + woolSize);
    if (!isCorner) {
      // Wool texture variation
      const n = ((dx * 5 + dy * 7 + seed * 3) % 4);
      ctx.fillStyle = n < 1 ? '#e8e4d8' : n < 2 ? '#f0ece0' : n < 3 ? '#f4f0e8' : '#eae6da';
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }

  // Extra fluff lumps on top (cloud-like)
  ctx.fillStyle = '#f0ece0';
  ctx.fillRect(cx + 1, cy - 1, 5, 1);
  ctx.fillStyle = '#f4f0e8';
  ctx.fillRect(cx + 2, cy - 2, 3, 1);
  // Side fluff
  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(cx - 1, cy + 1, 1, 2);
  ctx.fillRect(cx + 7, cy + 1, 1, 2);

  // Wool shading (bottom darker)
  ctx.fillStyle = '#d8d4c8';
  for (let dx = 1; dx < 6; dx++) ctx.fillRect(cx + dx, cy + 3 + woolSize, 1, 1);

  // Head (dark face, positioned based on flip)
  const headX = flip ? cx - 2 : cx + 7;
  ctx.fillStyle = '#3a3028';
  ctx.fillRect(headX, cy + 1, 2, 2);
  ctx.fillRect(headX + dir, cy + 2, 1, 1);
  // Muzzle lighter
  ctx.fillStyle = '#4a4038';
  ctx.fillRect(headX + (flip ? 0 : 1), cy + 2, 1, 1);

  // Eye (white dot + blink)
  const blink = Math.sin(ts * 0.001 + seed * 7) > 0.95;
  const eyeX = flip ? headX : headX + 1;
  if (!blink) {
    ctx.fillStyle = '#f0f0e0';
    ctx.fillRect(eyeX, cy + 1, 1, 1);
    ctx.fillStyle = '#1a0808';
    ctx.fillRect(eyeX, cy + 1, 1, 1);
  } else {
    ctx.fillStyle = '#3a3028';
    ctx.fillRect(eyeX, cy + 1, 1, 1);
  }

  // Ears (floppy)
  ctx.fillStyle = '#4a3a30';
  ctx.fillRect(headX, cy, 1, 1);
  ctx.fillRect(headX + 1, cy, 1, 1);
  ctx.fillStyle = '#d0b8a0';
  ctx.fillRect(headX + (flip ? 1 : 0), cy - 1, 1, 1);

  // Legs (dark, thin)
  ctx.fillStyle = '#3a3028';
  ctx.fillRect(cx + 1, cy + 4 + woolSize, 1, 2);
  ctx.fillRect(cx + 2, cy + 4 + woolSize, 1, 2);
  ctx.fillRect(cx + 5, cy + 4 + woolSize, 1, 2);
  ctx.fillRect(cx + 4, cy + 4 + woolSize, 1, 2);
  // Tiny hooves
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(cx + 1, cy + 6 + woolSize, 1, 1);
  ctx.fillRect(cx + 2, cy + 6 + woolSize, 1, 1);
  ctx.fillRect(cx + 4, cy + 6 + woolSize, 1, 1);
  ctx.fillRect(cx + 5, cy + 6 + woolSize, 1, 1);

  // Tiny tail puff
  const tailX = flip ? cx + 7 : cx - 1;
  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(tailX, cy + 1, 1, 1);
}

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Grassy ground with variation
  for (let dy = 0; dy < 24; dy++) for (let dx = 0; dx < 32; dx++) {
    const n = ((dx * 7 + dy * 11) % 9);
    const clover = ((dx * 13 + dy * 17) % 23) < 2;
    ctx.fillStyle = clover ? '#6aaa40' : n < 3 ? '#5a9a30' : n < 6 ? '#4a8a28' : '#4a8020';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Hay/straw scattered on ground
  for (let i = 0; i < 12; i++) {
    const sx = x + 3 + ((i * 17 + 5) % 26);
    const sy = y + 4 + ((i * 11 + 3) % 16);
    ctx.fillStyle = i % 3 === 0 ? '#d8c060' : '#c8b050';
    ctx.fillRect(sx, sy, 1, 1);
    if (i % 2 === 0) ctx.fillRect(sx + 1, sy, 1, 1);
  }
  // Small straw pile in corner
  ctx.fillStyle = '#c8b050';
  ctx.fillRect(x + 3, y + 18, 3, 2);
  ctx.fillStyle = '#d8c060';
  ctx.fillRect(x + 4, y + 17, 2, 1);
  ctx.fillStyle = '#b8a040';
  ctx.fillRect(x + 3, y + 19, 3, 1);

  // === Wooden post-and-rail fence (matching cow pen style) ===
  // Top fence
  for (let dx = 0; dx < 32; dx += 8) {
    // Fence posts
    for (let py = 0; py < 5; py++) {
      ctx.fillStyle = py === 0 ? '#4a2a18' : '#5a3a20';
      ctx.fillRect(x + dx, y + py, 2, 1);
    }
    // Post cap
    ctx.fillStyle = '#6a4a30';
    ctx.fillRect(x + dx, y, 2, 1);
    // Post shadow
    ctx.fillStyle = '#4a2a18';
    ctx.fillRect(x + dx + 2, y + 1, 1, 1);
  }
  // Top horizontal rails
  for (let dx = 0; dx < 32; dx++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + dx, y + 1, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + dx, y + 3, 1, 1);
    if (dx % 5 === 0) {
      ctx.fillStyle = '#9a7a58';
      ctx.fillRect(x + dx, y + 1, 1, 1);
    }
  }

  // Left fence
  for (let dy = 0; dy < 24; dy += 8) {
    for (let py = 0; py < 5 && dy + py < 24; py++) {
      ctx.fillStyle = py === 0 ? '#4a2a18' : '#5a3a20';
      ctx.fillRect(x, y + dy + py, 2, 1);
    }
  }
  for (let dy = 0; dy < 24; dy++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + 2, y + dy, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + 3, y + dy, 1, 1);
  }

  // Right fence
  for (let dy = 0; dy < 24; dy += 8) {
    for (let py = 0; py < 5 && dy + py < 24; py++) {
      ctx.fillStyle = py === 0 ? '#4a2a18' : '#5a3a20';
      ctx.fillRect(x + 30, y + dy + py, 2, 1);
    }
  }
  for (let dy = 0; dy < 24; dy++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + 28, y + dy, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + 29, y + dy, 1, 1);
  }

  // Bottom fence
  for (let dx = 0; dx < 32; dx++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + dx, y + 21, 1, 1);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + dx, y + 23, 1, 1);
  }
  for (let dx = 0; dx < 32; dx += 8) {
    for (let py = 0; py < 4; py++) {
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(x + dx, y + 20 + py, 2, 1);
    }
  }

  // Two sheep
  drawSheep(ctx, x + 5, y + 7, ts, 0, false);
  drawSheep(ctx, x + 17, y + 10, ts, 1, true);

  // Grass tufts inside pen
  for (let i = 0; i < 6; i++) {
    const gx = x + 5 + ((i * 11) % 22);
    const gy = y + 15 + ((i * 7) % 5);
    ctx.fillStyle = '#6aaa40';
    ctx.fillRect(gx, gy, 1, 1);
    ctx.fillRect(gx + 1, gy - 1, 1, 1);
    ctx.fillStyle = '#7aba50';
    ctx.fillRect(gx + 2, gy, 1, 1);
  }
}

registry.register(def, draw);
