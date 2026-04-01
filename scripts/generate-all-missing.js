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

async function generateFront(id, description) {
  const cleanPath = path.join(OUTPUT_DIR, `${id}-front-clean.png`);
  if (fs.existsSync(cleanPath)) {
    console.log(`  SKIP ${id} — already exists`);
    return true;
  }

  console.log(`  Generating ${id}...`);
  try {
    const data = await callOpenRouter([{
      role: 'user',
      content: `Create a pixel art sprite of a ${description}. Style: cozy cottage, warm brown wood tones, Stardew Valley / cozy RPG aesthetic. Pixel art game tile. The view should have a slight top-down angle as if viewed from above (diorama/dollhouse perspective). MUST have completely transparent background (PNG with alpha channel). No floor, no walls - just the isolated furniture piece. Viewed from the FRONT.`
    }]);

    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) {
      console.error(`  FAIL ${id} — no image in response`);
      return false;
    }

    const base64 = url.replace(/^data:image\/[^;]+;base64,/, '');
    const rawPath = path.join(OUTPUT_DIR, `${id}-front.png`);
    fs.writeFileSync(rawPath, Buffer.from(base64, 'base64'));
    await stripCheckerboard(rawPath, cleanPath);
    console.log(`  OK ${id}`);
    return true;
  } catch (e) {
    console.error(`  FAIL ${id}:`, e.message);
    return false;
  }
}

// All pieces that need hi-res sprites with descriptive prompts
const PIECES = [
  { id: 'desk', desc: 'a wooden desk with a computer setup — monitor on a stand, keyboard, mouse pad, and an office chair in front. Dark wood desk with warm tones' },
  { id: 'fireplace', desc: 'a stone fireplace with crackling fire. Grey/brown stone surround with a wooden mantle. Warm orange flames visible inside the firebox. A small rug in front. Cozy cottage hearth' },
  { id: 'fridge', desc: 'a retro-style refrigerator/fridge. Slightly rounded edges, cream/white color with silver handles. Two-door (freezer on top, fridge on bottom). Small feet at the base' },
  { id: 'clock_table', desc: 'a small wooden side table with an analog clock on top. Simple round clock face with a wooden or brass frame. Delicate wooden legs on the table' },
  { id: 'plant', desc: 'a potted houseplant in a terracotta pot. Medium-sized leafy green plant with several broad leaves, sitting in a simple clay pot with a saucer' },
  { id: 'tall_plant', desc: 'a tall indoor plant like a fiddle leaf fig in a large pot. Tall trunk with large green leaves at the top, in a decorative ceramic pot. Floor-standing height' },
  { id: 'succulent', desc: 'a tiny succulent plant in a small decorative pot. Compact rosette shape, pale green with pink tips, in a cute little ceramic pot' },
  { id: 'floor_lamp', desc: 'a standing floor lamp with a warm fabric shade. Tall thin dark metal or wooden pole with a cone-shaped warm-toned lampshade at the top, emitting soft light. Round base' },
  { id: 'wardrobe', desc: 'a large wooden wardrobe/armoire. Double doors with decorative panels, warm dark wood, small knob handles. Tall and imposing but cozy cottage style' },
  { id: 'bed', desc: 'a cozy wooden bed with headboard and footboard. Dark wood frame, white mattress visible, blue-grey blanket/duvet neatly folded, two white pillows. Warm cottage bedroom style' },
  { id: 'nightstand', desc: 'a small wooden bedside nightstand/table with a drawer. Simple cottage style, warm wood tones, small round knob on the drawer. A small lamp or candle on top' },
  { id: 'ceiling_light', desc: 'a hanging ceiling light/pendant lamp. Simple warm-toned glass or fabric shade hanging from a chain or cord. Cottage/rustic style, emitting warm glow' },
  { id: 'wall_sconce', desc: 'a wall-mounted sconce/light fixture. Small decorative bracket with a warm candle-like light or small shade. Brass or iron mounting, rustic cottage style' },
  { id: 'window', desc: 'a wooden-framed window with curtains. Four-pane window with warm brown wood frame, light curtains pulled to the sides, showing a bright view outside. Cottage style' },
  { id: 'bedroom_window', desc: 'a small wooden-framed bedroom window with curtains. Two-pane window with warm wood frame, soft blue-grey curtains. Cozy and intimate, cottage style' },
  { id: 'hallway_door', desc: 'a wooden interior door for a hallway. Simple paneled wooden door with a round doorknob. Warm brown wood, cottage style. Slightly ajar or closed' },
  { id: 'garden_gate', desc: 'a wooden garden gate/fence gate. Rustic picket-style wooden gate with a simple latch, part of a short fence section. Green vines growing on it. Outdoor cottage garden' },
  { id: 'farm_patch', desc: 'a farm garden crop patch with tilled soil rows. Neat rows of dark tilled earth with small green vegetable sprouts growing. Wooden border/edging around the patch. Cottage farm garden' },
  { id: 'cow_pen', desc: 'a small fenced cow pen/enclosure with a cute pixel art cow inside. Wooden post-and-rail fence, hay on the ground, a brown and white spotted cow. Farm cottage style' },
  { id: 'sheep_pen', desc: 'a small fenced sheep pen/enclosure with a fluffy pixel art sheep inside. Wooden post-and-rail fence, straw on the ground, a white woolly sheep. Farm cottage style' },
  { id: 'chicken_coop', desc: 'a small wooden chicken coop with chickens. Red/brown wooden coop structure with a small ramp, nesting boxes visible, and a couple of chickens pecking around. Farm cottage style' },
];

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\nGenerating front views for ${PIECES.length} furniture pieces...\n`);

  let ok = 0, fail = 0, skip = 0;
  for (const piece of PIECES) {
    const result = await generateFront(piece.id, piece.desc);
    if (result === true) {
      const cleanPath = path.join(OUTPUT_DIR, `${piece.id}-front-clean.png`);
      if (fs.existsSync(cleanPath)) {
        // Check if it was skipped (file existed before) or freshly generated
        ok++;
      }
    } else {
      fail++;
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nDone! ${ok} ok, ${fail} failed\n`);
}

main().catch(console.error);
