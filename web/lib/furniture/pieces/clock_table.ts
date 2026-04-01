import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'clock_table', label: 'Clock', gridW: 3, gridH: 3,
  spotDx: -1, spotDy: 1, canOverlapWall: false, drawKey: 'clock_table',
  category: 'surface', tags: ['timekeeping'],
  hiResSprites: { 0: '/furniture/clock_table-front-clean.png' },
};

// checkinRemaining is injected via the extra context system
let _checkinRemaining: number | null = null;
export function setCheckinRemaining(v: number | null) { _checkinRemaining = v; }

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Table top
  for (let dx=0;dx<16;dx++) {
    ctx.fillStyle = '#9a7040'; ctx.fillRect(x+1+dx, y, 1, 1);
    ctx.fillStyle = '#7a5028'; ctx.fillRect(x+1+dx, y+1, 1, 2);
  }
  // Front face
  for (let dy=3;dy<8;dy++) for (let dx=0;dx<16;dx++) {
    ctx.fillStyle = dx===0||dx===15 ? '#5a3818' : '#7a5028';
    ctx.fillRect(x+1+dx, y+dy, 1, 1);
  }
  // Legs
  ctx.fillStyle='#5a3818';
  for (let dy=8;dy<12;dy++) { ctx.fillRect(x+2,y+dy,2,1); ctx.fillRect(x+14,y+dy,2,1); }

  // Clock body
  const cx = x + 9, cy = y - 5;
  const clockPixels = [
    [0,0,1,1,1,0,0],
    [0,1,1,1,1,1,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [0,1,1,1,1,1,0],
    [0,0,1,1,1,0,0],
  ];
  clockPixels.forEach((row, ry) => row.forEach((v, rx) => {
    if (!v) return;
    const isEdge = ry===0||ry===6||rx===0||rx===6||(ry===1&&(rx===0||rx===6))||(ry===5&&(rx===0||rx===6));
    ctx.fillStyle = isEdge ? '#8a7060' : '#f0e8d8';
    ctx.fillRect(cx-3+rx, cy+ry, 1, 1);
  }));

  // Clock hands
  const now = new Date();
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(cx, cy+3, 1, 1);
  const hAngle = Math.round((h + m/60) / 3) % 4;
  ctx.fillStyle = '#2a2a2a';
  if (hAngle === 0) ctx.fillRect(cx, cy+2, 1, 1);
  else if (hAngle === 1) ctx.fillRect(cx+1, cy+3, 1, 1);
  else if (hAngle === 2) ctx.fillRect(cx, cy+4, 1, 1);
  else ctx.fillRect(cx-1, cy+3, 1, 1);
  const mAngle = Math.round(m / 7.5) % 8;
  ctx.fillStyle = '#1a1a1a';
  const mDirs = [[0,-2],[1,-1],[2,0],[1,1],[0,2],[-1,1],[-2,0],[-1,-1]];
  const [mdx, mdy] = mDirs[mAngle];
  ctx.fillRect(cx+mdx, cy+3+mdy, 1, 1);
  // Stand
  ctx.fillStyle = '#6a5040'; ctx.fillRect(cx-1, cy+7, 3, 1);
  ctx.fillStyle = '#7a6050'; ctx.fillRect(cx, cy+7, 1, 1);

  // Timer indicator
  const checkinRemaining = _checkinRemaining;
  if (checkinRemaining !== null && checkinRemaining > 0) {
    const pulse = Math.sin(ts * 0.005) * 0.5 + 0.5;
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fillStyle = '#D94F3D';
    ctx.fillRect(cx+3, cy, 1, 1);
    ctx.globalAlpha = 1;
    const labelX = x + 4;
    const labelY = y + 13;
    const maxDots = 8;
    const filledDots = Math.min(maxDots, Math.ceil(checkinRemaining / 120));
    for (let i = 0; i < maxDots; i++) {
      ctx.fillStyle = i < filledDots ? '#D94F3D' : '#3a2818';
      ctx.fillRect(labelX + i * 2, labelY, 1, 1);
    }
  }
}

registry.register(def, draw);
