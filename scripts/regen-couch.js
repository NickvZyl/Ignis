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
  if (!url) return null;
  return Buffer.from(url.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
}

const STYLE = `Style: cozy cottage pixel art, Stardew Valley aesthetic. IMPORTANT: This is for a TOP-DOWN 2D game. The camera looks STRAIGHT DOWN from above at a slight angle — NOT isometric, NOT diagonal, NOT 3/4 view. The couch should be drawn FLAT and HORIZONTALLY, parallel to the screen edges, as seen from directly above. Think RPG Maker or Stardew Valley furniture viewed from above. Transparent PNG background, no floor, no walls.`;

const DESC = `a comfortable 3-seater living room couch/sofa with plush cushions, deep blue-grey fabric upholstery, dark wooden armrests and frame, and two accent throw pillows (one amber/gold, one rust/terracotta)`;

async function main() {
  // Front view
  console.log('Generating FRONT view...');
  let data = await callOpenRouter([{ role: 'user',
    content: `Create a pixel art sprite of ${DESC}, viewed from the FRONT (camera is above and slightly behind, looking down — you see the top of the back cushions and the seat). ${STYLE}`
  }]);
  let buf = extractImage(data);
  if (!buf) { console.error('No front image'); return; }
  const frontRaw = path.join(OUTPUT_DIR, 'couch-front.png');
  fs.writeFileSync(frontRaw, buf);
  await stripCheckerboard(frontRaw, path.join(OUTPUT_DIR, 'couch-front-clean.png'));

  const frontB64 = buf.toString('base64');

  // Back view
  console.log('Generating BACK view...');
  data = await callOpenRouter([{ role: 'user', content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontB64 } },
    { type: 'text', text: `This is the FRONT view of a pixel art couch seen from above in a top-down 2D game. Now generate the BACK view — the camera is above and slightly in front, looking down at the back of the couch. You see the back frame and the tops of the armrests. Same colors, same proportions, same flat top-down perspective (NOT isometric/diagonal). Transparent PNG background.` }
  ]}]);
  buf = extractImage(data);
  if (buf) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'couch-back.png'), buf);
    await stripCheckerboard(path.join(OUTPUT_DIR, 'couch-back.png'), path.join(OUTPUT_DIR, 'couch-back-clean.png'));
  }

  // Right view
  console.log('Generating RIGHT view...');
  data = await callOpenRouter([{ role: 'user', content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontB64 } },
    { type: 'text', text: `This is the FRONT view of a pixel art couch seen from above in a top-down 2D game. Now generate the RIGHT SIDE view — the couch is rotated 90 degrees clockwise, so you see it from the right side. The couch should now be VERTICAL on screen (tall and narrow instead of wide). Same colors, same flat top-down perspective (NOT isometric/diagonal). Transparent PNG background.` }
  ]}]);
  buf = extractImage(data);
  let rightRaw = null;
  if (buf) {
    rightRaw = path.join(OUTPUT_DIR, 'couch-right.png');
    fs.writeFileSync(rightRaw, buf);
    await stripCheckerboard(rightRaw, path.join(OUTPUT_DIR, 'couch-right-clean.png'));
  }

  // Left view
  console.log('Generating LEFT view...');
  const refs = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontB64 } }];
  if (rightRaw) {
    const rightB64 = fs.readFileSync(rightRaw).toString('base64');
    refs.push({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + rightB64 } });
  }
  data = await callOpenRouter([{ role: 'user', content: [
    ...refs,
    { type: 'text', text: `The first image is the FRONT view and the second is the RIGHT view of a pixel art couch in a top-down 2D game. Now generate the LEFT SIDE view — it should be a mirror of the right side view. Same colors, same proportions, same flat top-down perspective (NOT isometric/diagonal). Transparent PNG background.` }
  ]}]);
  buf = extractImage(data);
  if (buf) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'couch-left.png'), buf);
    await stripCheckerboard(path.join(OUTPUT_DIR, 'couch-left.png'), path.join(OUTPUT_DIR, 'couch-left-clean.png'));
  }

  console.log('\nDone! All couch views regenerated.');
}

main().catch(console.error);
