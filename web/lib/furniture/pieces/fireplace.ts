import { registry } from '../registry';
import type { FurnitureDef } from '../types';

function animateFireplace(
  ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number, ts: number, rot: number,
) {
  if (rot !== 0) return;
  const f1 = Math.sin(ts * 0.008) * 0.2 + 0.5;
  const f2 = Math.sin(ts * 0.013 + 1.5) * 0.15 + 0.45;
  // Fire glow in hearth
  const cx = dx + dw * 0.50, cy = dy + dh * 0.62, r = dw * 0.12;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5);
  g.addColorStop(0, `rgba(255,200,60,${f1 * 0.5})`);
  g.addColorStop(0.3, `rgba(255,120,20,${f1 * 0.35})`);
  g.addColorStop(0.7, `rgba(255,60,0,${f2 * 0.2})`);
  g.addColorStop(1, 'rgba(200,40,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
  // Candle flickers on mantle
  const cf = Math.sin(ts * 0.012) * 0.2 + 0.6;
  for (const c of [{ x: 0.17, y: 0.06 }, { x: 0.83, y: 0.06 }]) {
    const ccx = dx + dw * c.x, ccy = dy + dh * c.y, cr = dw * 0.02;
    const cg = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, cr * 3);
    cg.addColorStop(0, `rgba(255,200,80,${cf * 0.6})`);
    cg.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(ccx - cr * 3, ccy - cr * 3, cr * 6, cr * 6);
  }
}

export const def: FurnitureDef = {
  id: 'fireplace', label: 'Fireplace', gridW: 6, gridH: 3,
  spotDx: 3, spotDy: 2.5, canOverlapWall: false, drawKey: 'fireplace',
  category: 'decor', tags: ['warmth'],
  hiResSprites: { 0: '/furniture/fireplace-front-clean.png' },
  hiResAnimate: animateFireplace,
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  // Stone surround
  for (let dy=0;dy<20;dy++) for (let dx=0;dx<24;dx++) {
    if (dx>=4&&dx<20&&dy>=4&&dy<18) {
      ctx.fillStyle='#120808';
    } else {
      const mortar = (dx%4===0)||(dy%3===0);
      ctx.fillStyle = mortar ? '#706050' : '#8a7a68';
    }
    ctx.fillRect(x+2+dx, y+2+dy, 1, 1);
  }
  // Mantle
  for (let dx=0;dx<28;dx++) { ctx.fillStyle='#7a5a3a';ctx.fillRect(x+dx,y,1,1);ctx.fillStyle='#8a6848';ctx.fillRect(x+dx,y+1,1,1); }
  // Fire
  const flicker = Math.sin(ts*0.008)*0.5+0.5;
  const flames: [number,number,number,string][] = [
    [x+8,y+16,8,'#ff8010'],[x+10,y+14,6,'#ffa020'],[x+12,y+12,4,'#ffb830'],[x+11,y+10,3,'#ffd040'],
  ];
  flames.forEach(([fx,fy,fw,fc], i) => {
    ctx.globalAlpha = 0.6+0.4*((i%2===0)?flicker:1-flicker);
    ctx.fillStyle = fc;
    for (let dx=0;dx<fw;dx++) ctx.fillRect(fx+dx, fy, 1, 1);
    ctx.globalAlpha = 1;
  });
  // Embers
  for (let dx=0;dx<12;dx++) {
    ctx.fillStyle = ((dx+Math.floor(ts/200))%3)<2 ? '#e84010' : '#c03008';
    ctx.fillRect(x+8+dx, y+18, 1, 1);
  }
  // Rug in front
  for (let dy=0;dy<6;dy++) for (let dx=0;dx<20;dx++) {
    const border = dx<1||dx>18||dy<1||dy>4;
    ctx.fillStyle = border ? '#8a3020' : ((dx+dy)%3<2 ? '#6a2818' : '#902e22');
    ctx.fillRect(x+4+dx, y+22+dy, 1, 1);
  }
}

export function glow(gctx: CanvasRenderingContext2D, x: number, y: number, ts: number, scale: number, isNight: boolean) {
  const fpGx = (x+14)*scale, fpGy = (y+14)*scale;
  const fp2 = 0.5+0.3*Math.sin(ts*0.008);
  const fpIntensity = isNight ? 0.35 : 0.15;
  const fpG = gctx.createRadialGradient(fpGx,fpGy,0,fpGx,fpGy,70);
  fpG.addColorStop(0,`rgba(255,160,40,${fpIntensity*fp2})`);
  fpG.addColorStop(0.6,`rgba(255,100,20,${fpIntensity*0.3*fp2})`);
  fpG.addColorStop(1,'rgba(255,80,0,0)');
  gctx.fillStyle=fpG;
  // Draw across the full floor area
  const FLOOR_Y = 64;
  gctx.fillRect(0, FLOOR_Y*scale, 192*scale, (160-FLOOR_Y)*scale);
}

registry.register(def, draw, glow);
