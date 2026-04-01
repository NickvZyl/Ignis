import { registry } from '../registry';
import type { FurnitureDef, FurnitureGlowFn } from '../types';

export const def: FurnitureDef = {
  id: 'chicken_coop', label: 'Chicken Coop', gridW: 4, gridH: 3,
  spotDx: 2, spotDy: 3, canOverlapWall: false, drawKey: 'chicken_coop',
  category: 'nature', tags: ['animals'],
  scene: 'garden',
  hiResSprites: { 0: '/furniture/chicken_coop-front-clean.png' },
};

function drawChicken(ctx: CanvasRenderingContext2D, cx: number, cy: number, ts: number, seed: number) {
  // Animated peck/bob cycle
  const phase = Math.sin(ts * 0.004 + seed * 2.5);
  const pecking = phase > 0.6;
  const headY = pecking ? cy + 1 : cy - 1;
  const headX = cx;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(cx, cy + 4, 3, 1);

  // Tail feathers (behind body)
  const isWhite = seed % 3 === 0;
  const isRed = seed % 3 === 1;
  ctx.fillStyle = isWhite ? '#d8d0c0' : isRed ? '#8a4820' : '#6a4018';
  ctx.fillRect(cx - 1, cy, 1, 1);
  ctx.fillRect(cx - 1, cy - 1, 1, 1);
  ctx.fillStyle = isWhite ? '#c8c0b0' : isRed ? '#7a3818' : '#5a3010';
  ctx.fillRect(cx - 2, cy - 1, 1, 1);

  // Body
  ctx.fillStyle = isWhite ? '#e8e0d0' : isRed ? '#a06830' : '#7a5028';
  ctx.fillRect(cx, cy, 3, 2);
  ctx.fillRect(cx + 1, cy + 2, 2, 1);
  // Body shading
  ctx.fillStyle = isWhite ? '#f0e8d8' : isRed ? '#b07838' : '#8a6030';
  ctx.fillRect(cx + 1, cy, 2, 1);
  // Wing detail
  ctx.fillStyle = isWhite ? '#d0c8b8' : isRed ? '#905828' : '#6a4020';
  ctx.fillRect(cx, cy + 1, 1, 1);
  ctx.fillRect(cx + 1, cy + 1, 1, 1);
  // Wing highlight
  ctx.fillStyle = isWhite ? '#e0d8c8' : isRed ? '#b87040' : '#8a5830';
  ctx.fillRect(cx + 1, cy + 1, 1, 1);

  // Breast (lighter)
  ctx.fillStyle = isWhite ? '#f0ece0' : isRed ? '#c08848' : '#9a7040';
  ctx.fillRect(cx + 2, cy + 1, 1, 1);

  // Head
  ctx.fillStyle = isWhite ? '#e8e0d0' : isRed ? '#b07838' : '#8a6030';
  ctx.fillRect(headX + 1, headY, 2, 1);

  // Eye
  ctx.fillStyle = '#1a0808';
  ctx.fillRect(headX + 2, headY, 1, 1);

  // Beak (longer, two-tone)
  ctx.fillStyle = '#e8a020';
  ctx.fillRect(headX + 3, headY, 1, 1);
  if (pecking) {
    ctx.fillStyle = '#d09018';
    ctx.fillRect(headX + 3, headY + 1, 1, 1);
  }

  // Comb (red, bigger)
  ctx.fillStyle = '#cc3030';
  ctx.fillRect(headX + 1, headY - 1, 1, 1);
  ctx.fillRect(headX + 2, headY - 1, 1, 1);
  // Wattle
  ctx.fillStyle = '#cc3030';
  ctx.fillRect(headX + 2, headY + 1, 1, 1);

  // Legs
  ctx.fillStyle = '#d89030';
  ctx.fillRect(cx + 1, cy + 3, 1, 1);
  ctx.fillRect(cx + 2, cy + 3, 1, 1);
  // Feet (small toes)
  ctx.fillStyle = '#c88028';
  ctx.fillRect(cx, cy + 4, 1, 1);
  ctx.fillRect(cx + 1, cy + 4, 1, 1);
  ctx.fillRect(cx + 2, cy + 4, 1, 1);
  ctx.fillRect(cx + 3, cy + 4, 1, 1);
}

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // === Coop structure (peaked roof with overhang, plank walls) ===
  // Roof — peaked with overhang, darker wood with ridge detail
  for (let dy = 0; dy < 6; dy++) {
    const overhang = 2;
    const leftEdge = 0 - overhang + dy;
    const rightEdge = 20 + overhang - dy;
    for (let dx = leftEdge; dx <= rightEdge; dx++) {
      if (dx < -2 || dx > 22) continue;
      // Shingle texture
      const shingleRow = dy;
      const shingleOff = (dx + shingleRow * 3) % 4;
      ctx.fillStyle = shingleRow < 2 ? '#5a3018' :
        shingleOff === 0 ? '#6a3a20' : shingleOff === 1 ? '#7a4a28' : '#704020';
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }
  // Ridge cap
  ctx.fillStyle = '#4a2a18';
  for (let dx = 4; dx < 16; dx++) ctx.fillRect(x + dx, y, 1, 1);
  // Roof overhang shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let dx = -1; dx < 21; dx++) {
    if (dx >= -1 && dx <= 21) ctx.fillRect(x + dx, y + 6, 1, 1);
  }

  // Walls — horizontal planks with visible grain
  for (let dy = 6; dy < 14; dy++) for (let dx = 1; dx < 19; dx++) {
    const plankIndex = Math.floor((dy - 6) / 2);
    const plankEven = plankIndex % 2 === 0;
    const grain = (dx * 7 + dy * 3) % 5;
    ctx.fillStyle = plankEven
      ? (grain === 0 ? '#8a6238' : grain === 1 ? '#9a7248' : '#8e6840')
      : (grain === 0 ? '#7a5830' : grain === 1 ? '#8a6840' : '#846038');
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Plank seams (horizontal lines between planks)
  for (let planky = 8; planky < 14; planky += 2) {
    for (let dx = 1; dx < 19; dx++) {
      ctx.fillStyle = '#5a3820';
      ctx.fillRect(x + dx, y + planky, 1, 1);
    }
  }
  // Vertical plank joins
  for (let dy = 6; dy < 14; dy++) {
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(x + 5, y + dy, 1, 1);
    ctx.fillRect(x + 14, y + dy, 1, 1);
  }

  // Door opening (darker interior)
  for (let dy = 8; dy < 14; dy++) for (let dx = 7; dx < 13; dx++) {
    const depth = ((dx - 7) + (dy - 8)) % 3;
    ctx.fillStyle = depth === 0 ? '#1a0808' : depth === 1 ? '#2a1808' : '#221410';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Door frame (thicker)
  ctx.fillStyle = '#5a3a20';
  for (let dy = 7; dy < 14; dy++) {
    ctx.fillRect(x + 6, y + dy, 1, 1);
    ctx.fillRect(x + 13, y + dy, 1, 1);
  }
  for (let dx = 6; dx < 14; dx++) ctx.fillRect(x + dx, y + 7, 1, 1);
  // Door frame highlight
  ctx.fillStyle = '#7a5a38';
  for (let dx = 7; dx < 13; dx++) ctx.fillRect(x + dx, y + 7, 1, 1);
  // Ramp from door
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(x + 8, y + 14, 4, 1);
  ctx.fillStyle = '#8a6a48';
  ctx.fillRect(x + 7, y + 15, 6, 1);
  // Ramp ridges
  ctx.fillStyle = '#6a4a30';
  ctx.fillRect(x + 8, y + 15, 1, 1);
  ctx.fillRect(x + 10, y + 15, 1, 1);
  ctx.fillRect(x + 12, y + 15, 1, 1);

  // Nesting box on side (with peaked mini-roof)
  // Mini roof
  ctx.fillStyle = '#5a3018';
  ctx.fillRect(x + 17, y + 5, 6, 1);
  ctx.fillStyle = '#6a3a20';
  ctx.fillRect(x + 18, y + 6, 5, 1);
  // Box walls
  for (let dy = 7; dy < 12; dy++) for (let dx = 18; dx < 23; dx++) {
    ctx.fillStyle = ((dx + dy) % 3) === 0 ? '#7a5830' : '#8a6238';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  // Nesting opening
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(x + 19, y + 8, 3, 3);
  // Straw in nesting box
  ctx.fillStyle = '#d8c060';
  ctx.fillRect(x + 19, y + 10, 3, 1);
  ctx.fillRect(x + 20, y + 9, 2, 1);
  // Egg
  ctx.fillStyle = '#f0e8d0';
  ctx.fillRect(x + 20, y + 10, 1, 1);
  ctx.fillStyle = '#e8e0c8';
  ctx.fillRect(x + 21, y + 10, 1, 1);

  // Ground area (dirt/straw with more variation)
  for (let dy = 14; dy < 24; dy++) for (let dx = 0; dx < 32; dx++) {
    const n = ((dx * 3 + dy * 7) % 11);
    const n2 = ((dx * 11 + dy * 5) % 7);
    ctx.fillStyle = n < 2 ? '#c8b060' : n < 4 ? '#b0a050' : n2 < 2 ? '#8a7a48' : '#9a8a50';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Chicken wire/mesh hint on yard area (subtle dots)
  for (let dy = 16; dy < 24; dy += 2) {
    for (let dx = 0; dx < 32; dx += 2) {
      const meshDot = ((dx + dy) % 4) === 0;
      if (meshDot) {
        ctx.fillStyle = 'rgba(150,150,150,0.12)';
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }

  // Fence around yard (post and wire style)
  // Fence posts
  for (let dx = 0; dx < 32; dx += 6) {
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(x + dx, y + 14, 1, 4);
    ctx.fillStyle = '#6a4a30';
    ctx.fillRect(x + dx, y + 14, 1, 1); // cap
  }
  // Wire/rail lines
  for (let dx = 0; dx < 32; dx++) {
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(x + dx, y + 15, 1, 1);
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + dx, y + 17, 1, 1);
  }

  // Scattered grain on the ground
  for (let i = 0; i < 10; i++) {
    const gx = x + 2 + ((i * 13 + 7) % 28);
    const gy = y + 18 + ((i * 7 + 3) % 5);
    ctx.fillStyle = i % 2 === 0 ? '#e0c850' : '#d0b840';
    ctx.fillRect(gx, gy, 1, 1);
  }
  // Small seed pile near bowl
  ctx.fillStyle = '#e0c850';
  ctx.fillRect(x + 13, y + 20, 1, 1);
  ctx.fillRect(x + 14, y + 20, 1, 1);
  ctx.fillRect(x + 14, y + 21, 1, 1);

  // Chickens (3 animated, different colors)
  drawChicken(ctx, x + 4, y + 18, ts, 0);   // white
  drawChicken(ctx, x + 16, y + 17, ts, 1);   // red/brown
  drawChicken(ctx, x + 24, y + 19, ts, 2);   // dark brown

  // Food bowl (more detailed)
  ctx.fillStyle = '#606060';
  ctx.fillRect(x + 11, y + 21, 5, 1);
  ctx.fillStyle = '#707070';
  ctx.fillRect(x + 10, y + 22, 7, 1);
  // Bowl rim highlight
  ctx.fillStyle = '#808080';
  ctx.fillRect(x + 11, y + 21, 1, 1);
  ctx.fillRect(x + 15, y + 21, 1, 1);
  // Seeds in bowl
  ctx.fillStyle = '#d8c060';
  ctx.fillRect(x + 12, y + 21, 3, 1);

  // Small feather on ground
  ctx.fillStyle = '#e0d8c8';
  ctx.fillRect(x + 27, y + 21, 1, 1);
  ctx.fillRect(x + 28, y + 22, 1, 1);
}

export const glow: FurnitureGlowFn = (gctx, x, y, ts, scale, isNight) => {
  if (!isNight) return;
  // Warm lantern glow from coop
  const lx = (x + 9) * scale, ly = (y + 10) * scale;
  const g = gctx.createRadialGradient(lx, ly, 0, lx, ly, 40);
  g.addColorStop(0, 'rgba(255,180,60,0.15)');
  g.addColorStop(0.6, 'rgba(255,140,40,0.05)');
  g.addColorStop(1, 'rgba(255,100,20,0)');
  gctx.fillStyle = g;
  gctx.fillRect(lx - 40, ly - 40, 80, 80);
};

registry.register(def, draw, glow);
