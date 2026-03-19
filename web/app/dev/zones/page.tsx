'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { registry } from '@web/lib/furniture';
import type { FurnitureDef, PlacementZone } from '@web/lib/furniture/types';
import { drawSceneBackground } from '@web/lib/scene-backgrounds';

const SCENE_BG_SRCS: Record<string, string> = {
  room: '/room-bg.png',
  garden: '/garden-bg.png',
};
const sceneBgImgs: Record<string, HTMLImageElement | null> = {};

const W = 192, H = 160, SCALE = 4;
const DISPLAY_W = W * SCALE, DISPLAY_H = H * SCALE;
const TILE = 8;

const ZONE_STORAGE_KEY = 'ignis_zone_boundaries';

interface ZoneBoundaries {
  ceilingBottom: number; // pixel Y where ceiling ends (top of wall)
  wallBottom: number;    // pixel Y where wall ends (top of floor)
}

function loadZones(): ZoneBoundaries {
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ceilingBottom: 32, wallBottom: 64 }; // defaults: 4 rows ceiling, 4 rows wall
}

function saveZones(zones: ZoneBoundaries) {
  localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(zones));
}

const ZONE_COLORS: Record<PlacementZone, string> = {
  ceiling: '#4488ff',
  wall: '#44cc44',
  floor: '#cc8844',
};

const ZONE_LABELS: Record<PlacementZone, string> = {
  ceiling: 'C',
  wall: 'W',
  floor: 'F',
};

export default function ZonesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const [zones, setZones] = useState<ZoneBoundaries>(loadZones);
  const [dragging, setDragging] = useState<'ceiling' | 'wall' | null>(null);
  const [scene, setScene] = useState<'room' | 'garden' | 'bedroom'>('room');
  const [allDefs, setAllDefs] = useState<FurnitureDef[]>([]);

  // Load furniture defs
  useEffect(() => {
    setAllDefs(registry.getAllDefs());
  }, []);

  // Filter defs for current scene
  const sceneDefs = allDefs.filter(d => (d.scene ?? 'room') === scene);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!canvas || !bgCanvas) return;
    const ctx = canvas.getContext('2d')!;
    const bgCtx = bgCanvas.getContext('2d')!;

    // Draw background at display res — use hi-res image if available
    bgCtx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
    const src = SCENE_BG_SRCS[scene];
    if (src && !sceneBgImgs[scene]) {
      const img = new Image();
      img.src = src;
      img.onload = () => { sceneBgImgs[scene] = img; setAllDefs([...registry.getAllDefs()]); }; // trigger re-render
    }
    if (src && sceneBgImgs[scene]) {
      bgCtx.imageSmoothingEnabled = true;
      bgCtx.imageSmoothingQuality = 'high';
      bgCtx.drawImage(sceneBgImgs[scene]!, 0, 0, DISPLAY_W, DISPLAY_H);
    } else {
      // Fallback to procedural
      const offscreen = document.createElement('canvas');
      offscreen.width = W;
      offscreen.height = H;
      const offCtx = offscreen.getContext('2d')!;
      drawSceneBackground(offCtx, scene);
      bgCtx.imageSmoothingEnabled = false;
      bgCtx.drawImage(offscreen, 0, 0, DISPLAY_W, DISPLAY_H);
    }

    // Draw zone overlays
    ctx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);

    // Ceiling zone
    ctx.fillStyle = 'rgba(68, 136, 255, 0.2)';
    ctx.fillRect(0, 0, DISPLAY_W, zones.ceilingBottom * SCALE);
    // Ceiling label
    ctx.fillStyle = '#4488ff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CEILING', DISPLAY_W / 2, zones.ceilingBottom * SCALE / 2 + 6);

    // Wall zone
    ctx.fillStyle = 'rgba(68, 204, 68, 0.2)';
    ctx.fillRect(0, zones.ceilingBottom * SCALE, DISPLAY_W, (zones.wallBottom - zones.ceilingBottom) * SCALE);
    // Wall label
    ctx.fillStyle = '#44cc44';
    ctx.fillText('WALL', DISPLAY_W / 2, (zones.ceilingBottom + (zones.wallBottom - zones.ceilingBottom) / 2) * SCALE + 6);

    // Floor zone
    ctx.fillStyle = 'rgba(204, 136, 68, 0.15)';
    ctx.fillRect(0, zones.wallBottom * SCALE, DISPLAY_W, (H - zones.wallBottom) * SCALE);
    // Floor label
    ctx.fillStyle = '#cc8844';
    ctx.fillText('FLOOR', DISPLAY_W / 2, (zones.wallBottom + (H - zones.wallBottom) / 2) * SCALE + 6);

    // Drag handles — thick lines at zone boundaries
    // Ceiling bottom edge
    ctx.strokeStyle = '#4488ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(0, zones.ceilingBottom * SCALE);
    ctx.lineTo(DISPLAY_W, zones.ceilingBottom * SCALE);
    ctx.stroke();

    // Wall bottom edge
    ctx.strokeStyle = '#44cc44';
    ctx.beginPath();
    ctx.moveTo(0, zones.wallBottom * SCALE);
    ctx.lineTo(DISPLAY_W, zones.wallBottom * SCALE);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grid row markers on the right side
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let row = 0; row <= H / TILE; row++) {
      const y = row * TILE * SCALE;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, y, DISPLAY_W, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`r${row}`, DISPLAY_W - 4, y + 12);
    }
  }, [zones, scene]);

  // Mouse handlers for dragging zone boundaries
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const py = (e.clientY - rect.top) / SCALE;
    const ceilDist = Math.abs(py - zones.ceilingBottom);
    const wallDist = Math.abs(py - zones.wallBottom);
    if (ceilDist < 4) setDragging('ceiling');
    else if (wallDist < 4) setDragging('wall');
  }, [zones]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const py = Math.round((e.clientY - rect.top) / SCALE / TILE) * TILE; // snap to grid rows
    if (dragging === 'ceiling') {
      const clamped = Math.max(TILE, Math.min(zones.wallBottom - TILE, py));
      setZones(z => ({ ...z, ceilingBottom: clamped }));
    } else if (dragging === 'wall') {
      const clamped = Math.max(zones.ceilingBottom + TILE, Math.min(H - TILE, py));
      setZones(z => ({ ...z, wallBottom: clamped }));
    }
  }, [dragging, zones]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      saveZones(zones);
      setDragging(null);
    }
  }, [dragging, zones]);

  // Zone assignment for a furniture piece
  const getZone = (def: FurnitureDef): PlacementZone => def.zone ?? 'floor';

  // Cycle zone on click
  const cycleZone = (def: FurnitureDef) => {
    const current = getZone(def);
    const next: PlacementZone = current === 'floor' ? 'wall' : current === 'wall' ? 'ceiling' : 'floor';
    def.zone = next;
    setAllDefs([...registry.getAllDefs()]); // force re-render
  };

  return (
    <div style={{ background: '#0a0a0e', minHeight: '100vh', color: '#e0e0e0', padding: 24 }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 14, marginBottom: 16, color: '#F59E0B' }}>
        Zone Editor
      </div>
      <div style={{ fontSize: 12, marginBottom: 16, color: '#888' }}>
        Drag the dashed lines to set zone boundaries. Click furniture to cycle its zone (F → W → C).
      </div>

      {/* Scene selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['room', 'garden', 'bedroom'] as const).map(s => (
          <button
            key={s}
            onClick={() => setScene(s)}
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8, padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: scene === s ? '#F59E0B' : 'rgba(255,255,255,0.08)',
              color: scene === s ? '#1a0e08' : '#a0a0a0',
            }}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Canvas with zone overlay */}
        <div style={{ position: 'relative', width: DISPLAY_W, height: DISPLAY_H, flexShrink: 0 }}>
          <canvas
            ref={bgCanvasRef}
            width={DISPLAY_W}
            height={DISPLAY_H}
            style={{ position: 'absolute', imageRendering: 'pixelated' }}
          />
          <canvas
            ref={canvasRef}
            width={DISPLAY_W}
            height={DISPLAY_H}
            style={{
              position: 'absolute',
              cursor: dragging ? 'row-resize' : 'default',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Furniture list with zone badges */}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, marginBottom: 12, color: '#888' }}>
            FURNITURE — {scene.toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sceneDefs.map(def => {
              const zone = getZone(def);
              return (
                <div
                  key={def.id}
                  onClick={() => cycleZone(def)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    background: 'rgba(255,255,255,0.04)', borderRadius: 4, cursor: 'pointer',
                    border: `1px solid ${ZONE_COLORS[zone]}33`,
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 4,
                    background: ZONE_COLORS[zone],
                    color: '#000', fontWeight: 'bold', fontSize: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'monospace',
                  }}>
                    {ZONE_LABELS[zone]}
                  </div>
                  <div style={{ fontSize: 11, flex: 1 }}>{def.label}</div>
                  <div style={{ fontSize: 9, color: '#666' }}>
                    {def.gridW}×{def.gridH}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zone info */}
          <div style={{ marginTop: 20, fontSize: 10, color: '#666', lineHeight: 1.8 }}>
            <div>Ceiling: rows 0–{Math.floor(zones.ceilingBottom / TILE) - 1} (y 0–{zones.ceilingBottom - 1}px)</div>
            <div>Wall: rows {Math.floor(zones.ceilingBottom / TILE)}–{Math.floor(zones.wallBottom / TILE) - 1} (y {zones.ceilingBottom}–{zones.wallBottom - 1}px)</div>
            <div>Floor: rows {Math.floor(zones.wallBottom / TILE)}–{H / TILE - 1} (y {zones.wallBottom}–{H - 1}px)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
