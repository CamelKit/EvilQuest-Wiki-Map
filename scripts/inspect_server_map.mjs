import fs from 'fs';

const cookie = 'eq_device_id=06764c48-a99f-4566-8837-5e248dbf5811; mom_last_world=1; eq_preauth=p1.mvkclls7.67273f09-9fc4-49cc-b95e-c929c094fca5.Os_tH6VmmZNTlWDBXgXy82heZMIo11I3; eq_ws_session=15fc7798faf661427b907544999d43b72fa098507020a5c16a86e9d4d749c7c2';
const token = '3d37572d85b4b7345d1b65723c4fba41c65084e4b336e1c2647c5ecbcdae436e';

async function fetchJson(path) {
  const res = await fetch('https://memoriesofmagic.com' + path, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0',
      'Referer': 'https://memoriesofmagic.com/play?world=1',
      'authorization': 'Bearer ' + token,
      'Cookie': cookie
    }
  });
  return await res.json();
}

async function main() {
  console.log('Fetching map.json from server...');
  const mapData = await fetchJson('/maps/kcmap/map.json?chunked=1');
  const m = mapData.map;
  
  const cw = m.caveWalls;
  const tiles = Object.keys(cw.tiles).map(k => {
    const [x, z] = k.split(',').map(Number);
    return { x, z };
  });

  console.log('Total cave wall tiles:', tiles.length);

  // Group into clusters
  const clusters = [];
  tiles.forEach(t => {
    let found = false;
    for (const c of clusters) {
      if (Math.abs(c.cx - t.x) < 30 && Math.abs(c.cz - t.z) < 30) {
        c.tiles.push(t);
        c.cx = c.tiles.reduce((acc, v) => acc + v.x, 0) / c.tiles.length;
        c.cz = c.tiles.reduce((acc, v) => acc + v.z, 0) / c.tiles.length;
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push({ cx: t.x, cz: t.z, tiles: [t] });
    }
  });

  console.log('Clusters count:', clusters.length);
  clusters.sort((a,b) => b.tiles.length - a.tiles.length).forEach((c, i) => {
    const xs = c.tiles.map(t => t.x);
    const zs = c.tiles.map(t => t.z);
    console.log(`Cluster ${i+1}: count=${c.tiles.length}, center=(${Math.round(c.cx)}, ${Math.round(c.cz)}), bounds=[x: ${Math.min(...xs)}..${Math.max(...xs)}, z: ${Math.min(...zs)}..${Math.max(...zs)}]`);
  });

  // Save the full map.json and walls.json locally so we have permanent offline access!
  fs.writeFileSync('static/data/server_kcmap_map.json', JSON.stringify(mapData));
  console.log('Saved static/data/server_kcmap_map.json');

  const wallsData = await fetchJson('/maps/kcmap/walls.json');
  fs.writeFileSync('static/data/server_kcmap_walls.json', JSON.stringify(wallsData));
  console.log('Saved static/data/server_kcmap_walls.json');
}

main().catch(console.error);
