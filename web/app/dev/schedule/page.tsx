'use client';

import { useState, useCallback, useEffect } from 'react';
import { loadSchedule, saveSchedule, invalidateScheduleCache, DEFAULT_SCHEDULE, slotToTime, SLOTS_PER_DAY, getCurrentSlot } from '@web/lib/schedule';
import type { FullSchedule, SlotBlock } from '@web/lib/schedule';
import { registry } from '@web/lib/furniture';

const FONT = "'Segoe UI', system-ui, sans-serif";
const SCENES = ['room', 'garden', 'bedroom'] as const;
const SCENE_COLORS: Record<string, string> = { room: '#c09870', garden: '#5a9a30', bedroom: '#8898b0' };
const SCENE_BG: Record<string, string> = { room: '#3a2818', garden: '#1a3010', bedroom: '#1a2030' };

function getFurnitureByScene(): Record<string, { id: string; label: string }[]> {
  const result: Record<string, { id: string; label: string }[]> = { room: [], garden: [], bedroom: [] };
  for (const def of registry.getAllDefs()) {
    const scene = def.scene ?? 'room';
    result[scene]?.push({ id: def.id, label: def.label });
  }
  return result;
}

function SlotRow({
  slot, block, isCurrent, onChange, furnitureByScene,
}: {
  slot: number;
  block: SlotBlock;
  isCurrent: boolean;
  onChange: (updated: SlotBlock) => void;
  furnitureByScene: Record<string, { id: string; label: string }[]>;
}) {
  const sceneFurniture = furnitureByScene[block.scene] ?? [];
  const time = slotToTime(slot);
  const isHourStart = slot % 4 === 0;

  return (
    <tr style={{
      background: isCurrent ? '#2a2820' : 'transparent',
      borderLeft: isCurrent ? '3px solid #F59E0B' : '3px solid transparent',
      borderTop: isHourStart ? '1px solid #333' : 'none',
    }}>
      <td style={{
        padding: '4px 12px', fontSize: 14,
        color: isCurrent ? '#F59E0B' : isHourStart ? '#888' : '#555',
        whiteSpace: 'nowrap', fontWeight: isCurrent ? 700 : isHourStart ? 500 : 400,
      }}>
        {isCurrent && '\u25B6 '}{time}
      </td>

      <td style={{ padding: '3px 8px' }}>
        <select value={block.scene} onChange={e => onChange({ ...block, scene: e.target.value as any })}
          style={{
            background: SCENE_BG[block.scene], color: SCENE_COLORS[block.scene],
            border: `1px solid ${SCENE_COLORS[block.scene]}44`, fontFamily: FONT, fontSize: 13,
            padding: '3px 6px', borderRadius: 4, cursor: 'pointer', width: '100%',
          }}>
          {SCENES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
        </select>
      </td>

      <td style={{ padding: '3px 8px' }}>
        <select value={block.primary} onChange={e => onChange({ ...block, primary: e.target.value })}
          style={{ background: '#1e1e24', color: '#ccc', border: '1px solid #444', fontFamily: FONT, fontSize: 13, padding: '3px 6px', borderRadius: 4, width: '100%' }}>
          {sceneFurniture.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </td>

      <td style={{ padding: '3px 8px' }}>
        <select value={block.secondary} onChange={e => onChange({ ...block, secondary: e.target.value })}
          style={{ background: '#1e1e24', color: '#999', border: '1px solid #444', fontFamily: FONT, fontSize: 13, padding: '3px 6px', borderRadius: 4, width: '100%' }}>
          {sceneFurniture.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </td>

      <td style={{ padding: '3px 8px' }}>
        <input type="text" value={block.label} onChange={e => onChange({ ...block, label: e.target.value })}
          style={{ background: '#1e1e24', color: '#aaa', border: '1px solid #333', fontFamily: FONT, fontSize: 13, padding: '3px 6px', borderRadius: 4, width: '100%' }} />
      </td>
    </tr>
  );
}

export default function ScheduleEditor() {
  const [schedule, setSchedule] = useState<FullSchedule>(() => loadSchedule());
  const [currentSlot, setCurrentSlot] = useState(getCurrentSlot());
  const [saved, setSaved] = useState(false);
  const furnitureByScene = getFurnitureByScene();

  useEffect(() => {
    const interval = setInterval(() => setCurrentSlot(getCurrentSlot()), 15_000);
    return () => clearInterval(interval);
  }, []);

  const updateSlot = useCallback((slot: number, block: SlotBlock) => {
    setSchedule(prev => {
      const next = [...prev];
      next[slot] = block;
      return next;
    });
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    saveSchedule(schedule);
    invalidateScheduleCache();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [schedule]);

  const handleReset = useCallback(() => {
    const fresh = DEFAULT_SCHEDULE.map(b => ({ ...b }));
    setSchedule(fresh);
    saveSchedule(fresh);
    invalidateScheduleCache();
  }, []);

  // Scene counts (in hours)
  const sceneCounts = { room: 0, garden: 0, bedroom: 0 };
  schedule.forEach(b => { sceneCounts[b.scene] += 0.25; });

  return (
    <div style={{ background: '#141418', minHeight: '100vh', color: '#ccc', fontFamily: FONT, padding: 20, overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 24, color: '#aaa', fontWeight: 600 }}>Ignis Schedule <span style={{ fontSize: 14, color: '#666' }}>(15-min slots)</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleReset} style={{
            fontFamily: FONT, fontSize: 14, padding: '6px 16px', borderRadius: 4,
            background: '#333', color: '#888', border: 'none', cursor: 'pointer',
          }}>RESET TO DEFAULT</button>
          <button onClick={handleSave} style={{
            fontFamily: FONT, fontSize: 14, padding: '6px 16px', borderRadius: 4,
            background: saved ? '#5a9a30' : '#F59E0B', color: '#000', border: 'none', cursor: 'pointer',
            fontWeight: 600, transition: 'background 0.2s',
          }}>{saved ? 'SAVED!' : 'SAVE'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 14, color: '#888' }}>
        {SCENES.map(s => (
          <span key={s}>
            <span style={{ color: SCENE_COLORS[s], fontWeight: 600 }}>{s.toUpperCase()}</span>
            {' '}{sceneCounts[s]}h
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: '#555' }}>
          Now: {slotToTime(currentSlot)} — {schedule[currentSlot]?.label}
        </span>
      </div>

      {/* Visual timeline bar */}
      <div style={{ display: 'flex', height: 32, borderRadius: 6, overflow: 'hidden', marginBottom: 20, border: '1px solid #333' }}>
        {schedule.map((block, i) => (
          <div key={i} style={{
            flex: 1,
            background: i === currentSlot ? SCENE_COLORS[block.scene] : SCENE_BG[block.scene],
            borderRight: i < SLOTS_PER_DAY - 1 && i % 4 === 3 ? '1px solid #222' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: i === currentSlot ? '#000' : SCENE_COLORS[block.scene],
            fontWeight: i === currentSlot ? 700 : 400,
            cursor: 'pointer', transition: 'background 0.15s',
          }}
            title={`${slotToTime(i)}: ${block.scene} — ${block.label}`}
          >
            {i % 4 === 0 ? Math.floor(i / 4) : ''}
          </div>
        ))}
      </div>

      {/* Schedule table */}
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#141418', zIndex: 1 }}>
            <tr style={{ borderBottom: '2px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13, color: '#666', width: 90 }}>TIME</th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 13, color: '#666', width: 130 }}>SCENE</th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 13, color: '#666' }}>PRIMARY</th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 13, color: '#666' }}>SECONDARY</th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 13, color: '#666' }}>ACTIVITY</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((block, i) => (
              <SlotRow
                key={i}
                slot={i}
                block={block}
                isCurrent={i === currentSlot}
                onChange={(updated) => updateSlot(i, updated)}
                furnitureByScene={furnitureByScene}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
