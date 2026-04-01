import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'farm_patch', label: 'Farm Patch', gridW: 4, gridH: 3,
  spotDx: 2, spotDy: 3, canOverlapWall: false, drawKey: 'farm_patch',
  category: 'nature', tags: ['gardening'],
  scene: 'garden',
  hiResSprites: { 0: '/furniture/farm_patch-front-clean.png' },
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Rich soil background with subtle variation
  for (let dy = 0; dy < 24; dy++) for (let dx = 0; dx < 32; dx++) {
    const noise = ((dx * 7 + dy * 13) % 5);
    const edge = dx < 2 || dx > 29 || dy < 2 || dy > 21;
    if (edge) {
      // Wooden plank border
      const plankVar = ((dx + dy * 3) % 4);
      ctx.fillStyle = plankVar < 1 ? '#5a3a20' : plankVar < 2 ? '#6a4a30' : '#7a5a38';
      // Horizontal plank grain on top/bottom
      if (dy < 2 || dy > 21) {
        ctx.fillStyle = (dx % 8 === 0) ? '#4a2a18' : (dx % 8 === 4) ? '#5a3a20' : '#7a5a38';
      }
      // Vertical plank grain on sides
      if (dx < 2 || dx > 29) {
        ctx.fillStyle = (dy % 6 === 0) ? '#4a2a18' : '#6a4a30';
      }
      // Corner nails
      if ((dx < 2 && dy < 2) || (dx > 29 && dy < 2) || (dx < 2 && dy > 21) || (dx > 29 && dy > 21)) {
        ctx.fillStyle = '#8a6a48';
      }
    } else {
      ctx.fillStyle = noise < 1 ? '#4a3018' : noise < 3 ? '#5a3820' : '#6a4828';
    }
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  // Plank border highlight on top edge
  for (let dx = 2; dx < 30; dx++) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + dx, y + 2, 1, 1);
  }

  // Corner pegs (small nails)
  ctx.fillStyle = '#a0a0a0';
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x + 30, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + 22, 1, 1);
  ctx.fillRect(x + 30, y + 22, 1, 1);

  // Tilled rows — 4 rows of crops
  const sway0 = Math.sin(ts * 0.002) * 0.6;

  // Row 1: Carrots (y+3 to y+7)
  for (let dx = 3; dx < 29; dx++) {
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x + dx, y + 3, 1, 1); // dark furrow
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(x + dx, y + 4, 1, 1); // soil mound
    ctx.fillStyle = '#6a4828';
    ctx.fillRect(x + dx, y + 5, 1, 1);
  }
  // Carrots: orange root peeking out + green feathery tops
  for (let c = 0; c < 6; c++) {
    const cx = x + 4 + c * 4 + Math.round(Math.sin(ts * 0.002 + c) * 0.4);
    // Orange carrot top poking from soil
    ctx.fillStyle = '#e07020';
    ctx.fillRect(cx, y + 4, 1, 1);
    ctx.fillStyle = '#d06018';
    ctx.fillRect(cx + 1, y + 4, 1, 1);
    // Green leafy tops (feathery fronds)
    ctx.fillStyle = '#4a9030';
    ctx.fillRect(cx, y + 3, 1, 1);
    ctx.fillRect(cx + 1, y + 3, 1, 1);
    ctx.fillStyle = '#5aaa38';
    ctx.fillRect(cx - 1, y + 2 + Math.round(sway0), 1, 1);
    ctx.fillRect(cx + 1, y + 2 + Math.round(sway0), 1, 1);
    ctx.fillStyle = '#6aba48';
    ctx.fillRect(cx, y + 2, 1, 1);
    ctx.fillRect(cx + 2, y + 2 + Math.round(sway0), 1, 1);
  }

  // Row 2: Tomatoes (y+8 to y+12)
  for (let dx = 3; dx < 29; dx++) {
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x + dx, y + 8, 1, 1);
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(x + dx, y + 9, 1, 1);
    ctx.fillStyle = '#6a4828';
    ctx.fillRect(x + dx, y + 10, 1, 1);
  }
  // Tomato plants: green stems with red fruit
  for (let t = 0; t < 5; t++) {
    const tx = x + 5 + t * 5;
    const sw = Math.sin(ts * 0.002 + t * 1.7) * 0.5;
    // Stem
    ctx.fillStyle = '#3a7020';
    ctx.fillRect(tx + 1, y + 8, 1, 1);
    ctx.fillRect(tx + 1, y + 7, 1, 1);
    ctx.fillStyle = '#4a8028';
    ctx.fillRect(tx + 1, y + 6, 1, 1);
    // Leaves
    ctx.fillStyle = '#5a9a30';
    ctx.fillRect(tx + Math.round(sw), y + 7, 1, 1);
    ctx.fillRect(tx + 2 + Math.round(sw), y + 7, 1, 1);
    ctx.fillStyle = '#4a8a28';
    ctx.fillRect(tx + Math.round(sw), y + 6, 1, 1);
    ctx.fillRect(tx + 2 + Math.round(sw), y + 6, 1, 1);
    // Tomatoes (red dots)
    const ripe = (t + Math.floor(ts * 0.0005)) % 3;
    ctx.fillStyle = ripe === 0 ? '#e03020' : ripe === 1 ? '#d04828' : '#c8e038';
    ctx.fillRect(tx, y + 8, 1, 1);
    ctx.fillStyle = ripe === 0 ? '#cc2818' : '#e04030';
    ctx.fillRect(tx + 2, y + 8, 1, 1);
    // Highlight on tomato
    ctx.fillStyle = '#f06048';
    ctx.fillRect(tx, y + 8, 1, 1);
  }

  // Row 3: Lettuce (y+13 to y+17)
  for (let dx = 3; dx < 29; dx++) {
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x + dx, y + 13, 1, 1);
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(x + dx, y + 14, 1, 1);
    ctx.fillStyle = '#6a4828';
    ctx.fillRect(x + dx, y + 15, 1, 1);
  }
  // Lettuce: leafy round bunches
  for (let l = 0; l < 5; l++) {
    const lx = x + 4 + l * 5;
    const sw = Math.sin(ts * 0.0018 + l * 2.3) * 0.4;
    // Outer leaves
    ctx.fillStyle = '#4a9a28';
    ctx.fillRect(lx, y + 13, 1, 1);
    ctx.fillRect(lx + 3, y + 13, 1, 1);
    ctx.fillRect(lx - 1 + Math.round(sw), y + 12, 1, 1);
    ctx.fillRect(lx + 3 + Math.round(sw), y + 12, 1, 1);
    // Inner leaves (lighter)
    ctx.fillStyle = '#6aba40';
    ctx.fillRect(lx + 1, y + 12, 1, 1);
    ctx.fillRect(lx + 2, y + 12, 1, 1);
    // Center (lightest)
    ctx.fillStyle = '#8aca58';
    ctx.fillRect(lx + 1, y + 11, 1, 1);
    ctx.fillRect(lx + 2, y + 11, 1, 1);
    // Base rosette shape
    ctx.fillStyle = '#5aaa30';
    ctx.fillRect(lx + 1, y + 13, 2, 1);
  }

  // Row 4: Mixed herbs/small plants (y+17 to y+21)
  for (let dx = 3; dx < 29; dx++) {
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x + dx, y + 17, 1, 1);
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(x + dx, y + 18, 1, 1);
    ctx.fillStyle = '#6a4828';
    ctx.fillRect(x + dx, y + 19, 1, 1);
  }
  // Herbs: small varied plants
  for (let h = 0; h < 7; h++) {
    const hx = x + 4 + h * 3 + Math.round(Math.sin(ts * 0.002 + h * 1.5) * 0.3);
    const variety = h % 3;
    if (variety === 0) {
      // Basil-like
      ctx.fillStyle = '#3a7a20';
      ctx.fillRect(hx, y + 18, 1, 1);
      ctx.fillStyle = '#5aaa30';
      ctx.fillRect(hx, y + 17, 1, 1);
      ctx.fillRect(hx - 1, y + 17, 1, 1);
      ctx.fillRect(hx + 1, y + 17, 1, 1);
    } else if (variety === 1) {
      // Parsley-like
      ctx.fillStyle = '#4a8a28';
      ctx.fillRect(hx, y + 18, 1, 1);
      ctx.fillStyle = '#6aba40';
      ctx.fillRect(hx, y + 17, 1, 1);
      ctx.fillRect(hx + 1, y + 16, 1, 1);
      ctx.fillRect(hx - 1, y + 16, 1, 1);
    } else {
      // Tiny flower herb
      ctx.fillStyle = '#4a8a28';
      ctx.fillRect(hx, y + 18, 1, 1);
      ctx.fillStyle = '#5a9a30';
      ctx.fillRect(hx, y + 17, 1, 1);
      ctx.fillStyle = '#e0b0e0';
      ctx.fillRect(hx, y + 16, 1, 1);
    }
  }

  // Watering can in the corner (more detailed)
  // Body
  ctx.fillStyle = '#607880';
  ctx.fillRect(x + 25, y + 19, 4, 3);
  ctx.fillStyle = '#708890';
  ctx.fillRect(x + 26, y + 19, 2, 2);
  // Handle
  ctx.fillStyle = '#506068';
  ctx.fillRect(x + 25, y + 18, 1, 1);
  ctx.fillRect(x + 26, y + 17, 2, 1);
  ctx.fillRect(x + 28, y + 18, 1, 1);
  // Spout
  ctx.fillStyle = '#607880';
  ctx.fillRect(x + 29, y + 19, 1, 1);
  ctx.fillRect(x + 30, y + 18, 1, 1);
  // Spout tip
  ctx.fillStyle = '#708890';
  ctx.fillRect(x + 30, y + 18, 1, 1);
  // Water droplet (animated)
  const drip = Math.sin(ts * 0.005) > 0.7;
  if (drip) {
    ctx.fillStyle = '#60a0d0';
    ctx.fillRect(x + 30, y + 19, 1, 1);
  }
}

registry.register(def, draw);
