import type { FurnitureDef, FurnitureRotation, FurnitureDrawFn, FurnitureGlowFn } from './types';

const TILE = 8;

export function getRotatedDims(def: FurnitureDef, rot: FurnitureRotation): { gridW: number; gridH: number } {
  if (rot === 1 || rot === 3) return { gridW: def.gridH, gridH: def.gridW };
  return { gridW: def.gridW, gridH: def.gridH };
}

export function getRotatedSpot(def: FurnitureDef, rot: FurnitureRotation): { spotDx: number; spotDy: number } {
  if (rot === 0) return { spotDx: def.spotDx, spotDy: def.spotDy };

  const W = def.gridW, H = def.gridH;
  // Spot relative to bounding box center
  let rx = def.spotDx - W / 2;
  let ry = def.spotDy - H / 2;

  // Apply 90° CW rotation: (x, y) -> (-y, x)
  for (let i = 0; i < rot; i++) {
    [rx, ry] = [-ry, rx];
  }

  // Re-express relative to new top-left
  const { gridW: nW, gridH: nH } = getRotatedDims(def, rot);
  return {
    spotDx: rx + nW / 2,
    spotDy: ry + nH / 2,
  };
}

export function drawRotated(
  ctx: CanvasRenderingContext2D,
  drawFn: FurnitureDrawFn,
  x: number, y: number, ts: number,
  def: FurnitureDef,
  rot: FurnitureRotation,
) {
  if (rot === 0) { drawFn(ctx, x, y, ts); return; }

  const pw = def.gridW * TILE;
  const ph = def.gridH * TILE;
  const { gridW: rw, gridH: rh } = getRotatedDims(def, rot);
  const rpw = rw * TILE;
  const rph = rh * TILE;

  ctx.save();
  // Move to center of rotated bounding box
  ctx.translate(x + rpw / 2, y + rph / 2);
  // Rotate CW
  ctx.rotate((rot * Math.PI) / 2);
  // Offset so draw function's origin maps to original top-left
  ctx.translate(-pw / 2, -ph / 2);
  drawFn(ctx, 0, 0, ts);
  ctx.restore();
}

export function glowRotated(
  gctx: CanvasRenderingContext2D,
  glowFn: FurnitureGlowFn,
  x: number, y: number, ts: number,
  scale: number, isNight: boolean,
  def: FurnitureDef,
  rot: FurnitureRotation,
) {
  if (rot === 0) { glowFn(gctx, x, y, ts, scale, isNight); return; }

  const pw = def.gridW * TILE;
  const ph = def.gridH * TILE;
  const { gridW: rw, gridH: rh } = getRotatedDims(def, rot);
  const rpw = rw * TILE;
  const rph = rh * TILE;

  gctx.save();
  // Rotate in scaled coordinate space around the rotated center
  const cx = (x + rpw / 2) * scale;
  const cy = (y + rph / 2) * scale;
  gctx.translate(cx, cy);
  gctx.rotate((rot * Math.PI) / 2);
  gctx.translate(-(x + pw / 2) * scale, -(y + ph / 2) * scale);
  glowFn(gctx, x, y, ts, scale, isNight);
  gctx.restore();
}
