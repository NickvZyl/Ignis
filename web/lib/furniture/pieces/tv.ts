import { registry } from '../registry';
import type { FurnitureDef } from '../types';

function animateTV(
  ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number, ts: number, rot: number,
) {
  if (rot !== 0) return;
  // Screen glow — subtle color shifting
  const shift = Math.sin(ts * 0.001) * 0.5 + 0.5;
  const r = Math.round(40 + shift * 30);
  const g = Math.round(80 + (1 - shift) * 40);
  const b = Math.round(120 + shift * 20);
  const pulse = Math.sin(ts * 0.003) * 0.05 + 0.15;

  const cx = dx + dw * 0.5, cy = dy + dh * 0.32;
  const rx = dw * 0.4, ry = dh * 0.25;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  grad.addColorStop(0, `rgba(${r},${g},${b},${pulse})`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},${pulse * 0.3})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
}

export const def: FurnitureDef = {
  id: 'tv', label: 'TV', gridW: 4, gridH: 2,
  spotDx: -0.7889280585217744, spotDy: -2.0115689798702903, canOverlapWall: false, drawKey: 'tv',
  category: 'decor', tags: ['relaxation'],
  hiResSprites: {
    0: '/furniture/tv-front-clean.png',
    1: '/furniture/tv-right-clean.png',
    2: '/furniture/tv-back-clean.png',
    3: '/furniture/tv-left-clean.png',
  },
  hiResAnimate: animateTV,
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // TV screen
  for (let dx = 0; dx < 20; dx++) for (let dy = 0; dy < 12; dy++) {
    ctx.fillStyle = (dx === 0 || dx === 19 || dy === 0 || dy === 11) ? '#2a2a2a' : '#0a1520';
    ctx.fillRect(x + 2 + dx, y + dy, 1, 1);
  }
  // TV stand
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 10, y + 12, 4, 2);
}

registry.register(def, draw);
