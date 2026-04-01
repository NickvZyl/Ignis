// ── Ignis schedule system (15-minute slots, 96 per day) ──
// localStorage = fast synchronous cache, Supabase = source of truth

import type { SceneId } from './room-grid';
import { supabase } from './supabase';

export interface SlotBlock {
  scene: SceneId;
  primary: string;    // furniture id
  secondary: string;  // furniture id
  label: string;
}

/** @deprecated Use SlotBlock instead */
export type HourBlock = SlotBlock;

export type FullSchedule = SlotBlock[]; // 96 entries, index = 15-min slot

export const SLOTS_PER_DAY = 96;

const STORAGE_KEY = 'ignis_schedule';

// ── Slot helpers ──

/** Slot index → "HH:MM" string */
export function slotToTime(slot: number): string {
  const h = Math.floor(slot / 4);
  const m = (slot % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:MM" string → slot index (rounds down to nearest 15 min) */
export function timeToSlot(time: string): number {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return h * 4 + Math.floor(m / 15);
}

/** Current 15-minute slot index */
export function getCurrentSlot(): number {
  const now = new Date();
  return now.getHours() * 4 + Math.floor(now.getMinutes() / 15);
}

// ── Default schedule (96 fifteen-minute slots) ──
// Defined per-hour then expanded to 4 slots each.
const HOURLY_DEFAULTS: SlotBlock[] = [
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

function expandToSlots(hourly: SlotBlock[]): FullSchedule {
  const slots: SlotBlock[] = [];
  for (const block of hourly) {
    for (let q = 0; q < 4; q++) slots.push({ ...block });
  }
  return slots;
}

export const DEFAULT_SCHEDULE: FullSchedule = expandToSlots(HOURLY_DEFAULTS);

// ── Load/save with auto-migration ──
export function loadSchedule(): FullSchedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FullSchedule;
      if (Array.isArray(parsed)) {
        // Auto-migrate old 24-entry schedule to 96 slots
        if (parsed.length === 24) {
          const migrated = expandToSlots(parsed);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }
        if (parsed.length === SLOTS_PER_DAY) return parsed;
      }
    }
  } catch {}
  return DEFAULT_SCHEDULE.map(b => ({ ...b }));
}

export function saveSchedule(schedule: FullSchedule) {
  // Write to local cache immediately (sync reads depend on this)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
  // Persist to Supabase (fire and forget, debounced)
  debouncedCloudSave(schedule);
}

// ── Supabase sync ──

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedCloudSave(schedule: FullSchedule) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.from('schedules').upsert({
        user_id: session.user.id,
        slots: schedule,
        updated_at: new Date().toISOString(),
      });
      console.log('[Schedule] saved to cloud');
    } catch (e) {
      console.error('[Schedule] cloud save failed:', e);
    }
  }, 2000);
}

/** Pull schedule from Supabase and update local cache. Call on app startup. */
export async function syncScheduleFromCloud(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data, error } = await supabase
      .from('schedules')
      .select('slots, updated_at')
      .eq('user_id', session.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No row yet — push local schedule to cloud
      const local = loadSchedule();
      await supabase.from('schedules').insert({
        user_id: session.user.id,
        slots: local,
        updated_at: new Date().toISOString(),
      });
      console.log('[Schedule] initial push to cloud');
      return;
    }

    if (error) throw error;

    if (data?.slots && Array.isArray(data.slots) && data.slots.length === SLOTS_PER_DAY) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.slots));
      invalidateScheduleCache();
      console.log('[Schedule] synced from cloud');
    }
  } catch (e) {
    console.error('[Schedule] cloud sync failed:', e);
  }
}

// ── Runtime getters ──
let cachedSchedule: FullSchedule | null = null;
let cacheTime = 0;

function getSchedule(): FullSchedule {
  const now = Date.now();
  if (!cachedSchedule || now - cacheTime > 5000) {
    cachedSchedule = loadSchedule();
    cacheTime = now;
  }
  return cachedSchedule;
}

/** Get the scene Igni should be in right now */
export function getGlobalScene(): SceneId {
  return getSchedule()[getCurrentSlot()].scene;
}

/** @deprecated Use getGlobalScene() */
export function getGlobalSceneForHour(): SceneId {
  return getGlobalScene();
}

export interface ScheduleBlock {
  primary: string;
  secondary: string;
  label: string;
}

/** Get current schedule block, falling back to placed furniture */
export function getScheduleBlock(placedIds: string[]): ScheduleBlock {
  const block = getSchedule()[getCurrentSlot()];
  const has = (id: string) => placedIds.includes(id);
  return {
    primary: has(block.primary) ? block.primary : placedIds[0] ?? block.primary,
    secondary: has(block.secondary) ? block.secondary : placedIds[0] ?? block.secondary,
    label: block.label,
  };
}

/** @deprecated Use getScheduleBlock() */
export function getScheduleBlockForHour(placedIds: string[]): ScheduleBlock {
  return getScheduleBlock(placedIds);
}

/** Collapse consecutive identical slots into ranges for display */
export function collapseScheduleForDisplay(schedule: FullSchedule): string {
  const lines: string[] = [];
  let i = 0;
  while (i < schedule.length) {
    const block = schedule[i];
    let j = i + 1;
    while (j < schedule.length &&
      schedule[j].scene === block.scene &&
      schedule[j].primary === block.primary &&
      schedule[j].label === block.label) {
      j++;
    }
    const start = slotToTime(i);
    const end = slotToTime(j - 1);
    const range = i === j - 1 ? start : `${start}-${end}`;
    lines.push(`${range} ${block.scene} - ${block.label} (at ${block.primary})`);
    i = j;
  }
  return lines.join('\n');
}

// Force cache refresh (called after saving from editor)
export function invalidateScheduleCache() {
  cachedSchedule = null;
  cacheTime = 0;
}
