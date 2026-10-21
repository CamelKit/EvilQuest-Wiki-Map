import fs from 'fs';
import path from 'path';

const ICONS_DIR = path.resolve('static/icons');
const SPRITES_DIR = path.resolve('static/sprites');
fs.mkdirSync(ICONS_DIR, { recursive: true });
fs.mkdirSync(SPRITES_DIR, { recursive: true });

const sprites = [
  { url: 'https://memoriesofmagic.com/world-map/ore-sprites.png?v=1', file: path.join(SPRITES_DIR, 'ore-sprites.png') },
  { url: 'https://memoriesofmagic.com/world-map/tree-sprites.png?v=1', file: path.join(SPRITES_DIR, 'tree-sprites.png') }
];

const data = JSON.parse(fs.readFileSync('static/data/nodes.json', 'utf-8'));
const icons = new Set(data.pois.map(p => p.icon).filter(Boolean));

async function download(url, dest) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'EvilQuestWiki/1.0' } });
    if (!res.ok) {
      console.error(`Failed to download ${url}: status ${res.status}`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`Saved ${path.basename(dest)} (${(buf.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`Error fetching ${url}:`, err.message);
  }
}

async function run() {
  console.log('Downloading sprites...');
  for (const s of sprites) {
    await download(s.url, s.file);
  }
  console.log('Downloading POI icons...');
  for (const icon of icons) {
    const url = 'https://memoriesofmagic.com/minimap/icons/' + encodeURIComponent(icon);
    const dest = path.join(ICONS_DIR, icon);
    await download(url, dest);
  }
  console.log('Done downloading assets!');
}

run();
