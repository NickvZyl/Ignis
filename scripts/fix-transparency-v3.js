const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

const OUTPUT_DIR = path.join(__dirname, '../web/public/furniture');

async function stripByFloodFill(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);

  const visited = new Uint8Array(width * height);
  const toRemove = new Uint8Array(width * height);

  function getPixel(x, y) {
    const i = (y * width + x) * 4;
    return { r: pixels[i], g: pixels[i+1], b: pixels[i+2], a: pixels[i+3] };
  }

  function colorDist(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  }

  // Flood fill from seed points along all 4 edges
  const seeds = [];
  for (let x = 0; x < width; x++) {
    seeds.push([x, 0]);
    seeds.push([x, 1]);
    seeds.push([x, height - 1]);
    seeds.push([x, height - 2]);
  }
  for (let y = 0; y < height; y++) {
    seeds.push([0, y]);
    seeds.push([1, y]);
    seeds.push([width - 1, y]);
    seeds.push([width - 2, y]);
  }

  // BFS flood fill — a pixel is "background" if:
  // 1. It's reachable from an edge pixel through similar-colored neighbors
  // 2. The color is grey-ish (low saturation) — not part of the actual furniture
  const queue = [];
  const TOLERANCE = 35; // color distance tolerance for neighbor similarity
  const SAT_LIMIT = 25; // max saturation to be considered "grey" background

  for (const [sx, sy] of seeds) {
    const idx = sy * width + sx;
    if (visited[idx]) continue;
    const p = getPixel(sx, sy);
    const sat = Math.max(Math.abs(p.r - p.g), Math.abs(p.g - p.b), Math.abs(p.r - p.b));
    if (sat > SAT_LIMIT) continue; // edge pixel is colored — skip
    visited[idx] = 1;
    toRemove[idx] = 1;
    queue.push([sx, sy]);
  }

  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    const cp = getPixel(cx, cy);

    const neighbors = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;

      const np = getPixel(nx, ny);
      if (np.a === 0) { toRemove[ni] = 1; continue; } // already transparent

      // Must be grey-ish
      const sat = Math.max(Math.abs(np.r - np.g), Math.abs(np.g - np.b), Math.abs(np.r - np.b));
      if (sat > SAT_LIMIT) continue; // colored pixel — stop flood

      // Must be similar to current pixel (handles the two checkerboard tones)
      const dist = colorDist(cp, np);
      if (dist > TOLERANCE) {
        // Not similar to immediate neighbor, but could still be the other checkerboard color
        // Check if it's similar to any seed/edge color
        const edgeP = getPixel(0, 0);
        const edgeP2 = getPixel(1, 0);
        if (colorDist(np, edgeP) > TOLERANCE && colorDist(np, edgeP2) > TOLERANCE) continue;
      }

      toRemove[ni] = 1;
      queue.push([nx, ny]);
    }
  }

  let removed = 0;
  for (let i = 0; i < toRemove.length; i++) {
    if (toRemove[i]) {
      pixels[i * 4 + 3] = 0;
      removed++;
    }
  }

  console.log(`  Removed ${removed} pixels (${(removed / (width * height) * 100).toFixed(1)}%)`);

  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } })
    .png().toFile(outputPath);
}

const PIECES = [
  'fireplace', 'clock_table', 'plant', 'tall_plant', 'succulent',
  'floor_lamp', 'ceiling_light', 'window', 'chicken_coop', 'bed',
  'wardrobe', 'bedroom_window',
];

async function main() {
  console.log(`\nFlood-fill transparency strip for ${PIECES.length} pieces...\n`);
  for (const id of PIECES) {
    const rawPath = path.join(OUTPUT_DIR, `${id}-front.png`);
    const cleanPath = path.join(OUTPUT_DIR, `${id}-front-clean.png`);
    if (!fs.existsSync(rawPath)) {
      console.log(`  SKIP ${id} — no raw file`);
      continue;
    }
    console.log(`Processing ${id}...`);
    await stripByFloodFill(rawPath, cleanPath);
  }
  console.log('\nDone!\n');
}

main().catch(console.error);
