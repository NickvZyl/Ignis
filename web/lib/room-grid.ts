// ── Tile grid system for the Ignis room ──

import { registry } from './furniture';
import type { FurnitureDef, FurnitureRotation } from './furniture';
import { getRotatedDims, getRotatedSpot } from './furniture';

export type { FurnitureDef, FurnitureRotation };
export type SceneId = 'room' | 'garden' | 'bedroom';

export const TILE = 8;           // pixels per tile
export const GRID_W = 24;        // columns (192 / 8)
export const GRID_H = 20;        // rows (160 / 8)
export const WALL_ROWS = 8;      // rows 0-7 are wall/ceiling (y 0-63)
export const CEILING_ROWS = 4;   // rows 0-3 are ceiling (y 0-31)
// Wall zone: rows 4-7 (y 32-63)
// Floor zone: rows 8-19 (y 64-159)
export const GARDEN_WALL_ROWS = 0;  // garden has no wall rows
export const BEDROOM_WALL_ROWS = 8; // bedroom is indoor, same as room

export interface PlacedFurniture {
  id: string;                // matches FurnitureDef.id
  gx: number;                // grid column (top-left)
  gy: number;                // grid row (top-left)
  rot?: FurnitureRotation;   // 0-3, defaults to 0
}

export interface RoomLayout {
  furniture: PlacedFurniture[];
}

export type SpotData = Record<string, { spotDx: number; spotDy: number }>;

// ── Unified furniture config ──
// Legacy: absolute sprite rectangle in 4x-scaled pixels (kept for one-shot migration).
export interface SpriteSize { widthPx: number; heightPx: number; offsetX: number; offsetY: number; }
// Preferred: how far the sprite extends beyond each hitbox edge, in tile units.
// Signed — negative values inset the sprite inside the hitbox.
export interface Overhang { top: number; right: number; bottom: number; left: number; }
export interface FurniturePieceConfig {
  gridW?: number;
  gridH?: number;
  spotDx?: number;
  spotDy?: number;
  /** @deprecated use `overhang` — auto-migrated at load time */
  sprite?: SpriteSize;
  /** @deprecated use `overhangOverrides` */
  spriteOverrides?: Record<string, SpriteSize>;
  overhang?: Overhang;
  overhangOverrides?: Record<string, Overhang>;
}
export type FurnitureConfig = Record<string, FurniturePieceConfig>;

let furnitureConfig: FurnitureConfig = {};

const SPRITE_SCALE = 4; // matches IgnisScene's SCALE — hi-res sprites are in 4x canvas space

function legacySpriteToOverhang(gridW: number, gridH: number, sprite: SpriteSize): Overhang {
  const px = TILE * SPRITE_SCALE;
  return {
    left: -sprite.offsetX / px,
    top: -sprite.offsetY / px,
    right: (sprite.widthPx + sprite.offsetX - gridW * px) / px,
    bottom: (sprite.heightPx + sprite.offsetY - gridH * px) / px,
  };
}

function rotatedDims(gridW: number, gridH: number, rot: number): { w: number; h: number } {
  return (rot === 1 || rot === 3) ? { w: gridH, h: gridW } : { w: gridW, h: gridH };
}

export function applyFurnitureConfig(config: FurnitureConfig) {
  // One-way migration: any leftover `sprite`/`spriteOverrides` are converted to
  // overhangs in-place and the legacy fields dropped. After the next save the
  // JSON on disk is clean.
  for (const [id, cfg] of Object.entries(config)) {
    const def = FURNITURE_DEFS[id];
    const gridW = cfg.gridW ?? def?.gridW ?? 1;
    const gridH = cfg.gridH ?? def?.gridH ?? 1;
    if (cfg.sprite && !cfg.overhang) {
      cfg.overhang = legacySpriteToOverhang(gridW, gridH, cfg.sprite);
    }
    if (cfg.spriteOverrides && !cfg.overhangOverrides) {
      cfg.overhangOverrides = {};
      for (const [rotStr, s] of Object.entries(cfg.spriteOverrides)) {
        const { w, h } = rotatedDims(gridW, gridH, Number(rotStr));
        cfg.overhangOverrides[rotStr] = legacySpriteToOverhang(w, h, s);
      }
    }
    delete cfg.sprite;
    delete cfg.spriteOverrides;

    if (def) {
      if (cfg.gridW !== undefined) def.gridW = cfg.gridW;
      if (cfg.gridH !== undefined) def.gridH = cfg.gridH;
      if (cfg.spotDx !== undefined) def.spotDx = cfg.spotDx;
      if (cfg.spotDy !== undefined) def.spotDy = cfg.spotDy;
    }
  }
  furnitureConfig = config;
}

export function getFurnitureConfig(): FurnitureConfig {
  return furnitureConfig;
}

export function getOverhang(id: string, rot: number): Overhang | null {
  const cfg = furnitureConfig[id];
  if (!cfg) return null;
  if (rot !== 0 && cfg.overhangOverrides?.[String(rot)]) return cfg.overhangOverrides[String(rot)];
  return cfg.overhang ?? null;
}

export function setOverhang(id: string, rot: number, oh: Overhang) {
  if (!furnitureConfig[id]) furnitureConfig[id] = {};
  if (rot === 0) {
    furnitureConfig[id].overhang = oh;
  } else {
    if (!furnitureConfig[id].overhangOverrides) furnitureConfig[id].overhangOverrides = {};
    furnitureConfig[id].overhangOverrides![String(rot)] = oh;
  }
}

// Kept for the old furniture-editor page. New code should use getOverhang.
export function getSpriteSize(id: string, rot: number): SpriteSize | null {
  const oh = getOverhang(id, rot);
  if (!oh) return null;
  const def = FURNITURE_DEFS[id];
  if (!def) return null;
  const { w, h } = rotatedDims(def.gridW, def.gridH, rot);
  const px = TILE * SPRITE_SCALE;
  return {
    widthPx: (w + oh.left + oh.right) * px,
    heightPx: (h + oh.top + oh.bottom) * px,
    offsetX: -oh.left * px,
    offsetY: -oh.top * px,
  };
}

export function updateFurnitureConfig(id: string, updates: Partial<FurniturePieceConfig>) {
  if (!furnitureConfig[id]) furnitureConfig[id] = {};
  Object.assign(furnitureConfig[id], updates);
  const def = FURNITURE_DEFS[id];
  if (def) {
    if (updates.gridW !== undefined) def.gridW = updates.gridW;
    if (updates.gridH !== undefined) def.gridH = updates.gridH;
    if (updates.spotDx !== undefined) def.spotDx = updates.spotDx;
    if (updates.spotDy !== undefined) def.spotDy = updates.spotDy;
  }
}

// Live lookup into registry — always returns the latest def (survives HMR)
export const FURNITURE_DEFS: Record<string, FurnitureDef> = new Proxy({} as Record<string, FurnitureDef>, {
  get(_target, prop: string) {
    return registry.getAllDefs().find(d => d.id === prop);
  },
  has(_target, prop: string) {
    return registry.getAllDefs().some(d => d.id === prop);
  },
  ownKeys() {
    return registry.getAllDefs().map(d => d.id);
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    const def = registry.getAllDefs().find(d => d.id === prop);
    if (def) return { value: def, configurable: true, enumerable: true, writable: false };
    return undefined;
  },
});


export const DEFAULT_LAYOUT: RoomLayout = {
  furniture: [
    // Ceiling zone (rows 0-3)
    { id: 'ceiling_light', gx: 11, gy: 1,  rot: 0 },
    // Wall zone (rows 4-7)
    { id: 'window',        gx: 7,  gy: 5,  rot: 0 },
    // Floor zone (rows 8-19) — wall-backing pieces overlap into wall zone
    { id: 'desk',          gx: 18, gy: 6,  rot: 0 },
    { id: 'bookshelf',     gx: 1,  gy: 6,  rot: 0 },
    { id: 'couch',         gx: 9,  gy: 14, rot: 0 },
    { id: 'fireplace',     gx: 1,  gy: 11, rot: 0 },
    { id: 'clock_table',   gx: 19, gy: 15, rot: 0 },
    { id: 'front_door',    gx: 10, gy: 18, rot: 0 },
    { id: 'hallway_door',  gx: 0,  gy: 8,  rot: 0 },
  ],
};

export const GARDEN_DEFAULT_LAYOUT: RoomLayout = {
  furniture: [
    { id: 'garden_gate',   gx: 10, gy: 18, rot: 0 },
    { id: 'farm_patch',    gx: 2,  gy: 2,  rot: 0 },
    { id: 'chicken_coop',  gx: 14, gy: 2,  rot: 0 },
    { id: 'cow_pen',       gx: 1,  gy: 10, rot: 0 },
    { id: 'sheep_pen',     gx: 14, gy: 10, rot: 0 },
  ],
};

export const BEDROOM_DEFAULT_LAYOUT: RoomLayout = {
  furniture: [
    { id: 'bedroom_door', gx: 10, gy: 18, rot: 0 },
    { id: 'bed',          gx: 1,  gy: 10, rot: 0 },
    { id: 'nightstand',   gx: 6,  gy: 9,  rot: 0 },
    { id: 'wardrobe',     gx: 18, gy: 6,  rot: 0 },
    { id: 'bedroom_window', gx: 7, gy: 5, rot: 0 },
  ],
};

// ── Grid computation ──

export type CellType = 0 | 1 | 2; // 0=walkable, 1=furniture, 2=wall

export function buildGrid(layout: RoomLayout, wallRows: number = WALL_ROWS): CellType[][] {
  const grid: CellType[][] = [];
  for (let r = 0; r < GRID_H; r++) {
    const row: CellType[] = [];
    for (let c = 0; c < GRID_W; c++) {
      row.push(r < wallRows ? 2 : 0);
    }
    grid.push(row);
  }

  for (const placed of layout.furniture) {
    const def = FURNITURE_DEFS[placed.id];
    if (!def) continue;
    const { gridW, gridH } = getRotatedDims(def, placed.rot ?? 0);
    for (let dy = 0; dy < gridH; dy++) {
      for (let dx = 0; dx < gridW; dx++) {
        const r = placed.gy + dy;
        const c = placed.gx + dx;
        if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) {
          if (grid[r][c] !== 2) grid[r][c] = 1;
        }
      }
    }
  }

  return grid;
}

// ── Helpers ──

export function getSpotPixel(placed: PlacedFurniture): { x: number; y: number } {
  const def = FURNITURE_DEFS[placed.id];
  if (!def) return { x: placed.gx * TILE, y: placed.gy * TILE };
  const { spotDx, spotDy } = getRotatedSpot(def, placed.rot ?? 0);
  return {
    x: (placed.gx + spotDx) * TILE,
    y: (placed.gy + spotDy) * TILE,
  };
}

export function getPixelPos(placed: PlacedFurniture): { x: number; y: number } {
  return { x: placed.gx * TILE, y: placed.gy * TILE };
}

export function isValidPlacement(
  layout: RoomLayout,
  pieceId: string,
  gx: number,
  gy: number,
  rot: FurnitureRotation = 0,
  excludeId?: string,
  wallRows: number = WALL_ROWS,
): boolean {
  const def = FURNITURE_DEFS[pieceId];
  if (!def) return false;

  const { gridW, gridH } = getRotatedDims(def, rot);

  if (gx < 0 || gy < 0 || gx + gridW > GRID_W || gy + gridH > GRID_H) return false;

  // Zone-based placement constraints
  const zone = def.zone ?? 'floor';
  if (zone === 'ceiling') {
    if (gy + gridH > CEILING_ROWS) return false;
  } else if (zone === 'wall') {
    if (gy < CEILING_ROWS || gy + gridH > wallRows) return false;
  } else {
    if (!def.canOverlapWall && gy < wallRows) return false;
    // canOverlapWall items must still have their bottom edge on the floor — can't float in the wall
    if (def.canOverlapWall && gy + gridH < wallRows) return false;
  }

  // Perimeter-only: must touch left edge, right edge, or bottom edge
  if (def.perimeterOnly) {
    const touchesLeft = gx === 0;
    const touchesRight = gx + gridW === GRID_W;
    const touchesBottom = gy + gridH === GRID_H;
    if (!touchesLeft && !touchesRight && !touchesBottom) return false;
  }

  for (const other of layout.furniture) {
    if (other.id === excludeId) continue;
    const otherDef = FURNITURE_DEFS[other.id];
    if (!otherDef) continue;
    const otherDims = getRotatedDims(otherDef, other.rot ?? 0);

    const overlaps =
      gx < other.gx + otherDims.gridW &&
      gx + gridW > other.gx &&
      gy < other.gy + otherDims.gridH &&
      gy + gridH > other.gy;

    if (overlaps) return false;
  }

  // Spot validation removed — spots can be adjusted via the spot editor.
  // Don't let spot position block furniture placement.

  return true;
}
