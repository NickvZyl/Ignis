const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

const OUTPUT_DIR = path.join(__dirname, '../web/public/furniture');

// Detect and remove checkerboard transparency pattern
// The pattern alternates between two similar grey tones in a grid
async function stripCheckerboard(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);

  // Step 1: Sample corners to detect checkerboard colors
  // The corners should be "transparent" (checkerboard) areas
  const cornerSamples = [];
  const samplePositions = [
    [2, 2], [3, 2], [2, 3], [3, 3], // top-left
    [width-4, 2], [width-3, 2], [width-4, 3], [width-3, 3], // top-right
    [2, height-4], [3, height-4], [2, height-3], [3, height-3], // bottom-left
  ];

  for (const [sx, sy] of samplePositions) {
    const idx = (sy * width + sx) * 4;
    cornerSamples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
  }

  // Find the two alternating colors (they should cluster into 2 groups)
  const lights = cornerSamples.filter(s => (s.r + s.g + s.b) / 3 > 160);
  const darks = cornerSamples.filter(s => (s.r + s.g + s.b) / 3 <= 160);

  if (lights.length < 2 || darks.length < 2) {
    // Fallback: try broader detection
    console.log(`  ${path.basename(inputPath)}: unusual corner colors, using broad detection`);
  }

  const avgLight = lights.length > 0 ? {
    r: Math.round(lights.reduce((s, c) => s + c.r, 0) / lights.length),
    g: Math.round(lights.reduce((s, c) => s + c.g, 0) / lights.length),
    b: Math.round(lights.reduce((s, c) => s + c.b, 0) / lights.length),
  } : { r: 204, g: 204, b: 204 };

  const avgDark = darks.length > 0 ? {
    r: Math.round(darks.reduce((s, c) => s + c.r, 0) / darks.length),
    g: Math.round(darks.reduce((s, c) => s + c.g, 0) / darks.length),
    b: Math.round(darks.reduce((s, c) => s + c.b, 0) / darks.length),
  } : { r: 170, g: 170, b: 170 };

  console.log(`  Checkerboard colors: light=(${avgLight.r},${avgLight.g},${avgLight.b}) dark=(${avgDark.r},${avgDark.g},${avgDark.b})`);

  // Step 2: For each pixel, check if it matches either checkerboard color
  // AND if the surrounding pixels alternate (confirming it's a pattern, not content)
  let removed = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2], a = pixels[idx+3];

      if (a === 0) continue; // already transparent

      // Check if pixel matches either checkerboard color (within tolerance)
      const matchesLight = Math.abs(r - avgLight.r) < 15 && Math.abs(g - avgLight.g) < 15 && Math.abs(b - avgLight.b) < 15;
      const matchesDark = Math.abs(r - avgDark.r) < 15 && Math.abs(g - avgDark.g) < 15 && Math.abs(b - avgDark.b) < 15;

      if (!matchesLight && !matchesDark) continue;

      // Verify it's actually a checkerboard by checking neighbors form alternating pattern
      // In a checkerboard, (x+y)%2 determines which color a pixel is
      // Check a few neighbors to confirm
      let checkerScore = 0;
      const checkOffsets = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [ox, oy] of checkOffsets) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = (ny * width + nx) * 4;
        const nr = pixels[ni], ng = pixels[ni+1], nb = pixels[ni+2];

        const nMatchesLight = Math.abs(nr - avgLight.r) < 15 && Math.abs(ng - avgLight.g) < 15 && Math.abs(nb - avgLight.b) < 15;
        const nMatchesDark = Math.abs(nr - avgDark.r) < 15 && Math.abs(ng - avgDark.g) < 15 && Math.abs(nb - avgDark.b) < 15;

        // Neighbor should be the OPPOSITE color
        if ((matchesLight && nMatchesDark) || (matchesDark && nMatchesLight)) {
          checkerScore++;
        }
      }

      // If at least 2 neighbors alternate, it's likely checkerboard
      if (checkerScore >= 2) {
        pixels[idx+3] = 0;
        removed++;
      }
    }
  }

  console.log(`  Removed ${removed} checkerboard pixels (${(removed / (width * height) * 100).toFixed(1)}%)`);

  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } })
    .png().toFile(outputPath);
}

const PIECES = [
  'fireplace', 'clock_table', 'plant', 'tall_plant', 'succulent',
  'floor_lamp', 'ceiling_light', 'window', 'chicken_coop', 'bed',
  'wardrobe', 'bedroom_window',
];

async function main() {
  console.log(`\nFixing transparency for ${PIECES.length} pieces...\n`);
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
