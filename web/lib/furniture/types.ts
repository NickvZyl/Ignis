export type FurnitureCategory = 'seating' | 'storage' | 'decor' | 'lighting' | 'surface' | 'wall_art' | 'appliance' | 'nature' | 'structural';

// Placement zones within the room (front-facing diorama view):
//   ceiling (rows 0-1)  — lights, fans
//   wall    (rows 2-5)  — paintings, sconces, window, shelves flush to wall
//   floor   (rows 6-19) — all regular furniture
export type PlacementZone = 'ceiling' | 'wall' | 'floor';

export interface FurnitureDef {
  id: string;
  label: string;
  gridW: number;
  gridH: number;
  spotDx: number;
  spotDy: number;
  canOverlapWall: boolean;
  drawKey: string;
  category: FurnitureCategory;
  zone?: PlacementZone;   // which zone this piece belongs to (default: 'floor')
  tags?: string[];         // for role/schedule mapping (e.g. 'work', 'reading', 'relaxation')
  required?: boolean;      // can't be removed from room
  perimeterOnly?: boolean; // must be placed on room edge
  scene?: 'room' | 'garden' | 'bedroom'; // which scene this belongs to (undefined = 'room')
  hiResSprites?: Record<number, string>; // per-rotation image URLs (drawn on bg canvas at display res)
  hiResAnimate?: (ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number, ts: number, rot: number) => void;
}

export type FurnitureRotation = 0 | 1 | 2 | 3; // 0=down, 1=right, 2=up, 3=left (90° CW increments)

export type FurnitureDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) => void;
export type FurnitureGlowFn = (gctx: CanvasRenderingContext2D, x: number, y: number, ts: number, scale: number, isNight: boolean) => void;
