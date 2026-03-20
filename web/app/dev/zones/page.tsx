'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { registry } from '@web/lib/furniture';
import type { FurnitureDef } from '@web/lib/furniture/types';
import { drawSceneBackground } from '@web/lib/scene-backgrounds';

const W = 192, H = 160, SCALE = 4, TILE = 8;
const DW = W * SCALE, DH = H * SCALE;

const ZONE_KEY = 'ignis_zone_boundaries';

interface ZoneBoundaries {
  ceilingBottom: number; // display pixels
  wallBottom: number;    // display pixels
}

type AllZones = Record<string, ZoneBoundaries>;

const DEFAULTS: Record<string, ZoneBoundaries> = {
  room: { ceilingBottom: 128, wallBottom: 256 },
  garden: { ceilingBottom: 32, wallBottom: 64 },  // garden still has zones for structure
  bedroom: { ceilingBottom: 128, wallBottom: 256 },
};

function loadAllZones(): AllZones {
  try {
    const raw = localStorage.getItem(ZONE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ...DEFAULTS };
}

function loadZonesForScene(scene: string): ZoneBoundaries {
  const all = loadAllZones();
  return all[scene] || DEFAULTS[scene] || { ceilingBottom: 128, wallBottom: 256 };
}

function saveZonesForScene(scene: string, z: ZoneBoundaries) {
  const all = loadAllZones();
  all[scene] = z;
  localStorage.setItem(ZONE_KEY, JSON.stringify(all));
}

const BG_SRCS: Record<string, string> = { room: '/room-bg.png', garden: '/garden-bg.png' };
const ZONE_COLORS = { ceiling: 'rgba(68,136,255,0.25)', wall: 'rgba(68,204,68,0.25)', floor: 'rgba(204,136,68,0.15)' };

type PlacementZone = 'ceiling' | 'wall' | 'floor';

export default function ZonesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scene, setSceneState] = useState<'room' | 'garden' | 'bedroom'>('room');
  const [zones, setZonesState] = useState<ZoneBoundaries>(() => loadZonesForScene('room'));
  const zonesRef = useRef(zones);
  const setZones = (z: ZoneBoundaries) => {
    zonesRef.current = z;
    setZonesState(z);
  };
  const setScene = (s: 'room' | 'garden' | 'bedroom') => {
    setSceneState(s);
    const loaded = loadZonesForScene(s);
    zonesRef.current = loaded;
    setZonesState(loaded);
  };
  const [dragging, setDragging] = useState<'ceiling' | 'wall' | null>(null);
  const [bgImgs, setBgImgs] = useState<Record<string, HTMLImageElement>>({});
  const [allDefs, setAllDefs] = useState<FurnitureDef[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    setAllDefs(registry.getAllDefs());
    Object.entries(BG_SRCS).forEach(([k, src]) => {
      const img = new Image(); img.src = src;
      img.onload = () => setBgImgs(p => ({ ...p, [k]: img }));
    });
  }, []);

  const sceneDefs = allDefs.filter(d => (d.scene ?? 'room') === scene);
  const bg = bgImgs[scene];

  // Draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, DW, DH);

    // Background — hi-res image or procedural fallback
    if (bg) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bg, 0, 0, DW, DH);
      ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, 0, DW, DH);
    } else {
      // Procedural fallback (bedroom, or while images load)
      ctx.save(); ctx.scale(SCALE, SCALE);
      drawSceneBackground(ctx, scene);
      ctx.restore();
    }

    // Zone overlays
    ctx.fillStyle = ZONE_COLORS.ceiling;
    ctx.fillRect(0, 0, DW, zones.ceilingBottom);

    ctx.fillStyle = ZONE_COLORS.wall;
    ctx.fillRect(0, zones.ceilingBottom, DW, zones.wallBottom - zones.ceilingBottom);

    ctx.fillStyle = ZONE_COLORS.floor;
    ctx.fillRect(0, zones.wallBottom, DW, DH - zones.wallBottom);

    // Zone labels
    ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#4488ff';
    ctx.fillText('CEILING', DW / 2, zones.ceilingBottom / 2 + 6);
    ctx.fillStyle = '#44cc44';
    ctx.fillText('WALL', DW / 2, zones.ceilingBottom + (zones.wallBottom - zones.ceilingBottom) / 2 + 6);
    ctx.fillStyle = '#cc8844';
    ctx.fillText('FLOOR', DW / 2, zones.wallBottom + (DH - zones.wallBottom) / 2 + 6);

    // Drag lines
    ctx.setLineDash([8, 4]); ctx.lineWidth = 3;
    ctx.strokeStyle = '#4488ff';
    ctx.beginPath(); ctx.moveTo(0, zones.ceilingBottom); ctx.lineTo(DW, zones.ceilingBottom); ctx.stroke();
    ctx.strokeStyle = '#44cc44';
    ctx.beginPath(); ctx.moveTo(0, zones.wallBottom); ctx.lineTo(DW, zones.wallBottom); ctx.stroke();
    ctx.setLineDash([]);

    // Drag handle indicators
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(DW / 2 - 20, zones.ceilingBottom - 4, 40, 8);
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('↕', DW / 2, zones.ceilingBottom + 3);

    ctx.fillStyle = '#44cc44';
    ctx.fillRect(DW / 2 - 20, zones.wallBottom - 4, 40, 8);
    ctx.fillStyle = '#fff';
    ctx.fillText('↕', DW / 2, zones.wallBottom + 3);

    // Info
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, DW, 24);
    ctx.fillStyle = '#e0e0e0'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    const cr = Math.round(zones.ceilingBottom / SCALE / TILE);
    const wr = Math.round(zones.wallBottom / SCALE / TILE);
    ctx.fillText(`Ceiling: rows 0-${cr - 1}  |  Wall: rows ${cr}-${wr - 1}  |  Floor: rows ${wr}-${H / TILE - 1}`, 8, 16);
  }, [zones, scene, bg]);

  const handleDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const cur = zonesRef.current;
    if (Math.abs(my - cur.ceilingBottom) < 12) setDragging('ceiling');
    else if (Math.abs(my - cur.wallBottom) < 12) setDragging('wall');
  }, []);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const cur = zonesRef.current;
    if (dragging === 'ceiling') {
      const clamped = Math.max(16, Math.min(cur.wallBottom - 16, my));
      setZones({ ...cur, ceilingBottom: clamped });
    } else {
      const clamped = Math.max(cur.ceilingBottom + 16, Math.min(DH - 16, my));
      setZones({ ...cur, wallBottom: clamped });
    }
    saveZonesForScene(scene, zonesRef.current);
  }, [dragging]);

  const handleUp = useCallback(() => {
    if (dragging) {
      saveZonesForScene(scene, zonesRef.current);
      setDragging(null);
    }
  }, [dragging]);

  const getZone = (def: FurnitureDef): PlacementZone => def.zone ?? 'floor';
  const zoneColor = (z: PlacementZone) => z === 'ceiling' ? '#4488ff' : z === 'wall' ? '#44cc44' : '#cc8844';
  const zoneLabel = (z: PlacementZone) => z === 'ceiling' ? 'C' : z === 'wall' ? 'W' : 'F';

  return (
    <div style={{ background: '#0a0a0e', minHeight: '100vh', color: '#e0e0e0', padding: 20 }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 14, marginBottom: 6, color: '#F59E0B' }}>
        Zone Editor
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        Drag the <span style={{ color: '#4488ff' }}>blue</span> and <span style={{ color: '#44cc44' }}>green</span> lines to set zone boundaries. Click furniture to cycle zones.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        {(['room', 'garden', 'bedroom'] as const).map(s => (
          <button key={s} onClick={() => setScene(s)} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 8, padding: '6px 12px',
            borderRadius: 4, border: 'none', cursor: 'pointer',
            background: scene === s ? '#F59E0B' : 'rgba(255,255,255,0.08)',
            color: scene === s ? '#1a0e08' : '#a0a0a0',
          }}>{s.toUpperCase()}</button>
        ))}
        <button onClick={() => {
          const def = DEFAULTS[scene] || { ceilingBottom: 128, wallBottom: 256 };
          setZones(def);
          saveZonesForScene(scene, def);
        }} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 7, padding: '5px 10px',
          borderRadius: 4, border: 'none', cursor: 'pointer',
          background: 'rgba(220,60,60,0.15)', color: '#e06060',
        }}>RESET ZONES</button>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <canvas ref={canvasRef} width={DW} height={DH}
          style={{ borderRadius: 8, cursor: dragging ? 'row-resize' : 'default', flexShrink: 0 }}
          onMouseDown={handleDown} onMouseMove={handleMove}
          onMouseUp={handleUp} onMouseLeave={handleUp}
        />

        <div style={{ flex: 1, maxHeight: DH, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#888', marginBottom: 8 }}>
            FURNITURE — {scene.toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sceneDefs.map(def => {
              const zone = getZone(def);
              return (
                <div key={def.id} onClick={() => {
                  const next: PlacementZone = zone === 'floor' ? 'wall' : zone === 'wall' ? 'ceiling' : 'floor';
                  def.zone = next;
                  setAllDefs([...registry.getAllDefs()]);
                }} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                  background: 'rgba(255,255,255,0.04)', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${zoneColor(zone)}33`,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4, background: zoneColor(zone),
                    color: '#000', fontWeight: 'bold', fontSize: 11,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
                  }}>{zoneLabel(zone)}</div>
                  <div style={{ fontSize: 11, flex: 1 }}>{def.label}</div>
                  <div style={{ fontSize: 9, color: '#666' }}>{def.gridW}×{def.gridH}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
