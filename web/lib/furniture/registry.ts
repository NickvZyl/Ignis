import type { FurnitureDef, FurnitureDrawFn, FurnitureGlowFn } from './types';

const drawFns = new Map<string, FurnitureDrawFn>();
const glowFns = new Map<string, FurnitureGlowFn>();
const allDefs: FurnitureDef[] = [];

export const registry = {
  register(def: FurnitureDef, draw: FurnitureDrawFn, glow?: FurnitureGlowFn) {
    drawFns.set(def.drawKey, draw);
    if (glow) glowFns.set(def.drawKey, glow);
    // Replace existing def on HMR so updated properties (like zone) take effect
    const idx = allDefs.findIndex(d => d.id === def.id);
    if (idx >= 0) {
      allDefs[idx] = def;
    } else {
      allDefs.push(def);
    }
  },
  getDraw(key: string): FurnitureDrawFn | undefined {
    return drawFns.get(key);
  },
  getGlow(key: string): FurnitureGlowFn | undefined {
    return glowFns.get(key);
  },
  getAllDefs(): FurnitureDef[] {
    return allDefs;
  },
};
