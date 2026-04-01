'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { registry } from '@web/lib/furniture';
import type { FurnitureDef } from '@web/lib/furniture/types';

const W = 192, H = 160, SCALE = 4, TILE = 8;
const DW = W * SCALE, DH = H * SCALE;
const WALL_END = 64;

const ASSET_SIZES_KEY = 'ignis_asset_sizes';
const GRID_SIZES_KEY = 'ignis_grid_sizes';
const ROT_LABELS: Record<number, string> = { 0: 'Front', 1: 'Right', 2: 'Back', 3: 'Left' };

interface AssetSize { widthPx: number; heightPx: number; offsetX: number; offsetY: number; }
interface GridSize { gridW: number; gridH: number; }

function loadMap<T>(key: string): Record<string, T> {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function saveMap(key: string, data: Record<string, unknown>) {
  localStorage.setItem(key, JSON.stringify(data));
}

type DragMode = null | 'move' | 'tl' | 'tr' | 'bl' | 'br';

export default function ResizePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [defs, setDefs] = useState<FurnitureDef[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [rot, setRot] = useState(0);
  const [assets, setAssets] = useState<Record<string, AssetSize>>(() => loadMap(ASSET_SIZES_KEY));
  const [grids, setGrids] = useState<Record<string, GridSize>>(() => loadMap(GRID_SIZES_KEY));
  const [imgs, setImgs] = useState<Record<string, HTMLImageElement>>({});
  const [bgImgs, setBgImgs] = useState<Record<string, HTMLImageElement>>({});
  const [drag, setDrag] = useState<DragMode>(null);
  const [dirty, setDirty] = useState(false);
  const ds = useRef({ mx: 0, my: 0, s: { widthPx: 0, heightPx: 0, offsetX: 0, offsetY: 0 } });
  const [, setTick] = useState(0);
  const redraw = () => setTick(t => t + 1);

  useEffect(() => {
    setDefs(registry.getAllDefs().filter(d => d.hiResSprites));
    for (const [k, src] of Object.entries({ room: '/room-bg.png', garden: '/garden-bg.png' })) {
      const img = new Image(); img.src = src;
      img.onload = () => setBgImgs(p => ({ ...p, [k]: img }));
    }
  }, []);

  const def = defs.find(d => d.id === sel);
  const availableRots = def?.hiResSprites ? Object.keys(def.hiResSprites).map(Number).sort() : [];
  const spriteSrc = def?.hiResSprites?.[rot] as string | undefined;

  // Load sprite images
  useEffect(() => {
    if (!spriteSrc || imgs[spriteSrc]) return;
    const img = new Image(); img.src = spriteSrc;
    img.onload = () => setImgs(p => ({ ...p, [spriteSrc]: img }));
  }, [spriteSrc]);

  // Preload all rotations
  useEffect(() => {
    if (!def?.hiResSprites) return;
    for (const src of Object.values(def.hiResSprites) as string[]) {
      if (!imgs[src]) {
        const i = new Image(); i.src = src;
        i.onload = () => setImgs(p => ({ ...p, [src]: i }));
      }
    }
  }, [def]);

  const img = spriteSrc ? imgs[spriteSrc] : null;
  const bg = bgImgs[(def?.scene ?? 'room') as string];

  // Keys: sprite size is per-rotation, grid size is per-piece (one hitbox for all rotations)
  const sizeKey = def ? `${def.id}_r${rot}` : '';
  const gridSizeKey = def ? def.id : ''; // per-piece, matches what room-grid.ts reads

  const grid = def ? (grids[gridSizeKey] || { gridW: def.gridW, gridH: def.gridH }) : { gridW: 1, gridH: 1 };
  const gpw = grid.gridW * TILE * SCALE;
  const gph = grid.gridH * TILE * SCALE;
  const ax = Math.floor(DW / 2 - gpw / 2);
  const ay = WALL_END * SCALE;

  const getSprite = useCallback((): AssetSize => {
    if (sizeKey && assets[sizeKey]) return assets[sizeKey];
    if (!img) return { widthPx: gpw, heightPx: gph, offsetX: 0, offsetY: 0 };
    // Default: fit within canvas, visible and usable
    const aspect = img.naturalHeight / img.naturalWidth;
    const maxW = DW * 0.45;
    const maxH = DH * 0.55;
    let w = maxW, h = w * aspect;
    if (h > maxH) { h = maxH; w = h / aspect; }
    return { widthPx: w, heightPx: h, offsetX: (gpw - w) / 2, offsetY: gph - h };
  }, [sizeKey, assets, img, gpw, gph]);

  const sprite = getSprite();
  const sx = ax + sprite.offsetX;
  const sy = ay + sprite.offsetY;

  // === SAVE ===
  const handleSave = useCallback(() => {
    saveMap(ASSET_SIZES_KEY, assets);
    saveMap(GRID_SIZES_KEY, grids);
    setDirty(false);
  }, [assets, grids]);

  const updateSprite = useCallback((newSize: AssetSize) => {
    // Save to current rotation + mirror (left<->right)
    const mirrorRot = rot === 1 ? 3 : rot === 3 ? 1 : -1;
    const updated = { ...assets, [sizeKey]: newSize };
    if (mirrorRot >= 0 && def) updated[`${def.id}_r${mirrorRot}`] = newSize;
    setAssets(updated);
    setDirty(true);
    redraw();
  }, [assets, sizeKey, rot, def]);

  const updateGrid = useCallback((newG: GridSize) => {
    const updated = { ...grids, [gridSizeKey]: newG };
    setGrids(updated);
    setDirty(true);
    redraw();
  }, [grids, gridSizeKey]);

  // === SYNC ALL ROTATIONS ===
  const syncAllRotations = useCallback(() => {
    if (!def || !img || !def.hiResSprites) return;
    const currentSize = getSprite();
    const isFB = rot === 0 || rot === 2;
    const currentLenSrc = isFB ? img.naturalWidth : img.naturalHeight;
    const currentLenRendered = isFB ? currentSize.widthPx : currentSize.heightPx;
    const scale = currentLenRendered / currentLenSrc;

    const updated = { ...assets };
    for (const [rStr, src] of Object.entries(def.hiResSprites)) {
      const r = Number(rStr);
      const cachedImg = imgs[src as string];
      if (!cachedImg) continue;
      const rIsFB = r === 0 || r === 2;
      const rLenSrc = rIsFB ? cachedImg.naturalWidth : cachedImg.naturalHeight;
      const rScale = (scale * currentLenSrc) / rLenSrc;
      const w = cachedImg.naturalWidth * rScale;
      const h = cachedImg.naturalHeight * rScale;
      updated[`${def.id}_r${r}`] = { widthPx: w, heightPx: h, offsetX: (gpw - w) / 2, offsetY: gph - h };
    }
    setAssets(updated);
    setDirty(true);
    redraw();
  }, [def, img, rot, assets, imgs, gpw, gph, getSprite]);

  // === DRAW ===
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !def) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, DW, DH);

    if (bg) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bg, 0, 0, DW, DH);
      ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, 0, DW, DH);
    } else {
      ctx.fillStyle = '#1a1a20'; ctx.fillRect(0, 0, DW, DH);
    }

    // Wall/floor line
    ctx.strokeStyle = 'rgba(100,255,100,0.4)'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(DW, ay); ctx.stroke();
    ctx.setLineDash([]);

    // Hitbox (yellow dashed)
    ctx.strokeStyle = '#F5D03B'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(ax, ay, gpw, gph);
    ctx.setLineDash([]);
    ctx.fillStyle = '#F5D03B'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`Hitbox ${grid.gridW}×${grid.gridH}`, ax + gpw / 2, ay + gph + 14);

    // Sprite image
    if (img) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sprite.widthPx, sprite.heightPx);

      // Blue outline + corner handles
      ctx.strokeStyle = '#06B6D4'; ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sprite.widthPx, sprite.heightPx);
      const HS = 10;
      for (const [hx, hy] of [[sx, sy], [sx + sprite.widthPx - HS, sy], [sx, sy + sprite.heightPx - HS], [sx + sprite.widthPx - HS, sy + sprite.heightPx - HS]]) {
        ctx.fillStyle = '#06B6D4'; ctx.fillRect(hx, hy, HS, HS);
        ctx.fillStyle = '#fff'; ctx.fillRect(hx + 2, hy + 2, HS - 4, HS - 4);
      }
    }

    // Info bar
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, DW, 24);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`${def.label} [${ROT_LABELS[rot] ?? rot}]  |  ${Math.round(sprite.widthPx)}×${Math.round(sprite.heightPx)}  |  Hitbox: ${grid.gridW}×${grid.gridH}`, 8, 16);

    // Dirty indicator
    if (dirty) {
      ctx.fillStyle = '#F59E0B'; ctx.textAlign = 'right';
      ctx.fillText('● UNSAVED', DW - 8, 16);
    }
  });

  // === DRAG HANDLERS ===
  const handleDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!def || !img) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const HS = 14;
    const corners: [DragMode, number, number][] = [
      ['tl', sx, sy], ['tr', sx + sprite.widthPx - HS, sy],
      ['bl', sx, sy + sprite.heightPx - HS], ['br', sx + sprite.widthPx - HS, sy + sprite.heightPx - HS],
    ];
    for (const [mode, cx, cy] of corners) {
      if (mx >= cx && mx <= cx + HS && my >= cy && my <= cy + HS) {
        setDrag(mode); ds.current = { mx, my, s: { ...sprite } }; return;
      }
    }
    if (mx >= sx && mx <= sx + sprite.widthPx && my >= sy && my <= sy + sprite.heightPx) {
      setDrag('move'); ds.current = { mx, my, s: { ...sprite } };
    }
  }, [def, img, sx, sy, sprite]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag || !def || !img) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const dx = mx - ds.current.mx, dy = my - ds.current.my;
    const o = ds.current.s;
    const aspect = img.naturalHeight / img.naturalWidth;
    let newW = o.widthPx, newOX = o.offsetX, newOY = o.offsetY;

    if (drag === 'move') { newOX = o.offsetX + dx; newOY = o.offsetY + dy; }
    else if (drag === 'br') { newW = Math.max(24, o.widthPx + dx); }
    else if (drag === 'bl') { newW = Math.max(24, o.widthPx - dx); newOX = o.offsetX + (o.widthPx - newW); }
    else if (drag === 'tr') { newW = Math.max(24, o.widthPx + dx); newOY = o.offsetY + (o.heightPx - newW * aspect); }
    else if (drag === 'tl') { newW = Math.max(24, o.widthPx - dx); newOX = o.offsetX + (o.widthPx - newW); newOY = o.offsetY + (o.heightPx - newW * aspect); }

    const newH = drag === 'move' ? o.heightPx : newW * aspect;
    updateSprite({ widthPx: newW, heightPx: newH, offsetX: newOX, offsetY: newOY });
  }, [drag, def, img, updateSprite]);

  const handleUp = useCallback(() => setDrag(null), []);

  const cursor = drag === 'move' ? 'grabbing'
    : drag === 'tl' || drag === 'br' ? 'nwse-resize'
    : drag === 'tr' || drag === 'bl' ? 'nesw-resize' : 'default';

  const F = "'Press Start 2P', monospace";
  const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    fontFamily: F, fontSize: 7, padding: '5px 7px', borderRadius: 4,
    border: 'none', cursor: 'pointer', textAlign: 'left', background: bg, color,
  });

  return (
    <div style={{ background: '#0a0a0e', minHeight: '100vh', color: '#e0e0e0', padding: 20 }}>
      <div style={{ fontFamily: F, fontSize: 14, marginBottom: 6, color: '#F59E0B' }}>Resize Tool</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        Drag image to move, corners to resize. Use inputs for precise values. Hit SAVE when done.
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 150, display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
          <div style={{ fontFamily: F, fontSize: 7, color: '#666', marginBottom: 2 }}>PIECES</div>
          {defs.map(d => (
            <button key={d.id} onClick={() => { setSel(d.id); setRot(0); }}
              style={btnStyle(sel === d.id ? '#F59E0B' : 'rgba(255,255,255,0.06)', sel === d.id ? '#1a0e08' : '#a0a0a0')}>
              {d.label}
            </button>
          ))}

          {def && availableRots.length > 0 && <>
            <div style={{ marginTop: 14, fontFamily: F, fontSize: 7, color: '#06B6D4' }}>ROTATION</div>
            {availableRots.map(r => (
              <button key={r} onClick={() => setRot(r)}
                style={btnStyle(rot === r ? '#06B6D4' : 'rgba(255,255,255,0.06)', rot === r ? '#000' : '#a0a0a0')}>
                {ROT_LABELS[r] ?? `Rot ${r}`}
              </button>
            ))}
          </>}

          {def && <>
            <div style={{ marginTop: 14, fontFamily: F, fontSize: 7, color: '#06B6D4' }}>SPRITE</div>
            <NumInput label="W" value={Math.round(sprite.widthPx)} onChange={v => {
              const a = img ? img.naturalHeight / img.naturalWidth : 1;
              updateSprite({ widthPx: v, heightPx: v * a, offsetX: sprite.offsetX, offsetY: sprite.offsetY });
            }} />
            <NumInput label="H" value={Math.round(sprite.heightPx)} onChange={v => {
              const a = img ? img.naturalHeight / img.naturalWidth : 1;
              updateSprite({ widthPx: v / a, heightPx: v, offsetX: sprite.offsetX, offsetY: sprite.offsetY });
            }} />
            <NumInput label="X" value={Math.round(sprite.offsetX)} onChange={v => updateSprite({ ...sprite, offsetX: v })} />
            <NumInput label="Y" value={Math.round(sprite.offsetY)} onChange={v => updateSprite({ ...sprite, offsetY: v })} />

            <div style={{ marginTop: 14, fontFamily: F, fontSize: 7, color: '#F5D03B' }}>HITBOX</div>
            <NumInput label="W" value={grid.gridW} onChange={v => updateGrid({ gridW: Math.max(1, v), gridH: grid.gridH })} />
            <NumInput label="H" value={grid.gridH} onChange={v => updateGrid({ gridW: grid.gridW, gridH: Math.max(1, v) })} />

            {availableRots.length > 1 && (
              <button onClick={syncAllRotations} style={{ ...btnStyle('rgba(6,182,212,0.15)', '#06B6D4'), marginTop: 14 }}>
                SYNC ALL ROTS
              </button>
            )}

            {/* === SAVE BUTTON === */}
            <button onClick={handleSave} style={{
              marginTop: 14, fontFamily: F, fontSize: 9, padding: '8px 10px', borderRadius: 4,
              border: dirty ? '2px solid #F59E0B' : '2px solid #333', cursor: 'pointer',
              background: dirty ? '#F59E0B' : '#333', color: dirty ? '#000' : '#888',
              fontWeight: dirty ? 'bold' : 'normal',
            }}>
              {dirty ? '● SAVE' : 'SAVED'}
            </button>

            <button onClick={() => {
              if (!def) return;
              const cleanA = { ...assets };
              const cleanG = { ...grids };
              delete cleanA[def.id];
              delete cleanG[def.id];
              for (let r = 0; r < 4; r++) delete cleanA[`${def.id}_r${r}`];
              setAssets(cleanA); setGrids(cleanG);
              saveMap(ASSET_SIZES_KEY, cleanA); saveMap(GRID_SIZES_KEY, cleanG);
              setDirty(false); redraw();
            }} style={{ ...btnStyle('rgba(220,60,60,0.15)', '#e06060'), marginTop: 8 }}>
              RESET PIECE
            </button>

            <button onClick={() => {
              localStorage.removeItem(ASSET_SIZES_KEY); localStorage.removeItem(GRID_SIZES_KEY);
              setAssets({}); setGrids({}); setDirty(false); redraw();
            }} style={{ ...btnStyle('rgba(220,60,60,0.4)', '#ff4040'), marginTop: 4 }}>
              NUKE ALL
            </button>
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

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: '#888', width: 14 }}>{label}</span>
      <input type="number" value={value}
        onChange={e => { const v = Number(e.target.value); if (isFinite(v)) onChange(v); }}
        style={{ width: 60, fontSize: 10, padding: '2px 4px', background: '#1a1a20', color: '#06B6D4',
          border: '1px solid #333', borderRadius: 3, fontFamily: 'monospace' }}
      />
    </div>
  );
}
