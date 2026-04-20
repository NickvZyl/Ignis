// One-time normalization pass: round each piece's overhang out to whole tiles
// and pad the corresponding PNG with transparent pixels so the art's visual
// position in-scene is unchanged. After this runs every overhang in
// furniture-config.json is an integer number of tiles, which makes future
// editing much simpler (no more fractional drag-artifact values).
//
// The PNG's own pixel dimensions are whatever the artist exported — we just
// grow them proportionally to the new sprite rect and paste the original
// content at the right inset, so the renderer (which stretches PNG → sprite
// rect) still produces the same pixels on-screen.

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const WEB = path.join(__dirname, '..');
const PIECES_DIR = path.join(WEB, 'lib', 'furniture', 'pieces');
const CONFIG_PATH = path.join(WEB, 'lib', 'furniture-config.json');
const PUBLIC_DIR = path.join(WEB, 'public');
const TILE_PX = 32; // 8 * 4 (internal tile size × SCALE)

function rotatedDims(gridW, gridH, rot) {
  return (rot === 1 || rot === 3) ? { w: gridH, h: gridW } : { w: gridW, h: gridH };
}

function ceilOverhang(oh) {
  return {
    left:   Math.ceil(oh.left),
    top:    Math.ceil(oh.top),
    right:  Math.ceil(oh.right),
    bottom: Math.ceil(oh.bottom),
  };
}

function sameOverhang(a, b) {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

async function loadPieces() {
  const files = (await fs.readdir(PIECES_DIR)).filter(f => f.endsWith('.ts'));
  const pieces = [];
  for (const f of files) {
    const src = await fs.readFile(path.join(PIECES_DIR, f), 'utf-8');
    const id = src.match(/id:\s*'([^']+)'/)?.[1];
    if (!id) continue;
    const gridW = parseInt(src.match(/gridW:\s*(\d+)/)?.[1] || '1', 10);
    const gridH = parseInt(src.match(/gridH:\s*(\d+)/)?.[1] || '1', 10);
    const hiResBlock = src.match(/hiResSprites:\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    const sprites = {};
    for (const m of hiResBlock.matchAll(/(\d+):\s*'([^']+)'/g)) {
      sprites[m[1]] = m[2];
    }
    if (Object.keys(sprites).length > 0) pieces.push({ id, gridW, gridH, sprites });
  }
  return pieces;
}

async function padSprite(spriteUrl, oldOh, newOh, rotDims) {
  const rel = spriteUrl.replace(/^\//, '');
  const fullPath = path.join(PUBLIC_DIR, rel);
  const meta = await sharp(fullPath).metadata();
  const oldPngW = meta.width;
  const oldPngH = meta.height;

  const oldSpriteW = (rotDims.w + oldOh.left + oldOh.right) * TILE_PX;
  const oldSpriteH = (rotDims.h + oldOh.top + oldOh.bottom) * TILE_PX;
  if (oldSpriteW <= 0 || oldSpriteH <= 0) {
    console.log(`  skip ${spriteUrl}: degenerate sprite rect`);
    return;
  }
  const newSpriteW = (rotDims.w + newOh.left + newOh.right) * TILE_PX;
  const newSpriteH = (rotDims.h + newOh.top + newOh.bottom) * TILE_PX;

  const newPngW = Math.round(oldPngW * newSpriteW / oldSpriteW);
  const newPngH = Math.round(oldPngH * newSpriteH / oldSpriteH);
  const pasteX  = Math.round((newOh.left - oldOh.left) * TILE_PX * oldPngW / oldSpriteW);
  const pasteY  = Math.round((newOh.top  - oldOh.top ) * TILE_PX * oldPngH / oldSpriteH);

  if (newPngW === oldPngW && newPngH === oldPngH && pasteX === 0 && pasteY === 0) {
    console.log(`  ${spriteUrl}: unchanged`);
    return;
  }

  const origBuf = await sharp(fullPath).png().toBuffer();
  await sharp({
    create: {
      width: newPngW,
      height: newPngH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: origBuf, left: pasteX, top: pasteY }])
    .png()
    .toFile(fullPath);

  console.log(`  ${spriteUrl}: ${oldPngW}×${oldPngH} → ${newPngW}×${newPngH} (paste ${pasteX},${pasteY})`);
}

async function main() {
  const pieces = await loadPieces();
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8'));

  for (const piece of pieces) {
    const cfg = config[piece.id];
    if (!cfg) continue;

    const gridW = cfg.gridW ?? piece.gridW;
    const gridH = cfg.gridH ?? piece.gridH;
    const baseOh = cfg.overhang ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const oldOverrides = cfg.overhangOverrides ?? {};

    console.log(`\n${piece.id} (${gridW}×${gridH})`);

    const newBase = ceilOverhang(baseOh);
    const newOverrides = {};

    for (const [rotStr, spriteUrl] of Object.entries(piece.sprites)) {
      const rot = parseInt(rotStr, 10);
      const effOh = oldOverrides[rotStr] ?? baseOh;
      const newEffOh = ceilOverhang(effOh);
      const dims = rotatedDims(gridW, gridH, rot);

      try {
        await padSprite(spriteUrl, effOh, newEffOh, dims);
      } catch (err) {
        console.log(`  ${spriteUrl}: error — ${err.message}`);
      }

      // Decide whether to keep this as an explicit override. Keep if the source
      // had an override, OR if the new value differs from newBase.
      if (rot === 0) continue;
      const hadOverride = rotStr in oldOverrides;
      if (hadOverride || !sameOverhang(newEffOh, newBase)) {
        newOverrides[rotStr] = newEffOh;
      }
    }

    cfg.overhang = newBase;
    if (Object.keys(newOverrides).length > 0) cfg.overhangOverrides = newOverrides;
    else delete cfg.overhangOverrides;
  }

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log('\nfurniture-config.json updated.');
}

main().catch(err => { console.error(err); process.exit(1); });
