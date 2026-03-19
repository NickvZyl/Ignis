import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'kitchen', label: 'Kitchen', gridW: 5, gridH: 3,
  spotDx: 2, spotDy: 3, canOverlapWall: true, drawKey: 'kitchen',
  category: 'appliance', tags: [],
  hiResSprites: {
    0: '/furniture/kitchen-front-clean.png',
    1: '/furniture/kitchen-right-clean.png',
    2: '/furniture/kitchen-back-clean.png',
    3: '/furniture/kitchen-left-clean.png',
  },
};

// Minimal fallback draw (shown on scene canvas while images load)
export function draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(x, y, 40, 24);
  ctx.fillStyle = '#9a8a78';
  ctx.fillRect(x, y, 40, 2);
}

registry.register(def, draw);
