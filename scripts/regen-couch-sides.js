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

  // Generate RIGHT side view with proper 3/4 top-down angle
  console.log('Generating RIGHT side view...');
  let data = await callOpenRouter([{ role: 'user', content: [
    frontRef,
    { type: 'text', text: `This is the FRONT view of a pixel art couch for a top-down 2D game (like Stardew Valley). It shows the couch from above at a slight angle — you can see the tops of the cushions and pillows.

Now generate the RIGHT SIDE view of this EXACT same couch, as it would appear in a top-down 2D RPG game like Stardew Valley.

The couch has been rotated 90 degrees on the floor so you're looking at the right armrest end. The camera is slightly above. You should see:

- The right armrest at the bottom (closest to camera), dark brown wood
- The 3 seat cushions visible from above, running STRAIGHT UP on the screen (vertically)
- The couch back along the LEFT edge running vertically
- Throw pillows on the cushions
- The left armrest at the top (furthest from camera)

CRITICAL LAYOUT: The couch's back edge and front edge must be PARALLEL TO THE LEFT/RIGHT SCREEN EDGES — running straight vertically, NOT diagonally. The couch should form a roughly RECTANGULAR shape on screen, taller than it is wide. Think of the front view rotated 90 degrees — the back of the couch that was horizontal across the top is now running vertically down the left side. Only a very subtle top-down depth hint, NOT an isometric diagonal angle.

Same exact colors (dark blue-grey fabric, dark brown wood, amber + rust pillows). Same pixel art style. Transparent PNG background, no floor, no walls. Generate ONLY ONE couch, not two.` }
  ]}]);

  let buf = extractImage(data);
  if (buf) {
    const rawPath = path.join(OUTPUT_DIR, 'couch-right.png');
    fs.writeFileSync(rawPath, buf);
    await stripCheckerboard(rawPath, path.join(OUTPUT_DIR, 'couch-right-clean.png'));
    console.log('Right view done.');

    // Mirror right to create left
    console.log('Creating LEFT view by mirroring right...');
    await sharp(path.join(OUTPUT_DIR, 'couch-right-clean.png'))
      .flop()
      .toFile(path.join(OUTPUT_DIR, 'couch-left-clean.png'));
    console.log('  Done: couch-left-clean.png');
  } else {
    console.error('Failed to generate right view');
  }

  console.log('\nAll done!');
}

main().catch(console.error);
