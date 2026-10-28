import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const DATA_DIR = path.resolve('static/data/maps/the_sultans_mine');
const OUTPUT_DIR = path.resolve('static/images/maps');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const meta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'meta.json'), 'utf8'));
const wallsData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'walls.json'), 'utf8'));

const width = meta.width;   // 256
const height = meta.height; // 192
const scale = 4;            // 4x resolution = 1024 x 768
const outW = width * scale;
const outH = height * scale;

// Load all chunks into a unified 256 x 192 tile grid
const groundGrid = new Array(width * height).fill('void');
const tilesDir = path.join(DATA_DIR, 'tiles');

// Chunk layout: 4 columns x 3 rows of 64x64 tiles
for (let cz = 0; cz < 3; cz++) {
  for (let cx = 0; cx < 4; cx++) {
    const chunkFile = path.join(tilesDir, `chunk_${cx}_${cz}.json`);
    if (!fs.existsSync(chunkFile)) continue;
    const chunk = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));
    for (const [key, val] of Object.entries(chunk)) {
      const [czOffset, cxOffset] = key.split(',').map(Number);
      const x = cx * 64 + cxOffset;
      const z = cz * 64 + czOffset;
      if (x >= 0 && x < width && z >= 0 && z < height) {
        groundGrid[z * width + x] = val.ground || 'dungeon-floor';
      }
    }
  }
}

// Exact in-game minimap sampled colors
const PALETTE = {
  void: [12, 10, 8],
  'dungeon-floor': [184, 138, 78],      // Warm earthy sandstone floor
  'dungeon-rock': [118, 82, 46],       // Dark cave rock
  'dungeon-torchlight': [184, 138, 78], // Same floor brown (torch bloom removed)
  dirt: [168, 128, 72],                 // Dirt patches
  path: [196, 160, 104],                // Light walkway / cart track
  water: [44, 88, 142]                  // Subterranean mineral water
};

const wallFillColor = [100, 68, 40];    // Cave wall brown
const wallBorderColor = [34, 22, 14];   // Dark brown wall boundary stroke
const caveRimColor = [34, 22, 14];      // Perimeter rock rim bordering void

// Create output buffer
const buf = Buffer.alloc(outW * outH * 4);

// 1. Fill ground tiles
for (let z = 0; z < height; z++) {
  for (let x = 0; x < width; x++) {
    const ground = groundGrid[z * width + x];
    const col = PALETTE[ground] || PALETTE['void'];

    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const px = x * scale + dx;
        const py = z * scale + dy;
        const idx = (py * outW + px) * 4;
        buf[idx] = col[0];
        buf[idx + 1] = col[1];
        buf[idx + 2] = col[2];
        buf[idx + 3] = 255;
      }
    }
  }
}

// 2. Cave perimeter rock rim bordering void
for (let z = 0; z < height; z++) {
  for (let x = 0; x < width; x++) {
    const ground = groundGrid[z * width + x];
    if (ground === 'void') continue;

    const northVoid = z === 0 || groundGrid[(z - 1) * width + x] === 'void';
    const southVoid = z === height - 1 || groundGrid[(z + 1) * width + x] === 'void';
    const westVoid = x === 0 || groundGrid[z * width + (x - 1)] === 'void';
    const eastVoid = x === width - 1 || groundGrid[z * width + (x + 1)] === 'void';

    if (northVoid || southVoid || westVoid || eastVoid) {
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          let isRim = false;
          if (northVoid && dy === 0) isRim = true;
          if (southVoid && dy === scale - 1) isRim = true;
          if (westVoid && dx === 0) isRim = true;
          if (eastVoid && dx === scale - 1) isRim = true;

          if (isRim) {
            const px = x * scale + dx;
            const py = z * scale + dy;
            const idx = (py * outW + px) * 4;
            buf[idx] = caveRimColor[0];
            buf[idx + 1] = caveRimColor[1];
            buf[idx + 2] = caveRimColor[2];
            buf[idx + 3] = 255;
          }
        }
      }
    }
  }
}

// 3. Draw authentic walls from walls.json
// Walls bitmask: 1=N, 2=E, 4=S, 8=W, 15=Solid
const walls = wallsData.walls || {};

for (const [key, mask] of Object.entries(walls)) {
  const [x, z] = key.split(',').map(Number);
  if (x < 0 || x >= width || z < 0 || z >= height) continue;

  const hasN = walls[x + ',' + (z - 1)] !== undefined;
  const hasS = walls[x + ',' + (z + 1)] !== undefined;
  const hasW = walls[(x - 1) + ',' + z] !== undefined;
  const hasE = walls[(x + 1) + ',' + z] !== undefined;

  for (let dy = 0; dy < scale; dy++) {
    for (let dx = 0; dx < scale; dx++) {
      const px = x * scale + dx;
      const py = z * scale + dy;
      const idx = (py * outW + px) * 4;

      let isBorder = false;
      if (mask === 15) {
        if (dy === 0 && !hasN) isBorder = true;
        if (dy === scale - 1 && !hasS) isBorder = true;
        if (dx === 0 && !hasW) isBorder = true;
        if (dx === scale - 1 && !hasE) isBorder = true;
      } else {
        if ((mask & 1) && dy === 0) isBorder = true;
        if ((mask & 4) && dy === scale - 1) isBorder = true;
        if ((mask & 8) && dx === 0) isBorder = true;
        if ((mask & 2) && dx === scale - 1) isBorder = true;
      }

      const col = isBorder ? wallBorderColor : wallFillColor;
      buf[idx] = col[0];
      buf[idx + 1] = col[1];
      buf[idx + 2] = col[2];
      buf[idx + 3] = 255;
    }
  }
}

// Save lossless WebP
const outputPath = path.join(OUTPUT_DIR, 'the_sultans_mine.webp');
await sharp(buf, {
  raw: {
    width: outW,
    height: outH,
    channels: 4
  }
})
  .webp({ lossless: true, quality: 100 })
  .toFile(outputPath);

console.log(`Saved pristine lossless map: ${outputPath} (${outW}x${outH})`);
