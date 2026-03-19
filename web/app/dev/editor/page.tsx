'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { registry } from '@web/lib/furniture';
import { FURNITURE_DEFS } from '@web/lib/room-grid';

// ── Types ──
type PixelGrid = (string | null)[][]; // [y][x] = hex color or null

const PALETTE = [
  // Woods
  '#3a2010', '#4a2c18', '#5a3a1c', '#6a4828', '#7a5838', '#8a6848', '#9a7848', '#a08050',
  '#6a4020', '#7a5430', '#8a6440', '#9a7450',
  // Warm tones
  '#c09870', '#d4b48e', '#e8d0b0', '#f0e8d8',
  // Greens
  '#1a6020', '#2a7a2a', '#3a9a3a', '#4aaa4a', '#2a5a18',
  // Blues
  '#3040a0', '#4060c0', '#6080d0', '#8090a0',
  // Reds / warm
  '#8a3020', '#a04030', '#c06040', '#e08060',
  '#cc3030', '#e84010', '#ff8010', '#ffa020', '#ffb830', '#ffd040',
  // Grays / metals
  '#303030', '#505050', '#707070', '#909090', '#b0b0b0', '#d0d0d0',
  '#506068', '#708088', '#8090a0',
  // Gold / brass
  '#c0a030', '#c0a040', '#d8b840', '#d8b850',
  // Fabrics
  '#6a2020', '#8a3030', '#687890', '#8898b0',
  // Skin / cream
  '#e8e0d0', '#f0ece4', '#d0c8c0', '#c8b080',
  // Dark
  '#1a0808', '#120808', '#2a1808', '#000000',
  // White
  '#ffffff', '#f8f8f0', '#e8e8f8',
];

const GRID_SIZES = [
  { label: '2x2 (16x16)', w: 16, h: 16, gw: 2, gh: 2 },
  { label: '2x3 (16x24)', w: 16, h: 24, gw: 2, gh: 3 },
  { label: '3x2 (24x16)', w: 24, h: 16, gw: 3, gh: 2 },
  { label: '3x3 (24x24)', w: 24, h: 24, gw: 3, gh: 3 },
  { label: '3x4 (24x32)', w: 24, h: 32, gw: 3, gh: 4 },
  { label: '4x3 (32x24)', w: 32, h: 24, gw: 4, gh: 3 },
  { label: '4x4 (32x32)', w: 32, h: 32, gw: 4, gh: 4 },
  { label: '5x3 (40x24)', w: 40, h: 24, gw: 5, gh: 3 },
  { label: '5x4 (40x32)', w: 40, h: 32, gw: 5, gh: 4 },
];

function createGrid(w: number, h: number): PixelGrid {
  return Array.from({ length: h }, () => Array(w).fill(null));
}

// Render an existing furniture piece at 1x and read back pixels
function rasterizePiece(pieceId: string): { grid: PixelGrid; w: number; h: number } | null {
  const def = FURNITURE_DEFS[pieceId];
  if (!def) return null;
  const drawFn = registry.getDraw(def.drawKey);
  if (!drawFn) return null;

  const w = def.gridW * 8;
  const h = def.gridH * 8;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Draw at ts=0 for a static snapshot
  drawFn(ctx, 0, 0, 0);

  // Read back pixels
  const imageData = ctx.getImageData(0, 0, w, h);
  const grid: PixelGrid = [];
  for (let y = 0; y < h; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      if (a < 10) {
        row.push(null);
      } else {
        row.push('#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join(''));
      }
    }
    grid.push(row);
  }
  return { grid, w, h };
}

function getAllPieceIds(): { id: string; label: string; scene: string }[] {
  return registry.getAllDefs().map(d => ({
    id: d.id,
    label: d.label,
    scene: d.scene ?? 'room',
  }));
}

// ── Export: generate draw() function code from pixel data ──
function exportDrawFunction(grid: PixelGrid, name: string): string {
  const h = grid.length;
  const w = h > 0 ? grid[0].length : 0;
  if (w === 0 || h === 0) return '// empty';

  // Group pixels by color for compact output
  const colorPixels = new Map<string, [number, number][]>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (!c) continue;
      if (!colorPixels.has(c)) colorPixels.set(c, []);
      colorPixels.get(c)!.push([x, y]);
    }
  }

  const lines: string[] = [];
  lines.push(`export function draw(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {`);

  for (const [color, pixels] of colorPixels) {
    lines.push(`  ctx.fillStyle = '${color}';`);
    // Try to group into horizontal runs
    const sorted = pixels.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    let i = 0;
    while (i < sorted.length) {
      const [sx, sy] = sorted[i];
      let runLen = 1;
      while (i + runLen < sorted.length && sorted[i + runLen][1] === sy && sorted[i + runLen][0] === sx + runLen) {
        runLen++;
      }
      if (runLen > 2) {
        lines.push(`  ctx.fillRect(x + ${sx}, y + ${sy}, ${runLen}, 1);`);
      } else {
        for (let j = 0; j < runLen; j++) {
          lines.push(`  ctx.fillRect(x + ${sx + j}, y + ${sy}, 1, 1);`);
        }
      }
      i += runLen;
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ── Preview: render pixel grid onto a canvas ──
function renderPreview(canvas: HTMLCanvasElement, grid: PixelGrid, scale: number) {
  const ctx = canvas.getContext('2d')!;
  const h = grid.length;
  const w = h > 0 ? grid[0].length : 0;
  canvas.width = w * scale;
  canvas.height = h * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
}

// ── Main Editor ──
export default function FurnitureEditor() {
  const [sizeIdx, setSizeIdx] = useState(5); // 4x3 default
  const size = GRID_SIZES[sizeIdx];
  const [grid, setGrid] = useState<PixelGrid>(() => createGrid(size.w, size.h));
  const [color, setColor] = useState('#8a6848');
  const [tool, setTool] = useState<'draw' | 'erase' | 'pick'>('draw');
  const [pieceName, setPieceName] = useState('new_piece');
  const [showExport, setShowExport] = useState(false);
  const [painting, setPainting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const preview3xRef = useRef<HTMLCanvasElement>(null);

  const ZOOM = 18; // editor pixel size

  // Undo stack
  const [history, setHistory] = useState<PixelGrid[]>([]);
  const pushHistory = useCallback(() => {
    setHistory(h => [...h.slice(-20), grid.map(r => [...r])]);
  }, [grid]);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setGrid(prev);
      return h.slice(0, -1);
    });
  }, []);

  // Redraw previews when grid changes
  useEffect(() => {
    if (previewRef.current) renderPreview(previewRef.current, grid, 1);
    if (preview3xRef.current) renderPreview(preview3xRef.current, grid, 3);
  }, [grid]);

  // Draw editor canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = grid[0]?.length ?? 0;
    const h = grid.length;
    canvas.width = w * ZOOM;
    canvas.height = h * ZOOM;

    // Checkerboard background for transparency
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = grid[y][x];
        if (c) {
          ctx.fillStyle = c;
        } else {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a2a' : '#222222';
        }
        ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x++) {
      ctx.beginPath(); ctx.moveTo(x * ZOOM, 0); ctx.lineTo(x * ZOOM, h * ZOOM); ctx.stroke();
    }
    for (let y = 0; y <= h; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * ZOOM); ctx.lineTo(w * ZOOM, y * ZOOM); ctx.stroke();
    }

    // Tile grid (8px) boundary lines
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= Math.ceil(w / 8); gx++) {
      ctx.beginPath(); ctx.moveTo(gx * 8 * ZOOM, 0); ctx.lineTo(gx * 8 * ZOOM, h * ZOOM); ctx.stroke();
    }
    for (let gy = 0; gy <= Math.ceil(h / 8); gy++) {
      ctx.beginPath(); ctx.moveTo(0, gy * 8 * ZOOM); ctx.lineTo(w * ZOOM, gy * 8 * ZOOM); ctx.stroke();
    }
  }, [grid, ZOOM]);

  const applyTool = useCallback((px: number, py: number) => {
    const w = grid[0]?.length ?? 0;
    const h = grid.length;
    if (px < 0 || px >= w || py < 0 || py >= h) return;

    setGrid(prev => {
      const next = prev.map(r => [...r]);
      if (tool === 'draw') {
        next[py][px] = color;
      } else if (tool === 'erase') {
        next[py][px] = null;
      } else if (tool === 'pick') {
        const picked = prev[py][px];
        if (picked) setColor(picked);
        setTool('draw');
      }
      return next;
    });
  }, [grid, color, tool]);

  const getPixelCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      px: Math.floor((e.clientX - rect.left) / ZOOM),
      py: Math.floor((e.clientY - rect.top) / ZOOM),
    };
  }, [ZOOM]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    pushHistory();
    setPainting(true);
    const { px, py } = getPixelCoords(e);
    applyTool(px, py);
  }, [pushHistory, getPixelCoords, applyTool]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!painting) return;
    const { px, py } = getPixelCoords(e);
    applyTool(px, py);
  }, [painting, getPixelCoords, applyTool]);

  const handleMouseUp = useCallback(() => setPainting(false), []);

  const handleSizeChange = useCallback((idx: number) => {
    setSizeIdx(idx);
    const s = GRID_SIZES[idx];
    setGrid(createGrid(s.w, s.h));
    setHistory([]);
  }, []);

  const loadPiece = useCallback((pieceId: string) => {
    const result = rasterizePiece(pieceId);
    if (!result) return;
    pushHistory();
    // Find matching grid size or use closest
    const matchIdx = GRID_SIZES.findIndex(s => s.w === result.w && s.h === result.h);
    if (matchIdx >= 0) setSizeIdx(matchIdx);
    setGrid(result.grid);
    setPieceName(pieceId);
    setHistory([]);
  }, [pushHistory]);

  const clearGrid = useCallback(() => {
    pushHistory();
    setGrid(createGrid(size.w, size.h));
  }, [pushHistory, size]);

  const exportCode = exportDrawFunction(grid, pieceName);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'b') setTool('draw');
      if (e.key === 'e') setTool('erase');
      if (e.key === 'i') setTool('pick');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  // Save/load to localStorage
  const saveToStorage = useCallback(() => {
    localStorage.setItem(`furniture_editor_${pieceName}`, JSON.stringify({ grid, sizeIdx }));
  }, [grid, sizeIdx, pieceName]);

  const loadFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(`furniture_editor_${pieceName}`);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.grid) { setGrid(data.grid); setSizeIdx(data.sizeIdx ?? sizeIdx); }
      }
    } catch {}
  }, [pieceName, sizeIdx]);

  const font = "'Segoe UI', system-ui, sans-serif";

  return (
    <div style={{ background: '#1a1a1a', minHeight: '100vh', color: '#ccc', fontFamily: font, padding: 24 }}>
      <div style={{ fontSize: 24, marginBottom: 16, color: '#aaa', fontWeight: 600 }}>Furniture Pixel Editor</div>

      <div style={{ display: 'flex', gap: 32 }}>
        {/* Left: Canvas */}
        <div>
          <canvas
            ref={canvasRef}
            style={{ cursor: tool === 'pick' ? 'crosshair' : 'default', imageRendering: 'pixelated' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
            {size.w}x{size.h}px ({size.gw}x{size.gh} tiles)
          </div>
        </div>

        {/* Right: Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 280 }}>
          {/* Load existing piece */}
          <div>
            <div style={{ fontSize: 14, color: '#F59E0B', marginBottom: 4 }}>LOAD EXISTING</div>
            <select
              value=""
              onChange={e => { if (e.target.value) loadPiece(e.target.value); }}
              style={{ background: '#2a2010', color: '#F59E0B', border: '1px solid #F59E0B44', fontFamily: font, fontSize: 14, padding: 4, width: '100%' }}
            >
              <option value="">— select piece —</option>
              {['room', 'garden', 'bedroom'].map(scene => (
                <optgroup key={scene} label={scene.toUpperCase()}>
                  {getAllPieceIds().filter(p => p.scene === scene).map(p => (
                    <option key={p.id} value={p.id}>{p.label} ({p.id})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Size selector */}
          <div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>GRID SIZE</div>
            <select
              value={sizeIdx}
              onChange={e => handleSizeChange(Number(e.target.value))}
              style={{ background: '#333', color: '#ccc', border: '1px solid #555', fontFamily: font, fontSize: 14, padding: 4 }}
            >
              {GRID_SIZES.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Tools */}
          <div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>TOOLS</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['draw', 'erase', 'pick'] as const).map(t => (
                <button key={t} onClick={() => setTool(t)}
                  style={{
                    fontFamily: font, fontSize: 14, padding: '6px 12px', border: 'none', cursor: 'pointer',
                    background: tool === t ? '#F59E0B' : '#333', color: tool === t ? '#000' : '#aaa',
                  }}>
                  {t === 'draw' ? 'B DRAW' : t === 'erase' ? 'E ERASE' : 'I PICK'}
                </button>
              ))}
            </div>
          </div>

          {/* Current color */}
          <div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>COLOR</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 36, height: 36, background: color, border: '2px solid #555', borderRadius: 4 }} />
              <input type="text" value={color} onChange={e => setColor(e.target.value)}
                style={{ background: '#333', color: '#ccc', border: '1px solid #555', fontFamily: font, fontSize: 14, width: 120, padding: 6, borderRadius: 4 }} />
            </div>
          </div>

          {/* Palette */}
          <div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>PALETTE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxWidth: 320 }}>
              {PALETTE.map(c => (
                <div key={c} onClick={() => { setColor(c); setTool('draw'); }}
                  style={{
                    width: 22, height: 22, background: c, cursor: 'pointer', borderRadius: 2,
                    border: c === color ? '2px solid #F59E0B' : '1px solid #444',
                    boxSizing: 'border-box',
                  }} />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={undo} style={{ fontFamily: font, fontSize: 14, padding: '6px 12px', background: '#333', color: '#aaa', border: 'none', cursor: 'pointer' }}>
              UNDO (^Z)
            </button>
            <button onClick={clearGrid} style={{ fontFamily: font, fontSize: 14, padding: '6px 12px', background: '#333', color: '#aaa', border: 'none', cursor: 'pointer' }}>
              CLEAR
            </button>
            <button onClick={saveToStorage} style={{ fontFamily: font, fontSize: 14, padding: '6px 12px', background: '#333', color: '#aaa', border: 'none', cursor: 'pointer' }}>
              SAVE
            </button>
            <button onClick={loadFromStorage} style={{ fontFamily: font, fontSize: 14, padding: '6px 12px', background: '#333', color: '#aaa', border: 'none', cursor: 'pointer' }}>
              LOAD
            </button>
          </div>

          {/* Piece name */}
          <div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>PIECE NAME</div>
            <input type="text" value={pieceName} onChange={e => setPieceName(e.target.value)}
              style={{ background: '#333', color: '#ccc', border: '1px solid #555', fontFamily: font, fontSize: 14, width: 220, padding: 6, borderRadius: 4 }} />
          </div>

          {/* Preview */}
          <div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>PREVIEW</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <canvas ref={previewRef} style={{ imageRendering: 'pixelated', border: '1px solid #333' }} />
                <div style={{ fontSize: 13, color: '#555' }}>1x</div>
              </div>
              <div>
                <canvas ref={preview3xRef} style={{ imageRendering: 'pixelated', border: '1px solid #333' }} />
                <div style={{ fontSize: 13, color: '#555' }}>3x</div>
              </div>
            </div>
          </div>

          {/* Export */}
          <button onClick={() => setShowExport(!showExport)}
            style={{ fontFamily: font, fontSize: 14, padding: '4px 8px', background: '#F59E0B', color: '#000', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}>
            {showExport ? 'HIDE CODE' : 'EXPORT CODE'}
          </button>
        </div>
      </div>

      {/* Export panel */}
      {showExport && (
        <div style={{ marginTop: 16, background: '#111', border: '1px solid #333', padding: 12, maxWidth: 800 }}>
          <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>GENERATED DRAW FUNCTION — copy into your piece file</div>
          <pre style={{ fontSize: 15, color: '#8a8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto', lineHeight: 1.4 }}>
            {exportCode}
          </pre>
          <button onClick={() => navigator.clipboard.writeText(exportCode)}
            style={{ fontFamily: font, fontSize: 14, padding: '6px 14px', background: '#333', color: '#aaa', border: 'none', cursor: 'pointer', marginTop: 8 }}>
            COPY TO CLIPBOARD
          </button>
        </div>
      )}
    </div>
  );
}
