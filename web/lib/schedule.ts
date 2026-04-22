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
// Written per-slot so Igni moves and changes focus every 15 minutes instead
// of standing around on the same piece of furniture for hours.
const PER_SLOT_DEFAULTS: FullSchedule = [
  // 00:00–05:45 — asleep (deep sleep, dreaming, gentle stirring near the end)
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'deep sleep' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'deep sleep' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'deep sleep' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'deep sleep' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'dreaming' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'dreaming' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'dreaming' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'dreaming' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'dreaming' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'dreaming' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'dreaming' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'dreaming' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'half-awake' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'half-awake' },
  { scene: 'bedroom', primary: 'bed', secondary: 'wardrobe', label: 'stirring' },
  { scene: 'bedroom', primary: 'bed', secondary: 'wardrobe', label: 'stirring' },

  // 06:00–07:45 — waking up and getting ready
  { scene: 'bedroom', primary: 'bed', secondary: 'wardrobe', label: 'waking up' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'stretching in bed' },
  { scene: 'bedroom', primary: 'wardrobe', secondary: 'bed', label: 'getting out of bed' },
  { scene: 'bedroom', primary: 'wardrobe', secondary: 'nightstand', label: 'washing up' },
  { scene: 'bedroom', primary: 'wardrobe', secondary: 'nightstand', label: 'choosing clothes' },
  { scene: 'bedroom', primary: 'wardrobe', secondary: 'bed', label: 'getting dressed' },
  { scene: 'bedroom', primary: 'nightstand', secondary: 'wardrobe', label: 'tidying the nightstand' },
  { scene: 'bedroom', primary: 'bed', secondary: 'wardrobe', label: 'making the bed' },

  // 08:00–09:45 — breakfast and morning garden
  { scene: 'room', primary: 'kitchen', secondary: 'fridge', label: 'making coffee' },
  { scene: 'room', primary: 'kitchen', secondary: 'fridge', label: 'cooking breakfast' },
  { scene: 'room', primary: 'couch', secondary: 'kitchen', label: 'eating breakfast' },
  { scene: 'room', primary: 'kitchen', secondary: 'fridge', label: 'washing up' },
  { scene: 'garden', primary: 'farm_patch', secondary: 'chicken_coop', label: 'stepping into the garden' },
  { scene: 'garden', primary: 'farm_patch', secondary: 'chicken_coop', label: 'weeding the farm patch' },
  { scene: 'garden', primary: 'farm_patch', secondary: 'cow_pen', label: 'watering the vegetables' },
  { scene: 'garden', primary: 'farm_patch', secondary: 'chicken_coop', label: 'picking vegetables' },

  // 10:00–11:45 — animals, then back inside for reading
  { scene: 'garden', primary: 'chicken_coop', secondary: 'farm_patch', label: 'feeding the chickens' },
  { scene: 'garden', primary: 'chicken_coop', secondary: 'cow_pen', label: 'gathering eggs' },
  { scene: 'garden', primary: 'cow_pen', secondary: 'sheep_pen', label: 'checking on the cows' },
  { scene: 'garden', primary: 'sheep_pen', secondary: 'cow_pen', label: 'feeding the sheep' },
  { scene: 'room', primary: 'bookshelf', secondary: 'desk', label: 'picking a book' },
  { scene: 'room', primary: 'couch', secondary: 'bookshelf', label: 'reading on the couch' },
  { scene: 'room', primary: 'bookshelf', secondary: 'couch', label: 'shelving books' },
  { scene: 'room', primary: 'plant', secondary: 'bookshelf', label: 'watering the plant' },

  // 12:00–13:45 — lunch and a slow break
  { scene: 'room', primary: 'kitchen', secondary: 'fridge', label: 'making lunch' },
  { scene: 'room', primary: 'couch', secondary: 'kitchen', label: 'eating lunch' },
  { scene: 'room', primary: 'kitchen', secondary: 'couch', label: 'clearing the table' },
  { scene: 'room', primary: 'kitchen', secondary: 'fridge', label: 'washing dishes' },
  { scene: 'room', primary: 'couch', secondary: 'fireplace', label: 'resting after lunch' },
  { scene: 'room', primary: 'couch', secondary: 'bookshelf', label: 'staring at nothing' },
  { scene: 'room', primary: 'plant', secondary: 'couch', label: 'fussing with the plant' },
  { scene: 'room', primary: 'couch', secondary: 'plant', label: 'stretching' },

  // 14:00–16:45 — work (broken up with a coffee break, references, short pauses)
  { scene: 'room', primary: 'desk', secondary: 'bookshelf', label: 'settling in to work' },
  { scene: 'room', primary: 'desk', secondary: 'plant', label: 'writing' },
  { scene: 'room', primary: 'desk', secondary: 'bookshelf', label: 'working' },
  { scene: 'room', primary: 'kitchen', secondary: 'desk', label: 'coffee break' },
  { scene: 'room', primary: 'desk', secondary: 'bookshelf', label: 'back at the desk' },
  { scene: 'room', primary: 'bookshelf', secondary: 'desk', label: 'looking up a reference' },
  { scene: 'room', primary: 'desk', secondary: 'plant', label: 'deep focus' },
  { scene: 'room', primary: 'plant', secondary: 'desk', label: 'stretching' },
  { scene: 'room', primary: 'desk', secondary: 'bookshelf', label: 'working' },
  { scene: 'room', primary: 'desk', secondary: 'plant', label: 'tidying the desk' },
  { scene: 'room', primary: 'couch', secondary: 'desk', label: 'a short break on the couch' },
  { scene: 'room', primary: 'desk', secondary: 'bookshelf', label: 'wrapping up work' },

  // 17:00–18:45 — evening garden rounds and cooking dinner
  { scene: 'garden', primary: 'farm_patch', secondary: 'cow_pen', label: 'evening rounds' },
  { scene: 'garden', primary: 'cow_pen', secondary: 'farm_patch', label: 'feeding the cows' },
  { scene: 'garden', primary: 'sheep_pen', secondary: 'cow_pen', label: 'checking on the sheep' },
  { scene: 'garden', primary: 'chicken_coop', secondary: 'sheep_pen', label: 'collecting eggs' },
  { scene: 'garden', primary: 'farm_patch', secondary: 'chicken_coop', label: 'harvesting vegetables' },
  { scene: 'garden', primary: 'farm_patch', secondary: 'sheep_pen', label: 'pulling weeds' },
  { scene: 'room', primary: 'kitchen', secondary: 'fridge', label: 'bringing in the harvest' },
  { scene: 'room', primary: 'kitchen', secondary: 'fridge', label: 'cooking dinner' },

  // 19:00–21:45 — winding down (TV, reading, plant, fireplace, lamp, journal)
  { scene: 'room', primary: 'couch', secondary: 'kitchen', label: 'eating dinner' },
  { scene: 'room', primary: 'kitchen', secondary: 'couch', label: 'clearing up' },
  { scene: 'room', primary: 'couch', secondary: 'tv', label: 'watching tv' },
  { scene: 'room', primary: 'tv', secondary: 'couch', label: 'watching tv' },
  { scene: 'room', primary: 'bookshelf', secondary: 'couch', label: 'picking an evening book' },
  { scene: 'room', primary: 'couch', secondary: 'bookshelf', label: 'reading' },
  { scene: 'room', primary: 'plant', secondary: 'couch', label: 'tending the plant' },
  { scene: 'room', primary: 'fireplace', secondary: 'couch', label: 'by the fire' },
  { scene: 'room', primary: 'fireplace', secondary: 'couch', label: 'by the fire' },
  { scene: 'room', primary: 'floor_lamp', secondary: 'couch', label: 'reading by the lamp' },
  { scene: 'room', primary: 'desk', secondary: 'floor_lamp', label: 'journaling' },
  { scene: 'room', primary: 'plant', secondary: 'desk', label: 'one last check on the plant' },

  // 22:00–23:45 — bed prep, then back to sleep
  { scene: 'bedroom', primary: 'wardrobe', secondary: 'nightstand', label: 'changing for bed' },
  { scene: 'bedroom', primary: 'nightstand', secondary: 'bed', label: 'brushing teeth' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'reading in bed' },
  { scene: 'bedroom', primary: 'nightstand', secondary: 'bed', label: 'turning off the lamp' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'settling to sleep' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
  { scene: 'bedroom', primary: 'bed', secondary: 'nightstand', label: 'sleeping' },
];

// Kept for auto-migration of legacy 24-entry schedules stored in localStorage.
function expandToSlots(hourly: SlotBlock[]): FullSchedule {
  const slots: SlotBlock[] = [];
  for (const block of hourly) {
    for (let q = 0; q < 4; q++) slots.push({ ...block });
  }
  return slots;
}

export const DEFAULT_SCHEDULE: FullSchedule = PER_SLOT_DEFAULTS;

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

// Decor pieces aren't meaningful "activity targets" — prefer anything else
// when substituting for a missing scheduled piece.
const DECOR_IDS: ReadonlySet<string> = new Set([
  'tall_plant', 'succulent', 'clock_table', 'ceiling_light', 'wall_sconce',
  'window', 'bedroom_window', 'bedroom_door', 'hallway_door', 'front_door', 'garden_gate',
]);

// Used instead of the slot's specific label when the scheduled primary isn't
// placed — keeps the caption honest ("pottering around" rather than
// "feeding the chickens" while standing in an empty garden).
const SCENE_FALLBACK_LABELS: Record<SceneId, string> = {
  room: 'pottering around',
  bedroom: 'in the bedroom',
  garden: 'pottering in the garden',
};

function pickFallback(placedIds: string[], preferred: string): string {
  if (placedIds.includes(preferred)) return preferred;
  const interactive = placedIds.find(id => !DECOR_IDS.has(id));
  return interactive ?? placedIds[0] ?? preferred;
}

/** Get current schedule block, falling back to placed furniture */
export function getScheduleBlock(placedIds: string[]): ScheduleBlock {
  const block = getSchedule()[getCurrentSlot()];
  const primary = pickFallback(placedIds, block.primary);
  const secondary = pickFallback(placedIds, block.secondary);
  const primaryMatched = placedIds.includes(block.primary);
  return {
    primary,
    secondary,
    label: primaryMatched ? block.label : SCENE_FALLBACK_LABELS[block.scene],
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
