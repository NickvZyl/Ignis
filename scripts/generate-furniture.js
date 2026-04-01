const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

// Try web/.env.local first, fall back to root .env
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
    if (maxDiff < 10 && avg > 175) {
      pixels[i+3] = 0;
    }
  }

  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outputPath);
  console.log(`  Cleaned: ${outputPath}`);
}

async function generateFront(id, description) {
  console.log(`Generating FRONT view for ${id}...`);
  const data = await callOpenRouter([{
    role: 'user',
    content: `Create a pixel art sprite of a ${description}. Style: cozy cottage, warm brown wood tones, Stardew Valley / cozy RPG aesthetic. Pixel art game tile. The view should have a slight top-down angle as if viewed from above (diorama/dollhouse perspective). MUST have completely transparent background (PNG with alpha channel). No floor, no walls - just the isolated furniture piece. Viewed from the FRONT.`
  }]);

  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) { console.error('No image in response:', JSON.stringify(data).slice(0, 500)); return null; }

  const base64 = url.replace(/^data:image\/[^;]+;base64,/, '');
  const rawPath = path.join(OUTPUT_DIR, `${id}-front.png`);
  fs.writeFileSync(rawPath, Buffer.from(base64, 'base64'));
  console.log(`  Saved raw: ${rawPath}`);

  const cleanPath = path.join(OUTPUT_DIR, `${id}-front-clean.png`);
  await stripCheckerboard(rawPath, cleanPath);
  return rawPath;
}

async function generateView(id, direction, frontImagePath, description, extraRef) {
  console.log(`Generating ${direction.toUpperCase()} view for ${id}...`);
  const frontB64 = fs.readFileSync(frontImagePath).toString('base64');

  const content = [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontB64 } },
  ];

  if (extraRef) {
    const extraB64 = fs.readFileSync(extraRef).toString('base64');
    content.push({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + extraB64 } });
  }

  let text = `This is the FRONT view of a pixel art ${description}. Now generate the ${direction.toUpperCase()} view of this EXACT same piece. Same colors, same proportions, same pixel art style, same slight top-down angle. Transparent background (PNG alpha).`;
  if (direction === 'left' && extraRef) {
    text = `The first image is the FRONT view and the second is the RIGHT view of a pixel art ${description}. Now generate the LEFT view — it should be a mirror of the right side view. Same colors, same proportions, same pixel art style, same slight top-down angle. Transparent background (PNG alpha).`;
  }
  content.push({ type: 'text', text });

  const data = await callOpenRouter([{ role: 'user', content }]);

  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) { console.error(`No image for ${direction}:`, JSON.stringify(data).slice(0, 500)); return null; }

  const base64 = url.replace(/^data:image\/[^;]+;base64,/, '');
  const rawPath = path.join(OUTPUT_DIR, `${id}-${direction}.png`);
  fs.writeFileSync(rawPath, Buffer.from(base64, 'base64'));
  console.log(`  Saved raw: ${rawPath}`);

  const cleanPath = path.join(OUTPUT_DIR, `${id}-${direction}-clean.png`);
  await stripCheckerboard(rawPath, cleanPath);
  return rawPath;
}

async function generateAll(id, description) {
  console.log(`\n=== Generating ${id} ===\n`);

  const frontPath = await generateFront(id, description);
  if (!frontPath) { console.error('Failed to generate front view'); return; }

  // Generate back and right
  await generateView(id, 'back', frontPath, description);
  const rightPath = await generateView(id, 'right', frontPath, description);

  // Generate left using front + right as reference
  if (rightPath) {
    await generateView(id, 'left', frontPath, description, rightPath);
  } else {
    await generateView(id, 'left', frontPath, description);
  }

  console.log(`\nDone! All views for ${id} generated.\n`);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate couch
  await generateAll('couch',
    'cozy living room couch/sofa. A comfortable 3-seater sofa with plush cushions, warm fabric upholstery in a deep blue-grey color, dark wooden armrests and legs, and two accent throw pillows (one amber/gold, one rust/terracotta). Cottage-style, inviting and well-worn'
  );

  // Generate TV
  await generateAll('tv',
    'small retro CRT television on a wooden TV stand. A chunky old-school tube TV with a dark screen, sitting on a simple wooden stand/cabinet. The TV has a slightly rounded screen and visible buttons/knobs on the side. Cozy cottage aesthetic, warm wood tones on the stand'
  );
}

main().catch(console.error);
