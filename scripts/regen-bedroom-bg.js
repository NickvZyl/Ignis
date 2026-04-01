const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

const API_KEY = fs.readFileSync(path.join(__dirname, '../web/.env.local'), 'utf8')
  .split(/\r?\n/).find(l => /OPENROUTER_API_KEY=/.test(l))
  ?.split('=').slice(1).join('=').trim();

const OUTPUT = path.join(__dirname, '../web/public/bedroom-bg.png');

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

function extractImage(data) {
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return null;
  return Buffer.from(url.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
}

async function main() {
  // Load room-bg as reference
  const roomRef = fs.readFileSync(path.join(__dirname, '../web/public/room-bg.png')).toString('base64');

  console.log('Generating bedroom background...');
  const data = await callOpenRouter([{ role: 'user', content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + roomRef } },
    { type: 'text', text: `This is the living room background for a cozy cottage pixel art game (Stardew Valley style, top-down 2D RPG perspective). Generate a BEDROOM version of this same room in EXACTLY the same art style, same camera angle, same proportions.

The bedroom should have:
- Same exposed wooden ceiling beams at the top
- Soft blue-gray wallpaper with a subtle small floral/diamond pattern (instead of the warm beige)
- Same style wood wainscoting/paneling on the lower wall, slightly cooler/darker tone
- Slightly darker hardwood floor, same plank style
- A cozy woven area rug on the floor (muted burgundy/brown tones)
- Same baseboard trim between wall and floor
- NO furniture, NO window — just the empty room background
- Same overall layout: ceiling at top, wallpaper section, wood paneling, floor at bottom
- Same pixel art resolution and style — warm, cozy, detailed

The image should be the same dimensions and aspect ratio as the reference. Generate ONLY the empty room background.` }
  ]}]);

  const buf = extractImage(data);
  if (!buf) {
    console.error('No image returned');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Write raw, then resize to match room-bg dimensions
  const rawPath = OUTPUT.replace('.png', '-raw.png');
  fs.writeFileSync(rawPath, buf);

  const roomMeta = await sharp(path.join(__dirname, '../web/public/room-bg.png')).metadata();
  console.log(`Room bg: ${roomMeta.width}x${roomMeta.height}`);

  const rawMeta = await sharp(rawPath).metadata();
  console.log(`Raw bedroom: ${rawMeta.width}x${rawMeta.height}`);

  // Resize to match room-bg aspect, using the scene aspect ratio (6:5)
  const targetW = roomMeta.width;
  const targetH = roomMeta.height;
  await sharp(rawPath)
    .resize(targetW, targetH, { fit: 'cover' })
    .png()
    .toFile(OUTPUT);

  console.log(`Bedroom bg saved: ${targetW}x${targetH} -> ${OUTPUT}`);

  // Cleanup
  try { fs.unlinkSync(rawPath); } catch {}
}

main().catch(console.error);
