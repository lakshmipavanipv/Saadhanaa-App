/**
 * gen-icons.js — regenerate the launcher / splash / favicon icon set so the
 * app icon pixel-matches the in-app animated BodySoulLogo (infinity ribbon +
 * lotus + gold dot + warm halo) and, crucially, sizes the logo to fill the
 * Android adaptive-icon SAFE ZONE so it isn't shrunk/clipped on the home screen.
 *
 * Logo geometry is copied verbatim from src/soulsync/components/BodySoulLogo.tsx
 * (native viewBox 280 x 110, content centered around 140,57).
 *
 * Run:  node scripts/gen-icons.js
 */
const sharp = require('sharp');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'images');
const NAVY = '#0a0e27';

const INF_PATH =
  'M 50 65 C 50 30, 90 30, 140 65 C 190 100, 230 100, 230 65 C 230 30, 190 30, 140 65 C 90 100, 50 100, 50 65';

// Shared <defs> — ribbon gradients + warm halo, matching the component.
const DEFS = `
  <defs>
    <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"   stop-color="#5a6fd0"/>
      <stop offset="0.5" stop-color="#9466c8"/>
      <stop offset="1"   stop-color="#d6a06b"/>
    </linearGradient>
    <linearGradient id="ribbonSoft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"   stop-color="#5a6fd0" stop-opacity="0.45"/>
      <stop offset="0.5" stop-color="#9466c8" stop-opacity="0.45"/>
      <stop offset="1"   stop-color="#d6a06b" stop-opacity="0.45"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0"   stop-color="#e7c79a" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#d6a06b" stop-opacity="0.18"/>
      <stop offset="1"   stop-color="#d6a06b" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

// The logo symbol in native (280x110) coordinates. `fill` overrides the
// gradient for the monochrome variant.
const symbol = (fill) => {
  const paint = fill || 'url(#ribbon)';
  const softPaint = fill || 'url(#ribbonSoft)';
  const halo = fill ? '' : `<ellipse cx="140" cy="38" rx="78" ry="60" fill="url(#halo)"/>`;
  return `
    ${halo}
    <path d="${INF_PATH}" stroke="${paint}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="${INF_PATH}" stroke="${softPaint}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <g>
      <ellipse cx="140" cy="28" rx="5" ry="16" fill="${paint}"/>
      <ellipse cx="125" cy="35" rx="4" ry="13" fill="${paint}" transform="rotate(-32 125 35)"/>
      <ellipse cx="155" cy="35" rx="4" ry="13" fill="${paint}" transform="rotate(32 155 35)"/>
      <ellipse cx="112" cy="45" rx="3" ry="10" fill="${paint}" transform="rotate(-58 112 45)"/>
      <ellipse cx="168" cy="45" rx="3" ry="10" fill="${paint}" transform="rotate(58 168 45)"/>
      <circle cx="140" cy="65" r="3.2" fill="${fill || '#FFD24A'}"/>
    </g>`;
};

// Compose a full 1024 SVG. `scale` controls how large the symbol is;
// content-center (140,57) is pinned to the canvas center (512,512).
const compose = ({ scale, bg, fill }) => {
  const bgRect = bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : '';
  const bgHalo = bg
    ? `<ellipse cx="512" cy="430" rx="360" ry="300" fill="url(#halo)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${DEFS}
    ${bgRect}
    ${bgHalo}
    <g transform="translate(512 512) scale(${scale}) translate(-140 -57)">
      ${symbol(fill)}
    </g>
  </svg>`;
};

const png = (svg, size, file) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT, file))
    .then(() => console.log('✓', file, size + 'px'));

(async () => {
  // Full-bleed app icon (iOS + fallback) — navy bg, comfortable margin.
  await png(compose({ scale: 3.3, bg: NAVY }), 1024, 'icon.png');

  // Android adaptive FOREGROUND — transparent bg, symbol sized to fill the
  // safe zone (scale 3.1 keeps the infinity tips inside the circular mask).
  await png(compose({ scale: 3.1 }), 1024, 'android-icon-foreground.png');

  // Android adaptive BACKGROUND — solid navy with a soft warm halo so the
  // masked circle looks rich behind the foreground.
  await png(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      ${DEFS}<rect width="1024" height="1024" fill="${NAVY}"/>
      <ellipse cx="512" cy="430" rx="380" ry="320" fill="url(#halo)"/></svg>`,
    1024, 'android-icon-background.png');

  // Monochrome (themed icons, Android 13+) — white silhouette, transparent.
  await png(compose({ scale: 3.1, fill: '#ffffff' }), 1024, 'android-icon-monochrome.png');

  // Splash — transparent bg (splash screen paints navy behind it).
  await png(compose({ scale: 3.3 }), 1024, 'splash-icon.png');

  // Favicon (web).
  await png(compose({ scale: 3.3, bg: NAVY }), 196, 'favicon.png');

  console.log('\nAll icons regenerated.');
})().catch(e => { console.error(e); process.exit(1); });
