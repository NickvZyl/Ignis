'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { registry } from '@web/lib/furniture';
import { FURNITURE_DEFS } from '@web/lib/room-grid';
import type { FurnitureDef } from '@web/lib/furniture';
import { drawSceneBackground, SCENE_W, SCENE_H } from '@web/lib/scene-backgrounds';

const THUMB_SCALE = 3;
const FOCUS_SCALE = 8;
const SCENES = ['room', 'garden', 'bedroom'] as const;
const FONT = "'Segoe UI', system-ui, sans-serif";

const FILE_MAP: Record<string, string> = {};
// Auto-populate from known piece IDs
const ALL_IDS = [
  'desk','bookshelf','couch','fireplace','clock_table','kitchen','fridge','plant',
  'front_door','tall_plant','succulent','floor_lamp','wall_sconce','window',
  'garden_gate','farm_patch','chicken_coop','cow_pen','sheep_pen',
  'hallway_door','bedroom_door','bed','nightstand','wardrobe','bedroom_window',
];
ALL_IDS.forEach(id => { FILE_MAP[id] = `web/lib/furniture/pieces/${id}.ts`; });

// ── Animated canvas renderer ──
function useAnimatedCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  def: FurnitureDef | null,
  scale: number,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !def) return;
    const ctx = canvas.getContext('2d')!;
    const pw = def.gridW * 8;
    const ph = def.gridH * 8;
    canvas.width = pw * scale;
    canvas.height = ph * scale;

    // Hi-res sprite: show the image instead of procedural draw
    const hiResSrc = def.hiResSprites?.[0] as string | undefined;
    if (hiResSrc) {
      const img = new Image();
      img.src = hiResSrc;
      img.onload = () => {
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        // Fit the image maintaining aspect ratio
        const aspect = img.naturalHeight / img.naturalWidth;
        const dw = canvas.width;
        const dh = dw * aspect;
        const dy = Math.max(0, canvas.height - dh);
        ctx.drawImage(img, 0, dy, dw, dh);
      };
      return;
    }

    // Procedural draw
    let animId: number;
    const draw = () => {
      const ts = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a2e' : '#222228';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
      ctx.save();
      ctx.scale(scale, scale);
      const drawFn = registry.getDraw(def.drawKey);
      if (drawFn) drawFn(ctx, 0, 0, ts);
      ctx.restore();
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [canvasRef, def, scale]);
}

// ── Thumbnail card ──
function FurnitureCard({ def, selected, onSelect }: { def: FurnitureDef; selected: boolean; onSelect: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useAnimatedCanvas(canvasRef, def, THUMB_SCALE);

  const pw = def.gridW * 8;
  const ph = def.gridH * 8;
  const scene = def.scene ?? 'room';

  return (
    <div onClick={onSelect} style={{
      background: selected ? '#2a2420' : '#1e1e24',
      border: selected ? '2px solid #F59E0B' : '1px solid #333',
      borderRadius: 4,
      padding: 6,
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      width: Math.max(pw * THUMB_SCALE + 12, 100),
      transition: 'border-color 0.15s',
    }}>
      <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
      <div style={{ fontSize: 16, color: selected ? '#F59E0B' : '#aaa', textAlign: 'center' }}>
        {def.label}
      </div>
    </div>
  );
}

// ── Focus panel (selected piece detail) ──
function FocusPanel({ def, onClose }: { def: FurnitureDef; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useAnimatedCanvas(canvasRef, def, FOCUS_SCALE);

  const [prompt, setPrompt] = useState('');
  const [savedPrompts, setSavedPrompts] = useState<string[]>([]);
  const [refImages, setRefImages] = useState<string[]>([]); // data URLs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scene = def.scene ?? 'room';
  const pw = def.gridW * 8;
  const ph = def.gridH * 8;
  const filePath = FILE_MAP[def.id] ?? `web/lib/furniture/pieces/${def.id}.ts`;

  // Load saved prompts + reference images for this piece
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`furniture_prompts_${def.id}`);
      if (raw) setSavedPrompts(JSON.parse(raw));
      else setSavedPrompts([]);
    } catch { setSavedPrompts([]); }
    try {
      const raw = localStorage.getItem(`furniture_refs_${def.id}`);
      if (raw) setRefImages(JSON.parse(raw));
      else setRefImages([]);
    } catch { setRefImages([]); }
  }, [def.id]);

  const savePrompt = useCallback(() => {
    if (!prompt.trim()) return;
    const updated = [...savedPrompts, prompt.trim()];
    setSavedPrompts(updated);
    localStorage.setItem(`furniture_prompts_${def.id}`, JSON.stringify(updated));
    setPrompt('');
  }, [prompt, savedPrompts, def.id]);

  const clearPrompts = useCallback(() => {
    setSavedPrompts([]);
    setRefImages([]);
    localStorage.removeItem(`furniture_prompts_${def.id}`);
    localStorage.removeItem(`furniture_refs_${def.id}`);
  }, [def.id]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setRefImages(prev => {
          const updated = [...prev, dataUrl];
          localStorage.setItem(`furniture_refs_${def.id}`, JSON.stringify(updated));
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, [def.id]);

  const removeImage = useCallback((idx: number) => {
    setRefImages(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      localStorage.setItem(`furniture_refs_${def.id}`, JSON.stringify(updated));
      return updated;
    });
  }, [def.id]);

  const sceneColor = scene === 'garden' ? '#5a9a30' : scene === 'bedroom' ? '#8898b0' : '#c09870';

  return (
    <div style={{
      background: '#1a1a20',
      border: '1px solid #F59E0B33',
      borderRadius: 6,
      padding: 16,
      display: 'flex',
      gap: 20,
      marginBottom: 20,
    }}>
      {/* Left: large preview */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', borderRadius: 4 }} />
        <div style={{ fontSize: 16, color: '#555' }}>{pw}x{ph}px @ {FOCUS_SCALE}x</div>
      </div>

      {/* Right: info + prompt */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, color: '#F59E0B', fontWeight: 600 }}>{def.label}</div>
            <div style={{ fontSize: 16, color: '#666', marginTop: 2 }}>{def.id}</div>
          </div>
          <button onClick={onClose} style={{
            fontFamily: FONT, fontSize: 15, background: '#333', color: '#888',
            border: 'none', padding: '2px 8px', cursor: 'pointer',
          }}>X</button>
        </div>

        {/* Metadata */}
        <div style={{ fontSize: 16, color: '#888', lineHeight: 1.8, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px' }}>
          <span style={{ color: '#555' }}>file</span><span style={{ color: '#6a8' }}>{filePath}</span>
          <span style={{ color: '#555' }}>size</span><span>{def.gridW}x{def.gridH} tiles ({pw}x{ph}px)</span>
          <span style={{ color: '#555' }}>scene</span><span style={{ color: sceneColor }}>{scene}</span>
          <span style={{ color: '#555' }}>category</span><span>{def.category}</span>
          <span style={{ color: '#555' }}>tags</span><span>{def.tags?.length ? def.tags.join(', ') : '—'}</span>
          <span style={{ color: '#555' }}>spot</span><span>({def.spotDx}, {def.spotDy})</span>
          <span style={{ color: '#555' }}>flags</span>
          <span>
            {def.required && <span style={{ color: '#e84010' }}>required </span>}
            {def.perimeterOnly && <span style={{ color: '#708088' }}>perimeter </span>}
            {def.canOverlapWall && <span style={{ color: '#7a8' }}>wall-ok </span>}
            {!def.required && !def.perimeterOnly && !def.canOverlapWall && '—'}
          </span>
        </div>

        {/* AI Prompt input */}
        <div>
          <div style={{ fontSize: 16, color: '#F59E0B', marginBottom: 4 }}>DESIGN PROMPT</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); savePrompt(); } }}
              placeholder="Describe how this piece should look..."
              rows={2}
              style={{
                flex: 1,
                background: '#111',
                color: '#ccc',
                border: '1px solid #333',
                fontFamily: 'monospace',
                fontSize: 16,
                padding: 6,
                resize: 'vertical',
                borderRadius: 3,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignSelf: 'flex-end' }}>
              <button onClick={savePrompt} style={{
                fontFamily: FONT, fontSize: 16, padding: '4px 10px',
                background: '#F59E0B', color: '#000', border: 'none', cursor: 'pointer', borderRadius: 3,
              }}>SAVE</button>
              <button onClick={() => fileInputRef.current?.click()} style={{
                fontFamily: FONT, fontSize: 14, padding: '3px 8px',
                background: '#2a2a2e', color: '#888', border: '1px solid #444', cursor: 'pointer', borderRadius: 3,
              }}>+ IMG</button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload}
                style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        {/* Reference images */}
        {refImages.length > 0 && (
          <div>
            <div style={{ fontSize: 16, color: '#888', marginBottom: 4 }}>REFERENCE IMAGES ({refImages.length})</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {refImages.map((src, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={src} alt={`ref ${i + 1}`} style={{
                    height: 120, borderRadius: 4, border: '1px solid #333', objectFit: 'cover',
                  }} />
                  <button onClick={() => removeImage(i)} style={{
                    position: 'absolute', top: -4, right: -4,
                    fontFamily: FONT, fontSize: 14, width: 14, height: 14,
                    background: '#e84010', color: '#fff', border: 'none', borderRadius: '50%',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0,
                  }}>x</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved prompts */}
        {savedPrompts.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 16, color: '#888' }}>SAVED PROMPTS ({savedPrompts.length})</div>
              <button onClick={clearPrompts} style={{
                fontFamily: FONT, fontSize: 14, background: 'none', color: '#555',
                border: 'none', cursor: 'pointer',
              }}>CLEAR ALL</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
              {savedPrompts.map((p, i) => (
                <div key={i} style={{
                  fontSize: 15, color: '#aaa', background: '#111', padding: '4px 6px',
                  borderRadius: 2, borderLeft: '2px solid #F59E0B44', fontFamily: 'monospace',
                }}>
                  {p}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scene background card ──
const BG_THUMB_SCALE = 2;
const BG_FOCUS_SCALE = 4;
const BG_SCENES: { id: string; label: string; scene: string; file: string; imgSrc?: string }[] = [
  { id: 'bg_room', label: 'Living Room', scene: 'room', file: 'web/public/room-bg.png', imgSrc: '/room-bg.png' },
  { id: 'bg_bedroom', label: 'Bedroom', scene: 'bedroom', file: 'web/lib/scene-backgrounds.ts (drawBedroomFloor + drawBedroomWalls)' },
  { id: 'bg_garden', label: 'Garden', scene: 'garden', file: 'web/public/garden-bg.png', imgSrc: '/garden-bg.png' },
];

function BackgroundCard({ bg, selected, onSelect }: { bg: typeof BG_SCENES[0]; selected: boolean; onSelect: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = SCENE_W * BG_THUMB_SCALE;
    canvas.height = SCENE_H * BG_THUMB_SCALE;

    if (bg.imgSrc) {
      // Use hi-res image
      const img = new Image();
      img.src = bg.imgSrc;
      img.onload = () => {
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      return;
    }

    // Fallback to procedural
    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save(); ctx.scale(BG_THUMB_SCALE, BG_THUMB_SCALE);
      drawSceneBackground(ctx, bg.scene, performance.now());
      ctx.restore();
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [bg.scene, bg.imgSrc]);

  return (
    <div onClick={onSelect} style={{
      background: selected ? '#2a2420' : '#1e1e24',
      border: selected ? '2px solid #F59E0B' : '1px solid #333',
      borderRadius: 4, padding: 6, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <canvas ref={canvasRef} style={{ borderRadius: 3 }} />
      <div style={{ fontSize: 14, color: selected ? '#F59E0B' : '#aaa' }}>{bg.label}</div>
    </div>
  );
}

function BackgroundFocusPanel({ bg, onClose }: { bg: typeof BG_SCENES[0]; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prompt, setPrompt] = useState('');
  const [savedPrompts, setSavedPrompts] = useState<string[]>([]);
  const [refImages, setRefImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = SCENE_W * BG_FOCUS_SCALE;
    canvas.height = SCENE_H * BG_FOCUS_SCALE;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save(); ctx.scale(BG_FOCUS_SCALE, BG_FOCUS_SCALE);
      drawSceneBackground(ctx, bg.scene, performance.now());
      ctx.restore();
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [bg.scene]);

  useEffect(() => {
    try { const r = localStorage.getItem(`furniture_prompts_${bg.id}`); if (r) setSavedPrompts(JSON.parse(r)); else setSavedPrompts([]); } catch { setSavedPrompts([]); }
    try { const r = localStorage.getItem(`furniture_refs_${bg.id}`); if (r) setRefImages(JSON.parse(r)); else setRefImages([]); } catch { setRefImages([]); }
  }, [bg.id]);

  const savePrompt = useCallback(() => {
    if (!prompt.trim()) return;
    const updated = [...savedPrompts, prompt.trim()];
    setSavedPrompts(updated);
    localStorage.setItem(`furniture_prompts_${bg.id}`, JSON.stringify(updated));
    setPrompt('');
  }, [prompt, savedPrompts, bg.id]);

  const clearPrompts = useCallback(() => {
    setSavedPrompts([]); setRefImages([]);
    localStorage.removeItem(`furniture_prompts_${bg.id}`);
    localStorage.removeItem(`furniture_refs_${bg.id}`);
  }, [bg.id]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        setRefImages(prev => { const u = [...prev, reader.result as string]; localStorage.setItem(`furniture_refs_${bg.id}`, JSON.stringify(u)); return u; });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, [bg.id]);

  const removeImage = useCallback((idx: number) => {
    setRefImages(prev => { const u = prev.filter((_, i) => i !== idx); localStorage.setItem(`furniture_refs_${bg.id}`, JSON.stringify(u)); return u; });
  }, [bg.id]);

  return (
    <div style={{ background: '#1a1a20', border: '1px solid #F59E0B33', borderRadius: 6, padding: 16, display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', borderRadius: 4 }} />
        <div style={{ fontSize: 14, color: '#555' }}>{SCENE_W}x{SCENE_H}px @ {BG_FOCUS_SCALE}x</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 280 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, color: '#F59E0B', fontWeight: 600 }}>{bg.label} Background</div>
            <div style={{ fontSize: 14, color: '#6a8', marginTop: 4 }}>{bg.file}</div>
          </div>
          <button onClick={onClose} style={{ fontFamily: FONT, fontSize: 16, background: '#333', color: '#888', border: 'none', padding: '4px 12px', cursor: 'pointer' }}>X</button>
        </div>

        <div>
          <div style={{ fontSize: 15, color: '#F59E0B', marginBottom: 4 }}>DESIGN PROMPT</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); savePrompt(); } }}
              placeholder="Describe how the background should look..."
              rows={2} style={{ flex: 1, background: '#111', color: '#ccc', border: '1px solid #333', fontFamily: 'monospace', fontSize: 15, padding: 8, resize: 'vertical', borderRadius: 3 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignSelf: 'flex-end' }}>
              <button onClick={savePrompt} style={{ fontFamily: FONT, fontSize: 15, padding: '6px 12px', background: '#F59E0B', color: '#000', border: 'none', cursor: 'pointer', borderRadius: 3 }}>SAVE</button>
              <button onClick={() => fileInputRef.current?.click()} style={{ fontFamily: FONT, fontSize: 14, padding: '4px 10px', background: '#2a2a2e', color: '#888', border: '1px solid #444', cursor: 'pointer', borderRadius: 3 }}>+ IMG</button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        {refImages.length > 0 && (
          <div>
            <div style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>REFERENCE IMAGES ({refImages.length})</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {refImages.map((src, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={src} alt={`ref ${i+1}`} style={{ height: 120, borderRadius: 4, border: '1px solid #333', objectFit: 'cover' }} />
                  <button onClick={() => removeImage(i)} style={{ position: 'absolute', top: -4, right: -4, fontSize: 14, width: 18, height: 18, background: '#e84010', color: '#fff', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {savedPrompts.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 15, color: '#888' }}>SAVED PROMPTS ({savedPrompts.length})</div>
              <button onClick={clearPrompts} style={{ fontFamily: FONT, fontSize: 14, background: 'none', color: '#555', border: 'none', cursor: 'pointer' }}>CLEAR ALL</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
              {savedPrompts.map((p, i) => (
                <div key={i} style={{ fontSize: 14, color: '#aaa', background: '#111', padding: '6px 8px', borderRadius: 3, borderLeft: '3px solid #F59E0B44', fontFamily: 'monospace' }}>{p}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Gallery ──
export default function FurnitureGallery() {
  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const allDefs = registry.getAllDefs();

  const grouped: Record<string, FurnitureDef[]> = { room: [], garden: [], bedroom: [] };
  for (const def of allDefs) {
    const scene = def.scene ?? 'room';
    if (!grouped[scene]) grouped[scene] = [];
    grouped[scene].push(def);
  }

  const selectedDef = selectedId ? allDefs.find(d => d.id === selectedId) ?? null : null;
  const selectedBg = selectedId ? BG_SCENES.find(b => b.id === selectedId) ?? null : null;
  const scenesToShow = filter === 'all' ? SCENES : [filter as typeof SCENES[number]];
  const sceneLabels: Record<string, string> = { room: 'LIVING ROOM', garden: 'GARDEN', bedroom: 'BEDROOM' };
  const sceneColors: Record<string, string> = { room: '#c09870', garden: '#5a9a30', bedroom: '#8898b0' };

  return (
    <div style={{ background: '#141418', minHeight: '100vh', color: '#ccc', fontFamily: FONT, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 24, color: '#aaa', fontWeight: 600 }}>Furniture Gallery</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', ...SCENES].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{
                fontFamily: FONT, fontSize: 16, padding: '6px 14px', border: 'none', cursor: 'pointer', borderRadius: 4,
                background: filter === s ? '#F59E0B' : '#2a2a2e',
                color: filter === s ? '#000' : '#888',
              }}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 15, color: '#555', marginBottom: 16 }}>
        {allDefs.length} pieces + 3 backgrounds &middot; click to focus &middot; upload references &middot; enter prompts
      </div>

      {/* Focus panel — furniture or background */}
      {selectedDef && <FocusPanel def={selectedDef} onClose={() => setSelectedId(null)} />}
      {selectedBg && <BackgroundFocusPanel bg={selectedBg} onClose={() => setSelectedId(null)} />}

      {/* Scene Backgrounds */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 16, color: '#aaa', marginBottom: 8, borderBottom: '1px solid #333', paddingBottom: 4 }}>
          SCENE BACKGROUNDS (3)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {BG_SCENES.filter(bg => filter === 'all' || bg.scene === filter).map(bg => (
            <BackgroundCard key={bg.id} bg={bg} selected={selectedId === bg.id}
              onSelect={() => setSelectedId(selectedId === bg.id ? null : bg.id)} />
          ))}
        </div>
      </div>

      {/* Scene groups */}
      {scenesToShow.map(scene => {
        const pieces = grouped[scene] ?? [];
        if (pieces.length === 0) return null;
        return (
          <div key={scene} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 15, color: sceneColors[scene], marginBottom: 8,
              borderBottom: `1px solid ${sceneColors[scene]}33`, paddingBottom: 4,
            }}>
              {sceneLabels[scene]} ({pieces.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pieces.map(def => (
                <FurnitureCard
                  key={def.id}
                  def={def}
                  selected={selectedId === def.id}
                  onSelect={() => setSelectedId(selectedId === def.id ? null : def.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
