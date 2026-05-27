/**
 * Generate the Body & Soul Ring app icon from an SVG.
 *
 * Design:
 *   • Deep indigo background (#0a0e27)
 *   • Centered lotus crown — 7 citrine-gold petals arranged in a fan above
 *   • Golden infinity symbol (∞) below the lotus — represents continuous
 *     balance between body and soul
 *   • Subtle outer glow ring
 *
 * Produces:
 *   - assets/images/icon.png                    (1024×1024)
 *   - assets/images/android-icon-foreground.png (1024×1024, transparent bg)
 *   - assets/images/android-icon-background.png (1024×1024, solid indigo)
 *   - assets/images/favicon.png                 (96×96)
 *   - assets/images/splash-icon.png             (1024×1024)
 */

const sharp = require('sharp');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'images');

// ─── Main icon SVG (1024×1024, full design with bg) ─────────────────

const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#1a2456"/>
      <stop offset="100%" stop-color="#040814"/>
    </radialGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFE066"/>
      <stop offset="100%" stop-color="#FFB800"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" fill="url(#bg)" rx="180" ry="180"/>

  <!-- Outer dim ring -->
  <circle cx="512" cy="512" r="460" fill="none" stroke="#FFB800" stroke-opacity="0.15" stroke-width="3"/>
  <circle cx="512" cy="512" r="430" fill="none" stroke="#FFB800" stroke-opacity="0.08" stroke-width="2" stroke-dasharray="12 8"/>

  <!-- Lotus crown — 7 petals fanning up from centre -->
  <g transform="translate(512,420)" filter="url(#glow)">
    <!-- Central tallest petal -->
    <ellipse cx="0" cy="-160" rx="55" ry="155" fill="url(#gold)" opacity="0.95"/>
    <!-- Inner pair -->
    <ellipse cx="-95" cy="-130" rx="48" ry="140" fill="url(#gold)" opacity="0.88"
             transform="rotate(-22 -95 -130)"/>
    <ellipse cx="95"  cy="-130" rx="48" ry="140" fill="url(#gold)" opacity="0.88"
             transform="rotate(22 95 -130)"/>
    <!-- Outer pair -->
    <ellipse cx="-185" cy="-80" rx="42" ry="120" fill="url(#gold)" opacity="0.8"
             transform="rotate(-45 -185 -80)"/>
    <ellipse cx="185"  cy="-80" rx="42" ry="120" fill="url(#gold)" opacity="0.8"
             transform="rotate(45 185 -80)"/>
    <!-- Outermost short pair -->
    <ellipse cx="-250" cy="-10" rx="38" ry="95" fill="url(#gold)" opacity="0.7"
             transform="rotate(-65 -250 -10)"/>
    <ellipse cx="250"  cy="-10" rx="38" ry="95" fill="url(#gold)" opacity="0.7"
             transform="rotate(65 250 -10)"/>
    <!-- Lotus heart (centre dot) -->
    <circle cx="0" cy="-20" r="22" fill="#FFE066"/>
  </g>

  <!-- Infinity symbol below -->
  <g transform="translate(512,720)" filter="url(#glow)">
    <path d="M -200,0 C -200,-110 -90,-110 0,0 C 90,110 200,110 200,0 C 200,-110 90,-110 0,0 C -90,110 -200,110 -200,0 Z"
          fill="none" stroke="url(#gold)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`.trim();

// Foreground for Android adaptive (no background, transparent corners)
const FOREGROUND_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="gold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFE066"/>
      <stop offset="100%" stop-color="#FFB800"/>
    </linearGradient>
  </defs>
  <!-- Same artwork as main, but on transparent bg. Adaptive icon insets
       the artwork by ~33% so we draw it slightly smaller / re-positioned. -->
  <g transform="translate(0,80)">
    <g transform="translate(512,420)">
      <ellipse cx="0" cy="-160" rx="55" ry="155" fill="url(#gold)" opacity="0.95"/>
      <ellipse cx="-95" cy="-130" rx="48" ry="140" fill="url(#gold)" opacity="0.88"
               transform="rotate(-22 -95 -130)"/>
      <ellipse cx="95"  cy="-130" rx="48" ry="140" fill="url(#gold)" opacity="0.88"
               transform="rotate(22 95 -130)"/>
      <ellipse cx="-185" cy="-80" rx="42" ry="120" fill="url(#gold)" opacity="0.8"
               transform="rotate(-45 -185 -80)"/>
      <ellipse cx="185"  cy="-80" rx="42" ry="120" fill="url(#gold)" opacity="0.8"
               transform="rotate(45 185 -80)"/>
      <ellipse cx="-250" cy="-10" rx="38" ry="95" fill="url(#gold)" opacity="0.7"
               transform="rotate(-65 -250 -10)"/>
      <ellipse cx="250"  cy="-10" rx="38" ry="95" fill="url(#gold)" opacity="0.7"
               transform="rotate(65 250 -10)"/>
      <circle cx="0" cy="-20" r="22" fill="#FFE066"/>
    </g>
    <g transform="translate(512,720)">
      <path d="M -200,0 C -200,-110 -90,-110 0,0 C 90,110 200,110 200,0 C 200,-110 90,-110 0,0 C -90,110 -200,110 -200,0 Z"
            fill="none" stroke="url(#gold)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>
`.trim();

// Solid background for Android adaptive
const BG_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#0a0e27"/>
</svg>
`.trim();

// Monochrome version for Android themed icons (white on transparent)
const MONO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(0,80)" fill="#ffffff">
    <g transform="translate(512,420)">
      <ellipse cx="0" cy="-160" rx="55" ry="155"/>
      <ellipse cx="-95" cy="-130" rx="48" ry="140" transform="rotate(-22 -95 -130)"/>
      <ellipse cx="95"  cy="-130" rx="48" ry="140" transform="rotate(22 95 -130)"/>
      <ellipse cx="-185" cy="-80" rx="42" ry="120" transform="rotate(-45 -185 -80)"/>
      <ellipse cx="185"  cy="-80" rx="42" ry="120" transform="rotate(45 185 -80)"/>
      <ellipse cx="-250" cy="-10" rx="38" ry="95" transform="rotate(-65 -250 -10)"/>
      <ellipse cx="250"  cy="-10" rx="38" ry="95" transform="rotate(65 250 -10)"/>
      <circle cx="0" cy="-20" r="22"/>
    </g>
    <g transform="translate(512,720)">
      <path d="M -200,0 C -200,-110 -90,-110 0,0 C 90,110 200,110 200,0 C 200,-110 90,-110 0,0 C -90,110 -200,110 -200,0 Z"
            fill="none" stroke="#ffffff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>
`.trim();

async function gen(svg, outName, size = 1024) {
  const file = path.join(OUT_DIR, outName);
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(file);
  console.log(`  ✓ ${outName} (${size}×${size})`);
}

(async () => {
  console.log('🪷 Generating Body & Soul Ring icons…');
  await gen(ICON_SVG,       'icon.png');
  await gen(ICON_SVG,       'splash-icon.png');
  await gen(FOREGROUND_SVG, 'android-icon-foreground.png');
  await gen(BG_SVG,         'android-icon-background.png');
  await gen(MONO_SVG,       'android-icon-monochrome.png');
  await gen(ICON_SVG,       'favicon.png', 96);
  console.log('🎉 Done.');
})().catch(e => { console.error(e); process.exit(1); });
