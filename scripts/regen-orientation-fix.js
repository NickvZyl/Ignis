const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

let API_KEY;
for (const envFile of ['../web/.env.local', '../.env']) {
  const fp = path.join(__dirname, envFile);
  if (!fs.existsSync(fp)) continue;
  const line = fs.readFileSync(fp, 'utf8')
    .split(/\r?\n/).find(l => /OPENROUTER_API_KEY=/.test(l));
  if (line) { API_KEY = line.split('=').slice(1).join('=').trim(); break; }
}
if (!API_KEY) { console.error('No API key found'); process.exit(1); }

const OUTPUT_DIR = path.join(__dirname, '../web/public/furniture');
const REF_IMAGE = path.join(OUTPUT_DIR, 'kitchen-front-clean.png');
const refB64 = fs.readFileSync(REF_IMAGE).toString('base64');

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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
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

async function stripCheckerboard(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
    const avg = (r + g + b) / 3;
    const maxDiff = Math.max(Math.abs(r - avg), Math.abs(g - avg), Math.abs(b - avg));
    if (maxDiff < 10 && avg > 175) pixels[i+3] = 0;
  }
  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } })
    .png().toFile(outputPath);
}

async function generateWithRef(id, description) {
  console.log(`  Generating ${id}...`);
  try {
    const data = await callOpenRouter([{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + refB64 } },
        { type: 'text', text: `This reference image shows the correct art style and viewing angle — a FLAT FRONT-FACING view, looking straight at the front of the furniture. NOT isometric. NOT angled. The camera faces the front surface directly, with only a very subtle top-down tilt to see the top surface slightly.

Now generate a pixel art sprite of ${description} using this EXACT same flat front-facing perspective. Same pixel art style, same warm cozy cottage aesthetic. Transparent background (PNG alpha). No floor, no walls — just the isolated furniture piece.` }
      ]
    }]);

    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) { console.error(`  FAIL ${id} — no image`); return; }

    const base64 = url.replace(/^data:image\/[^;]+;base64,/, '');
    const rawPath = path.join(OUTPUT_DIR, `${id}-front.png`);
    fs.writeFileSync(rawPath, Buffer.from(base64, 'base64'));
    const cleanPath = path.join(OUTPUT_DIR, `${id}-front-clean.png`);
    await stripCheckerboard(rawPath, cleanPath);
    console.log(`  OK ${id}`);
  } catch (e) {
    console.error(`  FAIL ${id}:`, e.message);
  }
}

const PIECES = [
  { id: 'desk', desc: 'a wooden desk with a computer setup — monitor on a stand, keyboard, and an office chair in front. Dark wood desk with warm tones. Wide desk seen from the front' },
  { id: 'fridge', desc: 'a retro-style refrigerator. Cream/white color with silver handles. Two-door (freezer on top, fridge on bottom). Seen from the front face' },
  { id: 'wall_sconce', desc: 'a wall-mounted candle sconce/light fixture. Decorative iron bracket holding a candle with warm flame. Seen from the front, mounted flat against the wall' },
  { id: 'garden_gate', desc: 'a wooden garden gate with fence sections on each side. Rustic picket-style, simple latch, green vines. Seen from the front — the gate faces the viewer directly' },
  { id: 'cow_pen', desc: 'a fenced cow pen seen from the front. Wooden post-and-rail fence in the foreground, a brown and white spotted cow visible behind it, hay on the ground. Front-facing flat view, fence runs left to right' },
  { id: 'nightstand', desc: 'a small wooden bedside nightstand with a drawer and a small lamp on top. Simple cottage style, warm wood. Seen from the front face directly' },
];

async function main() {
  console.log(`\nRegenerating ${PIECES.length} pieces with correct flat front orientation...\n`);
  for (const p of PIECES) {
    await generateWithRef(p.id, p.desc);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\nDone!\n');
}

main().catch(console.error);
