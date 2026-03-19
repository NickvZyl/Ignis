import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'desk', label: 'Desk', gridW: 5, gridH: 5,
  spotDx: 2, spotDy: 5, canOverlapWall: true, drawKey: 'desk',
  category: 'surface', tags: ['work'],
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Desk surface
  for (let dy=0;dy<4;dy++) for (let dx=0;dx<36;dx++) {
    ctx.fillStyle = dy===0 ? '#b08050' : '#9a6840';
    ctx.fillRect(x+2+dx, y+14+dy, 1, 1);
  }
  // Desk front
  for (let dy=0;dy<8;dy++) for (let dx=0;dx<36;dx++) {
    ctx.fillStyle = dx===0||dx===35 ? '#6a4020' : '#7a5028';
    ctx.fillRect(x+2+dx, y+18+dy, 1, 1);
  }
  // Legs
  [[x+3,y+26],[x+36,y+26]].forEach(([lx,ly]) => {
    for (let d=0;d<4;d++) { ctx.fillStyle='#5a3818';ctx.fillRect(lx,ly+d,2,1); }
  });
  // Monitor
  for (let dy=0;dy<10;dy++) for (let dx=0;dx<14;dx++) {
    ctx.fillStyle = (dx===0||dx===13||dy===0||dy===9) ? '#444' : '#1a2a3a';
    ctx.fillRect(x+13+dx, y+3+dy, 1, 1);
  }
  // Screen content flicker
  const flick = Math.sin(ts*0.003) > 0;
  if (flick) {
    for (let dx=2;dx<12;dx+=2) { ctx.fillStyle='#4a8aaa';ctx.fillRect(x+13+dx,y+5,1,1); }
    for (let dx=1;dx<10;dx+=3) { ctx.fillStyle='#3a7a6a';ctx.fillRect(x+13+dx,y+7,2,1); }
  } else {
    for (let dx=1;dx<11;dx+=2) { ctx.fillStyle='#5a9aba';ctx.fillRect(x+13+dx,y+6,1,1); }
    for (let dx=2;dx<12;dx+=3) { ctx.fillStyle='#4a8a5a';ctx.fillRect(x+13+dx,y+8,2,1); }
  }
  // Monitor stand
  ctx.fillStyle='#555';ctx.fillRect(x+19,y+13,3,2);
  // Keyboard
  for (let dx=0;dx<10;dx++) { ctx.fillStyle=(dx%2===0)?'#666':'#555';ctx.fillRect(x+15+dx,y+16,1,1); }
  // Chair
  for (let dy=0;dy<6;dy++) for (let dx=0;dx<10;dx++) {
    ctx.fillStyle = dy<2 ? '#8a5030' : '#7a4428';
    ctx.fillRect(x+15+dx, y+30+dy, 1, 1);
  }
}

export function glow(gctx: CanvasRenderingContext2D, x: number, y: number, _ts: number, scale: number) {
  const monGx = (x+20)*scale, monGy = (y+8)*scale;
  const mg = gctx.createRadialGradient(monGx,monGy,0,monGx,monGy,30);
  mg.addColorStop(0,'rgba(80,160,200,0.1)');
  mg.addColorStop(1,'rgba(80,160,200,0)');
  gctx.fillStyle=mg;
  gctx.fillRect(monGx-30,monGy-30,60,60);
}

registry.register(def, draw, glow);
