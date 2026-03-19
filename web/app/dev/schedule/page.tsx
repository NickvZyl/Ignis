'use client';

import { useState, useCallback, useEffect } from 'react';
import { loadSchedule, saveSchedule, invalidateScheduleCache, DEFAULT_SCHEDULE } from '@web/lib/schedule';
import type { FullSchedule, HourBlock } from '@web/lib/schedule';
import { registry } from '@web/lib/furniture';

const FONT = "'Segoe UI', system-ui, sans-serif";
const SCENES = ['room', 'garden', 'bedroom'] as const;
const SCENE_COLORS: Record<string, string> = { room: '#c09870', garden: '#5a9a30', bedroom: '#8898b0' };
const SCENE_BG: Record<string, string> = { room: '#3a2818', garden: '#1a3010', bedroom: '#1a2030' };

// Get all furniture IDs grouped by scene
function getFurnitureByScene(): Record<string, { id: string; label: string }[]> {
  const result: Record<string, { id: string; label: string }[]> = { room: [], garden: [], bedroom: [] };
  for (const def of registry.getAllDefs()) {
    const scene = def.scene ?? 'room';
    result[scene]?.push({ id: def.id, label: def.label });
  }
  return result;
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function HourRow({
  hour, block, currentHour, onChange, furnitureByScene,
}: {
  hour: number;
  block: HourBlock;
  currentHour: number;
  onChange: (updated: HourBlock) => void;
  furnitureByScene: Record<string, { id: string; label: string }[]>;
}) {
  const isCurrent = hour === currentHour;
  const sceneFurniture = furnitureByScene[block.scene] ?? [];

  return (
    <tr style={{
      background: isCurrent ? '#2a2820' : 'transparent',
      borderLeft: isCurrent ? '3px solid #F59E0B' : '3px solid transparent',
    }}>
      {/* Hour */}
      <td style={{ padding: '6px 12px', fontSize: 15, color: isCurrent ? '#F59E0B' : '#888', whiteSpace: 'nowrap', fontWeight: isCurrent ? 700 : 400 }}>
        {isCurrent && '\u25B6 '}{formatHour(hour)}
      </td>

      {/* Scene */}
      <td style={{ padding: '4px 8px' }}>
        <select value={block.scene} onChange={e => onChange({ ...block, scene: e.target.value as any })}
          style={{
            background: SCENE_BG[block.scene], color: SCENE_COLORS[block.scene],
            border: `1px solid ${SCENE_COLORS[block.scene]}44`, fontFamily: FONT, fontSize: 14,
            padding: '4px 8px', borderRadius: 4, cursor: 'pointer', width: '100%',
          }}>
          {SCENES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
        </select>
      </td>

      {/* Primary */}
      <td style={{ padding: '4px 8px' }}>
        <select value={block.primary} onChange={e => onChange({ ...block, primary: e.target.value })}
          style={{ background: '#1e1e24', color: '#ccc', border: '1px solid #444', fontFamily: FONT, fontSize: 14, padding: '4px 8px', borderRadius: 4, width: '100%' }}>
          {sceneFurniture.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </td>

      {/* Secondary */}
      <td style={{ padding: '4px 8px' }}>
        <select value={block.secondary} onChange={e => onChange({ ...block, secondary: e.target.value })}
          style={{ background: '#1e1e24', color: '#999', border: '1px solid #444', fontFamily: FONT, fontSize: 14, padding: '4px 8px', borderRadius: 4, width: '100%' }}>
          {sceneFurniture.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </td>

      {/* Label */}
      <td style={{ padding: '4px 8px' }}>
        <input type="text" value={block.label} onChange={e => onChange({ ...block, label: e.target.value })}
          style={{ background: '#1e1e24', color: '#aaa', border: '1px solid #333', fontFamily: FONT, fontSize: 14, padding: '4px 8px', borderRadius: 4, width: '100%' }} />
      </td>
    </tr>
  );
}

export default function ScheduleEditor() {
  const [schedule, setSchedule] = useState<FullSchedule>(() => loadSchedule());
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  const [saved, setSaved] = useState(false);
  const furnitureByScene = getFurnitureByScene();

  // Update current hour every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const updateHour = useCallback((hour: number, block: HourBlock) => {
    setSchedule(prev => {
      const next = [...prev];
      next[hour] = block;
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

  // Paint mode: drag a scene across multiple hours
  const [painting, setPainting] = useState(false);
  const [paintScene, setPaintScene] = useState<string | null>(null);

  // Quick scene assignment blocks
  const sceneCounts = { room: 0, garden: 0, bedroom: 0 };
  schedule.forEach(b => { sceneCounts[b.scene]++; });

  return (
    <div style={{ background: '#141418', minHeight: '100vh', color: '#ccc', fontFamily: FONT, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 24, color: '#aaa', fontWeight: 600 }}>Ignis Schedule</div>
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

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 14, color: '#888' }}>
        {SCENES.map(s => (
          <span key={s}>
            <span style={{ color: SCENE_COLORS[s], fontWeight: 600 }}>{s.toUpperCase()}</span>
            {' '}{sceneCounts[s]}h
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: '#555' }}>
          Now: {formatHour(currentHour)} — {schedule[currentHour]?.label}
        </span>
      </div>

      {/* Visual timeline bar */}
      <div style={{ display: 'flex', height: 32, borderRadius: 6, overflow: 'hidden', marginBottom: 20, border: '1px solid #333' }}>
        {schedule.map((block, h) => (
          <div key={h} style={{
            flex: 1,
            background: h === currentHour ? SCENE_COLORS[block.scene] : SCENE_BG[block.scene],
            borderRight: h < 23 ? '1px solid #222' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: h === currentHour ? '#000' : SCENE_COLORS[block.scene],
            fontWeight: h === currentHour ? 700 : 400,
            cursor: 'pointer', transition: 'background 0.15s',
          }}
            title={`${formatHour(h)}: ${block.scene} — ${block.label}`}
          >
            {h % 3 === 0 ? h : ''}
          </div>
        ))}
      </div>

      {/* Schedule table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13, color: '#666', width: 90 }}>HOUR</th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 13, color: '#666', width: 130 }}>SCENE</th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 13, color: '#666' }}>PRIMARY</th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 13, color: '#666' }}>SECONDARY</th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 13, color: '#666' }}>ACTIVITY</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((block, h) => (
              <HourRow
                key={h}
                hour={h}
                block={block}
                currentHour={currentHour}
                onChange={(updated) => updateHour(h, updated)}
                furnitureByScene={furnitureByScene}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
