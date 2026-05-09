import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = process.cwd();
const src = path.join(root, 'assets', 'images', 'icon-source.svg');
const outIcon = path.join(root, 'assets', 'images', 'icon.png');
const outAdaptive = path.join(root, 'assets', 'images', 'adaptive-icon.png');
const outSplash = path.join(root, 'assets', 'images', 'splash-icon.png');
const outFavicon = path.join(root, 'assets', 'images', 'favicon.png');

const svg = await fs.readFile(src, 'utf8');

async function renderPng(filePath, size) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const pngData = r.render().asPng();
  await fs.writeFile(filePath, pngData);
}

await renderPng(outIcon, 1024);
await renderPng(outAdaptive, 1024);
await renderPng(outSplash, 512);
await renderPng(outFavicon, 256);

console.log('Generated:', {
  outIcon,
  outAdaptive,
  outSplash,
  outFavicon,
});

