import { registry } from '../registry';
import { darker } from '../colors';
import type { FurnitureDef } from '../types';

export const def: FurnitureDef = {
  id: 'bookshelf', label: 'Bookshelf', gridW: 4, gridH: 2,
  spotDx: 2, spotDy: 2, canOverlapWall: false, drawKey: 'bookshelf',
  category: 'storage', tags: ['reading'],
};

export function draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bh = 16, bw = 30;
  // Back
  for (let dy=0;dy<bh;dy++) for (let dx=0;dx<bw-2;dx++) {
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(x+1+dx, y+dy, 1, 1);
  }
  // Frame sides
  for (let dy=0;dy<bh;dy++) { ctx.fillStyle='#5a3a1a';ctx.fillRect(x,dy+y,1,1);ctx.fillRect(x+bw-1,dy+y,1,1); }
  // Top/bottom
  for (let dx=0;dx<bw;dx++) { ctx.fillStyle='#5a3a1a';ctx.fillRect(x+dx,y,1,1);ctx.fillRect(x+dx,y+bh-1,1,1); }
  // Shelves
  [5, 10].forEach(sy => {
    for (let dx=1;dx<bw-1;dx++) { ctx.fillStyle='#4a2c10';ctx.fillRect(x+dx,y+sy,1,1); }
  });
  // Books
  const bookColors = ['#8a3030','#305a8a','#2a6a2a','#8a6a20','#6a2a8a','#8a4420','#2a508a','#7a602a','#7a3050','#3a7a5a'];
  let bx2 = x+2;
  bookColors.forEach((c, i) => {
    const bookW = 2 + (i%2);
    const shelf = i < 5 ? 0 : 1;
    const by = y + 1 + shelf * 5;
    for (let dx=0;dx<bookW;dx++) for (let dy=0;dy<4;dy++) {
      ctx.fillStyle = dx===0 ? darker(c,30) : c;
      ctx.fillRect(bx2+dx, by+dy, 1, 1);
    }
    bx2 += bookW + 1;
    if (i === 4) bx2 = x+2;
  });
}

registry.register(def, draw);
