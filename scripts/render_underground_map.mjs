import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const WIDTH = 768;
const HEIGHT = 960;
const OUTPUT_DIR = path.resolve('static/images');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Pseudo-random noise generator with seed
function createNoise(seed = 42) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Generate subterranean cave terrain
function renderUndergroundTerrain(scale = 2) {
  const outW = WIDTH * scale;
  const outH = HEIGHT * scale;
  const buf = Buffer.alloc(outW * outH * 4);

  const noise = createNoise(12345);

  // 1. Bedrock void background: Solid dark basalt stone void
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const idx = (y * outW + x) * 4;
      buf[idx] = 12;     // R
      buf[idx + 1] = 14; // G
      buf[idx + 2] = 18; // B
      buf[idx + 3] = 255;
    }
  }

  // 2. Define Cave Rooms and Tunnels
  // Rooms: { cx, cz, rx, rz, type: 'sewer'|'mine'|'swamp'|'dungeon'|'tomb', color, floorColor }
  const chambers = [
    // --- Wibergis Sewers (around 625, 327) ---
    { cx: 625, cz: 327, rx: 18, rz: 14, type: 'sewer', color: [45, 52, 58], border: [28, 34, 38] },
    { cx: 605, cz: 327, rx: 14, rz: 10, type: 'sewer', color: [42, 48, 54], border: [26, 30, 34] },
    { cx: 645, cz: 327, rx: 12, rz: 12, type: 'sewer', color: [42, 48, 54], border: [26, 30, 34] },
    { cx: 625, cz: 305, rx: 10, rz: 16, type: 'sewer', color: [40, 46, 52], border: [25, 29, 33] },
    { cx: 625, cz: 348, rx: 12, rz: 14, type: 'sewer', color: [40, 46, 52], border: [25, 29, 33] },
    { cx: 640, cz: 355, rx: 14, rz: 12, type: 'sewer', color: [38, 44, 50], border: [24, 28, 32] },

    // --- West & North Swamp Caverns (around 471, 443 & 492, 424) ---
    { cx: 471, cz: 443, rx: 15, rz: 13, type: 'swamp', color: [42, 48, 38], border: [28, 32, 24] },
    { cx: 492, cz: 424, rx: 14, rz: 15, type: 'swamp', color: [40, 46, 36], border: [26, 30, 22] },
    { cx: 480, cz: 433, rx: 12, rz: 10, type: 'swamp', color: [44, 50, 40], border: [29, 33, 25] },
    { cx: 505, cz: 430, rx: 16, rz: 12, type: 'swamp', color: [38, 44, 34], border: [25, 29, 21] },
    { cx: 460, cz: 455, rx: 12, rz: 14, type: 'swamp', color: [36, 42, 32], border: [24, 28, 20] },

    // --- Castle Mud Dungeon & Prison (around 513, 599) ---
    { cx: 513, cz: 599, rx: 16, rz: 16, type: 'dungeon', color: [48, 46, 44], border: [32, 30, 28] },
    { cx: 498, cz: 599, rx: 10, rz: 12, type: 'dungeon', color: [44, 42, 40], border: [29, 27, 25] },
    { cx: 528, cz: 599, rx: 12, rz: 14, type: 'dungeon', color: [45, 43, 41], border: [30, 28, 26] },
    { cx: 513, cz: 618, rx: 14, rz: 12, type: 'dungeon', color: [42, 40, 38], border: [28, 26, 24] },
    { cx: 513, cz: 580, rx: 12, rz: 10, type: 'dungeon', color: [44, 42, 40], border: [29, 27, 25] },

    // --- Desert Mountain Mines & Rail Network (around 459, 658 & 469, 804) ---
    { cx: 459, cz: 658, rx: 15, rz: 15, type: 'mine', color: [58, 48, 38], border: [38, 30, 22] },
    { cx: 442, cz: 662, rx: 18, rz: 10, type: 'mine', color: [54, 44, 34], border: [35, 27, 20] },
    { cx: 430, cz: 665, rx: 12, rz: 12, type: 'mine', color: [52, 42, 32], border: [34, 26, 19] },
    { cx: 469, cz: 804, rx: 20, rz: 16, type: 'mine', color: [60, 48, 36], border: [40, 30, 22] },
    { cx: 472, cz: 790, rx: 16, rz: 14, type: 'mine', color: [56, 45, 34], border: [36, 28, 20] },
    { cx: 455, cz: 795, rx: 14, rz: 12, type: 'mine', color: [52, 42, 32], border: [34, 26, 18] },
    { cx: 485, cz: 808, rx: 15, rz: 14, type: 'mine', color: [54, 44, 33], border: [35, 27, 19] },

    // --- Ancient Desert Tomb / Catacombs (around 341, 709) ---
    { cx: 341, cz: 709, rx: 18, rz: 18, type: 'tomb', color: [62, 52, 38], border: [42, 34, 24] },
    { cx: 320, cz: 709, rx: 12, rz: 12, type: 'tomb', color: [58, 48, 35], border: [39, 31, 22] },
    { cx: 360, cz: 709, rx: 14, rz: 14, type: 'tomb', color: [58, 48, 35], border: [39, 31, 22] },
    { cx: 341, cz: 690, rx: 12, rz: 14, type: 'tomb', color: [56, 46, 33], border: [37, 29, 20] },
    { cx: 341, cz: 730, rx: 14, rz: 14, type: 'tomb', color: [56, 46, 33], border: [37, 29, 20] },

    // --- Mountain Cavern (around 247, 544) ---
    { cx: 247, cz: 544, rx: 18, rz: 16, type: 'cave', color: [46, 48, 52], border: [30, 32, 35] },
    { cx: 230, cz: 540, rx: 14, rz: 12, type: 'cave', color: [42, 44, 48], border: [28, 29, 32] },
    { cx: 260, cz: 550, rx: 12, rz: 14, type: 'cave', color: [42, 44, 48], border: [28, 29, 32] }
  ];

  // Connecting Tunnels: [{ x1, z1, x2, z2, width, color, border }]
  const tunnels = [
    // Wibergis Sewers network
    { x1: 625, z1: 305, x2: 625, z2: 355, width: 5, color: [45, 52, 58], border: [28, 34, 38] },
    { x1: 605, z1: 327, x2: 645, z2: 327, width: 5, color: [45, 52, 58], border: [28, 34, 38] },
    { x1: 625, z1: 348, x2: 640, z2: 355, width: 4, color: [40, 46, 52], border: [26, 30, 34] },

    // Swamp caverns network
    { x1: 471, z1: 443, x2: 492, z2: 424, width: 6, color: [42, 48, 38], border: [28, 32, 24] },
    { x1: 492, z1: 424, x2: 505, z2: 430, width: 5, color: [40, 46, 36], border: [26, 30, 22] },
    { x1: 471, z1: 443, x2: 460, z2: 455, width: 4, color: [38, 44, 34], border: [25, 29, 21] },

    // Castle Mud dungeon network
    { x1: 498, z1: 599, x2: 528, z2: 599, width: 5, color: [48, 46, 44], border: [32, 30, 28] },
    { x1: 513, z1: 580, x2: 513, z2: 618, width: 5, color: [48, 46, 44], border: [32, 30, 28] },

    // Mines & Rail network
    { x1: 459, z1: 658, x2: 430, z2: 665, width: 6, color: [58, 48, 38], border: [38, 30, 22] },
    { x1: 455, z1: 795, x2: 485, z2: 808, width: 6, color: [58, 48, 38], border: [38, 30, 22] },
    { x1: 472, z1: 790, x2: 469, z2: 804, width: 7, color: [60, 48, 36], border: [40, 30, 22] },

    // Tomb Catacombs network
    { x1: 320, z1: 709, x2: 360, z2: 709, width: 6, color: [60, 50, 36], border: [40, 32, 22] },
    { x1: 341, z1: 690, x2: 341, z2: 730, width: 6, color: [60, 50, 36], border: [40, 32, 22] },

    // Mountain Cavern network
    { x1: 230, z1: 540, x2: 260, z2: 550, width: 6, color: [46, 48, 52], border: [30, 32, 35] }
  ];

  // Helper: Paint floor tile with edge falloff
  const isFloor = new Uint8Array(outW * outH);
  const floorColors = new Uint8ClampedArray(outW * outH * 3);

  // Rasterize tunnels
  for (const t of tunnels) {
    const p1x = t.x1 * scale;
    const p1z = t.z1 * scale;
    const p2x = t.x2 * scale;
    const p2z = t.z2 * scale;
    const hw = (t.width * scale) / 2;

    const minX = Math.floor(Math.min(p1x, p2x) - hw - 2);
    const maxX = Math.ceil(Math.max(p1x, p2x) + hw + 2);
    const minZ = Math.floor(Math.min(p1z, p2z) - hw - 2);
    const maxZ = Math.ceil(Math.max(p1z, p2z) + hw + 2);

    const dx = p2x - p1x;
    const dz = p2z - p1z;
    const lenSq = dx * dx + dz * dz || 1;

    for (let py = Math.max(0, minZ); py <= Math.min(outH - 1, maxZ); py++) {
      for (let px = Math.max(0, minX); px <= Math.min(outW - 1, maxX); px++) {
        // Point to segment distance
        const tVal = clamp(((px - p1x) * dx + (py - p1z) * dz) / lenSq, 0, 1);
        const projX = p1x + tVal * dx;
        const projZ = p1z + tVal * dz;
        const dist = Math.hypot(px - projX, py - projZ);

        if (dist <= hw) {
          const idx = py * outW + px;
          isFloor[idx] = 1;
          floorColors[idx * 3] = t.color[0];
          floorColors[idx * 3 + 1] = t.color[1];
          floorColors[idx * 3 + 2] = t.color[2];
        }
      }
    }
  }

  // Rasterize chambers
  for (const c of chambers) {
    const cx = c.cx * scale;
    const cz = c.cz * scale;
    const rx = c.rx * scale;
    const rz = c.rz * scale;

    const minX = Math.floor(cx - rx - 2);
    const maxX = Math.ceil(cx + rx + 2);
    const minZ = Math.floor(cz - rz - 2);
    const maxZ = Math.ceil(cz + rz + 2);

    for (let py = Math.max(0, minZ); py <= Math.min(outH - 1, maxZ); py++) {
      for (let px = Math.max(0, minX); px <= Math.min(outW - 1, maxX); px++) {
        const nx = (px - cx) / rx;
        const nz = (py - cz) / rz;
        const dSq = nx * nx + nz * nz;

        if (dSq <= 1.0) {
          const idx = py * outW + px;
          isFloor[idx] = 1;
          floorColors[idx * 3] = c.color[0];
          floorColors[idx * 3 + 1] = c.color[1];
          floorColors[idx * 3 + 2] = c.color[2];
        }
      }
    }
  }

  // 3. Render Walls & Isometric Shading
  // For each floor pixel, paint floor color + subtle texture.
  // For border pixels (adjacent to unexcavated void), render rock wall bevel.
  for (let y = 1; y < outH - 1; y++) {
    for (let x = 1; x < outW - 1; x++) {
      const idx = y * outW + x;
      const bIdx = idx * 4;

      if (isFloor[idx]) {
        // Floor tile
        const r = floorColors[idx * 3];
        const g = floorColors[idx * 3 + 1];
        const b = floorColors[idx * 3 + 2];

        // Clean solid floor tile
        buf[bIdx] = r;
        buf[bIdx + 1] = g;
        buf[bIdx + 2] = b;
        buf[bIdx + 3] = 255;
      } else {
        // Check if adjacent to floor (wall boundary)
        const hasFloorNeighbour =
          isFloor[idx - 1] ||
          isFloor[idx + 1] ||
          isFloor[idx - outW] ||
          isFloor[idx + outW];

        if (hasFloorNeighbour) {
          // Rock wall rim / bevel
          const isTopWall = isFloor[idx + outW]; // Floor is south -> this is a north wall
          if (isTopWall) {
            // Bright highlight rim
            buf[bIdx] = 78;
            buf[bIdx + 1] = 68;
            buf[bIdx + 2] = 58;
          } else {
            // Dark shadow wall
            buf[bIdx] = 26;
            buf[bIdx + 1] = 24;
            buf[bIdx + 2] = 28;
          }
          buf[bIdx + 3] = 255;
        }
      }
    }
  }

  // 4. Sewer canals in Wibergis Sewers (water streams down center)
  const sewerCanals = [
    { x1: 605, z1: 327, x2: 645, z2: 327, w: 2 },
    { x1: 625, z1: 305, x2: 625, z2: 355, w: 2 }
  ];
  for (const sc of sewerCanals) {
    const p1x = sc.x1 * scale;
    const p1z = sc.z1 * scale;
    const p2x = sc.x2 * scale;
    const p2z = sc.z2 * scale;
    const hw = (sc.w * scale) / 2;

    const minX = Math.floor(Math.min(p1x, p2x) - hw);
    const maxX = Math.ceil(Math.max(p1x, p2x) + hw);
    const minZ = Math.floor(Math.min(p1z, p2z) - hw);
    const maxZ = Math.ceil(Math.max(p1z, p2z) + hw);

    const dx = p2x - p1x;
    const dz = p2z - p1z;
    const lenSq = dx * dx + dz * dz || 1;

    for (let py = Math.max(0, minZ); py <= Math.min(outH - 1, maxZ); py++) {
      for (let px = Math.max(0, minX); px <= Math.min(outW - 1, maxX); px++) {
        const tVal = clamp(((px - p1x) * dx + (py - p1z) * dz) / lenSq, 0, 1);
        const projX = p1x + tVal * dx;
        const projZ = p1z + tVal * dz;
        const dist = Math.hypot(px - projX, py - projZ);

        if (dist <= hw) {
          const idx = (py * outW + px) * 4;
          buf[idx] = 16;     // Deep murky green/teal sewer water
          buf[idx + 1] = 42;
          buf[idx + 2] = 48;
          buf[idx + 3] = 255;
        }
      }
    }
  }

  // 5. Ambient Torch & Luminescent Glows
  const lights = [
    { x: 625, z: 327, r: 25, color: [245, 175, 75], intensity: 0.18 },
    { x: 471, z: 443, r: 22, color: [80, 200, 120], intensity: 0.15 },
    { x: 492, z: 424, r: 20, color: [80, 200, 120], intensity: 0.15 },
    { x: 513, z: 599, r: 24, color: [240, 160, 60], intensity: 0.20 },
    { x: 459, z: 658, r: 26, color: [250, 180, 70], intensity: 0.22 },
    { x: 469, z: 804, r: 30, color: [250, 180, 70], intensity: 0.22 },
    { x: 341, z: 709, r: 28, color: [230, 190, 80], intensity: 0.20 },
    { x: 247, z: 544, r: 22, color: [100, 180, 240], intensity: 0.15 }
  ];

  for (const l of lights) {
    const lx = l.x * scale;
    const lz = l.z * scale;
    const rad = l.r * scale;

    const minX = Math.max(0, Math.floor(lx - rad));
    const maxX = Math.min(outW - 1, Math.ceil(lx + rad));
    const minZ = Math.max(0, Math.floor(lz - rad));
    const maxZ = Math.min(outH - 1, Math.ceil(lz + rad));

    for (let py = minZ; py <= maxZ; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dist = Math.hypot(px - lx, py - lz);
        if (dist < rad) {
          const factor = (1 - dist / rad) * l.intensity;
          const idx = (py * outW + px) * 4;
          buf[idx] = clamp(buf[idx] + l.color[0] * factor, 0, 255);
          buf[idx + 1] = clamp(buf[idx + 1] + l.color[1] * factor, 0, 255);
          buf[idx + 2] = clamp(buf[idx + 2] + l.color[2] * factor, 0, 255);
        }
      }
    }
  }

  return { buf, width: outW, height: outH };
}

async function main() {
  console.log('Rendering underground cave map images...');

  // 4x Ultra-HD WebP (3072x3840)
  const res4 = renderUndergroundTerrain(4);
  const out4 = path.join(OUTPUT_DIR, 'underground_map_4x.webp');
  await sharp(res4.buf, { raw: { width: res4.width, height: res4.height, channels: 4 } })
    .webp({ lossless: true, effort: 4 })
    .toFile(out4);
  console.log(`Saved ${out4} (${(fs.statSync(out4).size / 1024).toFixed(1)} KB) [Lossless 4x]`);

  // Default underground_map.webp set to 4x Ultra-HD
  fs.copyFileSync(out4, path.join(OUTPUT_DIR, 'underground_map.webp'));

  // 2x WebP (1536x1920)
  const res2 = renderUndergroundTerrain(2);
  const out2 = path.join(OUTPUT_DIR, 'underground_map_2x.webp');
  await sharp(res2.buf, { raw: { width: res2.width, height: res2.height, channels: 4 } })
    .webp({ lossless: true, effort: 4 })
    .toFile(out2);
  console.log(`Saved ${out2} (${(fs.statSync(out2).size / 1024).toFixed(1)} KB) [Lossless 2x]`);

  console.log('Underground map rendering completed successfully!');
}

main().catch(console.error);
