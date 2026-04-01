const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

let API_KEY;
const fp = path.join(__dirname, '../web/.env.local');
const line = fs.readFileSync(fp, 'utf8').split(/\r?\n/).find(l => /OPENROUTER_API_KEY=/.test(l));
API_KEY = line.split('=').slice(1).join('=').trim();

const OUTPUT_DIR = path.join(__dirname, '../web/public/furniture');
const refB64 = fs.readFileSync(path.join(OUTPUT_DIR, 'kitchen-front-clean.png')).toString('base64');

function callOpenRouter(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'google/gemini-3.1-flash-image-preview',
      messages,
      max_tokens: 4096,
    });
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(JSON.stringify(parsed.error)));
          else resolve(parsed);
        } catch (e) { reject(new Error(`Parse error: ${data.slice(0, 500)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function stripMagenta(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);

  let removed = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
    // Magenta: high red, low green, high blue
    // Also catch pink/fuchsia variants
    if (r > 180 && g < 100 && b > 180) {
      pixels[i+3] = 0;
      removed++;
    }
    // Bright green chromakey variant
    if (r < 100 && g > 180 && b < 100) {
      pixels[i+3] = 0;
      removed++;
    }
  }

  // Clean up edge artifacts — pixels adjacent to removed pixels that are close to magenta
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        if (pixels[i+3] === 0) continue;

        let transparentNeighbors = 0;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const ni = ((y+dy) * width + (x+dx)) * 4;
          if (pixels[ni+3] === 0) transparentNeighbors++;
        }

        if (transparentNeighbors >= 2) {
          const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
          // More lenient magenta check for edge pixels
          if (r > 150 && g < 120 && b > 150) {
            pixels[i+3] = 0;
            removed++;
          }
          if (r < 120 && g > 150 && b < 120) {
            pixels[i+3] = 0;
            removed++;
          }
        }
      }
    }
  }

  console.log(`  Stripped ${removed} pixels (${(removed / (width * height) * 100).toFixed(1)}%)`);
  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toFile(outputPath);
}

async function generate(id, desc) {
  console.log(`  Generating ${id}...`);
  try {
    const data = await callOpenRouter([{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + refB64 } },
        { type: 'text', text: `This reference shows the correct flat front-facing pixel art style for a cozy cottage game.

Now generate a pixel art sprite of ${desc}. FLAT FRONT-FACING view (not isometric, not angled). Same pixel art style, warm cozy cottage aesthetic.

CRITICAL: The background MUST be solid bright magenta/pink (#FF00FF). Fill ALL empty space around the furniture with solid flat #FF00FF magenta. No checkerboard, no transparency — just solid magenta everywhere that isn't the furniture.` }
      ]
    }]);

    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) { console.error(`  FAIL ${id} — no image`); return false; }

    const base64 = url.replace(/^data:image\/[^;]+;base64,/, '');
    const rawPath = path.join(OUTPUT_DIR, `${id}-front.png`);
    fs.writeFileSync(rawPath, Buffer.from(base64, 'base64'));

    const cleanPath = path.join(OUTPUT_DIR, `${id}-front-clean.png`);
    await stripMagenta(rawPath, cleanPath);
    console.log(`  OK ${id}`);
    return true;
  } catch (e) {
    console.error(`  FAIL ${id}:`, e.message);
    return false;
  }
}

const PIECES = [
  { id: 'fireplace', desc: 'a stone fireplace with crackling fire, wooden mantle, warm orange flames inside, small rug in front. Cottage hearth' },
  { id: 'clock_table', desc: 'a small wooden side table with an analog clock on top. Round clock face, delicate wooden legs' },
  { id: 'plant', desc: 'a potted houseplant in a terracotta pot. Medium leafy green plant with broad leaves' },
  { id: 'tall_plant', desc: 'a tall indoor fiddle leaf fig plant in a large ceramic pot. Floor-standing' },
  { id: 'succulent', desc: 'a tiny succulent in a small decorative pot. Compact rosette, pale green' },
  { id: 'floor_lamp', desc: 'a standing floor lamp with warm fabric cone shade, tall wooden pole, round base' },
  { id: 'ceiling_light', desc: 'a hanging pendant lamp/ceiling light. Glass or fabric shade hanging from a chain. Warm glow' },
  { id: 'window', desc: 'a wooden-framed four-pane window with light curtains pulled to the sides. Cottage style' },
  { id: 'chicken_coop', desc: 'a small wooden chicken coop with ramp, nesting boxes, and chickens pecking around. Farm cottage' },
  { id: 'bed', desc: 'a cozy wooden bed — dark wood frame, headboard, white pillows, blue-grey blanket. Cottage bedroom' },
  { id: 'wardrobe', desc: 'a large wooden wardrobe/armoire. Double doors with panels, warm dark wood, small knob handles' },
  { id: 'bedroom_window', desc: 'a small wooden-framed bedroom window with soft blue-grey curtains. Cozy cottage' },
];

async function main() {
  console.log(`\nRegenerating ${PIECES.length} pieces with magenta background...\n`);
  let ok = 0, fail = 0;
  for (const p of PIECES) {
    const result = await generate(p.id, p.desc);
    if (result) ok++; else fail++;
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log(`\nDone! ${ok} ok, ${fail} failed\n`);
}

main().catch(console.error);
