import { create } from 'zustand';
import {
  type RoomLayout,
  type CellType,
  type SpotData,
  type FurnitureRotation,
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
  applySpots,
  getActiveSpots,
  loadGridSizes,
  setGridSize,
} from '@web/lib/room-grid';
import { registry } from '@web/lib/furniture';
import type { SceneId } from '@web/lib/room-grid';

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

type SpotEdits = Record<string, { spotDx: number; spotDy: number }>;

interface RoomState {
  currentScene: SceneId;
  layout: RoomLayout;
  grid: CellType[][];
  inventory: string[];
  mode: 'live' | 'edit' | 'spot-edit';
  dragging: string | null;
  draggingRot: FurnitureRotation;
  draggingSpot: string | null;
  resizing: string | null;
  resizeType: 'hitbox' | 'sprite' | null;
  placing: string | null;
  placingRot: FurnitureRotation;
  pendingSpots: SpotEdits;
  spotsLoaded: boolean;

  initSpots: () => Promise<void>;
  setMode: (mode: 'live' | 'edit' | 'spot-edit') => void;
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
  startSpotDrag: (id: string) => void;
  endSpotDrag: () => void;
  setSpotEdit: (id: string, spotDx: number, spotDy: number) => void;
  saveSpots: () => Promise<void>;
  resizeGrid: (id: string, gridW: number, gridH: number) => void;
  resetLayout: () => void;
  getSpot: (furnitureId: string) => { x: number; y: number } | null;
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
  draggingSpot: null,
  resizing: null,
  resizeType: null,
  placing: null,
  placingRot: 0,
  pendingSpots: {},
  spotsLoaded: false,

  initSpots: async () => {
    if (get().spotsLoaded) return;
    // Load grid size overrides from localStorage
    loadGridSizes();
    try {
      const res = await fetch('/api/spots');
      if (res.ok) {
        const spots: SpotData = await res.json();
        applySpots(spots);
        const { layout, currentScene } = get();
        set({ grid: buildGrid(layout, wallRowsFor(currentScene)), spotsLoaded: true });
      }
    } catch (err) {
      console.error('[Spots] Failed to load:', err);
    }
  },

  switchSceneLayout: (scene) => {
    const { layout, inventory, currentScene } = get();
    // Save current scene's layout+inventory
    saveLayout(layout, currentScene);
    saveInventory(inventory, currentScene);
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
      draggingSpot: null,
    });
  },

  setMode: (mode) => {
    const prev = get().mode;
    if (prev === 'spot-edit' && mode !== 'spot-edit') {
      get().saveSpots();
    }
    set({ mode, dragging: null, draggingSpot: null, resizing: null, resizeType: null, placing: null, placingRot: 0, draggingRot: 0 });
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

  startSpotDrag: (id) => set({ draggingSpot: id }),
  endSpotDrag: () => set({ draggingSpot: null }),

  setSpotEdit: (id, spotDx, spotDy) => {
    const { pendingSpots } = get();
    set({ pendingSpots: { ...pendingSpots, [id]: { spotDx, spotDy } } });
  },

  saveSpots: async () => {
    const { pendingSpots } = get();
    if (Object.keys(pendingSpots).length === 0) return;

    const spots: SpotEdits = { ...getActiveSpots() };
    for (const [id, edit] of Object.entries(pendingSpots)) {
      spots[id] = edit;
    }

    try {
      const res = await fetch('/api/spots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spots),
      });
      if (res.ok) {
        applySpots(spots);
        set({ pendingSpots: {} });
      }
    } catch (err) {
      console.error('[Spots] Failed to save:', err);
    }
  },

  resizeGrid: (id, gridW, gridH) => {
    setGridSize(id, gridW, gridH);
    const { layout, currentScene } = get();
    set({ grid: buildGrid(layout, wallRowsFor(currentScene)) });
  },

  resetLayout: () => {
    const { currentScene } = get();
    const defaultLayout = defaultLayoutFor(currentScene);
    const grid = buildGrid(defaultLayout, wallRowsFor(currentScene));
    set({ layout: defaultLayout, grid });
    saveLayout(defaultLayout, currentScene);
  },

  getSpot: (furnitureId) => {
    const { layout, pendingSpots } = get();
    const placed = layout.furniture.find((f) => f.id === furnitureId);
    if (!placed) return null;

    const pending = pendingSpots[furnitureId];
    if (pending) {
      return {
        x: (placed.gx + pending.spotDx) * 8,
        y: (placed.gy + pending.spotDy) * 8,
      };
    }
    return getSpotPixel(placed);
  },
}));
