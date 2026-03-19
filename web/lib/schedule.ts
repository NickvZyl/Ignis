// ── Ignis schedule system (data-driven, editable via /dev/schedule) ──

import type { SceneId } from './room-grid';

export interface HourBlock {
  scene: SceneId;
  primary: string;    // furniture id
  secondary: string;  // furniture id
  label: string;
}

export type FullSchedule = HourBlock[]; // 24 entries, index = hour

const STORAGE_KEY = 'ignis_schedule';

// ── Default schedule ──
export const DEFAULT_SCHEDULE: FullSchedule = [
  /* 00 */ { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  /* 01 */ { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  /* 02 */ { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  /* 03 */ { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  /* 04 */ { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  /* 05 */ { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  /* 06 */ { scene: 'bedroom', primary: 'bed', secondary: 'wardrobe', label: 'waking up' },
  /* 07 */ { scene: 'bedroom', primary: 'wardrobe', secondary: 'nightstand', label: 'getting ready' },
  /* 08 */ { scene: 'room', primary: 'kitchen', secondary: 'fridge', label: 'breakfast' },
  /* 09 */ { scene: 'garden', primary: 'farm_patch', secondary: 'chicken_coop', label: 'tending the garden' },
  /* 10 */ { scene: 'garden', primary: 'chicken_coop', secondary: 'cow_pen', label: 'feeding animals' },
  /* 11 */ { scene: 'room', primary: 'bookshelf', secondary: 'desk', label: 'reading' },
  /* 12 */ { scene: 'room', primary: 'kitchen', secondary: 'couch', label: 'lunch break' },
  /* 13 */ { scene: 'room', primary: 'couch', secondary: 'fridge', label: 'taking a break' },
  /* 14 */ { scene: 'room', primary: 'desk', secondary: 'bookshelf', label: 'working' },
  /* 15 */ { scene: 'room', primary: 'desk', secondary: 'bookshelf', label: 'working' },
  /* 16 */ { scene: 'room', primary: 'desk', secondary: 'plant', label: 'working' },
  /* 17 */ { scene: 'garden', primary: 'cow_pen', secondary: 'sheep_pen', label: 'checking on animals' },
  /* 18 */ { scene: 'garden', primary: 'sheep_pen', secondary: 'farm_patch', label: 'evening rounds' },
  /* 19 */ { scene: 'room', primary: 'couch', secondary: 'fireplace', label: 'relaxing' },
  /* 20 */ { scene: 'room', primary: 'fireplace', secondary: 'couch', label: 'winding down' },
  /* 21 */ { scene: 'room', primary: 'fireplace', secondary: 'floor_lamp', label: 'winding down' },
  /* 22 */ { scene: 'bedroom', primary: 'nightstand', secondary: 'bed', label: 'getting ready for bed' },
  /* 23 */ { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
];

// ── Load/save ──
export function loadSchedule(): FullSchedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FullSchedule;
      if (Array.isArray(parsed) && parsed.length === 24) return parsed;
    }
  } catch {}
  return DEFAULT_SCHEDULE.map(b => ({ ...b }));
}

export function saveSchedule(schedule: FullSchedule) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
}

// ── Runtime getters (used by IgnisScene) ──
let cachedSchedule: FullSchedule | null = null;
let cacheTime = 0;

function getSchedule(): FullSchedule {
  // Reload from localStorage at most once per 5 seconds
  const now = Date.now();
  if (!cachedSchedule || now - cacheTime > 5000) {
    cachedSchedule = loadSchedule();
    cacheTime = now;
  }
  return cachedSchedule;
}

export function getGlobalSceneForHour(): SceneId {
  const hour = new Date().getHours();
  return getSchedule()[hour].scene;
}

export interface ScheduleBlock {
  primary: string;
  secondary: string;
  label: string;
}

export function getScheduleBlockForHour(placedIds: string[]): ScheduleBlock {
  const hour = new Date().getHours();
  const block = getSchedule()[hour];
  const has = (id: string) => placedIds.includes(id);
  return {
    primary: has(block.primary) ? block.primary : placedIds[0] ?? block.primary,
    secondary: has(block.secondary) ? block.secondary : placedIds[0] ?? block.secondary,
    label: block.label,
  };
}

// Force cache refresh (called after saving from editor)
export function invalidateScheduleCache() {
  cachedSchedule = null;
  cacheTime = 0;
}
