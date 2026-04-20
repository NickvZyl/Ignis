'use client';

// Scale calibration tool. Renders every registered furniture piece at native
// in-game resolution (4x) with an Ignis reference sprite next to it so sizing
// can be judged in a single place. Lets you tune each piece's overhang
// (sprite extent relative to hitbox) and save the full config.

import { useEffect, useRef, useState, useCallback } from 'react';
import { registry } from '@web/lib/furniture';
import type { FurnitureDef, FurnitureRotation } from '@web/lib/furniture';
import { getRotatedDims } from '@web/lib/furniture';
import { TILE, getOverhang, setOverhang, getFurnitureConfig, applyFurnitureConfig } from '@web/lib/room-grid';
import type { Overhang } from '@web/lib/room-grid';
import { api } from '@web/lib/api';

const SCALE = 4;
const PXT = TILE * SCALE; // pixels per tile at render scale = 32
const ROT_LABELS = ['Front', 'Right', 'Back', 'Left'] as const;

// Ignis ref sprite matches the one drawn in-game (8x8 at native res).
const IGNIS_REF = [
  [0,0,2,2,2,2,0,0],
  [0,2,1,1,1,1,2,0],
  [2,1,1,1,1,1,1,2],
  [1,1,4,1,1,4,1,1],
  [1,1,1,1,1,1,1,1],
  [1,1,1,2,2,1,1,1],
  [0,1,1,1,1,1,1,0],
  [0,0,3,3,3,3,0,0],
];
const IGNIS_COLOR = '#F5803B';

function drawIgnis(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = SCALE;
  for (let ry = 0; ry < 8; ry++) {
    for (let rx = 0; rx < 8; rx++) {
      const v = IGNIS_REF[ry][rx];
      if (!v) continue;
      ctx.fillStyle =
        v === 1 ? IGNIS_COLOR :
        v === 2 ? '#ffb36b' :
        v === 3 ? '#7a3815' :
        '#1a0808';
      ctx.fillRect(x + rx * px, y + ry * px, px, px);
    }
  }
}

interface PieceCardProps {
  def: FurnitureDef;
  rot: FurnitureRotation;
  overhang: Overhang;
  onChange: (oh: Overhang) => void;
}

function PieceCard({ def, rot, overhang, onChange }: PieceCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);

  const src = def.hiResSprites?.[rot] ?? def.hiResSprites?.[0];

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.src = src;
    img.onload = () => { imgRef.current = img; setImgReady(true); };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const dims = getRotatedDims(def, rot);
    const hitW = dims.gridW * PXT;
    const hitH = dims.gridH * PXT;

    // Card padding: enough room for overhangs plus a strip on the right for Ignis ref.
    const padL = Math.max(0, overhang.left) * PXT + 16;
    const padT = Math.max(0, overhang.top) * PXT + 16;
    const padR = Math.max(0, overhang.right) * PXT + 16 + 8 * SCALE + 16;
    const padB = Math.max(0, overhang.bottom) * PXT + 16;

    canvas.width = Math.round(hitW + padL + padR);
    canvas.height = Math.round(Math.max(hitH + padT + padB, 8 * SCALE + 32));

    // Background
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const hitX = padL;
    const hitY = padT;

    // Sprite
    if (imgReady && imgRef.current) {
      const img = imgRef.current;
      const dx = hitX - overhang.left * PXT;
      const dy = hitY - overhang.top * PXT;
      const dw = hitW + (overhang.left + overhang.right) * PXT;
      const dh = hitH + (overhang.top + overhang.bottom) * PXT;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    // Hitbox outline (dashed)
    ctx.strokeStyle = '#F5D03B';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(hitX, hitY, hitW, hitH);
    ctx.setLineDash([]);

    // Sprite outline (solid, subtle)
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      hitX - overhang.left * PXT,
      hitY - overhang.top * PXT,
      hitW + (overhang.left + overhang.right) * PXT,
      hitH + (overhang.top + overhang.bottom) * PXT,
    );

    // Ignis reference — 8x8 sprite at native scale, to the right of the piece,
    // with her feet aligned to the hitbox bottom.
    const ignisX = hitX + hitW + 16;
    const ignisY = hitY + hitH - 8 * SCALE;
    drawIgnis(ctx, ignisX, ignisY);

    // Labels
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(`${dims.gridW}×${dims.gridH} tiles`, hitX, hitY - 4);
    ctx.fillStyle = '#F5803B';
    ctx.fillText('Ignis', ignisX - 4, ignisY + 8 * SCALE + 12);
  }, [def, rot, overhang, imgReady]);

  const adjust = (k: keyof Overhang, delta: number) =>
    onChange({ ...overhang, [k]: Math.round((overhang[k] + delta) * 8) / 8 });

  return (
    <div style={{
      background: '#0f0805', border: '1px solid #2a1810', borderRadius: 4,
      padding: 12, marginBottom: 16, color: '#e6d0b8', fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{def.label} <span style={{ opacity: 0.5 }}>({def.id})</span></div>
        <div style={{ fontSize: 10, opacity: 0.6 }}>{ROT_LABELS[rot]}</div>
      </div>
      <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'auto' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12, fontSize: 11 }}>
        {(['top', 'right', 'bottom', 'left'] as const).map(side => (
          <div key={side} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ opacity: 0.6, textTransform: 'uppercase', fontSize: 9 }}>{side}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => adjust(side, -0.125)} style={btnStyle}>−</button>
              <input
                type="number"
                step="0.125"
                value={overhang[side]}
                onChange={(e) => onChange({ ...overhang, [side]: Number(e.target.value) })}
                style={inputStyle}
              />
              <button onClick={() => adjust(side, 0.125)} style={btnStyle}>+</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#2a1810', color: '#F5D03B', border: 'none', width: 20, height: 20,
  cursor: 'pointer', fontSize: 12, borderRadius: 2,
};
const inputStyle: React.CSSProperties = {
  background: '#1a0e08', color: '#e6d0b8', border: '1px solid #2a1810',
  padding: '2px 4px', fontFamily: 'monospace', fontSize: 11, width: '100%', textAlign: 'center',
};

export default function ScalePage() {
  const [defs, setDefs] = useState<FurnitureDef[]>([]);
  const [rotByPiece, setRotByPiece] = useState<Record<string, FurnitureRotation>>({});
  const [tick, setTick] = useState(0); // bump to force re-render on overhang changes
  const [status, setStatus] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(api('/api/furniture-config'), { cache: 'no-store' })
      .then(r => r.json())
      .then((cfg) => { applyFurnitureConfig(cfg); setLoaded(true); setDefs(registry.getAllDefs()); })
      .catch(() => { setLoaded(true); setDefs(registry.getAllDefs()); });
  }, []);

  const setRot = (id: string, rot: FurnitureRotation) => {
    setRotByPiece(p => ({ ...p, [id]: rot }));
  };

  const doSave = useCallback(async () => {
    setStatus('Saving…');
    const res = await fetch(api('/api/furniture-config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getFurnitureConfig()),
    });
    setStatus(res.ok ? 'Saved' : 'Save failed');
    setTimeout(() => setStatus(''), 1500);
  }, []);

  const updateOverhang = useCallback((id: string, rot: FurnitureRotation, oh: Overhang) => {
    setOverhang(id, rot, oh);
    setTick(t => t + 1);
    setStatus('Editing…');
    // Debounced auto-save so /app always reflects the latest edits.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { doSave(); }, 400);
  }, [doSave]);

  // Flush any pending save if user navigates away.
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      doSave();
    }
  }, [doSave]);

  const save = doSave;

  if (!loaded) {
    return <div style={{ padding: 24, color: '#e6d0b8', fontFamily: 'monospace' }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24, background: '#0a0604', minHeight: '100vh', color: '#e6d0b8', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, position: 'sticky', top: 0, background: '#0a0604', paddingBottom: 8, zIndex: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Scale calibration</h1>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            Yellow dashed = hitbox. Blue = sprite bounds. Ignis is drawn at native scale on the right.
            Overhang = how far the sprite extends past each hitbox edge, in tile units.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status && <span style={{ fontSize: 11, opacity: 0.7 }}>{status}</span>}
          <button onClick={save} style={{ ...btnStyle, width: 'auto', height: 28, padding: '0 16px', fontSize: 11, background: '#F5D03B', color: '#1a0e08' }}>SAVE</button>
        </div>
      </div>
      {defs.map(def => {
        const rot = rotByPiece[def.id] ?? 0;
        const oh = getOverhang(def.id, rot) ?? { top: 0, right: 0, bottom: 0, left: 0 };
        const rots = def.hiResSprites ? Object.keys(def.hiResSprites).map(Number).sort() as FurnitureRotation[] : [0 as FurnitureRotation];
        return (
          <div key={`${def.id}-${tick}`}>
            {rots.length > 1 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: -4 }}>
                {rots.map(r => (
                  <button
                    key={r}
                    onClick={() => setRot(def.id, r)}
                    style={{
                      ...btnStyle, width: 'auto', height: 20, padding: '0 8px', fontSize: 10,
                      background: r === rot ? '#F5D03B' : '#2a1810',
                      color: r === rot ? '#1a0e08' : '#F5D03B',
                    }}>
                    {ROT_LABELS[r]}
                  </button>
                ))}
              </div>
            )}
            <PieceCard
              def={def}
              rot={rot}
              overhang={oh}
              onChange={(next) => updateOverhang(def.id, rot, next)}
            />
          </div>
        );
      })}
    </div>
  );
}
