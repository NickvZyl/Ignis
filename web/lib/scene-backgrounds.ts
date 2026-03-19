// ── Shared scene background renderers ──
// Used by IgnisScene (runtime) and gallery (dev tool)

export const SCENE_W = 192;
export const SCENE_H = 160;
export const SCENE_WALL_H = 62;
export const SCENE_FLOOR_Y = 64;

export interface SkyConfig {
  top: [number, number, number];
  bottom: [number, number, number];
  stars: boolean;
  sun: boolean;
  moon: boolean;
  sunsetGlow: boolean;
  rain: boolean;
  clouds: number;
  wind: number;
}

export function drawRoomFloor(ctx: CanvasRenderingContext2D) {
  // Darker, cooler wood floor — separates from warm wall paneling & furniture
  const plankW = 6;
  for (let y = SCENE_FLOOR_Y; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const plankIdx = Math.floor(x / plankW);
    const plankX = x % plankW;
    const isSeam = plankX === 0;
    const plankSeed = (plankIdx * 37) % 7;
    let r: number, g: number, b: number;
    if (plankSeed < 2) { r = 118; g = 82; b = 56; }
    else if (plankSeed < 4) { r = 108; g = 74; b = 50; }
    else if (plankSeed < 6) { r = 126; g = 88; b = 60; }
    else { r = 102; g = 70; b = 46; }
    const grain = Math.sin(y * 0.8 + plankIdx * 4.3) * 6 + Math.sin(y * 0.3 + plankIdx * 7.1) * 3;
    r += Math.round(grain); g += Math.round(grain * 0.7); b += Math.round(grain * 0.4);
    const knotHash = ((x * 13 + y * 29 + plankIdx * 53) % 197);
    if (knotHash < 2) { r -= 25; g -= 20; b -= 12; }
    const boardY = (y - SCENE_FLOOR_Y + plankIdx * 7) % 18;
    if (boardY === 0) { r -= 12; g -= 10; b -= 6; }
    ctx.fillStyle = isSeam ? '#2e1c0e' : `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

export function drawRoomWalls(ctx: CanvasRenderingContext2D) {
  const CEIL_PX = 32; // ceiling zone: y 0-31 (4 grid rows)
  const PANEL_SPLIT = 46;
  const TRIM_H = 2;

  // ── CEILING: plaster + beams ──
  for (let y = 0; y < CEIL_PX - 4; y++) for (let x = 0; x < SCENE_W; x++) {
    const noise = ((x * 3 + y * 7) % 5) - 2;
    const depth = Math.floor(y * 0.25);
    ctx.fillStyle = `rgb(${200-depth+noise},${194-depth+noise},${185-depth+noise})`;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let y = CEIL_PX - 4; y < CEIL_PX; y++) for (let x = 0; x < SCENE_W; x++) {
    const beamIdx = Math.floor(x / 24); const beamX = x % 24;
    const isCross = beamX >= 22 || beamX < 2;
    const grain = Math.sin(x * 0.5 + beamIdx * 3) * 3;
    if (isCross) ctx.fillStyle = y === CEIL_PX - 4 ? '#3a2210' : '#4a3018';
    else { const b = 52 + Math.round(grain); ctx.fillStyle = `rgb(${b+8},${b-6},${b-22})`; }
    ctx.fillRect(x, y, 1, 1);
  }
  for (let x = 0; x < SCENE_W; x++) { ctx.fillStyle = '#2e1a0c'; ctx.fillRect(x, CEIL_PX, 1, 1); }

  // ── WALL: wallpaper + paneling ──
  const WS = CEIL_PX + 1;
  for (let y = WS; y < PANEL_SPLIT; y++) for (let x = 0; x < SCENE_W; x++) {
    const noise = ((x * 7 + y * 13) % 5) - 2;
    ctx.fillStyle = `rgb(${208+noise},${204+noise},${186+noise})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const flowerSpacing = 14;
  for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < Math.ceil(SCENE_W / flowerSpacing); fx++) {
    const cx = fx * flowerSpacing + (fy % 2) * 7 + 4, cy = WS + 2 + fy * 6;
    if (cy + 3 >= PANEL_SPLIT || cx + 3 >= SCENE_W) continue;
    ctx.fillStyle = '#a0a880'; ctx.fillRect(cx + 1, cy + 2, 1, 2);
    ctx.fillStyle = '#b0a888';
    ctx.fillRect(cx, cy + 1, 1, 1); ctx.fillRect(cx + 2, cy + 1, 1, 1); ctx.fillRect(cx + 1, cy, 1, 1);
    ctx.fillStyle = '#c0b090'; ctx.fillRect(cx + 1, cy + 1, 1, 1);
  }
  for (let x = 0; x < SCENE_W; x++) {
    ctx.fillStyle = '#7a5430'; ctx.fillRect(x, PANEL_SPLIT, 1, 1);
    ctx.fillStyle = '#8a6440'; ctx.fillRect(x, PANEL_SPLIT + 1, 1, 1);
  }
  const panelTop = PANEL_SPLIT + TRIM_H, panelPlankW = 5;
  for (let y = panelTop; y < SCENE_WALL_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const plankIdx = Math.floor(x / panelPlankW); const plankX = x % panelPlankW; const isSeam = plankX === 0;
    const seed = (plankIdx * 31) % 5;
    let r: number, g: number, b: number;
    if (seed < 1) { r = 150; g = 105; b = 62; } else if (seed < 2) { r = 140; g = 96; b = 56; }
    else if (seed < 3) { r = 158; g = 112; b = 68; } else if (seed < 4) { r = 135; g = 92; b = 52; }
    else { r = 145; g = 100; b = 60; }
    const grain = Math.sin(y * 0.6 + plankIdx * 5.7) * 6 + Math.sin(y * 0.2 + plankIdx * 3.1) * 3;
    r += Math.round(grain); g += Math.round(grain * 0.7); b += Math.round(grain * 0.4);
    ctx.fillStyle = isSeam ? '#4a3018' : `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let x = 0; x < SCENE_W; x++) {
    ctx.fillStyle = '#3a2010'; ctx.fillRect(x, SCENE_WALL_H, 1, 1);
    ctx.fillStyle = '#4a2c18'; ctx.fillRect(x, SCENE_WALL_H + 1, 1, 1);
  }
}

// Garden background loaded from static image (used by gallery)
let gardenBgImageShared: HTMLImageElement | null = null;
let gardenBgLoadingShared = false;

function loadGardenBgShared() {
  if (gardenBgImageShared || gardenBgLoadingShared) return;
  gardenBgLoadingShared = true;
  const img = new Image();
  img.src = '/garden-bg.png';
  img.onload = () => { gardenBgImageShared = img; };
}

export function drawGardenGround(ctx: CanvasRenderingContext2D) {
  loadGardenBgShared();
  if (gardenBgImageShared) {
    ctx.drawImage(gardenBgImageShared, 0, 0, SCENE_W, SCENE_H);
  } else {
    for (let y = 0; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) {
      const hash = (x * 7 + y * 13) % 17;
      ctx.fillStyle = hash < 8 ? '#5a8a30' : '#4a7a28';
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function drawGardenSky(ctx: CanvasRenderingContext2D, ts: number, sky: SkyConfig) {
  const skyH = 40;
  for (let y = 0; y < skyH; y++) {
    const t = y / skyH;
    const r = Math.round(sky.top[0] + (sky.bottom[0] - sky.top[0]) * t);
    const g = Math.round(sky.top[1] + (sky.bottom[1] - sky.top[1]) * t);
    const b = Math.round(sky.top[2] + (sky.bottom[2] - sky.top[2]) * t);
    for (let x = 0; x < SCENE_W; x++) { ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(x, y, 1, 1); }
  }
  for (let y = skyH; y < skyH + 6; y++) {
    const blend = (y - skyH) / 6; ctx.globalAlpha = 1 - blend;
    for (let x = 0; x < SCENE_W; x++) {
      ctx.fillStyle = `rgb(${Math.round(sky.bottom[0])},${Math.round(sky.bottom[1])},${Math.round(sky.bottom[2])})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  if (sky.stars) {
    [[12,5],[40,12],[80,4],[120,10],[160,6],[180,15],[30,20],[70,18],[110,8],[150,22],[55,14],[140,3],[25,30],[95,25],[170,28],[60,32],[130,35]].forEach(([sx,sy]) => {
      if (sy >= skyH) return;
      ctx.globalAlpha = 0.3 + 0.7*(Math.sin(ts*0.0015+sx*0.7+sy*1.3)*0.5+0.5);
      ctx.fillStyle = '#e8e8f8'; ctx.fillRect(sx, sy, 1, 1);
    }); ctx.globalAlpha = 1;
  }
  if (sky.moon) {
    const mx = SCENE_W - 28, my = 8;
    [[0,1],[0,2],[1,0],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3],[3,1],[3,2]].forEach(([dx,dy]) => {
      ctx.fillStyle = '#e8d898'; ctx.fillRect(mx+dx, my+dy, 1, 1);
    }); ctx.fillStyle = '#f8eecc'; ctx.fillRect(mx+1, my+1, 1, 1);
  }
  if (sky.sun) {
    const sx = 30, sy = 10;
    [[0,1],[0,2],[1,0],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3],[3,1],[3,2]].forEach(([dx,dy]) => {
      ctx.fillStyle = '#ffe860'; ctx.fillRect(sx+dx, sy+dy, 1, 1);
    }); ctx.fillStyle = '#ffd030';
    [[-1,2],[4,1],[1,-1],[2,4]].forEach(([rx,ry]) => ctx.fillRect(sx+rx, sy+ry, 1, 1));
  }
  if (sky.sunsetGlow) {
    for (let y = skyH - 10; y < skyH; y++) {
      ctx.globalAlpha = 0.3 * ((y - (skyH - 10)) / 10); ctx.fillStyle = '#ff8840';
      for (let x = 0; x < SCENE_W; x++) ctx.fillRect(x, y, 1, 1);
    } ctx.globalAlpha = 1;
  }
}

export function drawGardenFence(ctx: CanvasRenderingContext2D) {
  const fc1 = '#7a5a38', fc2 = '#8a6a48', pc = '#6a4a28', fY = 38;
  for (let x = 0; x < SCENE_W; x++) {
    ctx.fillStyle = fc1; ctx.fillRect(x, fY, 1, 1); ctx.fillRect(x, fY+2, 1, 1);
    ctx.fillStyle = fc2; ctx.fillRect(x, fY+1, 1, 1);
  }
  for (let x = 0; x < SCENE_W; x += 16) {
    for (let dy = -2; dy < 5; dy++) { ctx.fillStyle = pc; ctx.fillRect(x, fY+dy, 2, 1); }
    ctx.fillStyle = pc; ctx.fillRect(x, fY-3, 1, 1);
  }
  for (let y = fY; y < SCENE_H - 16; y++) {
    ctx.fillStyle = fc1; ctx.fillRect(0, y, 1, 1); ctx.fillRect(2, y, 1, 1);
    ctx.fillStyle = fc2; ctx.fillRect(1, y, 1, 1);
    ctx.fillStyle = fc1; ctx.fillRect(SCENE_W-3, y, 1, 1); ctx.fillRect(SCENE_W-1, y, 1, 1);
    ctx.fillStyle = fc2; ctx.fillRect(SCENE_W-2, y, 1, 1);
  }
}

export function drawBedroomFloor(ctx: CanvasRenderingContext2D) {
  const plankW = 7;
  for (let y = SCENE_FLOOR_Y; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const plankIdx = Math.floor(x / plankW); const plankX = x % plankW; const isSeam = plankX === 0;
    const seed = (plankIdx * 41) % 5;
    let r: number, g: number, b: number;
    if (seed < 1) { r = 120; g = 80; b = 52; } else if (seed < 2) { r = 112; g = 74; b = 46; }
    else if (seed < 3) { r = 128; g = 86; b = 56; } else if (seed < 4) { r = 108; g = 72; b = 44; }
    else { r = 118; g = 78; b = 50; }
    const grain = Math.sin(y * 0.7 + plankIdx * 5.1) * 5 + Math.sin(y * 0.25 + plankIdx * 8.3) * 3;
    r += Math.round(grain); g += Math.round(grain * 0.7); b += Math.round(grain * 0.4);
    const boardY = (y - SCENE_FLOOR_Y + plankIdx * 9) % 20;
    if (boardY === 0) { r -= 12; g -= 10; b -= 6; }
    ctx.fillStyle = isSeam ? '#3a2010' : `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const rugL = 44, rugR = 148, rugT = SCENE_FLOOR_Y + 24, rugB = SCENE_H - 16;
  for (let y = rugT; y < rugB; y++) for (let x = rugL; x < rugR; x++) {
    const border = x <= rugL+1 || x >= rugR-2 || y <= rugT+1 || y >= rugB-2;
    const inner = x <= rugL+3 || x >= rugR-4 || y <= rugT+3 || y >= rugB-4;
    if (border) ctx.fillStyle = '#7a5540'; else if (inner) ctx.fillStyle = '#8a6550';
    else { ctx.fillStyle = ((x-rugL)+(y-rugT))%4 < 2 ? '#987060' : '#906858'; }
    ctx.fillRect(x, y, 1, 1);
  }
}

export function drawBedroomWalls(ctx: CanvasRenderingContext2D) {
  const BEAM_H = 6, PANEL_START = 24, TRIM_H = 2;
  for (let y = 0; y < BEAM_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const beamIdx = Math.floor(x / 24); const beamX = x % 24;
    const isCross = beamX >= 22 || beamX < 2;
    const grain = Math.sin(x * 0.5 + beamIdx * 3) * 3;
    if (isCross) ctx.fillStyle = y < 1 ? '#32200e' : '#42280e';
    else { const b = 56 + Math.round(grain); ctx.fillStyle = `rgb(${b+8},${b-6},${b-22})`; }
    ctx.fillRect(x, y, 1, 1);
  }
  for (let x = 0; x < SCENE_W; x++) { ctx.fillStyle = '#32200e'; ctx.fillRect(x, BEAM_H, 1, 1); }
  for (let y = BEAM_H + 1; y < PANEL_START; y++) for (let x = 0; x < SCENE_W; x++) {
    const noise = ((x * 7 + y * 13) % 5) - 2;
    ctx.fillStyle = `rgb(${185 + noise},${192 + noise},${205 + noise})`;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < Math.ceil(SCENE_W / 12); fx++) {
    const cx = fx * 12 + (fy % 2) * 6 + 3, cy = BEAM_H + 4 + fy * 7;
    if (cy + 2 >= PANEL_START || cx + 2 >= SCENE_W) continue;
    ctx.fillStyle = '#b0b8c8';
    ctx.fillRect(cx+1, cy, 1, 1); ctx.fillRect(cx, cy+1, 1, 1);
    ctx.fillRect(cx+2, cy+1, 1, 1); ctx.fillRect(cx+1, cy+2, 1, 1);
  }
  for (let x = 0; x < SCENE_W; x++) {
    ctx.fillStyle = '#5a4028'; ctx.fillRect(x, PANEL_START, 1, 1);
    ctx.fillStyle = '#6a4a30'; ctx.fillRect(x, PANEL_START + 1, 1, 1);
  }
  const panelTop = PANEL_START + TRIM_H, panelPlankW = 5;
  for (let y = panelTop; y < SCENE_WALL_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const plankIdx = Math.floor(x / panelPlankW); const plankX = x % panelPlankW; const isSeam = plankX === 0;
    const seed = (plankIdx * 29) % 5;
    let r: number, g: number, b: number;
    if (seed < 1) { r = 125; g = 85; b = 52; } else if (seed < 2) { r = 118; g = 78; b = 46; }
    else if (seed < 3) { r = 132; g = 90; b = 56; } else if (seed < 4) { r = 115; g = 76; b = 44; }
    else { r = 122; g = 82; b = 50; }
    const grain = Math.sin(y * 0.6 + plankIdx * 4.9) * 5;
    r += Math.round(grain); g += Math.round(grain * 0.7); b += Math.round(grain * 0.4);
    ctx.fillStyle = isSeam ? '#3a2010' : `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let x = 0; x < SCENE_W; x++) {
    ctx.fillStyle = '#32200e'; ctx.fillRect(x, SCENE_WALL_H, 1, 1);
    ctx.fillStyle = '#3e2814'; ctx.fillRect(x, SCENE_WALL_H + 1, 1, 1);
  }
}

// Convenience: draw a full scene background
export function drawSceneBackground(ctx: CanvasRenderingContext2D, scene: string, ts?: number) {
  const t = ts ?? performance.now();
  if (scene === 'garden') {
    drawGardenGround(ctx);
    const daySky: SkyConfig = { top: [80,150,220], bottom: [120,190,240], stars: false, sun: true, moon: false, sunsetGlow: false, rain: false, clouds: 0, wind: 0 };
    drawGardenSky(ctx, t, daySky);
    drawGardenFence(ctx);
  } else if (scene === 'bedroom') {
    drawBedroomFloor(ctx);
    drawBedroomWalls(ctx);
  } else {
    drawRoomFloor(ctx);
    drawRoomWalls(ctx);
  }
}
