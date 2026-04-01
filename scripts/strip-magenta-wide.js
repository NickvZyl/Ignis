const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

const OUTPUT_DIR = path.join(__dirname, '../web/public/furniture');

async function stripMagenta(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);

  let removed = 0;

  // Pass 1: Remove any pixel where red and blue are high, green is low
  // This catches all shades of magenta/pink/fuchsia/purple-pink
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
    if (a === 0) continue;

    // Core magenta: R high, G low, B high
    const isMagenta = r > 140 && b > 140 && g < 130 && (r + b) > (g * 2 + 80);

    // Also catch lighter pinks where all channels are elevated but green is still lowest
    const isPink = r > 180 && b > 150 && g < 160 && (r - g) > 40 && (b - g) > 20;

    if (isMagenta || isPink) {
      pixels[i+3] = 0;
      removed++;
    }
  }

  console.log(`  Pass 1: ${removed} pixels (${(removed / (width * height) * 100).toFixed(1)}%)`);

  // Pass 2-4: Erode edge artifacts — semi-magenta pixels at boundaries
  for (let pass = 0; pass < 4; pass++) {
    let passRemoved = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (pixels[i+3] === 0) continue;

        // Count transparent neighbors (8-connected)
        let tCount = 0;
        for (const [dx, dy] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) { tCount++; continue; }
          if (pixels[(ny * width + nx) * 4 + 3] === 0) tCount++;
        }

        if (tCount >= 3) {
          const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
          // Lenient magenta check for edge pixels
          if (r > 120 && b > 120 && g < 150 && (r + b) > (g * 2 + 40)) {
            pixels[i+3] = 0;
            passRemoved++;
          }
          // Also remove isolated greyish pixels (anti-aliasing artifacts)
          if (tCount >= 6) {
            const sat = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
            if (sat < 15) {
              pixels[i+3] = 0;
              passRemoved++;
            }
          }
        }
      }
    }
    if (passRemoved > 0) console.log(`  Pass ${pass + 2}: cleaned ${passRemoved} edge pixels`);
    removed += passRemoved;
  }

  console.log(`  Total: ${removed} pixels (${(removed / (width * height) * 100).toFixed(1)}%)`);
  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toFile(outputPath);
}

const PIECES = [
  'fireplace', 'clock_table', 'plant', 'tall_plant',
  'floor_lamp', 'window', 'chicken_coop', 'bed',
  'wardrobe', 'bedroom_window',
];

async function main() {
  console.log(`\nWide magenta strip for ${PIECES.length} pieces...\n`);
  for (const id of PIECES) {
    const rawPath = path.join(OUTPUT_DIR, `${id}-front.png`);
    const cleanPath = path.join(OUTPUT_DIR, `${id}-front-clean.png`);
    if (!fs.existsSync(rawPath)) { console.log(`  SKIP ${id}`); continue; }
    console.log(`Processing ${id}...`);
    await stripMagenta(rawPath, cleanPath);
  }
  console.log('\nDone!\n');
}

main().catch(console.error);
