/**
 * Crop the 12 Hatha Surya Namaskar poses from the Gemini composite sheet
 * into individual PNGs for the YogaPoseAnimation component.
 *
 * Source: images/yoga/Gemini_Generated_Image_373p2s373p2s373p.png (1408x768)
 * Hatha section: leftmost ~360px, 3 cols × 4 rows grid.
 *
 * Coordinates measured visually; tuned by iteration.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC = path.resolve(__dirname, '..', '..', 'images', 'yoga', 'Gemini_Generated_Image_373p2s373p2s373p.png');
const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'yoga');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Hatha section: title bar y=0-45, then poses below.
// Layout is irregular — rows 1-2 are 3-column, rows 3-5 are 2-column.
// Each pose figure ~115×120 (image only). Label below ~20px.
// We crop only the figure area (no label) for clean use in the app.
// Tuned by visual probe at source resolution.
// Note: the composite art labels some poses non-traditionally —
// we honor TRADITIONAL Hindu/Hatha naming when mapping to our app pose IDs.
//   • Hatha row 1 col 1 "Pranamasana" — image shows arms-at-sides
//     (matches Tadasana visually; we use the row 1 col 2 image which
//      shows palms-at-heart — that is true Pranamasana).
//   • Hatha row 1 col 4 — labeled "Padahasasana" but the image is a
//     Warrior II stance; we use it as virabhadrasana.
//   • Ashtanga A row 1 col 1 (Tadasana) and col 2 (Urdhva Hastasana)
//     give us standing Tadasana + true arms-up Hasta Uttanasana.
const POSES = [
  // ── Surya Namaskar 12-step (8 unique frames) ──
  { id: 'pranamasana',          x: 126, y: 60,  w: 115, h: 115 },  // Hatha row1 col2 (palms-at-heart)
  { id: 'hasta-uttanasana',     x: 590, y: 60,  w: 115, h: 115 },  // Ashtanga A col2 (arms-up)
  { id: 'padahastasana',        x: 246, y: 60,  w: 115, h: 115 },
  { id: 'ashwa-sanchalanasana', x: 6,   y: 210, w: 115, h: 115 },
  { id: 'dandasana',            x: 126, y: 210, w: 115, h: 115 },
  { id: 'ashtanga-namaskara',   x: 246, y: 210, w: 115, h: 115 },
  { id: 'bhujangasana',         x: 6,   y: 365, w: 115, h: 115 },
  { id: 'adho-mukha-svanasana', x: 126, y: 365, w: 115, h: 115 },

  // ── Standalone asanas (bonus) ──
  { id: 'tadasana',             x: 465, y: 60,  w: 115, h: 115 },  // Ashtanga A col1
  { id: 'virabhadrasana',       x: 360, y: 60,  w: 120, h: 115 },  // Hatha row1 col4
];

(async () => {
  const meta = await sharp(SRC).metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  for (const p of POSES) {
    const outPath = path.join(OUT_DIR, `${p.id}.png`);
    await sharp(SRC)
      .extract({ left: p.x, top: p.y, width: p.w, height: p.h })
      .resize(460, 480, { kernel: 'lanczos3', fit: 'cover' })
      .png({ quality: 95 })
      .toFile(outPath);
    console.log(`  ✓ ${p.id}.png  (${p.x},${p.y}  ${p.w}×${p.h})`);
  }

  console.log(`\nDone. ${POSES.length} pose images saved to assets/yoga/`);
})().catch(e => { console.error(e); process.exit(1); });
