"""
generate-icon.py — produces the "Body & Soul Ring" app icon by hand.

The Gemini image API kept hitting quota errors, so we draw the icon
programmatically with PIL.  The design matches the splash screen's
visual identity:

  • Deep cosmic dark-navy background fading to near-black (radial)
  • Faint outer mandala ripple ring (~15% opacity)
  • Thin golden dashed mandala ring closer in
  • Soft warm citrine halo glow around the centre
  • Centred glowing golden lotus silhouette (8 petals)
  • Optional faint ॐ in the deep background

Outputs:
  • assets/images/icon.png                  (1024×1024 with background)
  • assets/images/android-icon-foreground.png  (1024×1024 transparent bg)
  • assets/images/splash-icon.png           (alias of icon.png)
  • assets/images/favicon.png               (256×256 web favicon)
"""

import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 1024
HALF = SIZE // 2

# ── Palette (matches src/theme.ts) ────────────────────────────────
DEEP_INNER = (10, 20, 40)        # #0a1428
DEEP_OUTER = (4,  8,  20)        # #040814
CITRINE    = (255, 184, 0)       # #FFB800 — gold
CITRINE_BRIGHT = (255, 224, 102) # #FFE066 — lighter gold


def radial_background():
    """Build a radial gradient from deep_inner at centre to deep_outer at edge."""
    bg = Image.new("RGB", (SIZE, SIZE), DEEP_OUTER)
    px = bg.load()
    cx, cy = HALF, HALF
    max_r = math.hypot(cx, cy)
    for y in range(SIZE):
        for x in range(SIZE):
            r = math.hypot(x - cx, y - cy) / max_r
            r = min(1.0, r)
            # ease-in-out curve so the centre stays bright a bit longer
            t = r * r * (3 - 2 * r)
            px[x, y] = (
                int(DEEP_INNER[0] * (1 - t) + DEEP_OUTER[0] * t),
                int(DEEP_INNER[1] * (1 - t) + DEEP_OUTER[1] * t),
                int(DEEP_INNER[2] * (1 - t) + DEEP_OUTER[2] * t),
            )
    return bg


def draw_om_faint(base):
    """Faint ॐ symbol behind the lotus — ~6% opacity, big enough to feel cosmic."""
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # Try to load a Unicode font that can render ॐ; fall back to default.
    font_paths = [
        r"C:\Windows\Fonts\seguisym.ttf",   # Segoe UI Symbol — has Devanagari
        r"C:\Windows\Fonts\mangal.ttf",     # Mangal — Devanagari
        r"C:\Windows\Fonts\arial.ttf",
    ]
    font = None
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, int(SIZE * 0.55))
                break
            except Exception:
                continue
    if font is None:
        return base   # skip silently if no font
    text = "ॐ"
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pos = (HALF - w // 2 - bbox[0], HALF - h // 2 - bbox[1] - int(SIZE * 0.04))
    d.text(pos, text, font=font, fill=(*CITRINE, 20))
    overlay = overlay.filter(ImageFilter.GaussianBlur(4))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def draw_outer_ripple_ring(base):
    """Outer faint mandala ripple — solid ring at very low opacity."""
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    r = int(SIZE * 0.44)
    bbox = [HALF - r, HALF - r, HALF + r, HALF + r]
    d.ellipse(bbox, outline=(*CITRINE_BRIGHT, 35), width=2)
    overlay = overlay.filter(ImageFilter.GaussianBlur(2))
    return Image.alpha_composite(base, overlay)


def draw_dashed_mandala_ring(base):
    """Thin golden dashed segmented ring — the 'infinite' mandala motif."""
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    r = int(SIZE * 0.36)
    bbox = [HALF - r, HALF - r, HALF + r, HALF + r]
    # 36 dashes around the ring
    segments = 36
    dash_deg = 360 / segments / 2.0
    gap_deg  = 360 / segments / 2.0
    for i in range(segments):
        start = i * (dash_deg + gap_deg) - 90
        end   = start + dash_deg
        d.arc(bbox, start=start, end=end, fill=(*CITRINE, 200), width=5)
    return Image.alpha_composite(base, overlay)


def draw_halo(base):
    """Soft warm citrine halo behind the lotus."""
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # multiple stacked translucent disks → soft glow
    for r_frac, alpha in [(0.30, 80), (0.24, 110), (0.18, 90), (0.12, 60)]:
        r = int(SIZE * r_frac)
        bbox = [HALF - r, HALF - r, HALF + r, HALF + r]
        d.ellipse(bbox, fill=(*CITRINE, alpha))
    overlay = overlay.filter(ImageFilter.GaussianBlur(28))
    return Image.alpha_composite(base, overlay)


def _make_petal(width, length, fill, outline):
    """Draws a teardrop petal pointing UP on a (width × length) canvas.
    The petal is narrow at the BOTTOM (base, near centre of lotus) and
    rounded-pointed at the TOP (tip, away from centre)."""
    layer = Image.new("RGBA", (width, length), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = width / 2.0
    base_y = length - 2
    tip_y = 2
    # Build the polygon as two curves meeting at the base.
    # Right side: from base (centre x) curving outward then back to tip.
    pts = []
    steps = 24
    for i in range(steps + 1):
        t = i / steps
        # ease curve: 0 at base, 1 at tip — width peaks around 65%
        bell = math.sin(t * math.pi) ** 0.75
        x = cx + (width * 0.46) * bell
        y = base_y + (tip_y - base_y) * t
        pts.append((x, y))
    for i in range(steps + 1):
        t = 1 - i / steps
        bell = math.sin(t * math.pi) ** 0.75
        x = cx - (width * 0.46) * bell
        y = base_y + (tip_y - base_y) * t
        pts.append((x, y))
    d.polygon(pts, fill=fill, outline=outline)
    return layer


def draw_lotus(base):
    """8-petal lotus in citrine gold, centred. Petals radiate from the
    bindu outward, narrow at the base and wider with a rounded tip."""
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    petals = 8

    # Outer petals — long and elegant
    out_w = int(SIZE * 0.09)
    out_l = int(SIZE * 0.30)
    outer_petal = _make_petal(out_w, out_l,
                              fill=(*CITRINE, 230),
                              outline=(*CITRINE_BRIGHT, 255))

    for i in range(petals):
        ang = (360 / petals) * i      # 0° = point up
        rot = outer_petal.rotate(-ang, expand=True, resample=Image.BICUBIC)
        cx_p, cy_p = rot.size[0] / 2.0, rot.size[1] / 2.0
        # offset the centre of the canvas outward by half the petal length
        rad = math.radians(ang - 90)
        offset = out_l * 0.42
        offset_x = math.cos(rad) * offset
        offset_y = math.sin(rad) * offset
        paste_x = int(HALF + offset_x - cx_p)
        paste_y = int(HALF + offset_y - cy_p)
        overlay.paste(rot, (paste_x, paste_y), rot)

    # Inner petals — shorter, brighter, rotated 22.5° relative to outer
    in_w = int(SIZE * 0.065)
    in_l = int(SIZE * 0.18)
    inner_petal = _make_petal(in_w, in_l,
                              fill=(*CITRINE_BRIGHT, 200),
                              outline=(*CITRINE_BRIGHT, 240))

    for i in range(petals):
        ang = (360 / petals) * i + (360 / petals / 2)
        rot = inner_petal.rotate(-ang, expand=True, resample=Image.BICUBIC)
        cx_p, cy_p = rot.size[0] / 2.0, rot.size[1] / 2.0
        rad = math.radians(ang - 90)
        offset = in_l * 0.42
        offset_x = math.cos(rad) * offset
        offset_y = math.sin(rad) * offset
        paste_x = int(HALF + offset_x - cx_p)
        paste_y = int(HALF + offset_y - cy_p)
        overlay.paste(rot, (paste_x, paste_y), rot)

    # Bindu — centre dot, bright citrine with white highlight
    r = int(SIZE * 0.055)
    d = ImageDraw.Draw(overlay)
    d.ellipse([HALF - r, HALF - r, HALF + r, HALF + r],
              fill=(*CITRINE_BRIGHT, 255),
              outline=(255, 255, 255, 230), width=3)
    rr = int(r * 0.45)
    d.ellipse([HALF - rr, HALF - rr, HALF + rr, HALF + rr],
              fill=(255, 250, 230, 255))

    return Image.alpha_composite(base, overlay)


def build_icon(with_background=True):
    if with_background:
        img = radial_background().convert("RGBA")
        # ॐ overlay disabled — fonts on this machine don't carry the
        # Devanagari glyph and the .notdef tofu looks like a dark block.
        # img = draw_om_faint(img).convert("RGBA")
    else:
        img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    img = draw_outer_ripple_ring(img)
    img = draw_dashed_mandala_ring(img)
    img = draw_halo(img)
    img = draw_lotus(img)
    return img


# ── Emit files ────────────────────────────────────────────────────

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "images")
OUT_DIR = os.path.abspath(OUT_DIR)
os.makedirs(OUT_DIR, exist_ok=True)

icon = build_icon(with_background=True)
icon.save(os.path.join(OUT_DIR, "icon.png"), "PNG", optimize=True)
icon.save(os.path.join(OUT_DIR, "splash-icon.png"), "PNG", optimize=True)

fg = build_icon(with_background=False)
fg.save(os.path.join(OUT_DIR, "android-icon-foreground.png"), "PNG", optimize=True)

# Favicon — downscaled icon
fav = icon.resize((256, 256), Image.LANCZOS)
fav.save(os.path.join(OUT_DIR, "favicon.png"), "PNG", optimize=True)

print("Generated:")
for f in ("icon.png", "splash-icon.png", "android-icon-foreground.png", "favicon.png"):
    p = os.path.join(OUT_DIR, f)
    print(f"  {p} ({os.path.getsize(p) // 1024} KB)")
