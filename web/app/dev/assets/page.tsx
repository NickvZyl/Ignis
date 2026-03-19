'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { registry } from '@web/lib/furniture';
import type { FurnitureDef } from '@web/lib/furniture/types';

const W = 192, H = 160, SCALE = 4;
const TILE = 8;
const DISPLAY_W = W * SCALE, DISPLAY_H = H * SCALE;
const STORAGE_KEY = 'ignis_asset_sizes';

interface AssetSize {
  widthPx: number;
  heightPx: number;
  offsetX: number;
  offsetY: number;
}

function loadSizes(): Record<string, AssetSize> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveSizes(sizes: Record<string, AssetSize>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
}

// Room background image
const BG_SRCS: Record<string, string> = { room: '/room-bg.png', garden: '/garden-bg.png' };
const bgImgs: Record<string, HTMLImageElement> = {};

export default function AssetSizerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [allDefs, setAllDefs] = useState<FurnitureDef[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Record<string, AssetSize>>(loadSizes);
  const [loadedImgs, setLoadedImgs] = useState<Record<string, HTMLImageElement>>({});
  const [dragging, setDragging] = useState<'resize' | 'move' | null>(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, startW: 0, startH: 0, startOX: 0, startOY: 0 });

  useEffect(() => {
    setAllDefs(registry.getAllDefs().filter(d => d.hiResSprites));
    // Load background images
    Object.entries(BG_SRCS).forEach(([scene, src]) => {
      const img = new Image();
      img.src = src;
      img.onload = () => { bgImgs[scene] = img; setBgLoaded(true); };
    });
  }, []);

  // Load sprite images for selected piece
  useEffect(() => {
    if (!selected) return;
    const def = allDefs.find(d => d.id === selected);
    if (!def?.hiResSprites) return;
    Object.entries(def.hiResSprites).forEach(([, src]) => {
      if (loadedImgs[src as string]) return;
      const img = new Image();
      img.src = src as string;
      img.onload = () => setLoadedImgs(prev => ({ ...prev, [src as string]: img }));
    });
  }, [selected, allDefs]);

  const selectedDef = allDefs.find(d => d.id === selected);
  const frontSrc = selectedDef?.hiResSprites?.[0];
  const frontImg = frontSrc ? loadedImgs[frontSrc] : null;

  // Default must match the scene renderer's default exactly
  const getSize = (id: string, def: FurnitureDef): AssetSize => {
    if (sizes[id]) return sizes[id];
    const gridW = def.gridW * TILE * SCALE;
    const gridH = def.gridH * TILE * SCALE;
    const img = frontSrc ? loadedImgs[frontSrc] : null;
    const aspect = img ? img.naturalHeight / img.naturalWidth : 0.6;
    const dw = gridW;
    const dh = gridW * aspect;
    // Anchor to bottom of grid (same as scene renderer default)
    return { widthPx: dw, heightPx: dh, offsetX: 0, offsetY: gridH - dh };
  };

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedDef) return;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);

    // Draw room background
    const scene = (selectedDef.scene ?? 'room') as string;
    const bgImg = bgImgs[scene];
    if (bgImg) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bgImg, 0, 0, DISPLAY_W, DISPLAY_H);
      // Slight darken overlay so furniture stands out
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
    } else {
      ctx.fillStyle = '#1a1a20';
      ctx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
    }

    // Grid footprint (fixed — doesn't scale with sprite)
    const gridW = selectedDef.gridW * TILE * SCALE;
    const gridH = selectedDef.gridH * TILE * SCALE;
    // Place grid in the middle-bottom area (like furniture on the floor)
    const gridX = Math.floor(DISPLAY_W / 2 - gridW / 2);
    const gridY = Math.floor(DISPLAY_H * 0.55);

    // Grid cells
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= selectedDef.gridW; gx++) {
      ctx.beginPath();
      ctx.moveTo(gridX + gx * TILE * SCALE, gridY);
      ctx.lineTo(gridX + gx * TILE * SCALE, gridY + gridH);
      ctx.stroke();
    }
    for (let gy = 0; gy <= selectedDef.gridH; gy++) {
      ctx.beginPath();
      ctx.moveTo(gridX, gridY + gy * TILE * SCALE);
      ctx.lineTo(gridX + gridW, gridY + gy * TILE * SCALE);
      ctx.stroke();
    }

    // Grid outline (hitbox)
    ctx.strokeStyle = '#F5D03B';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(gridX, gridY, gridW, gridH);
    ctx.setLineDash([]);

    // Draw sprite
    if (frontImg) {
      const size = getSize(selected!, selectedDef);
      const imgX = gridX + size.offsetX;
      const imgY = gridY + size.offsetY;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(frontImg, imgX, imgY, size.widthPx, size.heightPx);

      // Sprite outline
      ctx.strokeStyle = 'rgba(6,182,212,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(imgX, imgY, size.widthPx, size.heightPx);
      ctx.setLineDash([]);

      // Resize handle (bottom-right)
      ctx.fillStyle = '#06B6D4';
      ctx.fillRect(imgX + size.widthPx - 10, imgY + size.heightPx - 10, 10, 10);

      // Move handle (top-left)
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(imgX, imgY, 10, 10);
    }

    // Info
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, DISPLAY_W, 28);
    ctx.fillStyle = '#06B6D4';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    if (frontImg) {
      const size = getSize(selected!, selectedDef);
      ctx.fillText(`${selectedDef.label}  |  sprite: ${Math.round(size.widthPx)}×${Math.round(size.heightPx)}px  |  offset: (${Math.round(size.offsetX)}, ${Math.round(size.offsetY)})  |  grid: ${gridW}×${gridH}px (fixed)`, 8, 18);
    } else {
      ctx.fillText(`${selectedDef.label}  |  loading sprite...`, 8, 18);
    }
  }, [selected, selectedDef, frontImg, sizes, bgLoaded]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selected || !selectedDef || !frontImg) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const size = getSize(selected, selectedDef);
    const gridW = selectedDef.gridW * TILE * SCALE;
    const gridH = selectedDef.gridH * TILE * SCALE;
    const gridX = Math.floor(DISPLAY_W / 2 - gridW / 2);
    const gridY = Math.floor(DISPLAY_H * 0.55);
    const imgX = gridX + size.offsetX;
    const imgY = gridY + size.offsetY;

    if (mx > imgX + size.widthPx - 16 && my > imgY + size.heightPx - 16) {
      setDragging('resize');
      dragStart.current = { mx, my, startW: size.widthPx, startH: size.heightPx, startOX: size.offsetX, startOY: size.offsetY };
    } else if (mx >= imgX && mx < imgX + 16 && my >= imgY && my < imgY + 16) {
      setDragging('move');
      dragStart.current = { mx, my, startW: size.widthPx, startH: size.heightPx, startOX: size.offsetX, startOY: size.offsetY };
    }
  }, [selected, selectedDef, frontImg, sizes]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !selected || !selectedDef || !frontImg) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ds = dragStart.current;

    if (dragging === 'resize') {
      const dx = mx - ds.mx;
      const aspect = frontImg.naturalHeight / frontImg.naturalWidth;
      const newW = Math.max(32, ds.startW + dx);
      const newH = newW * aspect;
      setSizes(prev => ({ ...prev, [selected]: { ...getSize(selected, selectedDef), widthPx: newW, heightPx: newH } }));
    } else if (dragging === 'move') {
      const dx = mx - ds.mx;
      const dy = my - ds.my;
      setSizes(prev => ({ ...prev, [selected]: { ...getSize(selected, selectedDef), offsetX: ds.startOX + dx, offsetY: ds.startOY + dy } }));
    }
  }, [dragging, selected, selectedDef, frontImg, sizes]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      saveSizes(sizes);
      setDragging(null);
    }
  }, [dragging, sizes]);

  return (
    <div style={{ background: '#0a0a0e', minHeight: '100vh', color: '#e0e0e0', padding: 24 }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 14, marginBottom: 16, color: '#F59E0B' }}>
        Asset Sizer
      </div>
      <div style={{ fontSize: 12, marginBottom: 16, color: '#888' }}>
        Drag <span style={{ color: '#06B6D4' }}>blue handle</span> to resize sprite. Drag <span style={{ color: '#F59E0B' }}>yellow handle</span> to offset. Yellow dashed box = hitbox (fixed).
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Piece selector */}
        <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {allDefs.map(def => (
            <button
              key={def.id}
              onClick={() => setSelected(def.id)}
              style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 8,
                padding: '8px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', textAlign: 'left',
                background: selected === def.id ? '#F59E0B' : 'rgba(255,255,255,0.06)',
                color: selected === def.id ? '#1a0e08' : '#a0a0a0',
              }}
            >
              {def.label}
            </button>
          ))}
          {allDefs.length === 0 && (
            <div style={{ fontSize: 10, color: '#666' }}>No furniture with hiResSprites yet</div>
          )}
        </div>

        {/* Preview — same size as the actual display canvas */}
        <canvas
          ref={canvasRef}
          width={DISPLAY_W}
          height={DISPLAY_H}
          style={{ borderRadius: 8, cursor: dragging === 'resize' ? 'nwse-resize' : dragging === 'move' ? 'grabbing' : 'default' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
}
