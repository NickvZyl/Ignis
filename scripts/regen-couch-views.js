const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

const API_KEY = fs.readFileSync(path.join(__dirname, '../web/.env.local'), 'utf8')
  .split(/\r?\n/).find(l => /OPENROUTER_API_KEY=/.test(l))
  ?.split('=').slice(1).join('=').trim();

const OUTPUT_DIR = path.join(__dirname, '../web/public/furniture');

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
  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toFile(outputPath);
  console.log(`  Cleaned: ${path.basename(outputPath)}`);
}

function extractImage(data) {
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) { console.error('No image in response'); return null; }
  return Buffer.from(url.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
}

async function main() {
  const frontB64 = fs.readFileSync(path.join(OUTPUT_DIR, 'couch-front.png')).toString('base64');
  const frontRef = { type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontB64 } };

  const commonDesc = `This attached image is the FRONT view of a pixel art couch for a top-down 2D RPG game (like Stardew Valley). The couch is a 3-seater with dark blue-grey fabric, dark brown wooden frame/armrests, an amber/gold throw pillow on the left and a rust/terracotta pillow on the right.

CRITICAL RULES:
- You MUST match this couch EXACTLY — same exact colors, same pixel art style, same level of detail, same proportions, same size
- The perspective is top-down with a very slight forward tilt (NOT isometric, NOT diagonal, NOT 3/4 view)
- The couch must remain HORIZONTAL (wide, not tall) — it does NOT rotate on screen, we just see a different face of it
- Transparent PNG background, no floor, no shadows, no extra objects`;

  // Back view
  console.log('Generating BACK view...');
  let data = await callOpenRouter([{ role: 'user', content: [
    frontRef,
    { type: 'text', text: `${commonDesc}

Now generate the BACK view of this EXACT same couch. The viewer is now on the opposite side, looking at the back of the couch from above. You should see:
- The top of the wooden back frame prominently
- The dark brown wood grain of the back panel
- The tops of both armrests on the sides
- Just a sliver of the cushion tops peeking over the back
- The couch feet/legs at the bottom
- Same width as the front view` }
  ]}]);
  let buf = extractImage(data);
  if (buf) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'couch-back.png'), buf);
    await stripCheckerboard(path.join(OUTPUT_DIR, 'couch-back.png'), path.join(OUTPUT_DIR, 'couch-back-clean.png'));
  }

  // Right view
  console.log('Generating RIGHT view...');
  data = await callOpenRouter([{ role: 'user', content: [
    frontRef,
    { type: 'text', text: `${commonDesc}

Now generate the RIGHT SIDE view of this EXACT same couch. The viewer is now looking at the right armrest end of the couch from above. You should see:
- The right armrest facing the viewer (dark brown wood)
- The side profile of the back cushions behind it
- The side of the seat cushion
- The couch is now NARROW (you're looking at the short end), but still horizontal on screen
- The depth/width should match the height of the front view
- Same colors, same wood grain, same fabric texture` }
  ]}]);
  buf = extractImage(data);
  let rightPath = null;
  if (buf) {
    rightPath = path.join(OUTPUT_DIR, 'couch-right.png');
    fs.writeFileSync(rightPath, buf);
    await stripCheckerboard(rightPath, path.join(OUTPUT_DIR, 'couch-right-clean.png'));
  }

  // Left view (use front + right as reference)
  console.log('Generating LEFT view...');
  const refs = [frontRef];
  if (rightPath) {
    const rightB64 = fs.readFileSync(rightPath).toString('base64');
    refs.push({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + rightB64 } });
  }
  data = await callOpenRouter([{ role: 'user', content: [
    ...refs,
    { type: 'text', text: `The first image is the FRONT view and the second is the RIGHT SIDE view of a pixel art couch for a top-down 2D RPG game.

${commonDesc}

Now generate the LEFT SIDE view. This should be an exact horizontal mirror/flip of the right side view — same armrest, same proportions, just facing the opposite direction. Same colors, same style.` }
  ]}]);
  buf = extractImage(data);
  if (buf) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'couch-left.png'), buf);
    await stripCheckerboard(path.join(OUTPUT_DIR, 'couch-left.png'), path.join(OUTPUT_DIR, 'couch-left-clean.png'));
  }

  console.log('\nDone!');
}

main().catch(console.error);
