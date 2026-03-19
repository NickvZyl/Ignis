'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { registry } from '@web/lib/furniture';
import type { FurnitureDef } from '@web/lib/furniture/types';

const W = 192, H = 160, SCALE = 4, TILE = 8;
const DW = W * SCALE, DH = H * SCALE;
const WALL_END = 64; // wall/floor boundary in internal pixels

const ASSET_SIZES_KEY = 'ignis_asset_sizes';
const GRID_SIZES_KEY = 'ignis_grid_sizes';

interface AssetSize { widthPx: number; heightPx: number; offsetX: number; offsetY: number; }
interface GridSize { gridW: number; gridH: number; }

function isValid(s: AssetSize) { return [s.widthPx, s.heightPx, s.offsetX, s.offsetY].every(v => typeof v === 'number' && isFinite(v)); }
function isValidG(g: GridSize) { return typeof g.gridW === 'number' && isFinite(g.gridW) && g.gridW > 0 && typeof g.gridH === 'number' && isFinite(g.gridH) && g.gridH > 0; }

function loadAssetSizes(): Record<string, AssetSize> {
  try {
    const raw = JSON.parse(localStorage.getItem(ASSET_SIZES_KEY) || '{}');
    const clean: Record<string, AssetSize> = {};
    for (const [k, v] of Object.entries(raw)) if (isValid(v as AssetSize)) clean[k] = v as AssetSize;
    if (Object.keys(clean).length !== Object.keys(raw).length) localStorage.setItem(ASSET_SIZES_KEY, JSON.stringify(clean));
    return clean;
  } catch { localStorage.removeItem(ASSET_SIZES_KEY); return {}; }
}
function loadGridSizes(): Record<string, GridSize> {
  try {
    const raw = JSON.parse(localStorage.getItem(GRID_SIZES_KEY) || '{}');
    const clean: Record<string, GridSize> = {};
    for (const [k, v] of Object.entries(raw)) if (isValidG(v as GridSize)) clean[k] = v as GridSize;
    if (Object.keys(clean).length !== Object.keys(raw).length) localStorage.setItem(GRID_SIZES_KEY, JSON.stringify(clean));
    return clean;
  } catch { localStorage.removeItem(GRID_SIZES_KEY); return {}; }
}
function save(a: Record<string, AssetSize>, g: Record<string, GridSize>) {
  localStorage.setItem(ASSET_SIZES_KEY, JSON.stringify(a));
  localStorage.setItem(GRID_SIZES_KEY, JSON.stringify(g));
}

const BG_SRCS: Record<string, string> = { room: '/room-bg.png', garden: '/garden-bg.png' };
type DragMode = null | 'move' | 'tl' | 'tr' | 'bl' | 'br' | 'hb-tl' | 'hb-tr' | 'hb-bl' | 'hb-br';

export default function ResizePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [defs, setDefs] = useState<FurnitureDef[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [assets, setAssets] = useState<Record<string, AssetSize>>(loadAssetSizes);
  const [grids, setGrids] = useState<Record<string, GridSize>>(loadGridSizes);
  const [imgs, setImgs] = useState<Record<string, HTMLImageElement>>({});
  const [bgImgs, setBgImgs] = useState<Record<string, HTMLImageElement>>({});
  const [drag, setDrag] = useState<DragMode>(null);
  const ds = useRef({ mx: 0, my: 0, s: { widthPx: 0, heightPx: 0, offsetX: 0, offsetY: 0 }, g: { gridW: 1, gridH: 1 } });
  const [, setTick] = useState(0);
  const redraw = () => setTick(t => t + 1);

  useEffect(() => {
    setDefs(registry.getAllDefs().filter(d => d.hiResSprites));
    Object.entries(BG_SRCS).forEach(([k, src]) => {
      const img = new Image(); img.src = src;
      img.onload = () => setBgImgs(p => ({ ...p, [k]: img }));
    });
  }, []);

  const def = defs.find(d => d.id === sel);
  const src = def?.hiResSprites?.[0] as string | undefined;
  useEffect(() => {
    if (!src || imgs[src]) return;
    const img = new Image(); img.src = src;
    img.onload = () => setImgs(p => ({ ...p, [src]: img }));
  }, [src]);
  const img = src ? imgs[src] : null;
  const bg = bgImgs[(def?.scene ?? 'room') as string];

  const grid = def ? (grids[def.id] || { gridW: def.gridW, gridH: def.gridH }) : { gridW: 1, gridH: 1 };
  const gpw = grid.gridW * TILE * SCALE;
  const gph = grid.gridH * TILE * SCALE;

  // Anchor: hitbox centered horizontally, sitting on floor line
  const ax = Math.floor(DW / 2 - gpw / 2);
  const ay = WALL_END * SCALE;

  const getSprite = useCallback((): AssetSize => {
    if (def && assets[def.id]) return assets[def.id];
    const aspect = img ? img.naturalHeight / img.naturalWidth : 0.55;
    return { widthPx: gpw, heightPx: gpw * aspect, offsetX: 0, offsetY: gph - gpw * aspect };
  }, [def, assets, img, gpw, gph]);

  const sprite = getSprite();
  const sx = ax + sprite.offsetX;
  const sy = ay + sprite.offsetY;

  // Draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !def) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, DW, DH);

    // Background
    if (bg) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bg, 0, 0, DW, DH);
      ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, 0, DW, DH);
    } else {
      ctx.fillStyle = '#1a1a20'; ctx.fillRect(0, 0, DW, DH);
    }

    // Zone line: wall/floor
    ctx.strokeStyle = 'rgba(100,255,100,0.4)'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, WALL_END * SCALE); ctx.lineTo(DW, WALL_END * SCALE); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(100,255,100,0.4)'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
    ctx.fillText('↑ WALL    ↓ FLOOR', DW - 6, WALL_END * SCALE - 4);

    // Draw the image
    if (img) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sprite.widthPx, sprite.heightPx);

      // Sprite outline (blue)
      ctx.strokeStyle = '#06B6D4'; ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sprite.widthPx, sprite.heightPx);

      // Corner handles
      const HS = 10;
      [[sx, sy], [sx + sprite.widthPx - HS, sy], [sx, sy + sprite.heightPx - HS], [sx + sprite.widthPx - HS, sy + sprite.heightPx - HS]].forEach(([hx, hy]) => {
        ctx.fillStyle = '#06B6D4'; ctx.fillRect(hx, hy, HS, HS);
        ctx.fillStyle = '#fff'; ctx.fillRect(hx + 2, hy + 2, HS - 4, HS - 4);
      });

      // "SPRITE — drag to move, corners to resize" label
      ctx.fillStyle = '#06B6D4'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
      ctx.fillText('SPRITE — drag image to move, corners to resize', sx, sy - 6);
    }

    // Hitbox (yellow) with 4 corner handles
    ctx.strokeStyle = '#F5D03B'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(ax, ay, gpw, gph);
    ctx.setLineDash([]);
    const HB = 10;
    [[ax, ay], [ax + gpw - HB, ay], [ax, ay + gph - HB], [ax + gpw - HB, ay + gph - HB]].forEach(([hx, hy]) => {
      ctx.fillStyle = '#F5D03B'; ctx.fillRect(hx, hy, HB, HB);
      ctx.fillStyle = '#000'; ctx.fillRect(hx + 2, hy + 2, HB - 4, HB - 4);
    });
    ctx.fillStyle = '#F5D03B'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`HITBOX ${grid.gridW}×${grid.gridH} — drag corners or use +/-`, ax + gpw / 2, ay + gph + 14);

    // Info bar
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, DW, 24);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`${def.label}  |  Sprite: ${Math.round(sprite.widthPx)}×${Math.round(sprite.heightPx)}  offset(${Math.round(sprite.offsetX)}, ${Math.round(sprite.offsetY)})  |  Hitbox: ${grid.gridW}×${grid.gridH}`, 8, 16);
  });

  const handleDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!def || !img) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const HS = 14;

    // Hitbox corners (check first — they're on top)
    const hbCorners: [DragMode, number, number][] = [
      ['hb-tl', ax, ay], ['hb-tr', ax + gpw - HS, ay],
      ['hb-bl', ax, ay + gph - HS], ['hb-br', ax + gpw - HS, ay + gph - HS],
    ];
    for (const [mode, cx, cy] of hbCorners) {
      if (mx >= cx && mx <= cx + HS && my >= cy && my <= cy + HS) {
        setDrag(mode);
        ds.current = { mx, my, s: { ...sprite }, g: { ...grid } };
        return;
      }
    }

    // Sprite corners
    const corners: [DragMode, number, number][] = [
      ['tl', sx, sy], ['tr', sx + sprite.widthPx - HS, sy],
      ['bl', sx, sy + sprite.heightPx - HS], ['br', sx + sprite.widthPx - HS, sy + sprite.heightPx - HS],
    ];
    for (const [mode, cx, cy] of corners) {
      if (mx >= cx && mx <= cx + HS && my >= cy && my <= cy + HS) {
        setDrag(mode);
        ds.current = { mx, my, s: { ...sprite }, g: { ...grid } };
        return;
      }
    }

    // Click anywhere on the image to move
    if (mx >= sx && mx <= sx + sprite.widthPx && my >= sy && my <= sy + sprite.heightPx) {
      setDrag('move');
      ds.current = { mx, my, s: { ...sprite }, g: { ...grid } };
    }
  }, [def, img, sx, sy, sprite, ax, ay, gpw, gph, grid]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag || !def || !img) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const dx = mx - ds.current.mx, dy = my - ds.current.my;
    const o = ds.current.s;
    const g = ds.current.g;
    const aspect = img.naturalHeight / img.naturalWidth;
    const tileD = TILE * SCALE; // pixel size of one tile on display

    // Hitbox corner dragging (free pixel, no grid snap)
    if (drag === 'hb-br') {
      const newGW = Math.max(0.5, g.gridW + dx / tileD);
      const newGH = Math.max(0.5, g.gridH + dy / tileD);
      const updated = { ...grids, [def.id]: { gridW: newGW, gridH: newGH } };
      setGrids(updated); save(assets, updated); redraw(); return;
    } else if (drag === 'hb-bl') {
      const newGW = Math.max(0.5, g.gridW - dx / tileD);
      const updated = { ...grids, [def.id]: { gridW: newGW, gridH: g.gridH } };
      setGrids(updated); save(assets, updated); redraw(); return;
    } else if (drag === 'hb-tr') {
      const newGH = Math.max(0.5, g.gridH - dy / tileD);
      const updated = { ...grids, [def.id]: { gridW: g.gridW, gridH: newGH } };
      setGrids(updated); save(assets, updated); redraw(); return;
    } else if (drag === 'hb-tl') {
      const newGW = Math.max(0.5, g.gridW - dx / tileD);
      const newGH = Math.max(0.5, g.gridH - dy / tileD);
      const updated = { ...grids, [def.id]: { gridW: newGW, gridH: newGH } };
      setGrids(updated); save(assets, updated); redraw(); return;
    }

    // Sprite dragging — free resize (independent W/H)
    let newW = o.widthPx, newH = o.heightPx, newOX = o.offsetX, newOY = o.offsetY;

    if (drag === 'move') {
      newOX = o.offsetX + dx;
      newOY = o.offsetY + dy;
    } else if (drag === 'br') {
      newW = Math.max(24, o.widthPx + dx);
      newH = Math.max(24, o.heightPx + dy);
    } else if (drag === 'bl') {
      newW = Math.max(24, o.widthPx - dx);
      newH = Math.max(24, o.heightPx + dy);
      newOX = o.offsetX + (o.widthPx - newW);
    } else if (drag === 'tr') {
      newW = Math.max(24, o.widthPx + dx);
      newH = Math.max(24, o.heightPx - dy);
      newOY = o.offsetY + (o.heightPx - newH);
    } else if (drag === 'tl') {
      newW = Math.max(24, o.widthPx - dx);
      newH = Math.max(24, o.heightPx - dy);
      newOX = o.offsetX + (o.widthPx - newW);
      newOY = o.offsetY + (o.heightPx - newH);
    }

    const updated = { ...assets, [def.id]: { widthPx: newW, heightPx: newH, offsetX: newOX, offsetY: newOY } };
    setAssets(updated);
    save(updated, grids);
    redraw();
  }, [drag, def, img, assets, grids]);

  const handleUp = useCallback(() => { setDrag(null); }, []);

  const adjustGrid = (dw: number, dh: number) => {
    if (!def) return;
    const g = grids[def.id] || { gridW: def.gridW, gridH: def.gridH };
    const updated = { ...grids, [def.id]: { gridW: Math.max(1, g.gridW + dw), gridH: Math.max(1, g.gridH + dh) } };
    setGrids(updated);
    save(assets, updated);
    redraw();
  };

  const reset = () => {
    if (!def) return;
    const { [def.id]: _, ...ra } = assets;
    const { [def.id]: __, ...rg } = grids;
    setAssets(ra); setGrids(rg);
    save(ra, rg);
    redraw();
  };

  const cursor = drag === 'move' ? 'grabbing'
    : drag === 'tl' || drag === 'br' || drag === 'hb-tl' || drag === 'hb-br' ? 'nwse-resize'
    : drag === 'tr' || drag === 'bl' || drag === 'hb-tr' || drag === 'hb-bl' ? 'nesw-resize'
    : 'default';

  return (
    <div style={{ background: '#0a0a0e', minHeight: '100vh', color: '#e0e0e0', padding: 20 }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 14, marginBottom: 6, color: '#F59E0B' }}>
        Resize Tool
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <span style={{ color: '#06B6D4' }}>Blue = sprite visual</span> — drag image to move, drag corners to resize.{' '}
        <span style={{ color: '#F5D03B' }}>Yellow = hitbox</span> — use +/- buttons below.
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 140, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#666', marginBottom: 2 }}>PIECES</div>
          {defs.map(d => (
            <button key={d.id} onClick={() => setSel(d.id)} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 7, padding: '5px 7px', borderRadius: 4,
              border: 'none', cursor: 'pointer', textAlign: 'left',
              background: sel === d.id ? '#F59E0B' : 'rgba(255,255,255,0.06)',
              color: sel === d.id ? '#1a0e08' : '#a0a0a0',
            }}>{d.label}</button>
          ))}

          {def && <>
            <div style={{ marginTop: 14, fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#F5D03B' }}>HITBOX SIZE</div>
            <Row label="W" value={grid.gridW} onMinus={() => adjustGrid(-1, 0)} onPlus={() => adjustGrid(1, 0)} />
            <Row label="H" value={grid.gridH} onMinus={() => adjustGrid(0, -1)} onPlus={() => adjustGrid(0, 1)} />
            <button onClick={reset} style={{
              marginTop: 14, fontFamily: "'Press Start 2P', monospace", fontSize: 7, padding: '5px 7px',
              borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'rgba(220,60,60,0.15)', color: '#e06060',
            }}>RESET ALL</button>
          </>}
        </div>

        <canvas ref={canvasRef} width={DW} height={DH}
          style={{ borderRadius: 8, cursor }}
          onMouseDown={handleDown} onMouseMove={handleMove}
          onMouseUp={handleUp} onMouseLeave={handleUp}
        />
      </div>
    </div>
  );
}

function Row({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  const btn: React.CSSProperties = {
    fontFamily: "'Press Start 2P', monospace", fontSize: 10, padding: '3px 8px',
    borderRadius: 4, border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.1)', color: '#e0e0e0',
  };
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: '#888', width: 14 }}>{label}</span>
      <button onClick={onMinus} style={btn}>−</button>
      <span style={{ fontSize: 12, color: '#F5D03B', width: 24, textAlign: 'center', fontFamily: 'monospace' }}>{value}</span>
      <button onClick={onPlus} style={btn}>+</button>
    </div>
  );
}
