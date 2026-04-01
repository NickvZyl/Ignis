const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

const OUTPUT_DIR = path.join(__dirname, '../web/public/furniture');

async function stripCheckerboard(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);

  // Sample the top-left corner area to find the two checkerboard colors and block size
  // Try block sizes: 1, 2, 4, 8, 10, 12, 16, 20
  const blockSizes = [1, 2, 4, 8, 10, 12, 16, 20];
  let bestBlockSize = 8;
  let color1 = null, color2 = null;

  for (const bs of blockSizes) {
    // Sample two adjacent blocks in the top-left
    const samples1 = []; // block at (0,0)
    const samples2 = []; // block at (bs,0)

    for (let dy = 0; dy < Math.min(bs, 4); dy++) {
      for (let dx = 0; dx < Math.min(bs, 4); dx++) {
        const i1 = (dy * width + dx) * 4;
        samples1.push({ r: pixels[i1], g: pixels[i1+1], b: pixels[i1+2] });

        const i2 = (dy * width + (bs + dx)) * 4;
        samples2.push({ r: pixels[i2], g: pixels[i2+1], b: pixels[i2+2] });
      }
    }

    const avg1 = {
      r: Math.round(samples1.reduce((s, c) => s + c.r, 0) / samples1.length),
      g: Math.round(samples1.reduce((s, c) => s + c.g, 0) / samples1.length),
      b: Math.round(samples1.reduce((s, c) => s + c.b, 0) / samples1.length),
    };
    const avg2 = {
      r: Math.round(samples2.reduce((s, c) => s + c.r, 0) / samples2.length),
      g: Math.round(samples2.reduce((s, c) => s + c.g, 0) / samples2.length),
      b: Math.round(samples2.reduce((s, c) => s + c.b, 0) / samples2.length),
    };

    // Both colors should be grey-ish (low saturation)
    const sat1 = Math.max(Math.abs(avg1.r - avg1.g), Math.abs(avg1.g - avg1.b), Math.abs(avg1.r - avg1.b));
    const sat2 = Math.max(Math.abs(avg2.r - avg2.g), Math.abs(avg2.g - avg2.b), Math.abs(avg2.r - avg2.b));

    // They should be different from each other
    const diff = Math.abs(avg1.r - avg2.r) + Math.abs(avg1.g - avg2.g) + Math.abs(avg1.b - avg2.b);

    // Verify: sample block at (2*bs, 0) should match block at (0,0)
    const samples3 = [];
    for (let dy = 0; dy < Math.min(bs, 4); dy++) {
      for (let dx = 0; dx < Math.min(bs, 4); dx++) {
        const x = 2 * bs + dx;
        if (x >= width) continue;
        const i3 = (dy * width + x) * 4;
        samples3.push({ r: pixels[i3], g: pixels[i3+1], b: pixels[i3+2] });
      }
    }
    if (samples3.length === 0) continue;

    const avg3 = {
      r: Math.round(samples3.reduce((s, c) => s + c.r, 0) / samples3.length),
      g: Math.round(samples3.reduce((s, c) => s + c.g, 0) / samples3.length),
      b: Math.round(samples3.reduce((s, c) => s + c.b, 0) / samples3.length),
    };
    const repeatDiff = Math.abs(avg1.r - avg3.r) + Math.abs(avg1.g - avg3.g) + Math.abs(avg1.b - avg3.b);

    if (sat1 < 15 && sat2 < 15 && diff > 15 && repeatDiff < 15) {
      bestBlockSize = bs;
      color1 = avg1;
      color2 = avg2;
      break;
    }
  }

  if (!color1 || !color2) {
    // Last resort: just use corner pixel colors directly
    const i0 = 0;
    color1 = { r: pixels[i0], g: pixels[i0+1], b: pixels[i0+2] };
    const bs = 8;
    const i1 = (0 * width + bs) * 4;
    color2 = { r: pixels[i1], g: pixels[i1+1], b: pixels[i1+2] };
    bestBlockSize = bs;
  }

  console.log(`  Block size: ${bestBlockSize}, colors: (${color1.r},${color1.g},${color1.b}) / (${color2.r},${color2.g},${color2.b})`);

  // Now remove all pixels that match either checkerboard color
  // Use a generous tolerance since the blocks might not be perfectly uniform
  let removed = 0;
  const tolerance = 20;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2], a = pixels[idx+3];
      if (a === 0) continue;

      const m1 = Math.abs(r - color1.r) + Math.abs(g - color1.g) + Math.abs(b - color1.b);
      const m2 = Math.abs(r - color2.r) + Math.abs(g - color2.g) + Math.abs(b - color2.b);

      if (m1 > tolerance && m2 > tolerance) continue;

      // Verify this pixel is in a region that's part of the checkerboard
      // Check: which block are we in? Does the expected color match?
      const bx = Math.floor(x / bestBlockSize);
      const by = Math.floor(y / bestBlockSize);
      const expectColor1 = (bx + by) % 2 === 0;

      if (expectColor1 && m1 <= tolerance) {
        pixels[idx+3] = 0;
        removed++;
      } else if (!expectColor1 && m2 <= tolerance) {
        pixels[idx+3] = 0;
        removed++;
      } else if (expectColor1 && m2 <= tolerance) {
        // Colors might be swapped
        pixels[idx+3] = 0;
        removed++;
      } else if (!expectColor1 && m1 <= tolerance) {
        pixels[idx+3] = 0;
        removed++;
      }
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
  console.log(`\nFixing transparency v2 for ${PIECES.length} pieces...\n`);
  for (const id of PIECES) {
    const rawPath = path.join(OUTPUT_DIR, `${id}-front.png`);
    const cleanPath = path.join(OUTPUT_DIR, `${id}-front-clean.png`);
    if (!fs.existsSync(rawPath)) {
      console.log(`  SKIP ${id} — no raw file`);
      continue;
    }
    console.log(`Processing ${id}...`);
    await stripCheckerboard(rawPath, cleanPath);
  }
  console.log('\nDone!\n');
}

main().catch(console.error);
