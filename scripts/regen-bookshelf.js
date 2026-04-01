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

function extractImage(data) {
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return null;
  return Buffer.from(url.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
}

async function removeMagenta(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r > 150 && g < 100 && b > 150 && (r - g) > 80 && (b - g) > 80) {
      pixels[i + 3] = 0;
    }
  }
  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toFile(outputPath);
}

async function processView(id, view, buf, frontMeta) {
  const rawPath = path.join(OUTPUT_DIR, `${id}-${view}-raw.png`);
  const strippedPath = path.join(OUTPUT_DIR, `${id}-${view}-stripped.png`);
  const cleanPath = path.join(OUTPUT_DIR, `${id}-${view}-clean.png`);

  fs.writeFileSync(rawPath, buf);
  await removeMagenta(rawPath, strippedPath);
  const trimmed = await sharp(strippedPath).trim().toBuffer({ resolveWithObject: true });

  if (frontMeta && view !== 'front') {
    // Normalize to front dimensions
    await sharp(trimmed.data).resize(frontMeta.width, frontMeta.height, { fit: 'fill' }).toFile(cleanPath);
    console.log(`  ${view}: ${trimmed.info.width}x${trimmed.info.height} -> ${frontMeta.width}x${frontMeta.height}`);
  } else {
    await sharp(trimmed.data).png().toFile(cleanPath);
    console.log(`  ${view}: ${trimmed.info.width}x${trimmed.info.height}`);
  }

  // Cleanup
  try { fs.unlinkSync(rawPath); } catch {}
  try { fs.unlinkSync(strippedPath); } catch {}
  return cleanPath;
}

const DESC = 'a tall wooden bookshelf filled with colorful books. Dark warm brown wood frame, 3-4 shelves packed with books of various sizes and colors (red, blue, green, gold, purple). Some books leaning, a small plant or trinket on top. Cozy cottage pixel art style, Stardew Valley aesthetic.';

async function main() {
  // Front
  console.log('Generating bookshelf front...');
  let data = await callOpenRouter([{
    role: 'user',
    content: `Create a pixel art sprite of ${DESC} Viewed from the FRONT, top-down 2D RPG perspective (camera slightly above). Use SOLID BRIGHT MAGENTA (#FF00FF) background. The bookshelf should fill the entire canvas, drawn LARGE. Generate ONLY ONE bookshelf.`
  }]);
  let buf = extractImage(data);
  if (!buf) { console.error('No front image'); return; }
  const frontClean = await processView('bookshelf', 'front', buf, null);
  const frontMeta = await sharp(frontClean).metadata();

  // Back
  console.log('Generating bookshelf back...');
  const frontCleanB64 = fs.readFileSync(frontClean).toString('base64');
  data = await callOpenRouter([{ role: 'user', content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontCleanB64 } },
    { type: 'text', text: `This is the FRONT view of a pixel art bookshelf. Generate the BACK view — you see the plain wooden back panel, maybe some structural bracing. Same size, same proportions. Use SOLID BRIGHT MAGENTA (#FF00FF) background. Generate ONLY ONE bookshelf.` }
  ]}]);
  buf = extractImage(data);
  if (buf) await processView('bookshelf', 'back', buf, frontMeta);

  // Right side
  console.log('Generating bookshelf right...');
  data = await callOpenRouter([{ role: 'user', content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + frontCleanB64 } },
    { type: 'text', text: `This is the FRONT view of a pixel art bookshelf for a top-down 2D RPG game. Generate the RIGHT SIDE view. The camera is slightly above. You should see:
- The thin side profile of the bookshelf
- The edges of the shelves visible
- Some book spines peeking out from the side
- The bookshelf should form a RECTANGULAR shape, taller than wide, with edges parallel to screen edges (NOT diagonal)
Use SOLID BRIGHT MAGENTA (#FF00FF) background. Generate ONLY ONE bookshelf.` }
  ]}]);
  buf = extractImage(data);
  if (buf) {
    await processView('bookshelf', 'right', buf, null);
    // Normalize side: height should match front width
    const right = await sharp(path.join(OUTPUT_DIR, 'bookshelf-right-clean.png')).metadata();
    const targetH = frontMeta.width;
    const scale = targetH / right.height;
    const targetW = Math.round(right.width * scale);
    await sharp(path.join(OUTPUT_DIR, 'bookshelf-right-clean.png'))
      .resize(targetW, targetH)
      .toFile(path.join(OUTPUT_DIR, 'bookshelf-right-clean.tmp.png'));
    fs.renameSync(path.join(OUTPUT_DIR, 'bookshelf-right-clean.tmp.png'), path.join(OUTPUT_DIR, 'bookshelf-right-clean.png'));
    console.log(`  right normalized: ${targetW}x${targetH}`);

    // Left = mirror of right
    await sharp(path.join(OUTPUT_DIR, 'bookshelf-right-clean.png')).flop()
      .toFile(path.join(OUTPUT_DIR, 'bookshelf-left-clean.png'));
    console.log('  left: mirrored from right');
  }

  console.log('\nAll bookshelf views generated!');
}

main().catch(console.error);
