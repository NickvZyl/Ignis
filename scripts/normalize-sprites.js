// Usage: node scripts/normalize-sprites.js [id1] [id2] ...
// If no IDs given, normalizes all furniture with hi-res sprites.
//
// Rules:
//   - Back is scaled to match front dimensions (contain + trim, no distortion)
//   - Side views: height = front width (preserves physical length)
//   - Left = mirror of right

const sharp = require('../web/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../web/public/furniture/');

async function normalize(id) {
  const frontPath = DIR + id + '-front-clean.png';
  if (!fs.existsSync(frontPath)) { console.log(id + ': no front sprite, skipping'); return; }

  const front = await sharp(frontPath).metadata();
  console.log(`\n${id} front: ${front.width}x${front.height}`);

  // Back → match front dimensions
  const backPath = DIR + id + '-back-clean.png';
  if (fs.existsSync(backPath)) {
    const back = await sharp(backPath).metadata();
    if (back.width !== front.width || back.height !== front.height) {
      await sharp(backPath)
        .resize(front.width, front.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toFile(backPath + '.tmp');
      // Trim padding
      const trimmed = await sharp(backPath + '.tmp').trim().toBuffer({ resolveWithObject: true });
      await sharp(trimmed.data).png().toFile(backPath);
      fs.unlinkSync(backPath + '.tmp');
      const final = await sharp(backPath).metadata();
      console.log(`  back: ${back.width}x${back.height} → ${final.width}x${final.height}`);
    } else {
      console.log(`  back: already ${back.width}x${back.height} ✓`);
    }
  }

  // Right → height = front width
  const rightPath = DIR + id + '-right-clean.png';
  if (fs.existsSync(rightPath)) {
    const right = await sharp(rightPath).metadata();
    const targetH = front.width;
    if (right.height !== targetH) {
      const scale = targetH / right.height;
      const targetW = Math.round(right.width * scale);
      await sharp(rightPath)
        .resize(targetW, targetH)
        .toFile(rightPath + '.tmp');
      fs.renameSync(rightPath + '.tmp', rightPath);
      console.log(`  right: ${right.width}x${right.height} → ${targetW}x${targetH}`);
    } else {
      console.log(`  right: already correct ✓`);
    }

    // Left = mirror of right
    const leftPath = DIR + id + '-left-clean.png';
    await sharp(rightPath).flop().toFile(leftPath + '.tmp');
    fs.renameSync(leftPath + '.tmp', leftPath);
    console.log(`  left: mirrored from right`);
  }
}

async function main() {
  let ids = process.argv.slice(2);

  if (ids.length === 0) {
    // Auto-detect: find all *-front-clean.png files
    ids = fs.readdirSync(DIR)
      .filter(f => f.endsWith('-front-clean.png'))
      .map(f => f.replace('-front-clean.png', ''));
    console.log('Auto-detected:', ids.join(', '));
  }

  for (const id of ids) await normalize(id);
  console.log('\nDone!');
}

main().catch(console.error);
