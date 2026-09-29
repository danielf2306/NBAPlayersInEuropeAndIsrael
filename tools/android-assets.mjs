// Renders the Android launcher icons and splash images from the app's SVG artwork.
// Usage: node tools/android-assets.mjs   (needs Playwright + Chromium)
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android/app/src/main/res');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BALL = (r, cx, cy) => `<g transform="translate(${cx - r} ${cy - r}) scale(${r / 32})"><circle cx="32" cy="32" r="30" fill="#f26b1d"/><g fill="none" stroke="#2b1508" stroke-width="2.6" stroke-linecap="round"><circle cx="32" cy="32" r="30"/><path d="M2 32h60M32 2v60M11 11c12 11 12 31 0 42M53 11c-12 11-12 31 0 42"/></g></g>`;
const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c1733"/><stop offset=".6" stop-color="#1d428a"/><stop offset="1" stop-color="#2b58b3"/></linearGradient></defs>`;

function svgFor(name, w, h) {
  const s = Math.min(w, h);
  if (name === 'ic_launcher_foreground.png') return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${BALL(s * 0.27, w / 2, h / 2)}</svg>`;
  if (name === 'ic_launcher_round.png') return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${GRAD}<circle cx="${w / 2}" cy="${h / 2}" r="${s / 2}" fill="url(#g)"/>${BALL(s * 0.3, w / 2, h / 2)}</svg>`;
  if (name === 'ic_launcher.png') return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${GRAD}<rect width="${w}" height="${h}" rx="${s * 0.22}" fill="url(#g)"/>${BALL(s * 0.3, w / 2, h / 2)}</svg>`;
  // splash
  const court = `<g fill="none" stroke="rgba(255,255,255,.08)" stroke-width="${s * 0.006}"><circle cx="${w / 2}" cy="${h / 2}" r="${s * 0.22}"/><line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${GRAD}<rect width="${w}" height="${h}" fill="url(#g)"/>${court}${BALL(s * 0.1, w / 2, h / 2)}</svg>`;
}

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/^(ic_launcher(_round|_foreground)?|splash)\.png$/.test(f)) files.push(p);
  }
})(res);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const file of files) {
  const buf = readFileSync(file);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const name = file.split('/').pop();
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgFor(name, w, h)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
await browser.close();
console.log(`rendered ${files.length} images`);
