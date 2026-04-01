'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { registry } from '@web/lib/furniture';
import { api } from '@web/lib/api';
import type { FurnitureDef } from '@web/lib/furniture/types';
import {
  TILE, GRID_W, GRID_H, WALL_ROWS, CEILING_ROWS,
  FURNITURE_DEFS, getPixelPos, getSpriteSize,
  getFurnitureConfig, applyFurnitureConfig,
  DEFAULT_LAYOUT, GARDEN_DEFAULT_LAYOUT, BEDROOM_DEFAULT_LAYOUT,
} from '@web/lib/room-grid';
import type { FurnitureConfig, FurniturePieceConfig, SpriteSize, PlacedFurniture, SceneId } from '@web/lib/room-grid';
import { getRotatedDims, getRotatedSpot } from '@web/lib/furniture';
import { useRoomStore } from '@web/stores/room-store';

const W = 192, H = 160, SCALE = 4;
const DW = W * SCALE, DH = H * SCALE;
const ROT_LABELS: Record<number, string> = { 0: 'Front', 1: 'Right', 2: 'Back', 3: 'Left' };
const HANDLE_SIZE = 8; // px radius for drag handles

type DragMode =
  | null
  | 'spot'           // dragging the spot dot
  | 'sprite-move'    // dragging the sprite body to reposition
  | 'sprite-tl'      // resize from top-left corner
  | 'sprite-tr'      // resize from top-right corner
  | 'sprite-bl'      // resize from bottom-left corner
  | 'sprite-br'      // resize from bottom-right corner
  | 'hitbox-r'       // drag right edge of hitbox
  | 'hitbox-b'       // drag bottom edge of hitbox
  | 'hitbox-br';     // drag bottom-right corner of hitbox

export default function FurnitureEditorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const allDefs = useRef<FurnitureDef[]>([]);

  const { layout, currentScene, switchSceneLayout } = useRoomStore();

  const [config, setConfig] = useState<FurnitureConfig>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRot, setSelectedRot] = useState<number>(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [spriteImgs, setSpriteImgs] = useState<Record<string, HTMLImageElement>>({});
  const [bgImgs, setBgImgs] = useState<Record<string, HTMLImageElement>>({});

  const [editGridW, setEditGridW] = useState(1);
  const [editGridH, setEditGridH] = useState(1);
  const [editSpotDx, setEditSpotDx] = useState(0);
  const [editSpotDy, setEditSpotDy] = useState(0);
  const [editWidthPx, setEditWidthPx] = useState(0);
  const [editHeightPx, setEditHeightPx] = useState(0);
  const [editOffsetX, setEditOffsetX] = useState(0);
  const [editOffsetY, setEditOffsetY] = useState(0);
  const [aspectLock, setAspectLock] = useState(true);
  const aspectRatio = useRef<number>(1);

  // Drag state
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStart = useRef({ mx: 0, my: 0, val: { w: 0, h: 0, ox: 0, oy: 0, gw: 0, gh: 0, sdx: 0, sdy: 0 } });

  // Init
  useEffect(() => {
    allDefs.current = registry.getAllDefs();
    fetch(api('/api/furniture-config'))
      .then(r => r.json())
      .then((cfg: FurnitureConfig) => { setConfig(cfg); applyFurnitureConfig(cfg); })
      .catch(() => {});
    for (const [key, src] of Object.entries({ room: '/room-bg.png', garden: '/garden-bg.png', bedroom: '/bedroom-bg.png' })) {
      const img = new Image(); img.src = src;
      img.onload = () => setBgImgs(p => ({ ...p, [key]: img }));
    }
  }, []);

  const selectedDef = selectedId ? allDefs.current.find(d => d.id === selectedId) ?? null : null;
  const availableRots = selectedDef?.hiResSprites ? Object.keys(selectedDef.hiResSprites).map(Number).sort() : [0];

  // Load sprite images
  useEffect(() => {
    const toLoad: Record<string, string> = {};
    for (const placed of layout.furniture) {
      const def = allDefs.current.find(d => d.id === placed.id);
      if (!def?.hiResSprites) continue;
      const rot = placed.rot ?? 0;
      const src = def.hiResSprites[rot] as string | undefined;
      if (src && !spriteImgs[src]) toLoad[src] = src;
      if (placed.id === selectedId) {
        for (const s of Object.values(def.hiResSprites) as string[]) {
          if (!spriteImgs[s]) toLoad[s] = s;
        }
      }
    }
    if (selectedDef?.hiResSprites) {
      for (const s of Object.values(selectedDef.hiResSprites) as string[]) {
        if (!spriteImgs[s]) toLoad[s] = s;
      }
    }
    for (const src of Object.values(toLoad)) {
      const img = new Image(); img.src = src;
      img.onload = () => setSpriteImgs(p => ({ ...p, [src]: img }));
    }
  }, [layout.furniture, selectedId, selectedDef]);

  // Load values when selection changes
  useEffect(() => {
    if (!selectedDef) return;
    const cfg = config[selectedDef.id];
    setEditGridW(cfg?.gridW ?? selectedDef.gridW);
    setEditGridH(cfg?.gridH ?? selectedDef.gridH);
    setEditSpotDx(cfg?.spotDx ?? selectedDef.spotDx);
    setEditSpotDy(cfg?.spotDy ?? selectedDef.spotDy);
    loadSpriteValues(selectedDef, selectedRot, cfg);
  }, [selectedId, selectedDef]);

  useEffect(() => {
    if (!selectedDef) return;
    const cfg = config[selectedDef.id];
    loadSpriteValues(selectedDef, selectedRot, cfg);
  }, [selectedRot]);

  function loadSpriteValues(def: FurnitureDef, rot: number, cfg: FurniturePieceConfig | undefined) {
    let sprite: SpriteSize | null = null;
    if (rot !== 0 && cfg?.spriteOverrides?.[String(rot)]) sprite = cfg.spriteOverrides[String(rot)];
    else if (cfg?.sprite) sprite = cfg.sprite;

    if (sprite) {
      setEditWidthPx(sprite.widthPx);
      setEditHeightPx(sprite.heightPx);
      setEditOffsetX(sprite.offsetX);
      setEditOffsetY(sprite.offsetY);
      aspectRatio.current = sprite.heightPx / sprite.widthPx;
    } else {
      const dims = getRotatedDims(def, rot as 0 | 1 | 2 | 3);
      const gridW = dims.gridW * TILE * SCALE;
      const gridH = dims.gridH * TILE * SCALE;
      const src = def.hiResSprites?.[rot] as string | undefined;
      const img = src ? spriteImgs[src] : null;
      if (img) {
        const aspect = img.naturalHeight / img.naturalWidth;
        let dw: number, dh: number;
        if (gridW * aspect <= gridH) { dw = gridW; dh = gridW * aspect; }
        else { dh = gridH; dw = gridH / aspect; }
        setEditWidthPx(Math.round(dw)); setEditHeightPx(Math.round(dh));
        setEditOffsetX(Math.round((gridW - dw) / 2)); setEditOffsetY(Math.round(gridH - dh));
        aspectRatio.current = aspect;
      } else {
        setEditWidthPx(gridW); setEditHeightPx(gridH);
        setEditOffsetX(0); setEditOffsetY(0);
        aspectRatio.current = gridH / gridW;
      }
    }
  }

  // Apply edits to config
  const applyEdits = useCallback(() => {
    if (!selectedDef) return;
    const newConfig = { ...config };
    if (!newConfig[selectedDef.id]) newConfig[selectedDef.id] = {};
    const piece = { ...newConfig[selectedDef.id] };
    piece.gridW = editGridW;
    piece.gridH = editGridH;
    piece.spotDx = editSpotDx;
    piece.spotDy = editSpotDy;
    const spriteVal: SpriteSize = { widthPx: editWidthPx, heightPx: editHeightPx, offsetX: editOffsetX, offsetY: editOffsetY };
    if (selectedRot === 0) { piece.sprite = spriteVal; }
    else {
      if (!piece.spriteOverrides) piece.spriteOverrides = {};
      piece.spriteOverrides = { ...piece.spriteOverrides, [String(selectedRot)]: spriteVal };
    }
    newConfig[selectedDef.id] = piece;
    setConfig(newConfig);
    setDirty(true);
  }, [selectedDef, selectedRot, editGridW, editGridH, editSpotDx, editSpotDy, editWidthPx, editHeightPx, editOffsetX, editOffsetY, config]);

  useEffect(() => {
    if (!selectedDef) return;
    applyEdits();
  }, [editGridW, editGridH, editSpotDx, editSpotDy, editWidthPx, editHeightPx, editOffsetX, editOffsetY]);

  const saveConfig = async () => {
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(api('/api/furniture-config'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) { applyFurnitureConfig(config); setDirty(false); setSaveMsg('Saved!'); setTimeout(() => setSaveMsg(''), 2000); }
      else setSaveMsg('Save failed');
    } catch { setSaveMsg('Save failed'); }
    setSaving(false);
  };

  const resetPiece = () => {
    if (!selectedDef) return;
    const newConfig = { ...config };
    delete newConfig[selectedDef.id];
    setConfig(newConfig); setDirty(true);
    setEditGridW(selectedDef.gridW); setEditGridH(selectedDef.gridH);
    setEditSpotDx(selectedDef.spotDx); setEditSpotDy(selectedDef.spotDy);
    loadSpriteValues(selectedDef, selectedRot, undefined);
  };

  // ── Canvas mouse coordinate helper ──
  function canvasCoords(e: React.MouseEvent<HTMLCanvasElement>): { mx: number; my: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left) * (DW / rect.width),
      my: (e.clientY - rect.top) * (DH / rect.height),
    };
  }

  // Get the selected piece's placement and pixel positions for hit testing
  function getSelectedGeometry() {
    if (!selectedId || !selectedDef) return null;
    const placed = layout.furniture.find(f => f.id === selectedId);
    if (!placed) return null;
    const p = getPixelPos(placed);
    const gx = p.x * SCALE;
    const gy = p.y * SCALE;
    // Sprite bounds
    const sx = gx + editOffsetX;
    const sy = gy + editOffsetY;
    const sw = editWidthPx;
    const sh = editHeightPx;
    // Hitbox bounds
    const hx = gx;
    const hy = gy;
    const hw = editGridW * TILE * SCALE;
    const hh = editGridH * TILE * SCALE;
    // Spot position
    const spotX = (placed.gx + editSpotDx) * TILE * SCALE;
    const spotY = (placed.gy + editSpotDy) * TILE * SCALE;
    return { placed, gx, gy, sx, sy, sw, sh, hx, hy, hw, hh, spotX, spotY };
  }

  // ── Mouse down: detect what to drag ──
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { mx, my } = canvasCoords(e);
    const geo = getSelectedGeometry();

    if (geo) {
      const { sx, sy, sw, sh, hx, hy, hw, hh, spotX, spotY } = geo;

      // 1. Check spot dot (highest priority — small target)
      const spotDist = Math.sqrt((mx - spotX) ** 2 + (my - spotY) ** 2);
      if (spotDist < 14) {
        setDragMode('spot');
        dragStart.current = { mx, my, val: { w: 0, h: 0, ox: 0, oy: 0, gw: 0, gh: 0, sdx: editSpotDx, sdy: editSpotDy } };
        e.preventDefault();
        return;
      }

      // 2. Check sprite corner handles (resize)
      const corners: { mode: DragMode; cx: number; cy: number }[] = [
        { mode: 'sprite-tl', cx: sx, cy: sy },
        { mode: 'sprite-tr', cx: sx + sw, cy: sy },
        { mode: 'sprite-bl', cx: sx, cy: sy + sh },
        { mode: 'sprite-br', cx: sx + sw, cy: sy + sh },
      ];
      for (const { mode, cx, cy } of corners) {
        if (Math.abs(mx - cx) < HANDLE_SIZE + 4 && Math.abs(my - cy) < HANDLE_SIZE + 4) {
          setDragMode(mode);
          dragStart.current = { mx, my, val: { w: editWidthPx, h: editHeightPx, ox: editOffsetX, oy: editOffsetY, gw: 0, gh: 0, sdx: 0, sdy: 0 } };
          e.preventDefault();
          return;
        }
      }

      // 3. Check hitbox corner/edge handles
      const hbr = { cx: hx + hw, cy: hy + hh };
      if (Math.abs(mx - hbr.cx) < HANDLE_SIZE + 4 && Math.abs(my - hbr.cy) < HANDLE_SIZE + 4) {
        setDragMode('hitbox-br');
        dragStart.current = { mx, my, val: { w: 0, h: 0, ox: 0, oy: 0, gw: editGridW, gh: editGridH, sdx: 0, sdy: 0 } };
        e.preventDefault();
        return;
      }
      // Right edge
      if (Math.abs(mx - (hx + hw)) < 6 && my > hy && my < hy + hh) {
        setDragMode('hitbox-r');
        dragStart.current = { mx, my, val: { w: 0, h: 0, ox: 0, oy: 0, gw: editGridW, gh: editGridH, sdx: 0, sdy: 0 } };
        e.preventDefault();
        return;
      }
      // Bottom edge
      if (Math.abs(my - (hy + hh)) < 6 && mx > hx && mx < hx + hw) {
        setDragMode('hitbox-b');
        dragStart.current = { mx, my, val: { w: 0, h: 0, ox: 0, oy: 0, gw: editGridW, gh: editGridH, sdx: 0, sdy: 0 } };
        e.preventDefault();
        return;
      }

      // 4. Check sprite body (move)
      if (mx >= sx && mx <= sx + sw && my >= sy && my <= sy + sh) {
        setDragMode('sprite-move');
        dragStart.current = { mx, my, val: { w: editWidthPx, h: editHeightPx, ox: editOffsetX, oy: editOffsetY, gw: 0, gh: 0, sdx: 0, sdy: 0 } };
        e.preventDefault();
        return;
      }
    }

    // 5. No handle hit — try to select a new piece
    const furniture = [...layout.furniture].reverse();
    for (const placed of furniture) {
      const def = allDefs.current.find(d => d.id === placed.id);
      if (!def) continue;
      const rot = placed.rot ?? 0;
      const dims = getRotatedDims(def, rot as 0 | 1 | 2 | 3);
      const p = getPixelPos(placed);
      const x = p.x * SCALE, y = p.y * SCALE;
      const w = dims.gridW * TILE * SCALE, h = dims.gridH * TILE * SCALE;
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
        setSelectedId(placed.id);
        setSelectedRot(rot);
        return;
      }
    }
  }, [selectedId, selectedDef, layout, editWidthPx, editHeightPx, editOffsetX, editOffsetY, editGridW, editGridH, editSpotDx, editSpotDy]);

  // ── Mouse move: update values during drag ──
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragMode || !selectedDef) return;
    const { mx, my } = canvasCoords(e);
    const ds = dragStart.current;
    const ddx = mx - ds.mx;
    const ddy = my - ds.my;

    if (dragMode === 'spot') {
      const placed = layout.furniture.find(f => f.id === selectedId);
      if (placed) {
        const newSpotDx = mx / (TILE * SCALE) - placed.gx;
        const newSpotDy = my / (TILE * SCALE) - placed.gy;
        setEditSpotDx(Math.round(newSpotDx * 4) / 4); // snap to 0.25 grid
        setEditSpotDy(Math.round(newSpotDy * 4) / 4);
      }
    } else if (dragMode === 'sprite-move') {
      setEditOffsetX(Math.round(ds.val.ox + ddx));
      setEditOffsetY(Math.round(ds.val.oy + ddy));
    } else if (dragMode === 'sprite-br') {
      const newW = Math.max(8, Math.round(ds.val.w + ddx));
      if (aspectLock) {
        setEditWidthPx(newW);
        setEditHeightPx(Math.round(newW * aspectRatio.current));
      } else {
        setEditWidthPx(newW);
        setEditHeightPx(Math.max(8, Math.round(ds.val.h + ddy)));
      }
    } else if (dragMode === 'sprite-bl') {
      const newW = Math.max(8, Math.round(ds.val.w - ddx));
      const newOx = Math.round(ds.val.ox + ddx);
      if (aspectLock) {
        const newH = Math.round(newW * aspectRatio.current);
        setEditWidthPx(newW);
        setEditHeightPx(newH);
        setEditOffsetX(newOx);
      } else {
        setEditWidthPx(newW);
        setEditHeightPx(Math.max(8, Math.round(ds.val.h + ddy)));
        setEditOffsetX(newOx);
      }
    } else if (dragMode === 'sprite-tr') {
      const newW = Math.max(8, Math.round(ds.val.w + ddx));
      const newOy = Math.round(ds.val.oy + ddy);
      if (aspectLock) {
        const newH = Math.round(newW * aspectRatio.current);
        setEditWidthPx(newW);
        setEditHeightPx(newH);
      } else {
        setEditWidthPx(newW);
        setEditHeightPx(Math.max(8, Math.round(ds.val.h - ddy)));
        setEditOffsetY(newOy);
      }
    } else if (dragMode === 'sprite-tl') {
      const newW = Math.max(8, Math.round(ds.val.w - ddx));
      const newOx = Math.round(ds.val.ox + ddx);
      const newOy = Math.round(ds.val.oy + ddy);
      if (aspectLock) {
        const newH = Math.round(newW * aspectRatio.current);
        setEditWidthPx(newW);
        setEditHeightPx(newH);
        setEditOffsetX(newOx);
      } else {
        setEditWidthPx(newW);
        setEditHeightPx(Math.max(8, Math.round(ds.val.h - ddy)));
        setEditOffsetX(newOx);
        setEditOffsetY(newOy);
      }
    } else if (dragMode === 'hitbox-r') {
      const newGridW = Math.max(1, Math.round(ds.val.gw + ddx / (TILE * SCALE)));
      setEditGridW(newGridW);
    } else if (dragMode === 'hitbox-b') {
      const newGridH = Math.max(1, Math.round(ds.val.gh + ddy / (TILE * SCALE)));
      setEditGridH(newGridH);
    } else if (dragMode === 'hitbox-br') {
      setEditGridW(Math.max(1, Math.round(ds.val.gw + ddx / (TILE * SCALE))));
      setEditGridH(Math.max(1, Math.round(ds.val.gh + ddy / (TILE * SCALE))));
    }
  }, [dragMode, selectedId, selectedDef, layout, aspectLock]);

  // ── Mouse up: end drag ──
  const handleMouseUp = useCallback(() => {
    setDragMode(null);
  }, []);

  // ── Cursor style based on hover position ──
  const [cursorStyle, setCursorStyle] = useState('crosshair');
  const handleMouseMoveForCursor = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMode) {
      // Already dragging — keep the drag cursor
      handleMouseMove(e);
      return;
    }
    if (!selectedDef) { setCursorStyle('crosshair'); return; }
    const { mx, my } = canvasCoords(e);
    const geo = getSelectedGeometry();
    if (!geo) { setCursorStyle('crosshair'); return; }

    const { sx, sy, sw, sh, hx, hy, hw, hh, spotX, spotY } = geo;

    // Spot
    if (Math.sqrt((mx - spotX) ** 2 + (my - spotY) ** 2) < 14) { setCursorStyle('move'); return; }

    // Sprite corners
    if (Math.abs(mx - sx) < HANDLE_SIZE + 4 && Math.abs(my - sy) < HANDLE_SIZE + 4) { setCursorStyle('nwse-resize'); return; }
    if (Math.abs(mx - (sx + sw)) < HANDLE_SIZE + 4 && Math.abs(my - sy) < HANDLE_SIZE + 4) { setCursorStyle('nesw-resize'); return; }
    if (Math.abs(mx - sx) < HANDLE_SIZE + 4 && Math.abs(my - (sy + sh)) < HANDLE_SIZE + 4) { setCursorStyle('nesw-resize'); return; }
    if (Math.abs(mx - (sx + sw)) < HANDLE_SIZE + 4 && Math.abs(my - (sy + sh)) < HANDLE_SIZE + 4) { setCursorStyle('nwse-resize'); return; }

    // Hitbox edges
    if (Math.abs(mx - (hx + hw)) < 6 && Math.abs(my - (hy + hh)) < 6) { setCursorStyle('nwse-resize'); return; }
    if (Math.abs(mx - (hx + hw)) < 6 && my > hy && my < hy + hh) { setCursorStyle('ew-resize'); return; }
    if (Math.abs(my - (hy + hh)) < 6 && mx > hx && mx < hx + hw) { setCursorStyle('ns-resize'); return; }

    // Sprite body
    if (mx >= sx && mx <= sx + sw && my >= sy && my <= sy + sh) { setCursorStyle('grab'); return; }

    setCursorStyle('crosshair');
  }, [selectedDef, selectedId, editWidthPx, editHeightPx, editOffsetX, editOffsetY, editGridW, editGridH, editSpotDx, editSpotDy, layout, dragMode, handleMouseMove]);

  // ── Canvas draw ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = DW;
    canvas.height = DH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, DW, DH);

    const bg = bgImgs[currentScene];
    if (bg) {
      ctx.drawImage(bg, 0, 0, DW, DH);
    } else {
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(0, 0, DW, WALL_ROWS * TILE * SCALE);
      ctx.fillStyle = '#3a3a2a';
      ctx.fillRect(0, WALL_ROWS * TILE * SCALE, DW, DH - WALL_ROWS * TILE * SCALE);
    }

    // Grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) {
      ctx.beginPath(); ctx.moveTo(x * TILE * SCALE, 0); ctx.lineTo(x * TILE * SCALE, DH); ctx.stroke();
    }
    for (let y = 0; y <= GRID_H; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * TILE * SCALE); ctx.lineTo(DW, y * TILE * SCALE); ctx.stroke();
    }

    // Draw all furniture
    for (const placed of layout.furniture) {
      const def = allDefs.current.find(d => d.id === placed.id);
      if (!def) continue;
      const rot = placed.rot ?? 0;
      const dims = getRotatedDims(def, rot as 0 | 1 | 2 | 3);
      const p = getPixelPos(placed);
      const isSelected = placed.id === selectedId;

      ctx.globalAlpha = isSelected ? 1.0 : 0.6;

      const src = def.hiResSprites?.[rot] as string | undefined;
      const img = src ? spriteImgs[src] : null;

      if (img) {
        let spriteSize: SpriteSize | null = null;
        if (isSelected) {
          spriteSize = { widthPx: editWidthPx, heightPx: editHeightPx, offsetX: editOffsetX, offsetY: editOffsetY };
        } else {
          const cfg = config[def.id];
          if (cfg) {
            if (rot !== 0 && cfg.spriteOverrides?.[String(rot)]) spriteSize = cfg.spriteOverrides[String(rot)];
            else if (cfg.sprite) spriteSize = cfg.sprite;
          }
        }

        if (spriteSize) {
          ctx.drawImage(img, p.x * SCALE + spriteSize.offsetX, p.y * SCALE + spriteSize.offsetY, spriteSize.widthPx, spriteSize.heightPx);
        } else {
          const gridW = dims.gridW * TILE * SCALE;
          const gridH = dims.gridH * TILE * SCALE;
          const aspect = img.naturalHeight / img.naturalWidth;
          let dw: number, dh: number;
          if (gridW * aspect <= gridH) { dw = gridW; dh = gridW * aspect; }
          else { dh = gridH; dw = gridH / aspect; }
          ctx.drawImage(img, p.x * SCALE + (gridW - dw) / 2, p.y * SCALE + gridH - dh, dw, dh);
        }
      } else {
        ctx.fillStyle = isSelected ? 'rgba(255,200,0,0.3)' : 'rgba(100,100,200,0.3)';
        ctx.fillRect(p.x * SCALE, p.y * SCALE, dims.gridW * TILE * SCALE, dims.gridH * TILE * SCALE);
      }

      ctx.globalAlpha = 1.0;

      // Selected piece overlays
      if (isSelected) {
        const hbW = editGridW;
        const hbH = editGridH;
        const hx = p.x * SCALE;
        const hy = p.y * SCALE;
        const hw = hbW * TILE * SCALE;
        const hh = hbH * TILE * SCALE;

        // Hitbox outline (yellow dashed)
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#ffdd00';
        ctx.lineWidth = 2;
        ctx.strokeRect(hx, hy, hw, hh);
        ctx.restore();

        // Hitbox drag handles — right edge, bottom edge, corner
        ctx.fillStyle = '#ffdd00';
        ctx.globalAlpha = 0.7;
        // Right edge handle
        ctx.fillRect(hx + hw - 3, hy + hh / 2 - 8, 6, 16);
        // Bottom edge handle
        ctx.fillRect(hx + hw / 2 - 8, hy + hh - 3, 16, 6);
        // Corner handle
        ctx.fillRect(hx + hw - 5, hy + hh - 5, 10, 10);
        ctx.globalAlpha = 1.0;

        // Sprite bounds (blue dashed)
        const sx = hx + editOffsetX;
        const sy = hy + editOffsetY;
        const sw = editWidthPx;
        const sh = editHeightPx;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();

        // Sprite corner handles (blue squares)
        ctx.fillStyle = '#4488ff';
        for (const [cx, cy] of [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]]) {
          ctx.fillRect(cx - HANDLE_SIZE / 2, cy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        }

        // Spot position
        const spotX = (placed.gx + editSpotDx) * TILE * SCALE;
        const spotY = (placed.gy + editSpotDy) * TILE * SCALE;

        // Spot dot (red, larger for easy grabbing)
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(spotX, spotY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(spotX, spotY, 7, 0, Math.PI * 2);
        ctx.stroke();

        // Ghost Igni
        ctx.fillStyle = 'rgba(255,120,50,0.5)';
        ctx.fillRect(spotX - TILE * SCALE / 2, spotY - TILE * SCALE, TILE * SCALE, TILE * SCALE);
        ctx.strokeStyle = 'rgba(255,120,50,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(spotX - TILE * SCALE / 2, spotY - TILE * SCALE, TILE * SCALE, TILE * SCALE);

        // Label
        ctx.fillStyle = '#ffdd00';
        ctx.font = '10px monospace';
        ctx.fillText(def.label, hx + 2, hy - 4);

        // Connector line from hitbox center to spot
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,50,50,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx + hw / 2, hy + hh / 2);
        ctx.lineTo(spotX, spotY);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [layout, currentScene, config, selectedId, selectedRot, spriteImgs, bgImgs,
      editGridW, editGridH, editSpotDx, editSpotDy, editWidthPx, editHeightPx, editOffsetX, editOffsetY]);

  // Group defs by scene
  const defsByScene: Record<string, FurnitureDef[]> = { room: [], garden: [], bedroom: [] };
  for (const def of allDefs.current.length ? allDefs.current : registry.getAllDefs()) {
    const scene = def.scene ?? 'room';
    if (!defsByScene[scene]) defsByScene[scene] = [];
    defsByScene[scene].push(def);
  }
  if (!allDefs.current.length) allDefs.current = registry.getAllDefs();

  const Stepper = ({ label, value, onChange, step = 1, min, precision = 2 }: {
    label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; precision?: number;
  }) => (
    <div className="flex items-center gap-1 mb-1">
      <span className="text-[10px] text-gray-400 w-16 shrink-0" style={{ fontFamily: "'Press Start 2P', monospace" }}>
        {label}
      </span>
      <button className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs"
        onClick={() => onChange(min !== undefined ? Math.max(min, +(value - step).toFixed(precision)) : +(value - step).toFixed(precision))}>-</button>
      <input type="number" value={+value.toFixed(precision)} step={step} min={min}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(min !== undefined ? Math.max(min, v) : v); }}
        className="w-20 px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-xs text-center text-white" />
      <button className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs"
        onClick={() => onChange(+(value + step).toFixed(precision))}>+</button>
    </div>
  );

  // Drag mode label for status bar
  const dragLabel = dragMode ? ({
    'spot': 'Dragging spot position',
    'sprite-move': 'Moving sprite',
    'sprite-tl': 'Resizing sprite (top-left)',
    'sprite-tr': 'Resizing sprite (top-right)',
    'sprite-bl': 'Resizing sprite (bottom-left)',
    'sprite-br': 'Resizing sprite (bottom-right)',
    'hitbox-r': 'Resizing hitbox width',
    'hitbox-b': 'Resizing hitbox height',
    'hitbox-br': 'Resizing hitbox',
  } as Record<string, string>)[dragMode] : null;

  return (
    <>
      <style>{`html, body { overflow: auto !important; }`}</style>
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <h1 className="text-lg mb-4" style={{ fontFamily: "'Press Start 2P', monospace" }}>
          Furniture Editor
        </h1>

        {/* Scene toggle */}
        <div className="flex gap-2 mb-4">
          {(['room', 'garden', 'bedroom'] as SceneId[]).map(scene => (
            <button key={scene} onClick={() => switchSceneLayout(scene)}
              className={`px-3 py-1 rounded text-xs font-bold uppercase ${
                currentScene === scene ? 'bg-yellow-600 text-black' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}>{scene}</button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: Canvas */}
          <div className="lg:w-[60%] shrink-0">
            <div className="border border-gray-700 rounded overflow-hidden inline-block">
              <canvas
                ref={canvasRef}
                width={DW}
                height={DH}
                style={{ width: DW, height: DH, imageRendering: 'auto', cursor: dragMode ? (dragMode === 'spot' ? 'move' : dragMode === 'sprite-move' ? 'grabbing' : cursorStyle) : cursorStyle }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMoveForCursor}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
            <div className="text-[10px] text-gray-500 mt-1 flex gap-4">
              <span>
                {dragLabel
                  ? <span className="text-yellow-400">{dragLabel}</span>
                  : selectedDef
                    ? `Selected: ${selectedDef.label} — Drag handles to resize, drag sprite to move, drag red dot to set spot`
                    : 'Click on furniture to select'}
              </span>
            </div>
            {/* Legend */}
            <div className="flex gap-4 mt-1 text-[9px]">
              <span><span className="inline-block w-3 h-2 rounded" style={{ background: '#ffdd00' }} /> Hitbox</span>
              <span><span className="inline-block w-3 h-2 rounded" style={{ background: '#4488ff' }} /> Sprite bounds</span>
              <span><span className="inline-block w-3 h-2 rounded" style={{ background: '#ff3333' }} /> Spot</span>
            </div>
          </div>

          {/* Right: Edit panel */}
          <div className="lg:w-[40%] space-y-4">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1" style={{ fontFamily: "'Press Start 2P', monospace" }}>Piece</label>
              <select value={selectedId ?? ''} onChange={e => {
                const id = e.target.value || null;
                setSelectedId(id);
                if (id) { const placed = layout.furniture.find(f => f.id === id); setSelectedRot(placed?.rot ?? 0); }
              }} className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-white">
                <option value="">-- Select piece --</option>
                {Object.entries(defsByScene).map(([scene, defs]) => (
                  <optgroup key={scene} label={scene.toUpperCase()}>
                    {defs.map(d => {
                      const isPlaced = layout.furniture.some(f => f.id === d.id);
                      return <option key={d.id} value={d.id}>{d.label} ({d.id}){isPlaced ? '' : ' [not placed]'}</option>;
                    })}
                  </optgroup>
                ))}
              </select>
            </div>

            {selectedDef && (
              <>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1" style={{ fontFamily: "'Press Start 2P', monospace" }}>Rotation</label>
                  <div className="flex gap-1">
                    {availableRots.map(r => (
                      <button key={r} onClick={() => setSelectedRot(r)}
                        className={`px-3 py-1 rounded text-xs ${selectedRot === r ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                        {ROT_LABELS[r] ?? `R${r}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border border-gray-700 rounded p-3">
                  <h3 className="text-[10px] text-yellow-400 mb-2" style={{ fontFamily: "'Press Start 2P', monospace" }}>Hitbox (grid)</h3>
                  <Stepper label="gridW" value={editGridW} onChange={setEditGridW} step={1} min={1} precision={0} />
                  <Stepper label="gridH" value={editGridH} onChange={setEditGridH} step={1} min={1} precision={0} />
                </div>

                <div className="border border-gray-700 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] text-blue-400" style={{ fontFamily: "'Press Start 2P', monospace" }}>Sprite (px @ 4x)</h3>
                    <button onClick={() => setAspectLock(!aspectLock)}
                      className={`text-[10px] px-2 py-0.5 rounded ${aspectLock ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-400'}`}>
                      {aspectLock ? 'AR Lock' : 'AR Free'}
                    </button>
                  </div>
                  <Stepper label="width" value={editWidthPx} onChange={v => {
                    setEditWidthPx(v);
                    if (aspectLock) setEditHeightPx(Math.round(v * aspectRatio.current));
                  }} step={4} min={4} precision={0} />
                  <Stepper label="height" value={editHeightPx} onChange={v => {
                    setEditHeightPx(v);
                    if (aspectLock) setEditWidthPx(Math.round(v / aspectRatio.current));
                  }} step={4} min={4} precision={0} />
                  <Stepper label="offX" value={editOffsetX} onChange={setEditOffsetX} step={2} precision={0} />
                  <Stepper label="offY" value={editOffsetY} onChange={setEditOffsetY} step={2} precision={0} />
                </div>

                <div className="border border-gray-700 rounded p-3">
                  <h3 className="text-[10px] text-red-400 mb-2" style={{ fontFamily: "'Press Start 2P', monospace" }}>Spot (grid units)</h3>
                  <Stepper label="spotDx" value={editSpotDx} onChange={setEditSpotDx} step={0.25} />
                  <Stepper label="spotDy" value={editSpotDy} onChange={setEditSpotDy} step={0.25} />
                </div>

                <div className="flex gap-2">
                  <button onClick={saveConfig} disabled={saving}
                    className={`px-4 py-2 rounded text-sm font-bold ${dirty ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                    {saving ? 'Saving...' : 'Save Config'}
                  </button>
                  <button onClick={resetPiece} className="px-4 py-2 rounded text-sm bg-red-900 hover:bg-red-800 text-red-200">
                    Reset Piece
                  </button>
                  {saveMsg && <span className="text-sm text-green-400 self-center">{saveMsg}</span>}
                </div>

                <div className="text-[10px] text-gray-500 space-y-0.5 border-t border-gray-800 pt-2">
                  <div>ID: {selectedDef.id} | Scene: {selectedDef.scene ?? 'room'}</div>
                  <div>Def gridW/H: {selectedDef.gridW}x{selectedDef.gridH} | spotDx/Dy: {selectedDef.spotDx.toFixed(2)}/{selectedDef.spotDy.toFixed(2)}</div>
                  <div>Config has override: {config[selectedDef.id] ? 'yes' : 'no'}</div>
                  {dirty && <div className="text-yellow-500">Unsaved changes</div>}
                </div>
              </>
            )}

            {!selectedDef && (
              <div className="text-gray-500 text-sm mt-8">
                Select a furniture piece from the dropdown or click one in the room canvas to begin editing.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
