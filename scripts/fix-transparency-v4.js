const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

const OUTPUT_DIR = path.join(__dirname, '../web/public/furniture');

async function stripGreyBackground(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);

  // Step 1: Detect the two checkerboard colors from corners
  const cornerPixels = [];
  for (let y = 0; y < Math.min(20, height); y++) {
    for (let x = 0; x < Math.min(20, width); x++) {
      const i = (y * width + x) * 4;
      cornerPixels.push({ r: pixels[i], g: pixels[i+1], b: pixels[i+2] });
    }
  }

  // Get unique-ish colors (cluster into 2)
  const sorted = cornerPixels.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
  const mid = Math.floor(sorted.length / 2);
  const darkGroup = sorted.slice(0, mid);
  const lightGroup = sorted.slice(mid);

  const avgDark = {
    r: Math.round(darkGroup.reduce((s, c) => s + c.r, 0) / darkGroup.length),
    g: Math.round(darkGroup.reduce((s, c) => s + c.g, 0) / darkGroup.length),
    b: Math.round(darkGroup.reduce((s, c) => s + c.b, 0) / darkGroup.length),
  };
  const avgLight = {
    r: Math.round(lightGroup.reduce((s, c) => s + c.r, 0) / lightGroup.length),
    g: Math.round(lightGroup.reduce((s, c) => s + c.g, 0) / lightGroup.length),
    b: Math.round(lightGroup.reduce((s, c) => s + c.b, 0) / lightGroup.length),
  };

  console.log(`  BG colors: dark=(${avgDark.r},${avgDark.g},${avgDark.b}) light=(${avgLight.r},${avgLight.g},${avgLight.b})`);

  // Step 2: Remove any pixel that closely matches either background color
  // Use generous tolerance
  const TOLERANCE = 25;
  let removed = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
    if (a === 0) continue;

    const dDark = Math.abs(r - avgDark.r) + Math.abs(g - avgDark.g) + Math.abs(b - avgDark.b);
    const dLight = Math.abs(r - avgLight.r) + Math.abs(g - avgLight.g) + Math.abs(b - avgLight.b);

    if (dDark <= TOLERANCE || dLight <= TOLERANCE) {
      pixels[i+3] = 0;
      removed++;
    }
  }

  console.log(`  Pass 1: removed ${removed} pixels (${(removed / (width * height) * 100).toFixed(1)}%)`);

  // Step 3: Clean up isolated opaque pixels surrounded by transparency
  // (artifacts at the boundary)
  let cleaned = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i+3] === 0) continue;

      // Count transparent neighbors
      let tCount = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const ni = ((y+dy) * width + (x+dx)) * 4;
        if (pixels[ni+3] === 0) tCount++;
      }
      // If 6+ of 8 neighbors are transparent, this is likely an artifact
      if (tCount >= 6) {
        pixels[i+3] = 0;
        cleaned++;
      }
    }
  }

  if (cleaned > 0) console.log(`  Pass 2: cleaned ${cleaned} isolated pixels`);
  console.log(`  Total transparent: ${Math.round((removed + cleaned) / (width * height) * 100)}%`);

  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } })
    .png().toFile(outputPath);
}

const PIECES = [
  'fireplace', 'clock_table', 'plant', 'tall_plant', 'succulent',
  'floor_lamp', 'ceiling_light', 'window', 'chicken_coop', 'bed',
  'wardrobe', 'bedroom_window',
];

async function main() {
  console.log(`\nAggressive grey-match transparency strip...\n`);
  for (const id of PIECES) {
    const rawPath = path.join(OUTPUT_DIR, `${id}-front.png`);
    const cleanPath = path.join(OUTPUT_DIR, `${id}-front-clean.png`);
    if (!fs.existsSync(rawPath)) {
      console.log(`  SKIP ${id}`);
      continue;
    }
    console.log(`Processing ${id}...`);
    await stripGreyBackground(rawPath, cleanPath);
  }
  console.log('\nDone!\n');
}

main().catch(console.error);
