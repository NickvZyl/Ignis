'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useCompanionStore } from '@web/stores/companion-store';
import { useEnvironmentStore, getWeatherCategory } from '@web/stores/environment-store';
import { useAuthStore } from '@web/stores/auth-store';
import { useChatStore } from '@web/stores/chat-store';
import { useRoomStore } from '@web/stores/room-store';
import { useSceneStore } from '@web/stores/scene-store';
import type { SceneId } from '@web/stores/scene-store';
import FurnitureInventory from '@web/components/FurnitureInventory';
import { TILE, GRID_W, GRID_H, WALL_ROWS, CEILING_ROWS, GARDEN_WALL_ROWS, BEDROOM_WALL_ROWS, FURNITURE_DEFS, getPixelPos, getSpotPixel, isValidPlacement, buildGrid, DEFAULT_LAYOUT, GARDEN_DEFAULT_LAYOUT, BEDROOM_DEFAULT_LAYOUT } from '@web/lib/room-grid';
import type { RoomLayout, CellType, PlacedFurniture } from '@web/lib/room-grid';
import { registry, setCheckinRemaining, getRotatedDims, drawRotated, glowRotated } from '@web/lib/furniture';
import type { FurnitureRotation } from '@web/lib/furniture';
import { findPath, type Point } from '@web/lib/pathfinding';
import { getGlobalSceneForHour, getScheduleBlockForHour } from '@web/lib/schedule';
import { EMOTION_COLORS, ROLE_COLORS } from '@/constants/ignisColors';
import type { EmotionLabel, RoleLabel } from '@/types';

// ── Canvas config ──
const W = 192, H = 160; // internal resolution
const SCALE = 4;         // display multiplier
const WALL_H = 62;      // wall+ceiling height in pixels (8 rows * 8px - 2px baseboard)
const FLOOR_Y = 64;     // where the floor starts (row 8 * 8px)

// ── Color helpers ──
import { h2r, darker, lighter } from '@web/lib/furniture/colors';

// Furniture pixel positions are now computed from room store layout
// Draw functions accept (ctx, x, y, ts) where x,y is the pixel position of the placed furniture

// ── Tag-based furniture lookup ──
// Find a placed furniture piece by tag, falling back to a specific ID
function findPlacedByTag(placedIds: string[], tag: string, fallbackId: string): string {
  // First check if any placed piece has the tag
  for (const id of placedIds) {
    const def = FURNITURE_DEFS[id];
    if (def?.tags?.includes(tag)) return id;
  }
  // Fall back to specific ID if placed
  if (placedIds.includes(fallbackId)) return fallbackId;
  // Last resort: return first placed piece
  return placedIds[0] ?? fallbackId;
}

// ── Role → furniture mapping ──
function getFurnitureForRole(role: RoleLabel, placedIds: string[]): string {
  switch (role) {
    case 'building': case 'active': case 'urgent':
      return findPlacedByTag(placedIds, 'work', 'desk');
    case 'curious': case 'thinking': case 'remembering':
      return findPlacedByTag(placedIds, 'reading', 'bookshelf');
    case 'caring':
      return findPlacedByTag(placedIds, 'relaxation', 'couch');
    default:
      return findPlacedByTag(placedIds, 'warmth', 'fireplace');
  }
}

function getIdleFurniture(emotion: EmotionLabel, placedIds: string[]): string {
  switch (emotion) {
    case 'warm': case 'deep': case 'reflective':
      return findPlacedByTag(placedIds, 'warmth', 'fireplace');
    case 'bright': case 'eager':
      return findPlacedByTag(placedIds, 'relaxation', 'couch');
    case 'grounded':
      return findPlacedByTag(placedIds, 'reading', 'bookshelf');
    default:
      return findPlacedByTag(placedIds, 'relaxation', 'couch');
  }
}

// ── Top-down Ignis sprite (8x8, two frames) ──
// 0=transparent 1=body 2=highlight 3=shadow 4=eye 5=closed eye (same as shadow)
const IGNIS_FRAMES = [
  // Frame A
  [[0,0,2,2,2,2,0,0],
   [0,2,1,1,1,1,2,0],
   [2,1,1,1,1,1,1,2],
   [1,1,4,1,1,4,1,1],
   [1,1,1,1,1,1,1,1],
   [1,1,1,2,2,1,1,1],
   [0,1,1,1,1,1,1,0],
   [0,0,3,3,3,3,0,0]],
  // Frame B (slight shift)
  [[0,0,0,2,2,0,0,0],
   [0,2,2,1,1,2,2,0],
   [2,1,1,1,1,1,1,2],
   [1,1,4,1,1,4,1,1],
   [1,1,1,1,1,1,1,1],
   [1,1,2,1,1,2,1,1],
   [0,1,1,1,1,1,1,0],
   [0,0,3,3,3,3,0,0]],
];

// Sleeping frames — eyes closed (4→3 shadow color), gentle breathing animation
const IGNIS_SLEEP_FRAMES = [
  [[0,0,2,2,2,2,0,0],
   [0,2,1,1,1,1,2,0],
   [2,1,1,1,1,1,1,2],
   [1,1,3,1,1,3,1,1],
   [1,1,1,1,1,1,1,1],
   [1,1,1,1,1,1,1,1],
   [0,1,1,1,1,1,1,0],
   [0,0,3,3,3,3,0,0]],
  [[0,0,2,2,2,2,0,0],
   [0,2,1,1,1,1,2,0],
   [2,1,1,1,1,1,1,2],
   [1,1,3,1,1,3,1,1],
   [1,1,1,1,1,1,1,1],
   [1,1,1,1,1,1,1,1],
   [0,1,1,1,1,1,1,0],
   [0,0,3,3,3,3,0,0]],
];

// ── Draw helpers ──
function drawSprite(ctx: CanvasRenderingContext2D, frame: number[][], x: number, y: number, bodyColor: string) {
  const hi = lighter(bodyColor, 60);
  const lo = darker(bodyColor, 50);
  frame.forEach((row, ry) => row.forEach((v, rx) => {
    if (!v) return;
    ctx.fillStyle = v===1 ? bodyColor : v===2 ? hi : v===3 ? lo : '#1a0808';
    ctx.fillRect(Math.round(x)+rx, Math.round(y)+ry, 1, 1);
  }));
}

function drawSleepZs(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  const zs = [
    { dx: 9, dy: -4, size: 3, phase: 0 },
    { dx: 12, dy: -8, size: 2, phase: 1.5 },
    { dx: 14, dy: -12, size: 2, phase: 3.0 },
  ];
  ctx.fillStyle = '#ffffff';
  for (const z of zs) {
    // Float upward and fade in a cycle
    const cycle = ((ts * 0.001 + z.phase) % 4) / 4; // 0-1 over 4 seconds
    const floatY = z.dy - cycle * 6;
    const alpha = cycle < 0.1 ? cycle / 0.1 : cycle > 0.7 ? (1 - cycle) / 0.3 : 1;
    ctx.globalAlpha = alpha * 0.7;
    const px = Math.round(x + z.dx);
    const py = Math.round(y + floatY);
    const s = z.size;
    // Draw a tiny pixel "Z"
    for (let i = 0; i < s; i++) ctx.fillRect(px + i, py, 1, 1);           // top bar
    for (let i = 0; i < s; i++) ctx.fillRect(px + s - 1 - i, py + i, 1, 1); // diagonal
    for (let i = 0; i < s; i++) ctx.fillRect(px + i, py + s - 1, 1, 1);   // bottom bar
  }
  ctx.globalAlpha = 1;
}

// Furniture drawing is now handled by the registry (web/lib/furniture/pieces/*)

// ── Sky colors from weather data or fallback ──
interface SkyConfig {
  top: [number,number,number];
  bottom: [number,number,number];
  stars: boolean;
  sun: boolean;
  moon: boolean;
  sunsetGlow: boolean;
  rain: boolean;
  clouds: number; // 0-1 cloud opacity overlay
  wind: number;   // 0-1 normalized wind intensity
}

function getSkyFromWeather(weather: any): SkyConfig {
  if (!weather) return getSkyFallback();

  const isDay = weather.isDay;
  const clouds = (weather.cloudCover || 0) / 100;
  const category = getWeatherCategory(weather.weatherCode);

  // Parse local time — format is "2026-03-18T11:00" (no timezone suffix, already local)
  const timeParts = String(weather.localTime).match(/T(\d{2}):(\d{2})/);
  const hour = timeParts ? parseInt(timeParts[1], 10) : new Date().getHours();
  const min = timeParts ? parseInt(timeParts[2], 10) : new Date().getMinutes();
  const t = hour + min / 60;

  // Parse sunrise/sunset — same format
  const parseTH = (s: string | null): number => {
    if (!s) return 6;
    const m = String(s).match(/T(\d{2}):(\d{2})/);
    return m ? parseInt(m[1],10) + parseInt(m[2],10)/60 : 6;
  };
  const sunriseH = parseTH(weather.sunrise);
  const sunsetH = parseTH(weather.sunset) || 18;
  const nearSunrise = Math.abs(t - sunriseH) < 1.5;
  const nearSunset = Math.abs(t - sunsetH) < 1.5;

  const rain = category === 'rain' || category === 'storm';
  // Normalize wind: 0 = calm, 1 = gale. Cap at ~50 km/h.
  const wind = Math.min(1, (weather.windSpeed || 0) / 50);

  if (!isDay) {
    const base: SkyConfig = {
      top: [8,8,24], bottom: [15,12,35],
      stars: clouds < 0.6, sun: false, moon: clouds < 0.4,
      sunsetGlow: false, rain, clouds: clouds * 0.4, wind,
    };
    if (nearSunrise || nearSunset) {
      base.top = [40,30,70]; base.bottom = [80,50,40];
      base.sunsetGlow = true;
    }
    return base;
  }

  if (nearSunrise) {
    return { top: [80,120,180], bottom: [180,140,100], stars: false, sun: false, moon: false, sunsetGlow: true, rain, clouds: clouds * 0.5, wind };
  }
  if (nearSunset) {
    return { top: [120,100,160], bottom: [220,140,80], stars: false, sun: false, moon: false, sunsetGlow: true, rain, clouds: clouds * 0.4, wind };
  }

  const clearTop: [number,number,number] = [80,150,220];
  const clearBottom: [number,number,number] = [120,190,240];
  const overcastTop: [number,number,number] = [140,140,150];
  const overcastBottom: [number,number,number] = [160,160,170];

  const mix = (a: [number,number,number], b: [number,number,number], t: number): [number,number,number] =>
    [Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t)];

  return {
    top: mix(clearTop, overcastTop, clouds),
    bottom: mix(clearBottom, overcastBottom, clouds),
    stars: false, sun: clouds < 0.7, moon: false,
    sunsetGlow: false, rain, clouds: 0, wind,
  };
}

function getSkyFallback(): SkyConfig {
  const hour = new Date().getHours();
  const t = hour + new Date().getMinutes() / 60;
  if (t >= 6 && t < 8)   return { top:[80,120,180], bottom:[180,140,100], stars:false, sun:false, moon:false, sunsetGlow:true, rain:false, clouds:0, wind:0 };
  if (t >= 8 && t < 16)   return { top:[80,150,220], bottom:[120,190,240], stars:false, sun:true, moon:false, sunsetGlow:false, rain:false, clouds:0, wind:0 };
  if (t >= 16 && t < 18)  return { top:[120,100,160], bottom:[220,140,80], stars:false, sun:false, moon:false, sunsetGlow:true, rain:false, clouds:0, wind:0 };
  if (t >= 18 && t < 20)  return { top:[60,40,100], bottom:[160,80,60], stars:true, sun:false, moon:false, sunsetGlow:true, rain:false, clouds:0, wind:0 };
  if (t >= 20 && t < 22)  return { top:[15,15,40], bottom:[30,25,60], stars:true, sun:false, moon:true, sunsetGlow:false, rain:false, clouds:0, wind:0 };
  return { top:[8,8,24], bottom:[15,12,35], stars:true, sun:false, moon:true, sunsetGlow:false, rain:false, clouds:0, wind:0 };
}

function drawWindow(ctx: CanvasRenderingContext2D, ts: number, skyOverride?: SkyConfig) {
  const wx = 60, wy = 33;  // in wall zone (below ceiling beams at y=32)
  const ww = 72, wh = 28;  // window dimensions (fits wall zone y=33-63)

  const sky = skyOverride || getSkyFallback();

  // Frame outer
  for (let dy=-1;dy<wh+1;dy++) for (let dx=-1;dx<ww+1;dx++) {
    if (dx >= 2 && dx < ww-2 && dy >= 2 && dy < wh-2) continue;
    ctx.fillStyle = (dy === -1 || dy === wh) ? '#8a6840' : '#6a4820';
    ctx.fillRect(wx+dx, wy+dy, 1, 1);
  }

  // Sky gradient in glass
  for (let dy=2;dy<wh-2;dy++) for (let dx=2;dx<ww-2;dx++) {
    // Skip dividers
    if (dx === Math.floor(ww/2)-1 || dx === Math.floor(ww/2)) continue;
    if (dy === Math.floor(wh/2)-1 || dy === Math.floor(wh/2)) continue;

    const t = dy / (wh - 4); // 0 at top, 1 at bottom
    const r = Math.round(sky.top[0] + (sky.bottom[0] - sky.top[0]) * t);
    const g = Math.round(sky.top[1] + (sky.bottom[1] - sky.top[1]) * t);
    const b = Math.round(sky.top[2] + (sky.bottom[2] - sky.top[2]) * t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(wx+dx, wy+dy, 1, 1);
  }

  // Dividers (cross)
  const midX = Math.floor(ww/2) - 1;
  const midY = Math.floor(wh/2) - 1;
  for (let dy=2;dy<wh-2;dy++) { ctx.fillStyle='#6a4820';ctx.fillRect(wx+midX,wy+dy,2,1); }
  for (let dx=2;dx<ww-2;dx++) { ctx.fillStyle='#6a4820';ctx.fillRect(wx+dx,wy+midY,1,2); }

  // Stars (only at night)
  if (sky.stars) {
    const starPositions: [number,number][] = [
      [wx+6,wy+5],[wx+20,wy+8],[wx+45,wy+6],[wx+55,wy+10],
      [wx+12,wy+22],[wx+30,wy+25],[wx+50,wy+20],[wx+65,wy+24],
      [wx+8,wy+14],[wx+40,wy+12],[wx+58,wy+7],[wx+25,wy+4],
    ];
    starPositions.forEach(([sx,sy]) => {
      ctx.globalAlpha = 0.3 + 0.7*(Math.sin(ts*0.0015+sx*0.7+sy*1.3)*0.5+0.5);
      ctx.fillStyle = '#e8e8f8';
      ctx.fillRect(sx, sy, 1, 1);
      ctx.globalAlpha = 1;
    });
  }

  // Moon
  if (sky.moon) {
    const moonX = wx + ww - 16, moonY = wy + 6;
    ([[0,1],[0,2],[1,0],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3],[3,1],[3,2]] as [number,number][]).forEach(([mx,my]) => {
      ctx.fillStyle = '#e8d898';
      ctx.fillRect(moonX+mx, moonY+my, 1, 1);
    });
    // Moon highlight
    ctx.fillStyle = '#f8eecc';
    ctx.fillRect(moonX+1, moonY+1, 1, 1);
  }

  // Sun
  if (sky.sun) {
    const sunX = wx + 18, sunY = wy + 8;
    // Simple sun disc
    ([[0,1],[0,2],[1,0],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3],[3,1],[3,2]] as [number,number][]).forEach(([sx,sy]) => {
      ctx.fillStyle = '#ffe860';
      ctx.fillRect(sunX+sx, sunY+sy, 1, 1);
    });
    // Sun rays
    ctx.fillStyle = '#ffd030';
    [[-1,2],[4,1],[1,-1],[2,4]].forEach(([rx,ry]) => ctx.fillRect(sunX+rx, sunY+ry, 1, 1));
  }

  // Sunset glow (warm gradient at bottom of sky)
  if (sky.sunsetGlow) {
    for (let dy=wh-10;dy<wh-2;dy++) for (let dx=2;dx<ww-2;dx++) {
      if (dx === midX || dx === midX+1) continue;
      if (dy === midY || dy === midY+1) continue;
      const intensity = (dy - (wh-10)) / 8;
      ctx.globalAlpha = 0.3 * intensity;
      ctx.fillStyle = '#ff8840';
      ctx.fillRect(wx+dx, wy+dy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // Sill
  for (let dx=-2;dx<ww+2;dx++) {
    ctx.fillStyle = '#7a5428';ctx.fillRect(wx+dx, wy+wh-2, 1, 1);
    ctx.fillStyle = '#8a6438';ctx.fillRect(wx+dx, wy+wh-1, 1, 1);
  }

  // Curtains on sides — wind-reactive
  const w = sky.wind;
  // Base amplitude: 0.5 calm → up to 4px in strong wind
  const amp = 0.5 + w * 3.5;
  // Speed: gentle sway normally, fast flapping in wind
  const speed = 0.001 + w * 0.008;
  // Gusts: irregular secondary wave that intensifies with wind
  const gustAmp = w * 2.0;
  const gustSpeed = 0.003 + w * 0.012;

  for (let dy=0;dy<wh;dy++) {
    // Main sway + gust layer + vertical ripple that increases toward bottom
    const verticalFactor = 0.5 + (dy / wh) * 0.5; // bottom billows more
    const mainWave = Math.sin(dy * 0.4 + ts * speed) * amp * verticalFactor;
    const gust = Math.sin(dy * 0.7 + ts * gustSpeed + 2.3) * gustAmp * verticalFactor;
    const wave = mainWave + gust;

    // Left curtain
    for (let dx=0;dx<4;dx++) {
      ctx.fillStyle = dx < 2 ? '#8a3030' : '#6a2020';
      ctx.fillRect(wx + dx + Math.round(wave), wy + dy, 1, 1);
    }
    // Right curtain
    for (let dx=0;dx<4;dx++) {
      ctx.fillStyle = dx > 1 ? '#8a3030' : '#6a2020';
      ctx.fillRect(wx + ww - 4 + dx - Math.round(wave), wy + dy, 1, 1);
    }
  }

  // Cloud overlay on glass
  if (sky.clouds > 0) {
    for (let dy=2;dy<wh-2;dy++) for (let dx=6;dx<ww-6;dx++) {
      if (dx === Math.floor(ww/2)-1 || dx === Math.floor(ww/2)) continue;
      if (dy === Math.floor(wh/2)-1 || dy === Math.floor(wh/2)) continue;
      // Wispy cloud pattern
      const cloudNoise = Math.sin(dx*0.3+dy*0.5+ts*0.0005)*0.5+0.5;
      if (cloudNoise > 0.6) {
        ctx.globalAlpha = sky.clouds * 0.4 * (cloudNoise - 0.6) / 0.4;
        ctx.fillStyle = '#c0c0c8';
        ctx.fillRect(wx+dx, wy+dy, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Rain streaks on window
  if (sky.rain) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#8899bb';
    for (let i=0; i<12; i++) {
      const rx = wx + 6 + ((i * 17 + Math.floor(ts/80)) % (ww-12));
      const ry = wy + 3 + ((i * 13 + Math.floor(ts/60)) % (wh-6));
      if (rx !== wx + Math.floor(ww/2)-1 && rx !== wx + Math.floor(ww/2)) {
        ctx.fillRect(rx, ry, 1, 1);
        ctx.fillRect(rx, ry+1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Clock table draw function is in web/lib/furniture/pieces/clock_table.ts

function drawFloor(ctx: CanvasRenderingContext2D) {
  // Darker, cooler wood floor — separates from warm wall paneling & furniture
  const plankW = 6;
  for (let y = FLOOR_Y; y < H; y++) for (let x = 0; x < W; x++) {
    const plankIdx = Math.floor(x / plankW);
    const plankX = x % plankW;
    const isSeam = plankX === 0;

    const plankSeed = (plankIdx * 37) % 7;
    let r: number, g: number, b: number;
    if (plankSeed < 2) { r = 118; g = 82; b = 56; }       // dark walnut
    else if (plankSeed < 4) { r = 108; g = 74; b = 50; }   // deep brown
    else if (plankSeed < 6) { r = 126; g = 88; b = 60; }   // medium dark
    else { r = 102; g = 70; b = 46; }                        // darkest accent

    const grain = Math.sin(y * 0.8 + plankIdx * 4.3) * 6 + Math.sin(y * 0.3 + plankIdx * 7.1) * 3;
    r += Math.round(grain);
    g += Math.round(grain * 0.7);
    b += Math.round(grain * 0.4);

    const knotHash = ((x * 13 + y * 29 + plankIdx * 53) % 197);
    if (knotHash < 2) { r -= 25; g -= 20; b -= 12; }

    const boardY = (y - FLOOR_Y + plankIdx * 7) % 18;
    if (boardY === 0) { r -= 12; g -= 10; b -= 6; }

    if (isSeam) {
      ctx.fillStyle = '#2e1c0e';
    } else {
      ctx.fillStyle = `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
    }
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  // Zone layout (rows → pixels):
  //   Ceiling zone: rows 0-3 (y 0-31)   — plaster + exposed beams
  //   Wall zone:    rows 4-7 (y 32-63)  — wallpaper + paneling + baseboard
  //   Floor zone:   rows 8-19 (y 64-159) — drawn by drawFloor()

  const CEIL_PX = CEILING_ROWS * TILE;     // 32 — end of ceiling zone
  const WALL_END = WALL_H;                 // 62 — end of wall (before baseboard)

  // ── CEILING ZONE (y 0-31): plaster with exposed beams ──
  for (let y = 0; y < CEIL_PX - 4; y++) for (let x = 0; x < W; x++) {
    const noise = ((x * 3 + y * 7) % 5) - 2;
    const depth = Math.floor(y * 0.25);
    const r = 200 - depth + noise, g = 194 - depth + noise, b = 185 - depth + noise;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Exposed beams (4px tall at bottom of ceiling zone)
  for (let y = CEIL_PX - 4; y < CEIL_PX; y++) for (let x = 0; x < W; x++) {
    const beamIdx = Math.floor(x / 24);
    const beamX = x % 24;
    const isCrossBeam = beamX >= 22 || beamX < 2;
    const grain = Math.sin(x * 0.5 + beamIdx * 3) * 3;
    if (isCrossBeam) {
      ctx.fillStyle = y === CEIL_PX - 4 ? '#3a2210' : '#4a3018';
    } else {
      const base = 52 + Math.round(grain);
      ctx.fillStyle = `rgb(${base + 8},${base - 6},${base - 22})`;
    }
    ctx.fillRect(x, y, 1, 1);
  }

  // Crown molding (transition between ceiling and wall)
  for (let x = 0; x < W; x++) {
    ctx.fillStyle = '#2e1a0c';
    ctx.fillRect(x, CEIL_PX, 1, 1);
  }

  // ── WALL ZONE (y 33-63): wallpaper + paneling ──
  const WALLPAPER_START = CEIL_PX + 1;
  const PANEL_SPLIT = 46;   // where wallpaper meets paneling
  const TRIM_H = 2;

  // Upper wall: sage-cream wallpaper
  for (let y = WALLPAPER_START; y < PANEL_SPLIT; y++) for (let x = 0; x < W; x++) {
    const noise = ((x * 7 + y * 13) % 5) - 2;
    const r = 208 + noise, g = 204 + noise, b = 186 + noise;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Floral motifs
  const flowerSpacing = 14;
  for (let fy = 0; fy < 2; fy++) {
    for (let fx = 0; fx < Math.ceil(W / flowerSpacing); fx++) {
      const cx = fx * flowerSpacing + (fy % 2) * 7 + 4;
      const cy = WALLPAPER_START + 2 + fy * 6;
      if (cy + 3 >= PANEL_SPLIT || cx + 3 >= W) continue;
      ctx.fillStyle = '#a0a880';
      ctx.fillRect(cx + 1, cy + 2, 1, 2);
      ctx.fillStyle = '#b0a888';
      ctx.fillRect(cx, cy + 1, 1, 1);
      ctx.fillRect(cx + 2, cy + 1, 1, 1);
      ctx.fillRect(cx + 1, cy, 1, 1);
      ctx.fillStyle = '#c0b090';
      ctx.fillRect(cx + 1, cy + 1, 1, 1);
    }
  }

  // Trim strip
  for (let x = 0; x < W; x++) {
    ctx.fillStyle = '#7a5430'; ctx.fillRect(x, PANEL_SPLIT, 1, 1);
    ctx.fillStyle = '#8a6440'; ctx.fillRect(x, PANEL_SPLIT + 1, 1, 1);
  }

  // Lower wall: wood paneling
  const panelTop = PANEL_SPLIT + TRIM_H;
  const panelPlankW = 5;
  for (let y = panelTop; y < WALL_END; y++) for (let x = 0; x < W; x++) {
    const plankIdx = Math.floor(x / panelPlankW);
    const plankX = x % panelPlankW;
    const isSeam = plankX === 0;
    const seed = (plankIdx * 31) % 5;
    let r: number, g: number, b: number;
    if (seed < 1) { r = 150; g = 105; b = 62; }
    else if (seed < 2) { r = 140; g = 96; b = 56; }
    else if (seed < 3) { r = 158; g = 112; b = 68; }
    else if (seed < 4) { r = 135; g = 92; b = 52; }
    else { r = 145; g = 100; b = 60; }
    const grain = Math.sin(y * 0.6 + plankIdx * 5.7) * 6 + Math.sin(y * 0.2 + plankIdx * 3.1) * 3;
    r += Math.round(grain); g += Math.round(grain * 0.7); b += Math.round(grain * 0.4);
    ctx.fillStyle = isSeam ? '#4a3018' : `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Baseboard
  for (let x = 0; x < W; x++) {
    ctx.fillStyle = '#3a2010'; ctx.fillRect(x, WALL_END, 1, 1);
    ctx.fillStyle = '#4a2c18'; ctx.fillRect(x, WALL_END + 1, 1, 1);
  }
}

// ── Garden drawing functions ──

// Hi-res scene backgrounds — rendered on separate canvas at display resolution
const sceneBgImages: Record<string, HTMLImageElement | null> = {};
const sceneBgLoading: Record<string, boolean> = {};

// Hi-res furniture sprites — loaded on demand, cached
const hiResSpriteCache: Record<string, HTMLImageElement | null> = {};
const hiResSpriteLoading: Record<string, boolean> = {};

function getHiResSprite(src: string): HTMLImageElement | null {
  if (hiResSpriteCache[src]) return hiResSpriteCache[src];
  if (hiResSpriteLoading[src]) return null;
  hiResSpriteLoading[src] = true;
  const img = new Image();
  img.src = src;
  img.onload = () => { hiResSpriteCache[src] = img; };
  return null;
}

// Asset size overrides from the asset sizer tool
interface AssetSize { widthPx: number; heightPx: number; offsetX: number; offsetY: number; }
let cachedAssetSizes: Record<string, AssetSize> | null = null;
let assetSizesCacheTime = 0;
function getAssetSizes(): Record<string, AssetSize> {
  const now = Date.now();
  if (cachedAssetSizes && now - assetSizesCacheTime < 5000) return cachedAssetSizes;
  try {
    const raw = localStorage.getItem('ignis_asset_sizes');
    const parsed = raw ? JSON.parse(raw) : {};
    // Purge corrupted NaN entries
    const clean: Record<string, AssetSize> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const s = v as AssetSize;
      if ([s.widthPx, s.heightPx, s.offsetX, s.offsetY].every(n => typeof n === 'number' && isFinite(n))) {
        clean[k] = s;
      }
    }
    if (Object.keys(clean).length !== Object.keys(parsed).length) {
      localStorage.setItem('ignis_asset_sizes', JSON.stringify(clean));
    }
    cachedAssetSizes = clean;
  } catch { cachedAssetSizes = {}; }
  assetSizesCacheTime = now;
  return cachedAssetSizes!;
}

function loadSceneBg(scene: string, src: string) {
  if (sceneBgImages[scene] || sceneBgLoading[scene]) return;
  sceneBgLoading[scene] = true;
  const img = new Image();
  img.src = src;
  img.onload = () => { sceneBgImages[scene] = img; };
}

function drawSceneBgHiRes(bgCtx: CanvasRenderingContext2D, scene: string) {
  const img = sceneBgImages[scene];
  if (img) {
    bgCtx.imageSmoothingEnabled = true;
    bgCtx.imageSmoothingQuality = 'high';
    bgCtx.drawImage(img, 0, 0, W * SCALE, H * SCALE);
  }
}

function drawGardenGround(ctx: CanvasRenderingContext2D) {
  loadSceneBg('garden', '/garden-bg.png');
  ctx.clearRect(0, 0, W, H);
}

function drawGardenSky(ctx: CanvasRenderingContext2D, ts: number, sky: SkyConfig) {
  const skyH = 40; // top portion is sky

  // Sky gradient
  for (let y = 0; y < skyH; y++) {
    const t = y / skyH;
    const r = Math.round(sky.top[0] + (sky.bottom[0] - sky.top[0]) * t);
    const g = Math.round(sky.top[1] + (sky.bottom[1] - sky.top[1]) * t);
    const b = Math.round(sky.top[2] + (sky.bottom[2] - sky.top[2]) * t);
    for (let x = 0; x < W; x++) {
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Horizon blend (sky into grass)
  for (let y = skyH; y < skyH + 6; y++) {
    const blend = (y - skyH) / 6;
    ctx.globalAlpha = 1 - blend;
    const r = Math.round(sky.bottom[0]);
    const g = Math.round(sky.bottom[1]);
    const b = Math.round(sky.bottom[2]);
    for (let x = 0; x < W; x++) {
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;

  // Stars
  if (sky.stars) {
    const starPositions: [number,number][] = [
      [12,5],[40,12],[80,4],[120,10],[160,6],[180,15],
      [30,20],[70,18],[110,8],[150,22],[55,14],[140,3],
      [25,30],[95,25],[170,28],[60,32],[130,35],
    ];
    starPositions.forEach(([sx,sy]) => {
      if (sy >= skyH) return;
      ctx.globalAlpha = 0.3 + 0.7*(Math.sin(ts*0.0015+sx*0.7+sy*1.3)*0.5+0.5);
      ctx.fillStyle = '#e8e8f8';
      ctx.fillRect(sx, sy, 1, 1);
    });
    ctx.globalAlpha = 1;
  }

  // Moon
  if (sky.moon) {
    const moonX = W - 28, moonY = 8;
    ([[0,1],[0,2],[1,0],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3],[3,1],[3,2]] as [number,number][]).forEach(([mx,my]) => {
      ctx.fillStyle = '#e8d898';
      ctx.fillRect(moonX+mx, moonY+my, 1, 1);
    });
    ctx.fillStyle = '#f8eecc';
    ctx.fillRect(moonX+1, moonY+1, 1, 1);
  }

  // Sun
  if (sky.sun) {
    const sunX = 30, sunY = 10;
    ([[0,1],[0,2],[1,0],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3],[3,1],[3,2]] as [number,number][]).forEach(([sx,sy]) => {
      ctx.fillStyle = '#ffe860';
      ctx.fillRect(sunX+sx, sunY+sy, 1, 1);
    });
    ctx.fillStyle = '#ffd030';
    [[-1,2],[4,1],[1,-1],[2,4]].forEach(([rx,ry]) => ctx.fillRect(sunX+rx, sunY+ry, 1, 1));
  }

  // Clouds
  if (sky.clouds > 0 || sky.sun) {
    const cloudAlpha = sky.clouds > 0 ? sky.clouds * 0.5 : 0.2;
    const cloudPositions = [
      { x: 20 + ((ts * 0.005) % 200) - 100, y: 12, w: 18, h: 5 },
      { x: 100 + ((ts * 0.003) % 200) - 100, y: 20, w: 22, h: 6 },
      { x: 160 + ((ts * 0.004) % 200) - 100, y: 8, w: 16, h: 4 },
    ];
    ctx.globalAlpha = cloudAlpha;
    ctx.fillStyle = '#d8d8e0';
    for (const c of cloudPositions) {
      for (let dy = 0; dy < c.h; dy++) for (let dx = 0; dx < c.w; dx++) {
        const cx = c.x + dx;
        const cy = c.y + dy;
        if (cy >= skyH || cx < 0 || cx >= W) continue;
        // Softer edges
        const edgeDist = Math.min(dx, c.w - 1 - dx, dy, c.h - 1 - dy);
        if (edgeDist === 0 && ((dx + dy) % 2 === 1)) continue;
        ctx.fillRect(cx, cy, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Sunset glow
  if (sky.sunsetGlow) {
    for (let y = skyH - 10; y < skyH; y++) {
      const intensity = (y - (skyH - 10)) / 10;
      ctx.globalAlpha = 0.3 * intensity;
      ctx.fillStyle = '#ff8840';
      for (let x = 0; x < W; x++) ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}

function drawGardenFence(ctx: CanvasRenderingContext2D) {
  // Wooden fence along left, right, and top edges (decorative background)
  const fenceColor1 = '#7a5a38';
  const fenceColor2 = '#8a6a48';
  const postColor = '#6a4a28';

  // Top fence (behind sky area, at y ~38-42)
  const fenceY = 38;
  for (let x = 0; x < W; x++) {
    ctx.fillStyle = fenceColor1;
    ctx.fillRect(x, fenceY, 1, 1);
    ctx.fillRect(x, fenceY + 2, 1, 1);
    ctx.fillStyle = fenceColor2;
    ctx.fillRect(x, fenceY + 1, 1, 1);
  }
  // Posts
  for (let x = 0; x < W; x += 16) {
    for (let dy = -2; dy < 5; dy++) {
      ctx.fillStyle = postColor;
      ctx.fillRect(x, fenceY + dy, 2, 1);
    }
    // Pointed top
    ctx.fillStyle = postColor;
    ctx.fillRect(x, fenceY - 3, 1, 1);
  }

  // Left fence
  for (let y = fenceY; y < H - 16; y++) {
    ctx.fillStyle = fenceColor1;
    ctx.fillRect(0, y, 1, 1);
    ctx.fillRect(2, y, 1, 1);
    ctx.fillStyle = fenceColor2;
    ctx.fillRect(1, y, 1, 1);
  }
  for (let y = fenceY; y < H - 16; y += 16) {
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = -2; dy < 4; dy++) {
        ctx.fillStyle = postColor;
        ctx.fillRect(dx, y + dy, 1, 1);
      }
    }
  }

  // Right fence
  for (let y = fenceY; y < H - 16; y++) {
    ctx.fillStyle = fenceColor1;
    ctx.fillRect(W - 3, y, 1, 1);
    ctx.fillRect(W - 1, y, 1, 1);
    ctx.fillStyle = fenceColor2;
    ctx.fillRect(W - 2, y, 1, 1);
  }
  for (let y = fenceY; y < H - 16; y += 16) {
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = -2; dy < 4; dy++) {
        ctx.fillStyle = postColor;
        ctx.fillRect(W - 3 + dx, y + dy, 1, 1);
      }
    }
  }
}

// ── Bedroom drawing functions ──

function drawBedroomFloor(ctx: CanvasRenderingContext2D) {
  // Darker, richer wood floor for bedroom
  const plankW = 7;
  for (let y = FLOOR_Y; y < H; y++) for (let x = 0; x < W; x++) {
    const plankIdx = Math.floor(x / plankW);
    const plankX = x % plankW;
    const isSeam = plankX === 0;

    const seed = (plankIdx * 41) % 5;
    let r: number, g: number, b: number;
    if (seed < 1) { r = 120; g = 80; b = 52; }
    else if (seed < 2) { r = 112; g = 74; b = 46; }
    else if (seed < 3) { r = 128; g = 86; b = 56; }
    else if (seed < 4) { r = 108; g = 72; b = 44; }
    else { r = 118; g = 78; b = 50; }

    const grain = Math.sin(y * 0.7 + plankIdx * 5.1) * 5 + Math.sin(y * 0.25 + plankIdx * 8.3) * 3;
    r += Math.round(grain); g += Math.round(grain * 0.7); b += Math.round(grain * 0.4);
    const boardY = (y - FLOOR_Y + plankIdx * 9) % 20;
    if (boardY === 0) { r -= 12; g -= 10; b -= 6; }

    ctx.fillStyle = isSeam ? '#3a2010' : `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Rug in center
  const rugL = 44, rugR = 148, rugT = FLOOR_Y + 24, rugB = H - 16;
  for (let y = rugT; y < rugB; y++) for (let x = rugL; x < rugR; x++) {
    const border = x <= rugL + 1 || x >= rugR - 2 || y <= rugT + 1 || y >= rugB - 2;
    const inner = x <= rugL + 3 || x >= rugR - 4 || y <= rugT + 3 || y >= rugB - 4;
    if (border) ctx.fillStyle = '#7a5540';
    else if (inner) ctx.fillStyle = '#8a6550';
    else {
      const pat = ((x - rugL) + (y - rugT)) % 4;
      ctx.fillStyle = pat < 2 ? '#987060' : '#906858';
    }
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawBedroomWalls(ctx: CanvasRenderingContext2D) {
  const BEAM_H = 6;
  const UPPER_START = BEAM_H;
  const PANEL_SPLIT = 24;
  const PANEL_START = PANEL_SPLIT;
  const TRIM_H = 2;

  // ── Ceiling beams (same cabin style, slightly darker) ──
  for (let y = 0; y < BEAM_H; y++) for (let x = 0; x < W; x++) {
    const beamIdx = Math.floor(x / 24);
    const beamX = x % 24;
    const isCross = beamX >= 22 || beamX < 2;
    const grain = Math.sin(x * 0.5 + beamIdx * 3) * 3;
    if (isCross) ctx.fillStyle = y < 1 ? '#32200e' : '#42280e';
    else { const b = 56 + Math.round(grain); ctx.fillStyle = `rgb(${b+8},${b-6},${b-22})`; }
    ctx.fillRect(x, y, 1, 1);
  }
  for (let x = 0; x < W; x++) { ctx.fillStyle = '#32200e'; ctx.fillRect(x, BEAM_H, 1, 1); }

  // ── Upper: soft blue-gray wallpaper with subtle pattern ──
  for (let y = UPPER_START + 1; y < PANEL_START; y++) for (let x = 0; x < W; x++) {
    const noise = ((x * 7 + y * 13) % 5) - 2;
    ctx.fillStyle = `rgb(${185 + noise},${192 + noise},${205 + noise})`;
    ctx.fillRect(x, y, 1, 1);
  }
  // Subtle diamond pattern
  for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < Math.ceil(W / 12); fx++) {
    const cx = fx * 12 + (fy % 2) * 6 + 3;
    const cy = UPPER_START + 4 + fy * 7;
    if (cy + 2 >= PANEL_START || cx + 2 >= W) continue;
    ctx.fillStyle = '#b0b8c8';
    ctx.fillRect(cx + 1, cy, 1, 1);
    ctx.fillRect(cx, cy + 1, 1, 1);
    ctx.fillRect(cx + 2, cy + 1, 1, 1);
    ctx.fillRect(cx + 1, cy + 2, 1, 1);
  }

  // ── Trim ──
  for (let x = 0; x < W; x++) {
    ctx.fillStyle = '#5a4028';
    ctx.fillRect(x, PANEL_START, 1, 1);
    ctx.fillStyle = '#6a4a30';
    ctx.fillRect(x, PANEL_START + 1, 1, 1);
  }

  // ── Lower: vertical wood paneling (darker than living room) ──
  const panelTop = PANEL_START + TRIM_H;
  const panelPlankW = 5;
  for (let y = panelTop; y < WALL_H; y++) for (let x = 0; x < W; x++) {
    const plankIdx = Math.floor(x / panelPlankW);
    const plankX = x % panelPlankW;
    const isSeam = plankX === 0;
    const seed = (plankIdx * 29) % 5;
    let r: number, g: number, b: number;
    if (seed < 1) { r = 125; g = 85; b = 52; }
    else if (seed < 2) { r = 118; g = 78; b = 46; }
    else if (seed < 3) { r = 132; g = 90; b = 56; }
    else if (seed < 4) { r = 115; g = 76; b = 44; }
    else { r = 122; g = 82; b = 50; }
    const grain = Math.sin(y * 0.6 + plankIdx * 4.9) * 5;
    r += Math.round(grain); g += Math.round(grain * 0.7); b += Math.round(grain * 0.4);
    ctx.fillStyle = isSeam ? '#3a2010' : `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // ── Baseboard ──
  for (let x = 0; x < W; x++) {
    ctx.fillStyle = '#32200e'; ctx.fillRect(x, WALL_H, 1, 1);
    ctx.fillStyle = '#3e2814'; ctx.fillRect(x, WALL_H + 1, 1, 1);
  }
}

// Schedule types (imported from @web/lib/schedule)
type ScheduleBlock = { primary: string; secondary: string; label: string };

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// ── Standalone scene data loading (for Ignis's independent pathfinding) ──
const SCENE_STORAGE_KEYS: Record<SceneId, string> = {
  room: 'ignis_room_layout', garden: 'ignis_garden_layout', bedroom: 'ignis_bedroom_layout',
};
const SCENE_DEFAULTS: Record<SceneId, RoomLayout> = {
  room: DEFAULT_LAYOUT, garden: GARDEN_DEFAULT_LAYOUT, bedroom: BEDROOM_DEFAULT_LAYOUT,
};
const SCENE_WALL_ROWS: Record<SceneId, number> = {
  room: WALL_ROWS, garden: GARDEN_WALL_ROWS, bedroom: BEDROOM_WALL_ROWS,
};

function loadSceneLayout(scene: SceneId): RoomLayout {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEYS[scene]);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.furniture?.length > 0) {
        parsed.furniture = parsed.furniture.map((f: any) => ({ ...f, rot: f.rot ?? 0 }));
        return parsed;
      }
    }
  } catch {}
  return SCENE_DEFAULTS[scene];
}

function buildIgnisSceneData(scene: SceneId) {
  const layout = loadSceneLayout(scene);
  const grid = buildGrid(layout, SCENE_WALL_ROWS[scene]);
  return { layout, grid };
}

// Global scene schedule imported from @web/lib/schedule

// ── Door routing: which door to exit through for each scene→scene transition ──
const EXIT_DOORS: Record<string, Record<string, string>> = {
  room:    { garden: 'front_door',   bedroom: 'hallway_door' },
  garden:  { room: 'garden_gate',    bedroom: 'garden_gate' },   // garden→bedroom goes via room
  bedroom: { room: 'bedroom_door',   garden: 'bedroom_door' },   // bedroom→garden goes via room
};

// ── Next scene in a multi-hop (garden↔bedroom must go through room) ──
function getNextHop(from: SceneId, to: SceneId): SceneId {
  if ((from === 'garden' && to === 'bedroom') || (from === 'bedroom' && to === 'garden')) {
    return 'room';
  }
  return to;
}

// Entry door when arriving in a scene — depends on where Ignis came FROM
const ENTRY_DOORS: Record<string, Record<string, string>> = {
  room:    { garden: 'front_door',   bedroom: 'hallway_door' },
  garden:  { room: 'garden_gate',    bedroom: 'garden_gate' },
  bedroom: { room: 'bedroom_door',   garden: 'bedroom_door' },
};

function getEntryDoor(arrivedScene: SceneId, cameFrom: SceneId): string {
  return ENTRY_DOORS[arrivedScene]?.[cameFrom] ?? 'front_door';
}

// ── Main component ──
export default function IgnisScene() {
  const emotionalState = useCompanionStore((s) => s.emotionalState);
  const emotion: EmotionLabel = emotionalState?.active_emotion ?? 'warm';
  const role: RoleLabel = emotionalState?.active_role ?? null;
  const userId = useAuthStore((s) => s.user?.id);
  const { weather, fetchEnvironment } = useEnvironmentStore();
  const { nextCheckinSeconds } = useChatStore();
  const { layout, grid, mode, setMode, moveFurniture, startDrag, endDrag, dragging, draggingRot, cycleDraggingRot, getSpot, draggingSpot, startSpotDrag, endSpotDrag, setSpotEdit, initSpots, spotsLoaded, placing, placingRot, cyclePlacingRot, addToRoom, removeFromRoom, cancelPlacing, switchSceneLayout, currentScene } = useRoomStore();
  const gotoFurniture = useChatStore((s) => s.gotoFurniture);
  const { activeScene, transitioning, switchScene, ignisScene, setIgnisScene } = useSceneStore();
  const activeSceneRef = useRef(activeScene);
  const ignisSceneRef = useRef(ignisScene);

  // ── Ignis's own scene data (independent of user's viewed scene) ──
  const ignisSceneData = useRef(buildIgnisSceneData(ignisScene));
  const ignisSpot = useCallback((id: string): { x: number; y: number } | null => {
    const placed = ignisSceneData.current.layout.furniture.find((f: PlacedFurniture) => f.id === id);
    if (!placed) return null;
    return getSpotPixel(placed);
  }, []);
  const ignisSpotOrFallback = useCallback((id: string) => ignisSpot(id) || { x: 96, y: 80 }, [ignisSpot]);
  const ignisPlacedIds = useCallback(() => ignisSceneData.current.layout.furniture.map((f: PlacedFurniture) => f.id), []);

  // Load spot positions from codebase on mount
  useEffect(() => { initSpots(); }, [initSpots]);

  // Helper to get furniture spot pixel position (declared early for scene-change effect)
  const spot = (id: string) => getSpot(id) || { x: 96, y: 80 };
  const placedIds = layout.furniture.map(f => f.id);
  const placedIdsRef = useRef(placedIds);
  placedIdsRef.current = placedIds;

  // Idle behavior refs (declared early for scene-change + goto effects)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentActivityRef = useRef<string>('relaxing');
  const isTaskActiveRef = useRef(false);
  const atPrimaryRef = useRef(true);
  const clearIdleTimer = () => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
  };
  const gotoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule-based idle: mostly sits at primary spot, occasionally visits secondary
  const getActiveSchedule = useCallback((ids: string[]): ScheduleBlock => {
    return getScheduleBlockForHour(ids);
  }, []);

  const scheduleNextIdle = useCallback(() => {
    if (settingTimerRef.current) {
      idleTimerRef.current = setTimeout(scheduleNextIdle, 5000);
      return;
    }
    const block = getActiveSchedule(ignisPlacedIds());
    if (atPrimaryRef.current) {
      if (Math.random() < 0.15) {
        atPrimaryRef.current = false;
        targetRef.current = { ...ignisSpotOrFallback(block.secondary) };
        currentActivityRef.current = block.label;
        idleTimerRef.current = setTimeout(scheduleNextIdle, randomInRange(2 * 60000, 5 * 60000));
      } else {
        targetRef.current = { ...ignisSpotOrFallback(block.primary) };
        currentActivityRef.current = block.label;
        idleTimerRef.current = setTimeout(scheduleNextIdle, randomInRange(5 * 60000, 15 * 60000));
      }
    } else {
      atPrimaryRef.current = true;
      targetRef.current = { ...ignisSpotOrFallback(block.primary) };
      currentActivityRef.current = block.label;
      idleTimerRef.current = setTimeout(scheduleNextIdle, randomInRange(8 * 60000, 20 * 60000));
    }
  }, [getActiveSchedule, ignisSpotOrFallback, ignisPlacedIds]);

  // ── Ignis scene transition (always walks to door, regardless of user view) ──
  const moveIgnisToScene = useCallback((targetScene: SceneId, gotoFurnitureId: string | null) => {
    const ignisAt = ignisSceneRef.current;
    if (ignisAt === targetScene || sceneTransitionPhase.current !== 'idle') return;

    pendingGotoAfterTransition.current = gotoFurnitureId;
    cameFromScene.current = ignisAt;

    // Resolve multi-hop (garden↔bedroom goes through room)
    const nextHop = getNextHop(ignisAt, targetScene);
    pendingFinalScene.current = nextHop !== targetScene ? targetScene : null;
    pendingNextHop.current = nextHop;

    // Walk to the exit door in Ignis's current scene
    const exitDoor = EXIT_DOORS[ignisAt]?.[nextHop];
    if (!exitDoor) return;
    sceneTransitionPhase.current = 'walking-to-door';
    isTaskActiveRef.current = true;
    clearIdleTimer();
    targetRef.current = { ...ignisSpotOrFallback(exitDoor) };
    pathRef.current = [];
    lastTargetRef.current = { x: -1, y: -1 };
  }, [ignisSpotOrFallback]);

  // After Ignis arrives in a new scene, set his position and target using his own scene data
  const resolveIgnisArrival = useCallback(() => {
    const arrivedScene = ignisSceneRef.current;
    const finalDest = pendingFinalScene.current;
    const gotoId = pendingGotoAfterTransition.current;

    // Multi-hop: start walking to next door immediately
    if (finalDest && finalDest !== arrivedScene) {
      // moveIgnisToScene will be called after scene data loads
      setTimeout(() => {
        sceneTransitionPhase.current = 'idle'; // allow re-entry
        moveIgnisToScene(finalDest, gotoId);
      }, 500);
      // Set position at entry door of this intermediate scene
      const entrySpot = ignisSpot(getEntryDoor(arrivedScene, cameFromScene.current));
      posRef.current = entrySpot ? { ...entrySpot } : { x: 88, y: 100 };
      pathRef.current = [];
      lastTargetRef.current = { x: -1, y: -1 };
      return;
    }
    pendingFinalScene.current = null;
    pendingGotoAfterTransition.current = null;

    // Position at entry door based on where Ignis came from
    const entrySpot = ignisSpot(getEntryDoor(arrivedScene, cameFromScene.current));
    posRef.current = entrySpot ? { ...entrySpot } : { x: 88, y: 100 };
    pathRef.current = [];
    lastTargetRef.current = { x: -1, y: -1 };

    if (gotoId) {
      // Walk to the requested furniture
      const targetSpot = ignisSpot(gotoId);
      if (targetSpot) {
        targetRef.current = { ...targetSpot };
        isTaskActiveRef.current = true;
        gotoTimerRef.current = setTimeout(() => {
          isTaskActiveRef.current = false;
          useChatStore.setState({ gotoFurniture: null });
          const block = getActiveSchedule(ignisPlacedIds());
          targetRef.current = { ...ignisSpotOrFallback(block.primary) };
          pathRef.current = [];
          lastTargetRef.current = { x: -1, y: -1 };
        }, randomInRange(2 * 60_000, 5 * 60_000));
      } else {
        isTaskActiveRef.current = false;
      }
    } else {
      // Resume idle schedule
      isTaskActiveRef.current = false;
      const block = getActiveSchedule(ignisPlacedIds());
      targetRef.current = { ...ignisSpotOrFallback(block.primary) };
      idleTimerRef.current = setTimeout(scheduleNextIdle, randomInRange(3_000, 10_000));
    }
  }, [moveIgnisToScene, ignisSpot, ignisSpotOrFallback, ignisPlacedIds, getActiveSchedule, scheduleNextIdle]);

  // Check global schedule every 60s — Ignis decides which scene to be in
  useEffect(() => {
    if (mode !== 'live') return;
    const checkGlobalSchedule = () => {
      const desiredScene = getGlobalSceneForHour();
      const ignisAt = ignisSceneRef.current;
      if (isTaskActiveRef.current || sceneTransitionPhase.current !== 'idle') return;
      if (desiredScene !== ignisAt) {
        moveIgnisToScene(desiredScene, null);
      }
    };
    const interval = setInterval(checkGlobalSchedule, 60_000);
    const mountCheck = setTimeout(checkGlobalSchedule, 3000);
    return () => { clearInterval(interval); clearTimeout(mountCheck); };
  }, [mode, moveIgnisToScene]);

  // Sync user's viewed scene: load layout when user navigates
  useEffect(() => {
    if (activeScene === activeSceneRef.current) return;
    activeSceneRef.current = activeScene;
    switchSceneLayout(activeScene);
  }, [activeScene, switchSceneLayout]);

  // Keep ignisSceneRef and scene data in sync
  useEffect(() => {
    ignisSceneRef.current = ignisScene;
    ignisSceneData.current = buildIgnisSceneData(ignisScene);
    pathRef.current = [];
    lastTargetRef.current = { x: -1, y: -1 };
  }, [ignisScene]);

  // Save position on page unload (per-scene)
  useEffect(() => {
    const save = () => {
      const p = posRef.current;
      const key = `ignis_pos_${activeSceneRef.current}`;
      localStorage.setItem(key, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }));
    };
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, []);

  // Fetch weather on mount, then sync to :00 and :30 each hour
  useEffect(() => {
    if (!userId) return;
    fetchEnvironment(userId);

    // Calculate ms until next :00 or :30
    const scheduleNext = () => {
      const now = new Date();
      const min = now.getMinutes();
      const nextMark = min < 30 ? 30 : 60;
      const msUntil = ((nextMark - min) * 60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      return setTimeout(() => {
        fetchEnvironment(userId);
        // After first sync, repeat every 30 min
        intervalRef = setInterval(() => fetchEnvironment(userId), 30 * 60 * 1000);
      }, msUntil);
    };

    let intervalRef: ReturnType<typeof setInterval> | null = null;
    const timeoutId = scheduleNext();

    return () => {
      clearTimeout(timeoutId);
      if (intervalRef) clearInterval(intervalRef);
    };
  }, [userId, fetchEnvironment]);

  const bgRef = useRef<HTMLCanvasElement>(null);   // hi-res background layer (garden)
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Ignis position + movement — restore from localStorage (based on Ignis's scene)
  const savedPos = (() => {
    try {
      const key = `ignis_pos_${ignisScene}`;
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as { x: number; y: number };
      // Fall back to old key for room backward compat
      if (ignisScene === 'room') {
        const oldRaw = localStorage.getItem('ignis_pos');
        if (oldRaw) return JSON.parse(oldRaw) as { x: number; y: number };
      }
    } catch {}
    if (ignisScene === 'garden') return { x: 88, y: 136 };
    if (ignisScene === 'bedroom') return { x: 88, y: FLOOR_Y + 40 };
    return { x: 90, y: FLOOR_Y + 40 };
  })();
  const posRef = useRef(savedPos);
  const targetRef = useRef({ ...savedPos });
  const pathRef = useRef<Point[]>([]);
  const lastTargetRef = useRef({ x: -1, y: -1 });
  const saveCounterRef = useRef(0);

  // Ghost drag position for spot-edit mode (pixel coords in internal resolution)
  const ghostDragRef = useRef<{ x: number; y: number } | null>(null);

  // ── Autonomous scene transition state ──
  const sceneTransitionPhase = useRef<'idle' | 'walking-to-door' | 'waiting-fade'>('idle');
  const pendingNextHop = useRef<SceneId | null>(null);           // immediate next scene to go to
  const pendingFinalScene = useRef<SceneId | null>(null);       // final destination for multi-hop
  const pendingGotoAfterTransition = useRef<string | null>(null); // furniture to walk to after arriving
  const cameFromScene = useRef<SceneId>('room');                  // which scene Ignis just left



  // Checkin countdown tracking — restore from persisted state
  const checkinStartRef = useRef<number | null>(
    nextCheckinSeconds ? Date.now() : null
  );
  const checkinDurationRef = useRef<number>(nextCheckinSeconds ?? 0);
  const settingTimerRef = useRef(false);

  // When a new checkin is scheduled, Ignis walks to the clock to "set" it
  useEffect(() => {
    if (nextCheckinSeconds && nextCheckinSeconds > 0) {
      checkinStartRef.current = Date.now();
      checkinDurationRef.current = nextCheckinSeconds;

      if (!isTaskActiveRef.current) {
        // Pause idle behavior
        settingTimerRef.current = true;
        clearIdleTimer();
        targetRef.current = { ...ignisSpotOrFallback('clock_table') };

        // Stay at clock for 5 seconds, then resume idle
        const resumeTimer = setTimeout(() => {
          settingTimerRef.current = false;
          if (!isTaskActiveRef.current) {
            const block = getActiveSchedule(ignisPlacedIds());
            targetRef.current = { ...ignisSpotOrFallback(block.primary) };
            idleTimerRef.current = setTimeout(scheduleNextIdle, randomInRange(5 * 60000, 10 * 60000));
          }
        }, 5000);

        return () => clearTimeout(resumeTimer);
      }
    } else {
      checkinStartRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCheckinSeconds]);

  // Handle goto furniture commands from chat (including cross-scene)
  useEffect(() => {
    if (!gotoFurniture) return;

    const furnitureDef = FURNITURE_DEFS[gotoFurniture];
    const furnitureScene: SceneId = (furnitureDef?.scene as SceneId) ?? 'room';
    const ignisAt = ignisSceneRef.current;

    if (furnitureScene === ignisAt && ignisAt === activeSceneRef.current) {
      // Furniture is in Ignis's scene AND user is viewing it — walk directly
      const targetSpot = getSpot(gotoFurniture);
      if (!targetSpot) return;
      isTaskActiveRef.current = true;
      clearIdleTimer();
      if (gotoTimerRef.current) clearTimeout(gotoTimerRef.current);
      targetRef.current = { ...targetSpot };
      pathRef.current = [];
      lastTargetRef.current = { x: -1, y: -1 };

      gotoTimerRef.current = setTimeout(() => {
        isTaskActiveRef.current = false;
        useChatStore.setState({ gotoFurniture: null });
        const block = getActiveSchedule(ignisPlacedIds());
        targetRef.current = { ...ignisSpotOrFallback(block.primary) };
        pathRef.current = [];
        lastTargetRef.current = { x: -1, y: -1 };
      }, randomInRange(2 * 60_000, 5 * 60_000));
    } else {
      // Different scene — cross-scene move
      moveIgnisToScene(furnitureScene, gotoFurniture);
    }

    return () => {
      if (gotoTimerRef.current) clearTimeout(gotoTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotoFurniture, moveIgnisToScene]);

  // When role becomes active, override idle — BUT not if a goto command is active
  useEffect(() => {
    // Don't override an active goto command or timer-setting
    if (gotoFurniture || settingTimerRef.current) return;

    if (role !== null) {
      isTaskActiveRef.current = true;
      clearIdleTimer();
      const furniture = getFurnitureForRole(role, ignisPlacedIds());
      targetRef.current = { ...ignisSpotOrFallback(furniture) };
      currentActivityRef.current = role;
    } else {
      isTaskActiveRef.current = false;
      clearIdleTimer();
      const block = getActiveSchedule(ignisPlacedIds());
      atPrimaryRef.current = true;
      targetRef.current = { ...ignisSpotOrFallback(block.primary) };
      currentActivityRef.current = block.label;
      idleTimerRef.current = setTimeout(scheduleNextIdle, randomInRange(5 * 60000, 10 * 60000));
    }
    return clearIdleTimer;
  }, [role, scheduleNextIdle, spotsLoaded]);

  // Start schedule on mount + re-target when spots load or returning from edit modes
  useEffect(() => {
    if (!spotsLoaded || mode !== 'live') return;
    clearIdleTimer();
    // Always re-target — furniture or spots may have moved
    if (role !== null) {
      const furniture = getFurnitureForRole(role, ignisPlacedIds());
      targetRef.current = { ...ignisSpotOrFallback(furniture) };
    } else if (gotoFurniture) {
      targetRef.current = { ...ignisSpotOrFallback(gotoFurniture) };
    } else {
      isTaskActiveRef.current = false;
      const block = getActiveSchedule(ignisPlacedIds());
      targetRef.current = { ...ignisSpotOrFallback(block.primary) };
      currentActivityRef.current = block.label;
      idleTimerRef.current = setTimeout(scheduleNextIdle, randomInRange(5 * 60000, 15 * 60000));
    }
    return clearIdleTimer;
  }, [scheduleNextIdle, spotsLoaded, mode]);

  const loop = useCallback((ts: number) => {
    const scene = sceneRef.current;
    const glow = glowRef.current;
    const bg = bgRef.current;
    if (!scene || !glow) return;
    const ctx = scene.getContext('2d')!;
    const gctx = glow.getContext('2d')!;
    const bgCtx = bg?.getContext('2d');

    // Ignis always moves using his own grid (independent of user's viewed scene)
    const pos = posRef.current;
    const tgt = targetRef.current;
    let dist = 0;
    const ignisHere = ignisSceneRef.current === activeSceneRef.current;
    const ignisGrid = ignisSceneData.current.grid;

    // Recompute path if target changed
    if (tgt.x !== lastTargetRef.current.x || tgt.y !== lastTargetRef.current.y) {
      lastTargetRef.current = { ...tgt };
      pathRef.current = findPath(ignisGrid, pos, tgt);
    }

    // Follow path waypoints
    if (pathRef.current.length > 0) {
      const wp = pathRef.current[0];
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      dist = Math.sqrt(dx*dx + dy*dy);
      const speed = 30;
      if (dist > 1) {
        const step = Math.min(speed / 60, dist);
        pos.x += (dx / dist) * step;
        pos.y += (dy / dist) * step;
      } else {
        pos.x = wp.x;
        pos.y = wp.y;
        pathRef.current.shift();
      }
    }

    // ── Ignis arrived at exit door — move him to next scene ──
    if (sceneTransitionPhase.current === 'walking-to-door' && pathRef.current.length === 0 && dist <= 1) {
      const nextHop = pendingNextHop.current;
      pendingNextHop.current = null;
      sceneTransitionPhase.current = 'idle';

      if (nextHop && nextHop !== ignisSceneRef.current) {
        // Save position in old scene
        localStorage.setItem(`ignis_pos_${ignisSceneRef.current}`, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }));
        // Move Ignis to the new scene (updates ref, store, and rebuilds scene data)
        ignisSceneRef.current = nextHop;
        setIgnisScene(nextHop);
        ignisSceneData.current = buildIgnisSceneData(nextHop);
        // Resolve: position at entry door, set target
        resolveIgnisArrival();
      } else {
        isTaskActiveRef.current = false;
      }
    }

    // Save position + track nearest furniture every ~1 second
    saveCounterRef.current++;
    if (saveCounterRef.current >= 60) {
      saveCounterRef.current = 0;
      localStorage.setItem(`ignis_pos_${ignisSceneRef.current}`, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }));

      // Find which furniture Ignis is closest to
      let nearestId: string | null = null;
      let nearestDist = Infinity;
      for (const placed of layout.furniture) {
        const sp = getSpot(placed.id);
        if (!sp) continue;
        const d = Math.sqrt((pos.x - sp.x) ** 2 + (pos.y - sp.y) ** 2);
        if (d < nearestDist) {
          nearestDist = d;
          nearestId = placed.id;
        }
      }
      // Only count as "at" furniture if within ~20px (about 2.5 tiles)
      const loc = nearestDist < 20 ? nearestId : null;
      if (loc !== useChatStore.getState().currentLocation) {
        useChatStore.setState({ currentLocation: loc });
      }
    }

    const isMoving = dist > 1;
    // Check if Ignis is sleeping (schedule-based)
    const currentHour = new Date().getHours();
    const scheduleNow = getScheduleBlockForHour(ignisPlacedIds());
    const isSleeping = !isMoving && scheduleNow.label === 'sleeping';

    // Walking: faster frame flip + bouncier bob. Idle: slow gentle float. Sleeping: slow breathing.
    const fr = isMoving ? Math.floor(ts / 200) % 2 : Math.floor(ts / 600) % 2;
    const bob = isSleeping ? Math.sin(ts * 0.002) * 0.3 : isMoving ? Math.sin(ts * 0.015) * 1.0 : Math.sin(ts * 0.003) * 0.4;
    const emotionColor = EMOTION_COLORS[emotion];

    // ── Draw scene ──
    ctx.clearRect(0, 0, W, H);
    const sky = getSkyFromWeather(weather);
    const currentSceneId = activeSceneRef.current;
    const isGarden = currentSceneId === 'garden';
    const isBedroom = currentSceneId === 'bedroom';

    // Hi-res background on separate canvas
    if (bgCtx) {
      bgCtx.clearRect(0, 0, W * SCALE, H * SCALE);
    }

    if (isGarden) {
      loadSceneBg('garden', '/garden-bg.png');
      if (bgCtx) drawSceneBgHiRes(bgCtx, 'garden');
      ctx.clearRect(0, 0, W, H);
    } else if (isBedroom) {
      drawBedroomFloor(ctx);
      drawBedroomWalls(ctx);
    } else {
      loadSceneBg('room', '/room-bg.png');
      if (bgCtx && sceneBgImages['room']) {
        drawSceneBgHiRes(bgCtx, 'room');
        ctx.clearRect(0, 0, W, H);
      } else {
        drawFloor(ctx);
        drawWalls(ctx);
        drawWindow(ctx, ts, sky);
      }
    }
    // Update clock table checkin state
    const checkinRemaining = checkinStartRef.current
      ? Math.max(0, checkinDurationRef.current - (Date.now() - checkinStartRef.current) / 1000)
      : null;
    setCheckinRemaining(checkinRemaining);

    // Draw all placed furniture via registry (sorted by bottom edge for z-order)
    const sorted = [...layout.furniture].sort((a, b) => {
      const aDef = FURNITURE_DEFS[a.id];
      const bDef = FURNITURE_DEFS[b.id];
      const aH = aDef ? getRotatedDims(aDef, a.rot ?? 0).gridH : 0;
      const bH = bDef ? getRotatedDims(bDef, b.rot ?? 0).gridH : 0;
      return (a.gy + aH) - (b.gy + bH);
    });
    for (const placed of sorted) {
      const def = FURNITURE_DEFS[placed.id];
      if (!def) continue;
      const p = getPixelPos(placed);
      const rot = placed.rot ?? 0;

      // Hi-res image sprites: draw on bg canvas at display resolution
      if (def.hiResSprites && bgCtx) {
        const spriteSrc = def.hiResSprites[rot] || def.hiResSprites[0];
        if (spriteSrc) {
          const img = getHiResSprite(spriteSrc);
          if (img) {
            const assetSizes = getAssetSizes();
            const saved = assetSizes[def.id];
            const dims = getRotatedDims(def, rot);
            const gridW = dims.gridW * TILE * SCALE;
            const gridH = dims.gridH * TILE * SCALE;
            const gridX = p.x * SCALE;
            const gridY = p.y * SCALE;

            let dw: number, dh: number, dx: number, dy: number;
            if (saved) {
              // Use saved size and offset from asset sizer tool
              dw = saved.widthPx;
              dh = saved.heightPx;
              dx = gridX + saved.offsetX;
              dy = gridY + saved.offsetY;
            } else {
              // Default: fill grid width, maintain aspect, anchor to bottom
              const aspect = img.naturalHeight / img.naturalWidth;
              dw = gridW;
              dh = gridW * aspect;
              dx = gridX;
              dy = gridY + gridH - dh;
            }
            bgCtx.imageSmoothingEnabled = true;
            bgCtx.imageSmoothingQuality = 'high';
            bgCtx.drawImage(img, dx, dy, dw, dh);
            continue;
          }
        }
      }

      // Fallback: procedural draw on scene canvas
      const drawFn = registry.getDraw(def.drawKey);
      if (drawFn) drawRotated(ctx, drawFn, p.x, p.y, ts, def, rot);
    }

    // Edit mode: zone tints + grid overlay + drag ghost
    if (mode === 'edit') {
      // Zone tints so user can see ceiling / wall / floor areas
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#80c0ff'; // ceiling: blue tint
      ctx.fillRect(0, 0, W, CEILING_ROWS * TILE);
      ctx.fillStyle = '#c0ff80'; // wall: green tint
      ctx.fillRect(0, CEILING_ROWS * TILE, W, (WALL_ROWS - CEILING_ROWS) * TILE);
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.3;
      for (let gx = 0; gx <= GRID_W; gx++) {
        ctx.beginPath(); ctx.moveTo(gx*TILE, 0); ctx.lineTo(gx*TILE, H); ctx.stroke();
      }
      for (let gy = 0; gy <= GRID_H; gy++) {
        ctx.beginPath(); ctx.moveTo(0, gy*TILE); ctx.lineTo(W, gy*TILE); ctx.stroke();
      }
      // Highlight furniture tiles + ghost Ignis at spots
      for (const placed of layout.furniture) {
        const def = FURNITURE_DEFS[placed.id];
        if (!def) continue;
        const isBeingDragged = placed.id === dragging;
        const dims = getRotatedDims(def, placed.rot ?? 0);

        // Original position highlight
        ctx.fillStyle = isBeingDragged ? '#F5D03B' : '#4A90D9';
        ctx.globalAlpha = isBeingDragged ? 0.1 : 0.2;
        ctx.fillRect(placed.gx*TILE, placed.gy*TILE, dims.gridW*TILE, dims.gridH*TILE);
        ctx.globalAlpha = isBeingDragged ? 0.25 : 0.5;
        ctx.strokeStyle = isBeingDragged ? '#F5D03B' : '#4A90D9';
        ctx.setLineDash(isBeingDragged ? [2, 2] : []);
        ctx.strokeRect(placed.gx*TILE+0.5, placed.gy*TILE+0.5, dims.gridW*TILE-1, dims.gridH*TILE-1);
        ctx.setLineDash([]);

        // Ghost preview at drag position
        if (isBeingDragged && furnitureDragRef.current) {
          const dg = furnitureDragRef.current;
          const dragDims = getRotatedDims(def, draggingRot);
          const valid = isValidPlacement(layout, placed.id, dg.gx, dg.gy, draggingRot, placed.id);
          ctx.fillStyle = valid ? '#F5D03B' : '#D94F3D';
          ctx.globalAlpha = 0.3;
          ctx.fillRect(dg.gx*TILE, dg.gy*TILE, dragDims.gridW*TILE, dragDims.gridH*TILE);
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = valid ? '#F5D03B' : '#D94F3D';
          ctx.strokeRect(dg.gx*TILE+0.5, dg.gy*TILE+0.5, dragDims.gridW*TILE-1, dragDims.gridH*TILE-1);
          // Rotated furniture preview
          const drawFn = registry.getDraw(def.drawKey);
          if (drawFn) {
            ctx.globalAlpha = 0.4;
            drawRotated(ctx, drawFn, dg.gx*TILE, dg.gy*TILE, ts, def, draggingRot);
          }
          // Label
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = valid ? '#F5D03B' : '#D94F3D';
          ctx.font = '3px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(def.label.toUpperCase(), dg.gx*TILE + (dragDims.gridW*TILE)/2, dg.gy*TILE - 2);
        }

        // Ghost Ignis at current interaction spot (when not dragging)
        if (!isBeingDragged) {
          const sp = getSpot(placed.id);
          if (sp) {
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = '#1a0808';
            ctx.fillRect(Math.round(sp.x)-1, Math.round(sp.y)+7, 10, 2);
            ctx.globalAlpha = 0.35;
            drawSprite(ctx, IGNIS_FRAMES[0], sp.x, sp.y, emotionColor);
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#fff';
            ctx.font = '3px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(def.label.toUpperCase(), sp.x + 4, sp.y - 2);
          }
        }
      }

      ctx.globalAlpha = 1;

      // Placement ghost from inventory
      if (placing && placementCursorRef.current) {
        const def = FURNITURE_DEFS[placing];
        if (def) {
          const pc = placementCursorRef.current;
          const placeDims = getRotatedDims(def, placingRot);
          const valid = isValidPlacement(layout, placing, pc.gx, pc.gy, placingRot);
          ctx.fillStyle = valid ? '#06B6D4' : '#D94F3D';
          ctx.globalAlpha = 0.3;
          ctx.fillRect(pc.gx*TILE, pc.gy*TILE, placeDims.gridW*TILE, placeDims.gridH*TILE);
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = valid ? '#06B6D4' : '#D94F3D';
          ctx.strokeRect(pc.gx*TILE+0.5, pc.gy*TILE+0.5, placeDims.gridW*TILE-1, placeDims.gridH*TILE-1);
          const drawFn = registry.getDraw(def.drawKey);
          if (drawFn) {
            ctx.globalAlpha = 0.5;
            drawRotated(ctx, drawFn, pc.gx*TILE, pc.gy*TILE, ts, def, placingRot);
          }
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = valid ? '#06B6D4' : '#D94F3D';
          ctx.font = '3px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(def.label.toUpperCase() + (placingRot ? ` R${placingRot}` : ''), pc.gx*TILE + (placeDims.gridW*TILE)/2, pc.gy*TILE - 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Spot-edit mode: draw ghost Ignis at each furniture spot
    if (mode === 'spot-edit') {
      // Grid overlay
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.3;
      for (let gxi = 0; gxi <= GRID_W; gxi++) {
        ctx.beginPath(); ctx.moveTo(gxi*TILE, 0); ctx.lineTo(gxi*TILE, H); ctx.stroke();
      }
      for (let gyi = 0; gyi <= GRID_H; gyi++) {
        ctx.beginPath(); ctx.moveTo(0, gyi*TILE); ctx.lineTo(W, gyi*TILE); ctx.stroke();
      }

      for (const placed of layout.furniture) {
        const def = FURNITURE_DEFS[placed.id];
        if (!def) continue;

        // Highlight furniture bounds
        ctx.fillStyle = '#4A90D9';
        ctx.globalAlpha = 0.12;
        ctx.fillRect(placed.gx*TILE, placed.gy*TILE, def.gridW*TILE, def.gridH*TILE);
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#4A90D9';
        ctx.strokeRect(placed.gx*TILE+0.5, placed.gy*TILE+0.5, def.gridW*TILE-1, def.gridH*TILE-1);

        // Draw ghost Ignis at spot position
        const sp = getSpot(placed.id);
        if (!sp) continue;

        const isBeingDragged = draggingSpot === placed.id;
        const ghostX = isBeingDragged && ghostDragRef.current ? ghostDragRef.current.x : sp.x;
        const ghostY = isBeingDragged && ghostDragRef.current ? ghostDragRef.current.y : sp.y;

        // Ghost shadow
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#1a0808';
        ctx.fillRect(Math.round(ghostX)-1, Math.round(ghostY)+7, 10, 2);

        // Ghost Ignis (semi-transparent)
        ctx.globalAlpha = isBeingDragged ? 0.9 : 0.5;
        drawSprite(ctx, IGNIS_FRAMES[0], ghostX, ghostY, isBeingDragged ? '#F5D03B' : emotionColor);
        ctx.globalAlpha = 1;

        // Furniture label above ghost
        ctx.globalAlpha = isBeingDragged ? 1 : 0.7;
        ctx.fillStyle = isBeingDragged ? '#F5D03B' : '#fff';
        ctx.font = '3px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(def.label.toUpperCase(), ghostX + 4, ghostY - 2);
        ctx.globalAlpha = 1;

        // Connector line from furniture center to spot
        const furCenterX = placed.gx * TILE + (def.gridW * TILE) / 2;
        const furCenterY = placed.gy * TILE + (def.gridH * TILE) / 2;
        ctx.strokeStyle = isBeingDragged ? '#F5D03B' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([1, 1]);
        ctx.beginPath();
        ctx.moveTo(furCenterX, furCenterY);
        ctx.lineTo(ghostX + 4, ghostY + 4);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }

    // Garden outdoor rain (full canvas)
    if (isGarden && sky.rain) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#8899bb';
      for (let i = 0; i < 40; i++) {
        const rx = ((i * 23 + Math.floor(ts / 50)) % W);
        const ry = ((i * 17 + Math.floor(ts / 40)) % H);
        ctx.fillRect(rx, ry, 1, 1);
        ctx.fillRect(rx, ry + 1, 1, 1);
        ctx.fillRect(rx, ry + 2, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    // Shadow + Ignis (only when Ignis is in this scene, hidden in spot-edit mode)
    const ignisVisible = ignisSceneRef.current === activeSceneRef.current;
    if (mode !== 'spot-edit' && ignisVisible) {
      ctx.globalAlpha = 0.2; ctx.fillStyle = '#1a0808';
      ctx.fillRect(Math.round(pos.x)-1, Math.round(pos.y)+7, 10, 2);
      ctx.globalAlpha = 1;
      const spriteFrames = isSleeping ? IGNIS_SLEEP_FRAMES : IGNIS_FRAMES;
      drawSprite(ctx, spriteFrames[fr], pos.x, pos.y + bob, emotionColor);
      if (isSleeping) {
        drawSleepZs(ctx, pos.x, pos.y + bob, ts);
      }
    }

    // ── Glow layer ──
    gctx.clearRect(0, 0, W*SCALE, H*SCALE);
    const pulse = 0.5 + 0.28 * Math.sin(ts * 0.0017);
    const [r,g,b] = h2r(emotionColor);
    const glowSky = getSkyFromWeather(weather);

    // Window light / outdoor ambient light
    const isDay = !glowSky.stars;
    if (isGarden) {
      // Outdoor: moonlight across whole scene at night
      if (!isDay) {
        gctx.fillStyle = 'rgba(80,100,180,0.06)';
        gctx.fillRect(0, 0, W*SCALE, H*SCALE);
      }
    } else if (isBedroom) {
      // Bedroom: softer ambient — nightstand lamp handles most glow via registry
      if (!isDay) {
        gctx.fillStyle = 'rgba(60,50,80,0.04)';
        gctx.fillRect(0, 0, W*SCALE, H*SCALE);
      }
    } else {
      // Room: window light cast on floor
      const winCenterX = 96 * SCALE, winFloorY = (FLOOR_Y + 20) * SCALE;
      if (isDay) {
        let wl = gctx.createRadialGradient(winCenterX, winFloorY, 0, winCenterX, winFloorY, 80);
        wl.addColorStop(0, glowSky.sunsetGlow ? 'rgba(255,160,60,0.15)' : 'rgba(200,220,255,0.12)');
        wl.addColorStop(1, 'rgba(200,220,255,0)');
        gctx.fillStyle = wl; gctx.fillRect(winCenterX-80, winFloorY-40, 160, 120);
      }
    }

    // Furniture glow effects via registry
    const isNight = glowSky.stars;
    for (const placed of layout.furniture) {
      const def = FURNITURE_DEFS[placed.id];
      if (!def) continue;
      const glowFn = registry.getGlow(def.drawKey);
      if (glowFn) {
        const p = getPixelPos(placed);
        glowRotated(gctx, glowFn, p.x, p.y, ts, SCALE, isNight, def, placed.rot ?? 0);
      }
    }

    // Ignis glow (only when visible)
    if (ignisVisible) {
      const igx = Math.round(pos.x+4)*SCALE, igy = Math.round(pos.y+4)*SCALE;
      let ig = gctx.createRadialGradient(igx,igy,0,igx,igy,45);
      ig.addColorStop(0,`rgba(${r},${g},${b},${0.4*pulse})`);
      ig.addColorStop(0.5,`rgba(${r},${g},${b},${0.12*pulse})`);
      ig.addColorStop(1,`rgba(${r},${g},${b},0)`);
      gctx.fillStyle=ig;gctx.fillRect(igx-45,igy-45,90,90);
    }

    animRef.current = requestAnimationFrame(loop);
  }, [emotion, role, weather, layout, grid, mode, dragging, draggingRot, draggingSpot, placing, placingRot, getSpot]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [loop]);

  // Convert mouse event to internal pixel coords
  // Accounts for CSS transform scale applied by the parent container
  const mouseToPixel = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // rect reflects the visual (post-transform) size; the canvas CSS size is W*SCALE x H*SCALE.
    // Compute the ratio so mouse coords map correctly even when a parent scales the element.
    const scaleX = (W * SCALE) / rect.width;
    const scaleY = (H * SCALE) / rect.height;
    const cssX = (e.clientX - rect.left) * scaleX;
    const cssY = (e.clientY - rect.top) * scaleY;
    return {
      px: cssX / SCALE,
      py: cssY / SCALE,
      gx: Math.floor(cssX / (TILE * SCALE)),
      gy: Math.floor(cssY / (TILE * SCALE)),
    };
  }, []);

  // Refs to track drag IDs so mouse handlers always see current value
  const draggingRef = useRef<string | null>(null);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  const draggingSpotRef = useRef<string | null>(null);
  useEffect(() => { draggingSpotRef.current = draggingSpot; }, [draggingSpot]);

  // Ghost position for furniture drag (grid coords)
  const furnitureDragRef = useRef<{ gx: number; gy: number } | null>(null);

  // Placement cursor for inventory items
  const placementCursorRef = useRef<{ gx: number; gy: number } | null>(null);
  const placingRef = useRef<string | null>(null);
  useEffect(() => { placingRef.current = placing; }, [placing]);
  const placingRotRef = useRef<FurnitureRotation>(0);
  useEffect(() => { placingRotRef.current = placingRot; }, [placingRot]);
  const draggingRotRef = useRef<FurnitureRotation>(0);
  useEffect(() => { draggingRotRef.current = draggingRot; }, [draggingRot]);

  // Unified mouse down — handles edit, spot-edit, live door clicks, and inventory placement
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py, gx, gy } = mouseToPixel(e);

    // Live mode: click on doors to switch scenes
    if (mode === 'live') {
      const DOOR_TARGETS: Record<string, SceneId> = {
        front_door: 'garden',
        garden_gate: 'room',
        hallway_door: 'bedroom',
        bedroom_door: 'room',
      };
      for (const placed of layout.furniture) {
        const target = DOOR_TARGETS[placed.id];
        if (!target) continue;
        const def = FURNITURE_DEFS[placed.id];
        if (!def) continue;
        const dims = getRotatedDims(def, placed.rot ?? 0);
        if (gx >= placed.gx && gx < placed.gx + dims.gridW && gy >= placed.gy && gy < placed.gy + dims.gridH) {
          switchScene(target);
          e.preventDefault();
          return;
        }
      }
    }

    if (mode === 'edit') {
      // Placing from inventory
      if (placingRef.current && placementCursorRef.current) {
        const { gx: pgx, gy: pgy } = placementCursorRef.current;
        addToRoom(placingRef.current, pgx, pgy);
        placementCursorRef.current = null;
        e.preventDefault();
        return;
      }

      // Right-click to remove furniture
      if (e.button === 2) {
        for (const placed of layout.furniture) {
          const def = FURNITURE_DEFS[placed.id];
          if (!def) continue;
          const dims = getRotatedDims(def, placed.rot ?? 0);
          if (gx >= placed.gx && gx < placed.gx + dims.gridW && gy >= placed.gy && gy < placed.gy + dims.gridH) {
            removeFromRoom(placed.id);
            e.preventDefault();
            return;
          }
        }
      }

      // Drag existing furniture
      for (const placed of layout.furniture) {
        const def = FURNITURE_DEFS[placed.id];
        if (!def) continue;
        const dims = getRotatedDims(def, placed.rot ?? 0);
        if (gx >= placed.gx && gx < placed.gx + dims.gridW && gy >= placed.gy && gy < placed.gy + dims.gridH) {
          startDrag(placed.id);
          furnitureDragRef.current = { gx: placed.gx, gy: placed.gy };
          e.preventDefault();
          return;
        }
      }
    }

    if (mode === 'spot-edit') {
      let closest: { id: string; dist: number } | null = null;
      for (const placed of layout.furniture) {
        const sp = getSpot(placed.id);
        if (!sp) continue;
        const dx = px - (sp.x + 4);
        const dy = py - (sp.y + 4);
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 12 && (!closest || dist < closest.dist)) {
          closest = { id: placed.id, dist };
        }
      }
      if (closest) {
        const sp = getSpot(closest.id)!;
        startSpotDrag(closest.id);
        ghostDragRef.current = { x: sp.x, y: sp.y };
        e.preventDefault();
      }
    }
  }, [mode, layout, getSpot, startDrag, startSpotDrag, addToRoom, removeFromRoom, mouseToPixel, switchScene]);

  // Unified mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py, gx, gy } = mouseToPixel(e);

    if (mode === 'edit') {
      if (draggingRef.current) {
        const def = FURNITURE_DEFS[draggingRef.current];
        if (def) {
          const { gridW, gridH } = getRotatedDims(def, draggingRotRef.current);
          furnitureDragRef.current = {
            gx: Math.max(0, Math.min(GRID_W - gridW, gx - Math.floor(gridW / 2))),
            gy: Math.max(0, Math.min(GRID_H - gridH, gy - Math.floor(gridH / 2))),
          };
        }
      }
      if (placingRef.current) {
        const def = FURNITURE_DEFS[placingRef.current];
        if (def) {
          const { gridW, gridH } = getRotatedDims(def, placingRotRef.current);
          placementCursorRef.current = {
            gx: Math.max(0, Math.min(GRID_W - gridW, gx - Math.floor(gridW / 2))),
            gy: Math.max(0, Math.min(GRID_H - gridH, gy - Math.floor(gridH / 2))),
          };
        }
      }
    }

    if (mode === 'spot-edit' && draggingSpotRef.current) {
      ghostDragRef.current = { x: px - 4, y: py - 4 };
    }
  }, [mode, mouseToPixel]);

  // Unified mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py } = mouseToPixel(e);

    if (mode === 'edit' && draggingRef.current && furnitureDragRef.current) {
      const { gx, gy } = furnitureDragRef.current;
      moveFurniture(draggingRef.current, gx, gy);
      furnitureDragRef.current = null;
      endDrag();
    }

    if (mode === 'spot-edit' && draggingSpotRef.current) {
      const dragId = draggingSpotRef.current;
      const placed = layout.furniture.find(f => f.id === dragId);
      if (placed) {
        const spotDx = Math.round((px - 4) / TILE - placed.gx);
        const spotDy = Math.round((py - 4) / TILE - placed.gy);
        setSpotEdit(dragId, spotDx, spotDy);
      }
      ghostDragRef.current = null;
      endSpotDrag();
    }
  }, [mode, layout, moveFurniture, endDrag, setSpotEdit, endSpotDrag, mouseToPixel]);

  // R key to cycle rotation while dragging or placing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        if (mode === 'edit') {
          if (placing) cyclePlacingRot();
          else if (dragging) cycleDraggingRot();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, placing, dragging, cyclePlacingRot, cycleDraggingRot]);

  const menuFont = "'Press Start 2P', monospace";

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-0">
      {/* Left-side menu */}
      <div className="flex flex-col gap-1 py-1 pr-2" style={{ fontFamily: menuFont }}>
        <button
          onClick={() => setMode(mode === 'edit' ? 'live' : 'edit')}
          className="px-2 py-1.5 rounded text-[8px] tracking-wider text-left"
          style={{
            background: mode === 'edit' ? '#F5D03B' : 'rgba(255,255,255,0.06)',
            color: mode === 'edit' ? '#1a0e08' : '#a0a0a0',
            border: 'none',
          }}
        >
          {mode === 'edit' ? '✓ EDIT' : 'EDIT'}
        </button>
        <button
          onClick={() => setMode(mode === 'spot-edit' ? 'live' : 'spot-edit')}
          className="px-2 py-1.5 rounded text-[8px] tracking-wider text-left"
          style={{
            background: mode === 'spot-edit' ? '#06B6D4' : 'rgba(255,255,255,0.06)',
            color: mode === 'spot-edit' ? '#1a0e08' : '#a0a0a0',
            border: 'none',
          }}
        >
          {mode === 'spot-edit' ? '✓ SPOTS' : 'SPOTS'}
        </button>
        <div className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
        <a
          href="/dev/editor"
          target="_blank"
          className="px-2 py-1.5 rounded text-[8px] tracking-wider block"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#06B6D4', border: 'none', textDecoration: 'none' }}
        >
          PIXEL
        </a>
        <a
          href="/dev/gallery"
          target="_blank"
          className="px-2 py-1.5 rounded text-[8px] tracking-wider block"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#F59E0B', border: 'none', textDecoration: 'none' }}
        >
          GALLERY
        </a>
        <a
          href="/dev/resize"
          target="_blank"
          className="px-2 py-1.5 rounded text-[8px] tracking-wider block"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#d070d0', border: 'none', textDecoration: 'none' }}
        >
          RESIZE
        </a>
        <a
          href="/dev/zones"
          target="_blank"
          className="px-2 py-1.5 rounded text-[8px] tracking-wider block"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#e06080', border: 'none', textDecoration: 'none' }}
        >
          ZONES
        </a>
        <a
          href="/dev/schedule"
          target="_blank"
          className="px-2 py-1.5 rounded text-[8px] tracking-wider block"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#a0e0a0', border: 'none', textDecoration: 'none' }}
        >
          SCHED
        </a>
      </div>
      {/* Scene canvas */}
      <div className="relative" style={{ width: W*SCALE, height: H*SCALE }}>
        {/* Hi-res background layer — smooth scaling, no pixelation */}
        <canvas
          ref={bgRef}
          width={W*SCALE}
          height={H*SCALE}
          className="absolute pointer-events-none"
          style={{ imageRendering: 'auto' }}
        />
        <canvas
          ref={sceneRef}
          width={W}
          height={H}
          className="absolute"
          onContextMenu={(e) => mode === 'edit' && e.preventDefault()}
          style={{
            width: W*SCALE, height: H*SCALE, imageRendering: 'pixelated',
            cursor: mode === 'edit' ? (dragging ? 'grabbing' : 'grab')
              : mode === 'spot-edit' ? (draggingSpot ? 'grabbing' : 'grab')
              : 'default',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        <canvas
          ref={glowRef}
          width={W*SCALE}
          height={H*SCALE}
          className="absolute pointer-events-none"
        />
        {/* Scene transition fade overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: '#000',
            opacity: transitioning ? 1 : 0,
            transition: 'opacity 300ms ease-in-out',
            zIndex: 20,
          }}
        />
        {/* Status bar overlays */}
        {mode === 'edit' && dragging && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded text-[8px] tracking-wider"
            style={{ fontFamily: menuFont, background: 'rgba(0,0,0,0.7)', color: '#F5D03B' }}>
            DRAGGING {FURNITURE_DEFS[dragging]?.label.toUpperCase()}
          </div>
        )}
        {mode === 'edit' && !dragging && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 items-center">
            <div className="px-3 py-1 rounded text-[8px] tracking-wider"
              style={{ fontFamily: menuFont, background: 'rgba(0,0,0,0.7)', color: '#888' }}>
              DRAG TO MOVE · R TO ROTATE
            </div>
            <button
              onClick={() => setMode('live')}
              className="px-3 py-1 rounded text-[8px] tracking-wider"
              style={{ fontFamily: menuFont, background: '#F5D03B', color: '#1a0e08', border: 'none', cursor: 'pointer' }}>
              DONE
            </button>
          </div>
        )}
        {mode === 'spot-edit' && draggingSpot && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded text-[8px] tracking-wider"
            style={{ fontFamily: menuFont, background: 'rgba(0,0,0,0.7)', color: '#06B6D4' }}>
            DRAG TO SET {FURNITURE_DEFS[draggingSpot]?.label.toUpperCase()} SPOT
          </div>
        )}
        {mode === 'spot-edit' && !draggingSpot && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 items-center">
            <div className="px-3 py-1 rounded text-[8px] tracking-wider"
              style={{ fontFamily: menuFont, background: 'rgba(0,0,0,0.7)', color: '#888' }}>
              DRAG GHOST IGNIS TO REPOSITION
            </div>
            <button
              onClick={() => setMode('live')}
              className="px-3 py-1 rounded text-[8px] tracking-wider"
              style={{ fontFamily: menuFont, background: '#06B6D4', color: '#1a0e08', border: 'none', cursor: 'pointer' }}>
              SAVE &amp; DONE
            </button>
          </div>
        )}
      </div>
      <FurnitureInventory />
      </div>
      <div className="flex gap-5 items-center py-1.5 text-[10px] tracking-widest" style={{ fontFamily: menuFont }}>
        <span style={{ color: EMOTION_COLORS[emotion] }}>● {emotion.toUpperCase()}</span>
        {role && <span style={{ color: ROLE_COLORS[role], opacity: 0.55 }}>▪ {role.toUpperCase()}</span>}
      </div>
    </div>
  );
}
