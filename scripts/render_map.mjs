import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const MAP_API_URL = 'https://memoriesofmagic.com/api/world-map';
const DEFAULT_MAP_CACHE = path.resolve('static/data/world_map.json');
const MAP_JSON_PATH = process.env.MAP_JSON_PATH || (fs.existsSync(DEFAULT_MAP_CACHE) ? DEFAULT_MAP_CACHE : null);
const TEXTURE_COLORS_PATH = path.resolve('static/data/texture_colors.json');
const OUTPUT_DIR = path.resolve('static/images');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function decodeRLE(rows, width, height, scale = 1) {
  const result = new Float32Array(width * height);
  for (let z = 0; z < height; z++) {
    const row = rows[z] ?? [];
    let x = 0;
    for (let idx = 0; idx + 1 < row.length && x < width; idx += 2) {
      const runLen = Math.min(width - x, Math.max(0, Math.trunc(row[idx])));
      const val = row[idx + 1] * scale;
      result.fill(val, z * width + x, z * width + x + runLen);
      x += runLen;
    }
  }
  return result;
}

// Function r from official code to merge collinear segments
function mergeCollinear(axis, fixed, list) {
  list.sort((a, b) => a - b);
  const n = list[0];
  if (n === undefined) return [];
  const res = [];
  let a = n, i = a + 1;
  for (let idx = 1; idx <= list.length; idx++) {
    const o = list[idx];
    if (o === i) {
      i++;
      continue;
    }
    res.push({ axis, fixed, start: a, end: i });
    a = o;
    i = o + 1;
  }
  return res;
}

function blendPixel(buf, idx, r, g, b, a) {
  if (a <= 0) return;
  if (a >= 255) {
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = 255;
    return;
  }
  const alpha = a / 255;
  const inv = 1 - alpha;
  buf[idx] = Math.round(r * alpha + buf[idx] * inv);
  buf[idx + 1] = Math.round(g * alpha + buf[idx + 1] * inv);
  buf[idx + 2] = Math.round(b * alpha + buf[idx + 2] * inv);
  buf[idx + 3] = 255;
}

function renderTerrainBase(worldMap, textureColors, scale = 2) {
  const mapData = worldMap.map;
  const width = mapData.width;
  const height = mapData.height;
  const terrain = mapData.terrain;
  const textureSurfaces = mapData.textureSurfaces ?? [];

  const outW = width * scale;
  const outH = height * scale;
  const buf = Buffer.alloc(outW * outH * 4).fill(0);

  // 1. Terrain Paint Rows & Palette
  const palette = (terrain?.palette ?? []).map(p => p.color);
  const paints = decodeRLE(terrain.paintRows, width, height);

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const pIdx = Math.round(paints[z * width + x]);
      const col = palette[pIdx] || [33, 110, 18];

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

  // 2. Terrain Relief Shading (Hill shading & 3D lighting)
  if (terrain?.heightRows) {
    const heights = decodeRLE(terrain.heightRows, width, height, terrain.heightScale ?? 1);
    const SQRT1_2 = Math.SQRT1_2;

    const getH = (x, z) => {
      const cx = clamp(x, 0, width - 1);
      const cz = clamp(z, 0, height - 1);
      const u = cz * width + cx;
      return paints[u] ? heights[u] : heights[z * width + x];
    };

    const calcSlope = (x, z, step, factor) => {
      const dh_dx = ((getH(x + step, z) - getH(x - step, z)) / (2 * step)) * factor;
      const dh_dz = ((getH(x, z + step) - getH(x, z - step)) / (2 * step)) * factor;
      return (0.5 * dh_dx + 0.5 * dh_dz + SQRT1_2) / Math.hypot(dh_dx, dh_dz, 1);
    };

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const u = z * width + x;
        const pal = terrain.palette[Math.round(paints[u])];
        if (!paints[u] || !pal || pal.water) continue;

        const p = 0.45 * calcSlope(x, z, 1, 1.25) + 0.35 * calcSlope(x, z, 2, 1) + 0.2 * calcSlope(x, z, 4, 0.75) - SQRT1_2;
        const isHighlight = p >= 0;
        const g = isHighlight ? Math.min(0.58, 0.85 * p) : Math.min(0.54, -0.72 * p);
        const alpha = Math.round(255 * g);

        const r = isHighlight ? 237 : 17;
        const gg = isHighlight ? 244 : 25;
        const b = isHighlight ? 250 : 38;

        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = x * scale + dx;
            const py = z * scale + dy;
            const idx = (py * outW + px) * 4;
            blendPixel(buf, idx, r, gg, b, alpha);
          }
        }
      }
    }
  }

  // 3. Water Outlines / Shorelines
  for (let t = 1; t < terrain.palette.length; t++) {
    const item = terrain.palette[t];
    if (!item?.water) continue;
    const isLava = item.water === 'lava';
    const strokeColor = isLava
      ? [255, 207, 92, Math.round(255 * 0.9)]
      : item.water === 'murky-still'
      ? [152, 164, 95, Math.round(255 * 0.55)]
      : [165, 204, 216, Math.round(255 * 0.65)];

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        if (Math.round(paints[z * width + x]) !== t) continue;

        const north = z > 0 && Math.round(paints[(z - 1) * width + x]) !== t;
        const south = z < height - 1 && Math.round(paints[(z + 1) * width + x]) !== t;
        const west = x > 0 && Math.round(paints[z * width + (x - 1)]) !== t;
        const east = x < width - 1 && Math.round(paints[z * width + (x + 1)]) !== t;

        if (north || south || west || east) {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              let onBorder = false;
              if (north && dy === 0) onBorder = true;
              if (south && dy === scale - 1) onBorder = true;
              if (west && dx === 0) onBorder = true;
              if (east && dx === scale - 1) onBorder = true;

              if (onBorder) {
                const px = x * scale + dx;
                const py = z * scale + dy;
                const idx = (py * outW + px) * 4;
                blendPixel(buf, idx, strokeColor[0], strokeColor[1], strokeColor[2], strokeColor[3]);
              }
            }
          }
        }
      }
    }
  }

  // 4. Biomes Overlay Tint
  const biomeDefs = new Map((mapData.biomes?.defs ?? []).map(b => [b.id, b]));
  for (const run of mapData.biomes?.runs ?? []) {
    const biome = biomeDefs.get(run.biomeId);
    if (!biome) continue;
    const col = biome.color.map(c => Math.round(clamp((255 * c - 128) * 1.32 + 128, 0, 255)));
    const alpha = Math.round(255 * 0.06);

    for (let rz = 0; rz < run.height; rz++) {
      for (let rx = 0; rx < run.width; rx++) {
        const tx = run.x + rx;
        const tz = run.z + rz;
        if (tx >= width || tz >= height) continue;

        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = tx * scale + dx;
            const py = tz * scale + dy;
            const idx = (py * outW + px) * 4;
            blendPixel(buf, idx, col[0], col[1], col[2], alpha);
          }
        }
      }
    }
  }

  // 5. Texture Surfaces (polygons for pads, plazas, floors)
  for (const surface of textureSurfaces) {
    const pts = surface.points;
    if (!pts || pts.length < 6) continue;
    const baseColor = textureColors[surface.textureId] ?? [120, 110, 95];
    const tint = surface.tint ?? [1, 1, 1];
    const col = [
      Math.round(clamp(baseColor[0] * (tint[0] ?? 1), 0, 255)),
      Math.round(clamp(baseColor[1] * (tint[1] ?? 1), 0, 255)),
      Math.round(clamp(baseColor[2] * (tint[2] ?? 1), 0, 255))
    ];

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const poly = [];
    for (let i = 0; i < pts.length; i += 2) {
      const px = pts[i] * scale;
      const pz = pts[i + 1] * scale;
      poly.push({ x: px, y: pz });
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }

    const startX = Math.max(0, Math.floor(minX));
    const endX = Math.min(outW - 1, Math.ceil(maxX));
    const startZ = Math.max(0, Math.floor(minZ));
    const endZ = Math.min(outH - 1, Math.ceil(maxZ));

    const numPts = poly.length;
    for (let py = startZ; py <= endZ; py++) {
      for (let px = startX; px <= endX; px++) {
        let inside = false;
        for (let i = 0, j = numPts - 1; i < numPts; j = i++) {
          const xi = poly[i].x, yi = poly[i].y;
          const xj = poly[j].x, yj = poly[j].y;
          const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        if (inside) {
          const idx = (py * outW + px) * 4;
          blendPixel(buf, idx, col[0], col[1], col[2], 230);
        }
      }
    }
  }

  return { buf, width: outW, height: outH };
}

function buildVectorSvg(mapData, scale = 2) {
  const width = mapData.width;
  const height = mapData.height;
  const outW = width * scale;
  const outH = height * scale;

  let svgContent = `<svg width="${outW}" height="${outH}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n`;

  // A. Cave Walls (Cliffs)
  const caveWalls = mapData.caveWalls;
  if (caveWalls?.runs?.length) {
    const defaultTan = [143, 107, 54];
    const cliffMap = new Map();

    // 1. Cave wall fills
    let fillSvg = '<g opacity="0.82">\n';
    for (const run of caveWalls.runs) {
      const palColor = caveWalls.palette?.[run.color] ?? defaultTan;
      const heightVal = run.height ?? 3;
      const factor = clamp(0.93 - 0.025 * Math.max(0, heightVal - 3), 0.78, 0.96);
      const r = Math.round(palColor[0] * factor);
      const g = Math.round(palColor[1] * factor);
      const b = Math.round(palColor[2] * factor);

      fillSvg += `  <rect x="${run.x}" y="${run.z}" width="${run.width}" height="1" fill="rgb(${r},${g},${b})" />\n`;

      for (let rx = 0; rx < run.width; rx++) {
        cliffMap.set(`${run.x + rx},${run.z}`, heightVal);
      }
    }
    fillSvg += '</g>\n';
    svgContent += fillSvg;

    // 2. Cave wall outer borders
    let outerD = '';
    for (const [key] of cliffMap) {
      const [cx, cz] = key.split(',').map(Number);
      if (!cliffMap.has(`${cx},${cz - 1}`)) outerD += `M${cx},${cz} H${cx + 1} `;
      if (!cliffMap.has(`${cx + 1},${cz}`)) outerD += `M${cx + 1},${cz} V${cz + 1} `;
      if (!cliffMap.has(`${cx},${cz + 1}`)) outerD += `M${cx},${cz + 1} H${cx + 1} `;
      if (!cliffMap.has(`${cx - 1},${cz}`)) outerD += `M${cx},${cz} V${cz + 1} `;
    }

    if (outerD) {
      svgContent += `  <path d="${outerD}" fill="none" stroke="rgba(75, 48, 20, 0.75)" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" />\n`;
    }

    // 3. Cave wall inner height step lines
    let innerD = '';
    for (const [key, hVal] of cliffMap) {
      const [r, a] = key.split(',').map(Number);
      const eastH = cliffMap.get(`${r + 1},${a}`);
      const southH = cliffMap.get(`${r},${a + 1}`);
      if (eastH !== undefined && Math.abs(eastH - hVal) > 0.01) {
        innerD += `M${r + 1},${a} V${a + 1} `;
      }
      if (southH !== undefined && Math.abs(southH - hVal) > 0.01) {
        innerD += `M${r},${a + 1} H${r + 1} `;
      }
    }

    if (innerD) {
      svgContent += `  <path d="${innerD}" fill="none" stroke="rgba(91, 61, 28, 0.45)" stroke-width="0.28" stroke-linecap="round" stroke-linejoin="round" />\n`;
    }
  }

  // B. Building & Town Walls
  const walls = (mapData.walls ?? []).filter(w => (w.floor ?? 0) === 0);
  const solidSet = new Set(walls.filter(w => w.edges === 15).map(w => `${w.x}:${w.z}`));
  const edgeSet = new Set();
  const solidRunsMap = new Map();

  for (const w of walls) {
    if (w.edges === 15) {
      const row = solidRunsMap.get(w.z);
      if (row) row.push(w.x);
      else solidRunsMap.set(w.z, [w.x]);

      if (!solidSet.has(`${w.x}:${w.z - 1}`)) edgeSet.add(`h:${w.z}:${w.x}`);
      if (!solidSet.has(`${w.x + 1}:${w.z}`)) edgeSet.add(`v:${w.x + 1}:${w.z}`);
      if (!solidSet.has(`${w.x}:${w.z + 1}`)) edgeSet.add(`h:${w.z + 1}:${w.x}`);
      if (!solidSet.has(`${w.x - 1}:${w.z}`)) edgeSet.add(`v:${w.x}:${w.z}`);
      continue;
    }
    if (w.edges & 1) edgeSet.add(`h:${w.z}:${w.x}`);
    if (w.edges & 2) edgeSet.add(`v:${w.x + 1}:${w.z}`);
    if (w.edges & 4) edgeSet.add(`h:${w.z + 1}:${w.x}`);
    if (w.edges & 8) edgeSet.add(`v:${w.x}:${w.z}`);
  }

  // Solid wall fill runs
  const fillRuns = [...solidRunsMap].flatMap(([z, xs]) =>
    mergeCollinear('horizontal', z, xs).map(t => ({ x: t.start, z, width: t.end - t.start }))
  );

  let wallFillSvg = '  <g fill="rgba(91, 61, 35, 0.92)">\n';
  for (const f of fillRuns) {
    wallFillSvg += `    <rect x="${f.x}" y="${f.z}" width="${f.width}" height="1" />\n`;
  }
  wallFillSvg += '  </g>\n';
  svgContent += wallFillSvg;

  // Segment grouping into continuous vector lines
  const horizMap = new Map(), vertMap = new Map();
  for (const item of edgeSet) {
    const [t, fixedStr, startStr] = item.split(':');
    const fixed = Number(fixedStr), start = Number(startStr);
    const targetMap = t === 'h' ? horizMap : vertMap;
    const list = targetMap.get(fixed);
    if (list) list.push(start);
    else targetMap.set(fixed, [start]);
  }

  const segments = [
    ...[...horizMap].flatMap(([z, xs]) => mergeCollinear('horizontal', z, xs)),
    ...[...vertMap].flatMap(([x, zs]) => mergeCollinear('vertical', x, zs))
  ];

  let wallLinesD = '';
  for (const seg of segments) {
    if (seg.axis === 'horizontal') {
      wallLinesD += `M${seg.start},${seg.fixed} H${seg.end} `;
    } else {
      wallLinesD += `M${seg.fixed},${seg.start} V${seg.end} `;
    }
  }

  // Double stroke: Dark outline behind + Warm light tan/gold stroke on top
  if (wallLinesD) {
    svgContent += `  <path d="${wallLinesD}" fill="none" stroke="rgba(24, 15, 9, 0.92)" stroke-width="1.0" stroke-linecap="round" stroke-linejoin="round" />\n`;
    svgContent += `  <path d="${wallLinesD}" fill="none" stroke="rgba(205, 168, 108, 0.96)" stroke-width="0.52" stroke-linecap="round" stroke-linejoin="round" />\n`;
  }

  svgContent += '</svg>';
  return svgContent;
}

async function renderFullMap(worldMap, textureColors, scale = 4) {
  const { buf, width, height } = renderTerrainBase(worldMap, textureColors, scale);
  const svgString = buildVectorSvg(worldMap.map, scale);

  const basePng = await sharp(buf, { raw: { width, height, channels: 4 } }).png().toBuffer();

  const finalImage = await sharp(basePng)
    .composite([{ input: Buffer.from(svgString), blend: 'over' }])
    .png()
    .toBuffer();

  return { buffer: finalImage, width, height };
}

async function loadMapData() {
  if (MAP_JSON_PATH && fs.existsSync(MAP_JSON_PATH)) {
    console.log(`Loading map data from ${MAP_JSON_PATH}...`);
    return JSON.parse(fs.readFileSync(MAP_JSON_PATH, 'utf-8'));
  }
  console.log(`Fetching live map data from ${MAP_API_URL}...`);
  const res = await fetch(MAP_API_URL, { headers: { 'User-Agent': 'EvilQuestWiki/1.0' } });
  if (!res.ok) throw new Error(`Failed to fetch map data: status ${res.status}`);
  const data = await res.json();
  fs.writeFileSync(DEFAULT_MAP_CACHE, JSON.stringify(data));
  return data;
}

async function main() {
  const rawData = await loadMapData();
  const textureColors = JSON.parse(fs.readFileSync(TEXTURE_COLORS_PATH, 'utf-8'));

  // 1. Render 4x Ultra-HD Map (3072x3840)
  console.log('Rendering 4x vector composited map...');
  const { buffer: buf4x, width: w4x, height: h4x } = await renderFullMap(rawData, textureColors, 4);
  const out4xWebp = path.join(OUTPUT_DIR, 'world_map_4x.webp');

  await sharp(buf4x)
    .webp({ quality: 92, effort: 5 })
    .toFile(out4xWebp);
  console.log(`Saved ${out4xWebp} (${(fs.statSync(out4xWebp).size / 1024).toFixed(1)} KB)`);

  // Default world_map.webp
  fs.copyFileSync(out4xWebp, path.join(OUTPUT_DIR, 'world_map.webp'));

  // 2. Also save 2x WebP (1536x1920) for lighter bandwidth / mobile fallback
  const out2xWebp = path.join(OUTPUT_DIR, 'world_map_2x.webp');
  await sharp(buf4x)
    .resize(w4x / 2, h4x / 2)
    .webp({ quality: 90, effort: 5 })
    .toFile(out2xWebp);
  console.log(`Saved ${out2xWebp} (${(fs.statSync(out2xWebp).size / 1024).toFixed(1)} KB)`);

  console.log('✅ 4x Ultra-HD vector map generation complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
