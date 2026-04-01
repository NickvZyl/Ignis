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
}

async function trimFile(fp) {
  const trimmed = await sharp(fp).trim().toBuffer({ resolveWithObject: true });
  await sharp(trimmed.data).png().toFile(fp + '.tmp');
  fs.renameSync(fp + '.tmp', fp);
  return trimmed.info;
}

function extractImage(data) {
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return null;
  return Buffer.from(url.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
}

const TV_DESC = 'modern flat screen TV on a slim TV stand/entertainment unit';
const STYLE = `Style: cozy cottage pixel art, Stardew Valley aesthetic. Top-down 2D game perspective — camera is slightly above looking down. The TV is a modern widescreen flat panel (thin bezel, dark frame) mounted on or sitting on a slim wooden TV stand/console table with warm wood tones. The screen is dark/off with a subtle reflection. NOT a CRT/retro TV — this is a modern flat screen. Transparent PNG background, no floor, no walls.`;

async function generateAndProcess(name, messages) {
  console.log(`Generating ${name}...`);
  const data = await callOpenRouter(messages);
  const buf = extractImage(data);
  if (!buf) { console.error(`  No image for ${name}`); return null; }

  const rawPath = path.join(OUTPUT_DIR, `tv-${name}.png`);
  fs.writeFileSync(rawPath, buf);

  const cleanPath = path.join(OUTPUT_DIR, `tv-${name}-clean.png`);
  await stripCheckerboard(rawPath, cleanPath);

  const info = await trimFile(cleanPath);
  console.log(`  ${name}: ${info.width}x${info.height}`);
  return rawPath;
}

async function main() {
  // Front
  const frontPath = await generateAndProcess('front', [{
    role: 'user',
    content: `Create a pixel art sprite of a ${TV_DESC}, viewed from the FRONT. ${STYLE} The TV should be wider than it is tall — a nice widescreen proportion. Generate ONLY ONE TV, not two.`
  }]);
  if (!frontPath) return;

  const frontB64 = fs.readFileSync(frontPath).toString('base64');
  const frontRef = { type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontB64 } };

  // Back
  await generateAndProcess('back', [{ role: 'user', content: [
    frontRef,
    { type: 'text', text: `This is the FRONT view of a pixel art modern flat screen TV on a wooden stand for a top-down 2D RPG game. Now generate the BACK view — you see the back panel of the TV (dark plastic/metal), maybe some ports/cables, and the back of the wooden stand. Same width, same proportions, same style. The TV and stand edges should be PARALLEL to screen edges (not diagonal). Transparent PNG background. Generate ONLY ONE TV.` }
  ]}]);

  // Right side
  await generateAndProcess('right', [{ role: 'user', content: [
    frontRef,
    { type: 'text', text: `This is the FRONT view of a pixel art modern flat screen TV on a wooden stand for a top-down 2D RPG game. Now generate the RIGHT SIDE view. The camera is slightly above looking down. You should see:
- The thin edge of the flat screen TV (it's very thin from the side — modern flat panel)
- The side of the wooden TV stand running vertically on screen
- The TV and stand should form a roughly RECTANGULAR shape, taller than wide
- Edges parallel to screen edges, NOT diagonal/isometric
Transparent PNG background. Generate ONLY ONE TV.` }
  ]}]);

  // Left = mirror of right
  console.log('Creating left by mirroring right...');
  await sharp(path.join(OUTPUT_DIR, 'tv-right-clean.png'))
    .flop()
    .toFile(path.join(OUTPUT_DIR, 'tv-left-clean.png'));
  console.log('  Done');

  console.log('\nAll TV views generated!');
}

main().catch(console.error);
