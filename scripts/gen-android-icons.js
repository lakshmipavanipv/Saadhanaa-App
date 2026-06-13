/**
 * gen-android-icons.js — regenerate the NATIVE Android launcher webp mipmaps
 * so the home-screen icon matches the in-app BodySoulLogo.
 *
 * These are the files Android actually renders (referenced by
 * mipmap-anydpi-v26/ic_launcher.xml). Editing assets/images/*.png does NOT
 * update them on a bare project — this script does.
 *
 * Run:  node scripts/gen-android-icons.js
 */
const sharp = require('sharp');
const path = require('path');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const NAVY = '#0a0e27';
const INF_PATH =
  'M 50 65 C 50 30, 90 30, 140 65 C 190 100, 230 100, 230 65 C 230 30, 190 30, 140 65 C 90 100, 50 100, 50 65';

const DEFS = `<defs>
  <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#5a6fd0"/><stop offset="0.5" stop-color="#9466c8"/><stop offset="1" stop-color="#d6a06b"/>
  </linearGradient>
  <linearGradient id="ribbonSoft" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#5a6fd0" stop-opacity="0.45"/><stop offset="0.5" stop-color="#9466c8" stop-opacity="0.45"/><stop offset="1" stop-color="#d6a06b" stop-opacity="0.45"/>
  </linearGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#e7c79a" stop-opacity="0.55"/><stop offset="0.6" stop-color="#d6a06b" stop-opacity="0.18"/><stop offset="1" stop-color="#d6a06b" stop-opacity="0"/>
  </radialGradient>
</defs>`;

const symbol = () => `
  <ellipse cx="140" cy="38" rx="78" ry="60" fill="url(#halo)"/>
  <path d="${INF_PATH}" stroke="url(#ribbon)" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="${INF_PATH}" stroke="url(#ribbonSoft)" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="140" cy="28" rx="5" ry="16" fill="url(#ribbon)"/>
  <ellipse cx="125" cy="35" rx="4" ry="13" fill="url(#ribbon)" transform="rotate(-32 125 35)"/>
  <ellipse cx="155" cy="35" rx="4" ry="13" fill="url(#ribbon)" transform="rotate(32 155 35)"/>
  <ellipse cx="112" cy="45" rx="3" ry="10" fill="url(#ribbon)" transform="rotate(-58 112 45)"/>
  <ellipse cx="168" cy="45" rx="3" ry="10" fill="url(#ribbon)" transform="rotate(58 168 45)"/>
  <circle cx="140" cy="65" r="3.2" fill="#FFD24A"/>`;

const svgFG = (scale, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${DEFS}${bg ? `<rect width="1024" height="1024" fill="${bg}"/><ellipse cx="512" cy="430" rx="360" ry="300" fill="url(#halo)"/>` : ''}
  <g transform="translate(512 512) scale(${scale}) translate(-140 -57)">${symbol()}</g></svg>`;

const svgBG = () => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${DEFS}<rect width="1024" height="1024" fill="${NAVY}"/><ellipse cx="512" cy="430" rx="380" ry="320" fill="url(#halo)"/></svg>`;

// Adaptive layers: full 108dp canvas. Legacy: 48dp canvas.
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const LEGACY   = { mdpi: 48,  hdpi: 72,  xhdpi: 96,  xxhdpi: 144, xxxhdpi: 192 };

const webp = (svg, size, dir, name, round) =>
  sharp(Buffer.from(svg)).resize(size, size).webp({ quality: 95 })
    .toBuffer()
    .then(async buf => {
      if (round) {
        const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#fff"/></svg>`);
        buf = await sharp(buf).composite([{ input: mask, blend: 'dest-in' }]).webp({ quality: 95 }).toBuffer();
      }
      const fs = require('fs');
      fs.writeFileSync(path.join(RES, `mipmap-${dir}`, name), buf);
    });

(async () => {
  // Compose legacy full-square icon (navy bg + symbol) once per density.
  for (const [dir, sz] of Object.entries(ADAPTIVE)) {
    await webp(svgFG(3.1), sz, dir, 'ic_launcher_foreground.webp', false);
    await webp(svgBG(),    sz, dir, 'ic_launcher_background.webp', false);
  }
  for (const [dir, sz] of Object.entries(LEGACY)) {
    await webp(svgFG(3.0, NAVY), sz, dir, 'ic_launcher.webp', false);
    await webp(svgFG(3.0, NAVY), sz, dir, 'ic_launcher_round.webp', true);
  }
  console.log('✓ Native Android mipmaps regenerated for all densities.');
})().catch(e => { console.error(e); process.exit(1); });
