import { create } from 'zustand';
import {
  type RoomLayout,
  type CellType,
  type FurnitureRotation,
  type FurnitureConfig,
  DEFAULT_LAYOUT,
  GARDEN_DEFAULT_LAYOUT,
  BEDROOM_DEFAULT_LAYOUT,
  FURNITURE_DEFS,
  WALL_ROWS,
  GARDEN_WALL_ROWS,
  BEDROOM_WALL_ROWS,
  buildGrid,
  isValidPlacement,
  getSpotPixel,
  applyFurnitureConfig,
  getFurnitureConfig,
  updateFurnitureConfig,
} from '@web/lib/room-grid';
import { registry } from '@web/lib/furniture';
import { supabase } from '@web/lib/supabase';
import { api } from '@web/lib/api';
import type { SceneId } from '@web/lib/room-grid';

// ── Supabase sync helpers ──
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function syncToSupabase(scene: SceneId, layout: RoomLayout, inventory: string[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('room_layouts')
    .upsert({
      user_id: user.id,
      scene,
      layout: layout as unknown as Record<string, unknown>,
      inventory,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,scene' });

  if (error) console.error('[RoomSync] Save failed:', error.message);
  else console.log('[RoomSync] Saved', scene);
}

function debouncedSync(scene: SceneId, layout: RoomLayout, inventory: string[]) {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => syncToSupabase(scene, layout, inventory), 2000);
}

async function loadFromSupabase(scene: SceneId): Promise<{ layout: RoomLayout; inventory: string[] } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('room_layouts')
    .select('layout, inventory')
    .eq('user_id', user.id)
    .eq('scene', scene)
    .single();

  if (error || !data) return null;
  return {
    layout: data.layout as unknown as RoomLayout,
    inventory: data.inventory as unknown as string[],
  };
}

function storageKeys(scene: SceneId) {
  const map: Record<SceneId, { layout: string; inventory: string }> = {
    room:    { layout: 'ignis_room_layout',    inventory: 'ignis_inventory' },
    garden:  { layout: 'ignis_garden_layout',  inventory: 'ignis_garden_inventory' },
    bedroom: { layout: 'ignis_bedroom_layout', inventory: 'ignis_bedroom_inventory' },
  };
  return map[scene];
}

function defaultLayoutFor(scene: SceneId): RoomLayout {
  if (scene === 'garden') return GARDEN_DEFAULT_LAYOUT;
  if (scene === 'bedroom') return BEDROOM_DEFAULT_LAYOUT;
  return DEFAULT_LAYOUT;
}

function wallRowsFor(scene: SceneId): number {
  if (scene === 'garden') return GARDEN_WALL_ROWS;
  if (scene === 'bedroom') return BEDROOM_WALL_ROWS;
  return WALL_ROWS;
}

function loadLayout(scene: SceneId = 'room'): RoomLayout {
  const keys = storageKeys(scene);
  const defaultLayout = defaultLayoutFor(scene);
  let layout = defaultLayout;
  try {
    const raw = localStorage.getItem(keys.layout);
    if (raw) {
      const parsed = JSON.parse(raw) as RoomLayout;
      if (parsed.furniture?.length > 0) {
        // Migrate: ensure all items have rot
        parsed.furniture = parsed.furniture.map(f => ({ ...f, rot: f.rot ?? 0 }));

        // Migrate: detect old layout (WALL_ROWS was 6, now 8) and shift floor furniture down by 2
        const migrationKey = keys.layout + '_v2';
        if (!localStorage.getItem(migrationKey) && scene !== 'garden') {
          parsed.furniture = parsed.furniture.map(f => {
            const def = FURNITURE_DEFS[f.id];
            const zone = def?.zone;
            // Only shift floor-zone items that are in the old floor area (gy >= 6)
            if (!zone || zone === 'floor') {
              return { ...f, gy: Math.min(f.gy + 2, 19) };
            }
            return f;
          });
          localStorage.setItem(migrationKey, '1');
        }

        layout = parsed;
      }
    }
  } catch {}

  // Ensure all required furniture for this scene is placed
  const placedIds = new Set(layout.furniture.map(f => f.id));
  const requiredDefs = registry.getAllDefs().filter(d => {
    if (!d.required) return false;
    const defScene = d.scene ?? 'room';
    return defScene === scene;
  });
  for (const def of requiredDefs) {
    if (!placedIds.has(def.id)) {
      const defaultPlaced = defaultLayout.furniture.find(f => f.id === def.id);
      layout = {
        ...layout,
        furniture: [...layout.furniture, defaultPlaced ?? { id: def.id, gx: 10, gy: 18, rot: 0 }],
      };
    }
  }

  return layout;
}

function saveLayout(layout: RoomLayout, scene: SceneId = 'room') {
  const keys = storageKeys(scene);
  localStorage.setItem(keys.layout, JSON.stringify(layout));
  // Cloud sync is triggered separately via debouncedSync with both layout + inventory
}

function loadInventory(placedIds: string[], scene: SceneId = 'room'): string[] {
  const keys = storageKeys(scene);
  let stored: string[] = [];
  try {
    const raw = localStorage.getItem(keys.inventory);
    if (raw) stored = JSON.parse(raw) as string[];
  } catch {}

  const known = new Set([...placedIds, ...stored]);
  const allDefs = registry.getAllDefs();
  // Only include furniture that belongs to this scene
  const newPieces = allDefs
    .filter(d => {
      const defScene = d.scene ?? 'room';
      return defScene === scene && !known.has(d.id) && !d.required;
    })
    .map(d => d.id);

  const inventory = [...stored.filter(id => !FURNITURE_DEFS[id]?.required), ...newPieces];
  return inventory;
}

function saveInventory(inventory: string[], scene: SceneId = 'room') {
  const keys = storageKeys(scene);
  localStorage.setItem(keys.inventory, JSON.stringify(inventory));
}

interface RoomState {
  currentScene: SceneId;
  layout: RoomLayout;
  grid: CellType[][];
  inventory: string[];
  mode: 'live' | 'edit';
  dragging: string | null;
  draggingRot: FurnitureRotation;
  placing: string | null;
  placingRot: FurnitureRotation;
  configLoaded: boolean;

  initConfig: () => Promise<void>;
  reloadConfig: () => Promise<void>;
  setMode: (mode: 'live' | 'edit') => void;
  switchSceneLayout: (scene: SceneId) => void;
  moveFurniture: (id: string, gx: number, gy: number, rot?: FurnitureRotation) => boolean;
  addToRoom: (id: string, gx: number, gy: number, rot?: FurnitureRotation) => boolean;
  removeFromRoom: (id: string) => void;
  startPlacing: (id: string) => void;
  cancelPlacing: () => void;
  cyclePlacingRot: () => void;
  startDrag: (id: string) => void;
  endDrag: () => void;
  cycleDraggingRot: () => void;
  resetLayout: () => void;
  getSpot: (furnitureId: string) => { x: number; y: number } | null;
  syncFromCloud: () => Promise<void>;
}

function getInitialScene(): SceneId {
  try {
    const raw = localStorage.getItem('ignis_active_scene');
    if (raw === 'garden' || raw === 'bedroom') return raw;
  } catch {}
  return 'room';
}

const initialScene = getInitialScene();
const initialLayout = loadLayout(initialScene);
const initialInventory = loadInventory(initialLayout.furniture.map(f => f.id), initialScene);

export const useRoomStore = create<RoomState>((set, get) => ({
  currentScene: initialScene,
  layout: initialLayout,
  grid: buildGrid(initialLayout, wallRowsFor(initialScene)),
  inventory: initialInventory,
  mode: 'live',
  dragging: null,
  draggingRot: 0,
  placing: null,
  placingRot: 0,
  configLoaded: false,

  initConfig: async () => {
    if (get().configLoaded) return;
    try {
      const res = await fetch(api('/api/furniture-config'));
      if (res.ok) {
        const config: FurnitureConfig = await res.json();

        // Migrate localStorage overrides into config if present
        let needsSave = false;
        try {
          const legacyGridSizes = localStorage.getItem('ignis_grid_sizes');
          if (legacyGridSizes) {
            const parsed = JSON.parse(legacyGridSizes);
            for (const [id, size] of Object.entries(parsed)) {
              const s = size as { gridW: number; gridH: number };
              if (!config[id]) config[id] = {};
              if (config[id].gridW === undefined) config[id].gridW = s.gridW;
              if (config[id].gridH === undefined) config[id].gridH = s.gridH;
            }
            localStorage.removeItem('ignis_grid_sizes');
            needsSave = true;
          }

          const legacyAssetSizes = localStorage.getItem('ignis_asset_sizes');
          if (legacyAssetSizes) {
            const parsed = JSON.parse(legacyAssetSizes);
            for (const [key, size] of Object.entries(parsed)) {
              const s = size as { widthPx: number; heightPx: number; offsetX: number; offsetY: number };
              // Parse keys like "desk_r0", "couch_r1"
              const match = key.match(/^(.+)_r(\d+)$/);
              if (!match) continue;
              const [, id, rotStr] = match;
              const rot = parseInt(rotStr);
              if (!config[id]) config[id] = {};
              if (rot === 0) {
                if (!config[id].sprite) config[id].sprite = s;
              } else {
                if (!config[id].spriteOverrides) config[id].spriteOverrides = {};
                if (!config[id].spriteOverrides![String(rot)]) config[id].spriteOverrides![String(rot)] = s;
              }
            }
            localStorage.removeItem('ignis_asset_sizes');
            needsSave = true;
          }
        } catch {}

        if (needsSave) {
          fetch(api('/api/furniture-config'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          }).catch(() => {});
        }

        applyFurnitureConfig(config);
        const { layout, currentScene } = get();
        set({ grid: buildGrid(layout, wallRowsFor(currentScene)), configLoaded: true });
      }
    } catch (err) {
      console.error('[FurnitureConfig] Failed to load:', err);
    }
  },

  reloadConfig: async () => {
    try {
      const res = await fetch(api('/api/furniture-config'));
      if (res.ok) {
        const config: FurnitureConfig = await res.json();
        applyFurnitureConfig(config);
        const { layout, currentScene } = get();
        set({ grid: buildGrid(layout, wallRowsFor(currentScene)) });
        console.log('[FurnitureConfig] Reloaded');
      }
    } catch (err) {
      console.error('[FurnitureConfig] Failed to reload:', err);
    }
  },

  switchSceneLayout: (scene) => {
    const { layout, inventory, currentScene } = get();
    // Save current scene's layout+inventory
    saveLayout(layout, currentScene);
    saveInventory(inventory, currentScene);
    debouncedSync(currentScene, layout, inventory);
    // Load target scene
    const newLayout = loadLayout(scene);
    const newInventory = loadInventory(newLayout.furniture.map(f => f.id), scene);
    const newGrid = buildGrid(newLayout, wallRowsFor(scene));
    set({
      currentScene: scene,
      layout: newLayout,
      grid: newGrid,
      inventory: newInventory,
      mode: 'live',
      dragging: null,
      placing: null,
      placingRot: 0,
      draggingRot: 0,
    });
  },

  setMode: (mode) => {
    set({ mode, dragging: null, placing: null, placingRot: 0, draggingRot: 0 });
  },

  moveFurniture: (id, gx, gy, rot) => {
    const { layout, draggingRot, currentScene } = get();
    const r = rot ?? draggingRot;
    const wRows = wallRowsFor(currentScene);
    if (!isValidPlacement(layout, id, gx, gy, r, id, wRows)) return false;

    const newFurniture = layout.furniture.map((f) =>
      f.id === id ? { ...f, gx, gy, rot: r } : f
    );
    const newLayout = { ...layout, furniture: newFurniture };
    const newGrid = buildGrid(newLayout, wRows);

    set({ layout: newLayout, grid: newGrid });
    saveLayout(newLayout, currentScene);
    debouncedSync(currentScene, newLayout, get().inventory);
    return true;
  },

  addToRoom: (id, gx, gy, rot) => {
    const { layout, inventory, placingRot, currentScene } = get();
    const r = rot ?? placingRot;
    const wRows = wallRowsFor(currentScene);
    if (!inventory.includes(id)) return false;
    if (!isValidPlacement(layout, id, gx, gy, r, undefined, wRows)) return false;

    const newFurniture = [...layout.furniture, { id, gx, gy, rot: r }];
    const newLayout = { ...layout, furniture: newFurniture };
    const newGrid = buildGrid(newLayout, wRows);
    const newInventory = inventory.filter(i => i !== id);

    set({ layout: newLayout, grid: newGrid, inventory: newInventory, placing: null, placingRot: 0 });
    saveLayout(newLayout, currentScene);
    saveInventory(newInventory, currentScene);
    debouncedSync(currentScene, newLayout, newInventory);
    return true;
  },

  removeFromRoom: (id) => {
    const def = FURNITURE_DEFS[id];
    if (def?.required) return;
    const { layout, inventory, currentScene } = get();
    const newFurniture = layout.furniture.filter(f => f.id !== id);
    const newLayout = { ...layout, furniture: newFurniture };
    const newGrid = buildGrid(newLayout, wallRowsFor(currentScene));
    const newInventory = [...inventory, id];

    set({ layout: newLayout, grid: newGrid, inventory: newInventory, dragging: null });
    saveLayout(newLayout, currentScene);
    saveInventory(newInventory, currentScene);
    debouncedSync(currentScene, newLayout, newInventory);
  },

  startPlacing: (id) => set({ placing: id, dragging: null, placingRot: 0 }),
  cancelPlacing: () => set({ placing: null, placingRot: 0 }),
  cyclePlacingRot: () => set(s => ({ placingRot: ((s.placingRot + 1) % 4) as FurnitureRotation })),

  startDrag: (id) => {
    const placed = get().layout.furniture.find(f => f.id === id);
    set({ dragging: id, draggingRot: (placed?.rot ?? 0) as FurnitureRotation });
  },
  endDrag: () => set({ dragging: null }),
  cycleDraggingRot: () => set(s => ({ draggingRot: ((s.draggingRot + 1) % 4) as FurnitureRotation })),


  resetLayout: () => {
    const { currentScene } = get();
    const defaultLayout = defaultLayoutFor(currentScene);
    const grid = buildGrid(defaultLayout, wallRowsFor(currentScene));
    const inventory = loadInventory(defaultLayout.furniture.map(f => f.id), currentScene);
    set({ layout: defaultLayout, grid, inventory });
    saveLayout(defaultLayout, currentScene);
    saveInventory(inventory, currentScene);
    debouncedSync(currentScene, defaultLayout, inventory);
  },

  syncFromCloud: async () => {
    const { currentScene } = get();
    const scenes: SceneId[] = ['room', 'garden', 'bedroom'];

    for (const scene of scenes) {
      const cloud = await loadFromSupabase(scene);
      if (cloud && cloud.layout.furniture?.length > 0) {
        // Ensure all items have rot
        cloud.layout.furniture = cloud.layout.furniture.map(f => ({ ...f, rot: f.rot ?? 0 }));

        // Ensure required pieces exist
        const placedIds = new Set(cloud.layout.furniture.map(f => f.id));
        const requiredDefs = registry.getAllDefs().filter(d => {
          if (!d.required) return false;
          return (d.scene ?? 'room') === scene;
        });
        for (const def of requiredDefs) {
          if (!placedIds.has(def.id)) {
            const dl = defaultLayoutFor(scene);
            const defaultPlaced = dl.furniture.find(f => f.id === def.id);
            cloud.layout.furniture.push(defaultPlaced ?? { id: def.id, gx: 10, gy: 18, rot: 0 });
          }
        }

        // Save to localStorage
        saveLayout(cloud.layout, scene);
        saveInventory(cloud.inventory, scene);

        // If this is the active scene, update state
        if (scene === currentScene) {
          const grid = buildGrid(cloud.layout, wallRowsFor(scene));
          set({ layout: cloud.layout, grid, inventory: cloud.inventory });
        }

        console.log('[RoomSync] Loaded', scene, 'from cloud:', cloud.layout.furniture.length, 'pieces');
      } else {
        // No cloud data — push local to cloud
        const localLayout = loadLayout(scene);
        const localInventory = loadInventory(localLayout.furniture.map(f => f.id), scene);
        syncToSupabase(scene, localLayout, localInventory);
        console.log('[RoomSync] Pushed', scene, 'to cloud:', localLayout.furniture.length, 'pieces');
      }
    }
  },

  getSpot: (furnitureId) => {
    const { layout } = get();
    const placed = layout.furniture.find((f) => f.id === furnitureId);
    if (!placed) return null;
    return getSpotPixel(placed);
  },
}));
