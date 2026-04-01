import { registry } from '../registry';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'couch', label: 'Couch', gridW: 7, gridH: 5,
  spotDx: 3, spotDy: -1, canOverlapWall: false, drawKey: 'couch',
  category: 'seating', tags: ['relaxation'],
  hiResSprites: {
    0: '/furniture/couch-front-clean.png',
    1: '/furniture/couch-right-clean.png',
    2: '/furniture/couch-back-clean.png',
    3: '/furniture/couch-left-clean.png',
  },
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Dark wood frame (back)
  for (let dy=0;dy<2;dy++) for (let dx=0;dx<50;dx++) {
    const isEnd = dx<3||dx>46;
    ctx.fillStyle = isEnd ? '#3a2218' : dy===0 ? '#4a2e1e' : '#3e2618';
    ctx.fillRect(x+dx, y+dy, 1, 1);
  }

  // Back cushions (deep slate blue fabric)
  for (let dy=0;dy<4;dy++) for (let dx=0;dx<44;dx++) {
    const leftCush = dx < 21;
    const isSeam = dx === 21 || dx === 22;
    if (isSeam) {
      ctx.fillStyle = '#2a3848';
    } else {
      // Subtle fabric texture per cushion
      const grain = ((dx * 3 + dy * 7) % 5) - 2;
      const highlight = dy === 0 ? 12 : dy === 1 ? 6 : 0;
      const r = 58 + grain + highlight;
      const g = 72 + grain + highlight;
      const b = 98 + grain + highlight;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
    }
    ctx.fillRect(x+3+dx, y+2+dy, 1, 1);
  }

  // Seat cushions (matching slate blue, slightly lighter)
  for (let dy=0;dy<5;dy++) for (let dx=0;dx<44;dx++) {
    const isSeam = dx === 21 || dx === 22;
    if (isSeam) {
      ctx.fillStyle = '#2e3c4c';
    } else {
      const grain = ((dx * 5 + dy * 11) % 5) - 2;
      const depthShade = dy === 0 ? 14 : dy === 4 ? -6 : 0;
      const r = 66 + grain + depthShade;
      const g = 82 + grain + depthShade;
      const b = 108 + grain + depthShade;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
    }
    ctx.fillRect(x+3+dx, y+6+dy, 1, 1);
  }

  // Armrests (dark wood, rounded)
  for (let dy=0;dy<10;dy++) {
    const shade = dy < 2 ? '#4a2e1e' : dy > 7 ? '#301c10' : '#3e2618';
    ctx.fillStyle = shade;
    ctx.fillRect(x, y+dy, 3, 1);
    ctx.fillRect(x+47, y+dy, 3, 1);
  }

  // Throw pillows (warm accent - muted amber/rust)
  // Left pillow
  for (let dy=0;dy<3;dy++) for (let dx=0;dx<4;dx++) {
    const edge = dx===0||dx===3||dy===0||dy===2;
    ctx.fillStyle = edge ? '#a06830' : '#c08040';
    ctx.fillRect(x+8+dx, y+3+dy, 1, 1);
  }
  // Right pillow
  for (let dy=0;dy<3;dy++) for (let dx=0;dx<4;dx++) {
    const edge = dx===0||dx===3||dy===0||dy===2;
    ctx.fillStyle = edge ? '#8a4030' : '#b05838';
    ctx.fillRect(x+38+dx, y+3+dy, 1, 1);
  }

}

registry.register(def, draw);
