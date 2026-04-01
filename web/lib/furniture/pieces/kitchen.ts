import { registry } from '../registry';
import type { FurnitureDef } from '../types';

// ── Steam particle system (persistent across frames) ──

interface SteamParticle {
  x: number;    // 0-1 relative to sprite width
  y: number;    // 0-1 relative to sprite height
  vx: number;   // drift speed
  vy: number;   // rise speed
  life: number; // 0-1 remaining
  size: number; // radius in fraction of sprite width
  born: number; // timestamp created
}

const steamParticles: SteamParticle[] = [];
let lastSteamSpawn = 0;

function spawnSteam(ts: number) {
  // Spawn from two pot locations (left pot ~0.40, right pot ~0.56)
  const sources = [
    { x: 0.40, y: 0.34 },  // left pot
    { x: 0.56, y: 0.37 },  // right pot/pan
  ];

  for (const src of sources) {
    if (Math.random() < 0.4) { // not every frame
      steamParticles.push({
        x: src.x + (Math.random() - 0.5) * 0.03,
        y: src.y,
        vx: (Math.random() - 0.5) * 0.00003,
        vy: -0.00008 - Math.random() * 0.00004,
        life: 1,
        size: 0.008 + Math.random() * 0.006,
        born: ts,
      });
    }
  }
}

function updateSteam(ts: number) {
  // Spawn new particles periodically
  if (ts - lastSteamSpawn > 80) {
    spawnSteam(ts);
    lastSteamSpawn = ts;
  }

  // Update existing
  for (let i = steamParticles.length - 1; i >= 0; i--) {
    const p = steamParticles[i];
    const age = ts - p.born;
    p.x += p.vx * age * 0.01;
    p.y += p.vy * age * 0.005;
    p.life = Math.max(0, 1 - age / 2500);
    p.size += 0.00003;
    if (p.life <= 0) steamParticles.splice(i, 1);
  }
}

// ── Hi-res animation overlay ──

function animateKitchen(
  ctx: CanvasRenderingContext2D,
  dx: number, dy: number, dw: number, dh: number,
  ts: number, _rot: number,
) {
  // Only animate front view for now (rot 0)
  if (_rot !== 0) return;

  // 1. Burner glow — pulsing orange radials under the pots
  const burnerPulse = Math.sin(ts * 0.004) * 0.15 + 0.35;
  const burners = [
    { cx: 0.42, cy: 0.48, r: 0.04 },  // left burner
    { cx: 0.56, cy: 0.48, r: 0.035 },  // right burner
  ];

  for (const b of burners) {
    const cx = dx + dw * b.cx;
    const cy = dy + dh * b.cy;
    const r = dw * b.r;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5);
    grad.addColorStop(0, `rgba(255, 140, 30, ${burnerPulse * 0.6})`);
    grad.addColorStop(0.4, `rgba(255, 80, 10, ${burnerPulse * 0.3})`);
    grad.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r * 2.5, cy - r * 2.5, r * 5, r * 5);
  }

  // 2. Oven window glow — warm amber pulse
  const ovenPulse = Math.sin(ts * 0.002) * 0.08 + 0.25;
  const ovenCx = dx + dw * 0.47;
  const ovenCy = dy + dh * 0.70;
  const ovenRx = dw * 0.08;
  const ovenRy = dh * 0.08;

  const ovenGrad = ctx.createRadialGradient(ovenCx, ovenCy, 0, ovenCx, ovenCy, Math.max(ovenRx, ovenRy) * 2);
  ovenGrad.addColorStop(0, `rgba(255, 160, 50, ${ovenPulse})`);
  ovenGrad.addColorStop(0.5, `rgba(255, 100, 20, ${ovenPulse * 0.5})`);
  ovenGrad.addColorStop(1, 'rgba(255, 80, 0, 0)');
  ctx.fillStyle = ovenGrad;
  ctx.fillRect(ovenCx - ovenRx * 2, ovenCy - ovenRy * 2, ovenRx * 4, ovenRy * 4);

  // 3. Steam particles
  updateSteam(ts);

  for (const p of steamParticles) {
    const px = dx + dw * p.x;
    const py = dy + dh * p.y;
    const pr = dw * p.size;
    const alpha = p.life * 0.35;

    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220, 220, 230, ${alpha})`;
    ctx.fill();

    // Slightly larger diffuse halo
    ctx.beginPath();
    ctx.arc(px, py, pr * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 200, 215, ${alpha * 0.3})`;
    ctx.fill();
  }
}

export const def: FurnitureDef = {
  id: 'kitchen', label: 'Kitchen', gridW: 7, gridH: 3,
  spotDx: 3.5, spotDy: 3, canOverlapWall: false, drawKey: 'kitchen',
  category: 'appliance', tags: [],
  hiResSprites: {
    0: '/furniture/kitchen-front-clean.png',
    1: '/furniture/kitchen-right-clean.png',
    2: '/furniture/kitchen-back-clean.png',
    3: '/furniture/kitchen-left-clean.png',
  },
  hiResAnimate: animateKitchen,
};

// Minimal fallback draw (shown on scene canvas while images load)
export function draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(x, y, 40, 24);
  ctx.fillStyle = '#9a8a78';
  ctx.fillRect(x, y, 40, 2);
}

registry.register(def, draw);
