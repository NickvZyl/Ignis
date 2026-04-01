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
    const body = JSON.stringify({ model: 'google/gemini-3.1-flash-image-preview', messages, max_tokens: 4096 });
    const req = https.request({
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function stripAndTrim(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const avg = (r + g + b) / 3;
    const maxDiff = Math.max(Math.abs(r - avg), Math.abs(g - avg), Math.abs(b - avg));
    if (maxDiff < 10 && avg > 175) pixels[i + 3] = 0;
  }
  const stripped = await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toBuffer();
  const trimmed = await sharp(stripped).trim().toBuffer({ resolveWithObject: true });
  await sharp(trimmed.data).png().toFile(outputPath);
  console.log(`  ${path.basename(outputPath)}: ${trimmed.info.width}x${trimmed.info.height}`);
  return trimmed.info;
}

function extractImage(data) {
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return null;
  return Buffer.from(url.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
}

async function generateDoor(id, description, backDescription) {
  console.log(`\n=== ${id} ===`);

  // Front view
  console.log('Generating front...');
  let data = await callOpenRouter([{
    role: 'user',
    content: `Create a pixel art sprite of ${description}. Top-down 2D RPG game perspective (like Stardew Valley) — camera is slightly above looking down. The door is set into a wall, viewed from the FRONT. You should see the door face with panels, handle/knob, and the door frame. The door should be a standard rectangular proportion — roughly twice as tall as it is wide. Cozy cottage pixel art style, warm wood tones. Transparent PNG background, no floor, no extra walls. The door should fill the entire image canvas — draw it LARGE. Generate ONLY ONE door.`
  }]);
  let buf = extractImage(data);
  if (!buf) { console.error('No front image'); return; }
  const frontRaw = path.join(OUTPUT_DIR, `${id}-front.png`);
  fs.writeFileSync(frontRaw, buf);
  const frontInfo = await stripAndTrim(frontRaw, path.join(OUTPUT_DIR, `${id}-front-clean.png`));

  // Back view
  console.log('Generating back...');
  const frontB64 = fs.readFileSync(frontRaw).toString('base64');
  data = await callOpenRouter([{ role: 'user', content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontB64 } },
    { type: 'text', text: `This is the FRONT view of a pixel art door for a top-down 2D RPG game. Now generate the BACK view of this EXACT same door. ${backDescription} Same proportions, same pixel art style, same size — the door must fill the entire canvas just like the reference. Transparent PNG background. Generate ONLY ONE door.` }
  ]}]);
  buf = extractImage(data);
  if (buf) {
    const backRaw = path.join(OUTPUT_DIR, `${id}-back.png`);
    fs.writeFileSync(backRaw, buf);
    await stripAndTrim(backRaw, path.join(OUTPUT_DIR, `${id}-back-clean.png`));

    // Normalize back to match front dimensions
    const front = await sharp(path.join(OUTPUT_DIR, `${id}-front-clean.png`)).metadata();
    const back = await sharp(path.join(OUTPUT_DIR, `${id}-back-clean.png`)).metadata();
    if (back.width !== front.width || back.height !== front.height) {
      await sharp(path.join(OUTPUT_DIR, `${id}-back-clean.png`))
        .resize(front.width, front.height, { fit: 'fill' })
        .toFile(path.join(OUTPUT_DIR, `${id}-back-clean.tmp.png`));
      fs.renameSync(path.join(OUTPUT_DIR, `${id}-back-clean.tmp.png`), path.join(OUTPUT_DIR, `${id}-back-clean.png`));
      console.log(`  back normalized to ${front.width}x${front.height}`);
    }
  }

  console.log(`${id} done!`);
}

async function main() {
  await generateDoor(
    'front_door',
    'a sturdy exterior front door with a solid wooden construction, darker rich brown wood, brass door knob and keyhole, two recessed panels (upper and lower), a thick wooden door frame, and a small stone threshold/step at the bottom with a green welcome mat',
    'Show the interior side of the front door — lighter wood, simple flat panels, a deadbolt lock and brass knob visible from inside. A small threshold at the bottom.'
  );

  await generateDoor(
    'bedroom_door',
    'an interior bedroom door with lighter warm wood, a simple brass round doorknob, two recessed panels (upper and lower), a clean wooden door frame. Lighter and more delicate than an exterior door — interior cottage style',
    'Show the other side of the bedroom door — same light wood, simple flat panels, brass knob. Interior hallway side.'
  );

  console.log('\nAll doors generated!');
}

main().catch(console.error);
