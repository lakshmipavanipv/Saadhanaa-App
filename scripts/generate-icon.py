"""
generate-icon.py — produces the "Body & Soul Ring" app icon by hand.

The icon is now built from the SAME visual identity as `BodySoulLogo`
(the brand mark shown on the Home tab):

  • Blue → Purple → Gold infinity (∞) ribbon — drawn as a continuous
    cubic bezier so it has the proper figure-eight shape (NOT two
    overlapping circles).
  • Five-petal lotus blossoms upward from the centre crossing of the
    infinity, using the same ribbon gradient.
  • Deep cosmic navy background fading to near-black so the gradient
    ribbon glows against it.
  • A soft halo behind the lotus to lift it off the background.
  • No text — the icon is square; the wordmark lives only inside the
    app, not on the tile.

Outputs:
  • assets/images/icon.png                       (1024×1024 with background)
  • assets/images/android-icon-foreground.png    (1024×1024 transparent bg)
  • assets/images/splash-icon.png                (alias of icon.png)
  • assets/images/favicon.png                    (256×256 web favicon)
"""

import math
import os
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
HALF = SIZE // 2

# ── Palette (matches BodySoulLogo gradient + theme.ts) ────────────
DEEP_INNER = (10, 20, 40)        # #0a1428
DEEP_OUTER = (4,  8,  20)        # #040814
RIBBON_BLUE   = (90,  111, 208)  # #5a6fd0
RIBBON_PURPLE = (148, 102, 200)  # #9466c8
RIBBON_GOLD   = (214, 160, 107)  # #d6a06b
HIGHLIGHT     = (255, 224, 102)  # #FFE066 — citrine highlight


# ── Background ────────────────────────────────────────────────────

def radial_background():
    """Radial gradient from deep_inner at centre to deep_outer at edge."""
    bg = Image.new("RGB", (SIZE, SIZE), DEEP_OUTER)
    px = bg.load()
    cx, cy = HALF, HALF
    max_r = math.hypot(cx, cy)
    for y in range(SIZE):
        for x in range(SIZE):
            r = math.hypot(x - cx, y - cy) / max_r
            r = min(1.0, r)
            t = r * r * (3 - 2 * r)
            px[x, y] = (
                int(DEEP_INNER[0] * (1 - t) + DEEP_OUTER[0] * t),
                int(DEEP_INNER[1] * (1 - t) + DEEP_OUTER[1] * t),
                int(DEEP_INNER[2] * (1 - t) + DEEP_OUTER[2] * t),
            )
    return bg


# ── Halo behind the lotus ────────────────────────────────────────

def draw_halo(base):
    """Soft warm halo behind the lotus to lift it off the cosmic background."""
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # Halo sits roughly where the lotus will land — slightly above centre
    halo_cy = int(SIZE * 0.40)
    for r_frac, alpha in [(0.22, 60), (0.16, 90), (0.10, 110), (0.06, 80)]:
        r = int(SIZE * r_frac)
        bbox = [HALF - r, halo_cy - r, HALF + r, halo_cy + r]
        d.ellipse(bbox, fill=(*RIBBON_GOLD, alpha))
    overlay = overlay.filter(ImageFilter.GaussianBlur(28))
    return Image.alpha_composite(base, overlay)


# ── Infinity ribbon ──────────────────────────────────────────────

def _bezier_point(t, p0, p1, p2, p3):
    """Cubic Bezier evaluated at t."""
    mt = 1 - t
    x = (mt ** 3) * p0[0] + 3 * (mt ** 2) * t * p1[0] + 3 * mt * (t ** 2) * p2[0] + (t ** 3) * p3[0]
    y = (mt ** 3) * p0[1] + 3 * (mt ** 2) * t * p1[1] + 3 * mt * (t ** 2) * p2[1] + (t ** 3) * p3[1]
    return (x, y)


def _gradient_for_x(x, x_min, x_max):
    """Interpolate the ribbon gradient (blue → purple → gold) by horizontal position."""
    t = (x - x_min) / max(1.0, x_max - x_min)
    t = max(0.0, min(1.0, t))
    if t < 0.5:
        u = t / 0.5
        r = RIBBON_BLUE[0]   * (1 - u) + RIBBON_PURPLE[0] * u
        g = RIBBON_BLUE[1]   * (1 - u) + RIBBON_PURPLE[1] * u
        b = RIBBON_BLUE[2]   * (1 - u) + RIBBON_PURPLE[2] * u
    else:
        u = (t - 0.5) / 0.5
        r = RIBBON_PURPLE[0] * (1 - u) + RIBBON_GOLD[0] * u
        g = RIBBON_PURPLE[1] * (1 - u) + RIBBON_GOLD[1] * u
        b = RIBBON_PURPLE[2] * (1 - u) + RIBBON_GOLD[2] * u
    return (int(r), int(g), int(b))


def draw_infinity_ribbon(base):
    """The figure-eight ribbon — drawn as a SINGLE continuous lemniscate
    path so the two loops actually cross through each other (going up-
    over-down-under-and-back).  Path samples follow the parametric form
    of a lemniscate of Bernoulli, then we stamp gradient-coloured disks
    along it to fake a gradient stroke."""
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # ── Lemniscate parameters ──
    cx, cy = HALF, int(SIZE * 0.60)     # centre of the ∞ (lower-mid)
    A = SIZE * 0.36                     # half-width of each lobe
    # Parametric lemniscate:
    #   x(t) = A * cos(t) / (1 + sin²t)
    #   y(t) = A * sin(t)*cos(t) / (1 + sin²t)
    # t ∈ [0, 2π) traces the figure-eight CONTINUOUSLY with a proper crossing.
    STEPS = 1200
    pts = []
    for i in range(STEPS):
        t = (i / STEPS) * 2 * math.pi
        denom = 1 + math.sin(t) ** 2
        x = cx + A * math.cos(t) / denom
        y = cy + A * math.sin(t) * math.cos(t) / denom
        pts.append((x, y, t))

    outer_r = int(SIZE * 0.028)
    inner_r = int(SIZE * 0.010)

    # ── Outer thick gradient stroke pass ──
    d = ImageDraw.Draw(overlay)
    x_min = cx - A * 1.05
    x_max = cx + A * 1.05
    for x, y, _t in pts:
        colour = _gradient_for_x(x, x_min, x_max)
        d.ellipse(
            [x - outer_r, y - outer_r, x + outer_r, y + outer_r],
            fill=(*colour, 235),
        )

    # ── Inner thin highlight echo pass ──
    for x, y, _t in pts:
        colour = _gradient_for_x(x, x_min, x_max)
        # bias toward the brighter highlight on top
        bright = tuple(min(255, int(c * 1.2)) for c in colour)
        d.ellipse(
            [x - inner_r, y - inner_r, x + inner_r, y + inner_r],
            fill=(*bright, 200),
        )

    # Soft glow underlay so the ribbon feels luminous against the navy bg
    glow = overlay.filter(ImageFilter.GaussianBlur(6))
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out = Image.alpha_composite(out, glow)
    out = Image.alpha_composite(out, overlay)
    return Image.alpha_composite(base, out)


# ── Lotus rising from the top crossing of the ∞ ──────────────────

def draw_lotus_on_top(base):
    """Five-petal lotus fanning UPWARD from the top crossing of the
    infinity ribbon — mirrors the BodySoulLogo geometry."""
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # Crossing of the infinity sits at (HALF, cy=0.62×SIZE).  Lotus base
    # is anchored just above that crossing so the bottom of the petals
    # meets the ribbon.
    base_cx = HALF
    base_cy = int(SIZE * 0.58)        # slightly above the ribbon crossing

    # Petal sizes — keep the proportions matching BodySoulLogo (5 petals).
    def draw_petal(cx, cy, rx, ry, angle_deg, fill):
        """Rotated ellipse petal."""
        petal = Image.new("RGBA", (int(rx * 2 + 4), int(ry * 2 + 4)), (0, 0, 0, 0))
        pd = ImageDraw.Draw(petal)
        pd.ellipse([2, 2, int(rx * 2 + 2), int(ry * 2 + 2)],
                   fill=fill, outline=(*HIGHLIGHT, 200), width=2)
        rot = petal.rotate(angle_deg, expand=True, resample=Image.BICUBIC)
        # paste so the centre of the petal sits at (cx, cy)
        pw, ph = rot.size
        overlay.paste(rot, (cx - pw // 2, cy - ph // 2), rot)

    # Petal fill colours — sampled from the gold/purple gradient end
    pcol = (*RIBBON_GOLD, 240)

    # Centre petal — straight up
    draw_petal(base_cx, base_cy - int(SIZE * 0.10),
               rx=int(SIZE * 0.030), ry=int(SIZE * 0.090),
               angle_deg=0, fill=pcol)

    # Inner side petals (±32°)
    draw_petal(base_cx - int(SIZE * 0.055), base_cy - int(SIZE * 0.07),
               rx=int(SIZE * 0.024), ry=int(SIZE * 0.078),
               angle_deg=32, fill=pcol)
    draw_petal(base_cx + int(SIZE * 0.055), base_cy - int(SIZE * 0.07),
               rx=int(SIZE * 0.024), ry=int(SIZE * 0.078),
               angle_deg=-32, fill=pcol)

    # Outer side petals (±58°)
    draw_petal(base_cx - int(SIZE * 0.10), base_cy - int(SIZE * 0.03),
               rx=int(SIZE * 0.018), ry=int(SIZE * 0.060),
               angle_deg=58, fill=(*RIBBON_PURPLE, 240))
    draw_petal(base_cx + int(SIZE * 0.10), base_cy - int(SIZE * 0.03),
               rx=int(SIZE * 0.018), ry=int(SIZE * 0.060),
               angle_deg=-58, fill=(*RIBBON_PURPLE, 240))

    # Tiny bindu where all petals meet
    r = int(SIZE * 0.014)
    d = ImageDraw.Draw(overlay)
    d.ellipse([base_cx - r, base_cy - r, base_cx + r, base_cy + r],
              fill=(*HIGHLIGHT, 255))

    return Image.alpha_composite(base, overlay)


# ── Compose ──────────────────────────────────────────────────────

def build_icon(with_background=True):
    if with_background:
        img = radial_background().convert("RGBA")
    else:
        img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    img = draw_halo(img)
    img = draw_infinity_ribbon(img)
    img = draw_lotus_on_top(img)
    return img


# ── Emit files ────────────────────────────────────────────────────

if __name__ == "__main__":
    OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "images")
    OUT_DIR = os.path.abspath(OUT_DIR)
    os.makedirs(OUT_DIR, exist_ok=True)

    icon = build_icon(with_background=True)
    icon.save(os.path.join(OUT_DIR, "icon.png"), "PNG", optimize=True)
    icon.save(os.path.join(OUT_DIR, "splash-icon.png"), "PNG", optimize=True)

    fg = build_icon(with_background=False)
    fg.save(os.path.join(OUT_DIR, "android-icon-foreground.png"), "PNG", optimize=True)

    fav = icon.resize((256, 256), Image.LANCZOS)
    fav.save(os.path.join(OUT_DIR, "favicon.png"), "PNG", optimize=True)

    print("Generated:")
    for f in ("icon.png", "splash-icon.png", "android-icon-foreground.png", "favicon.png"):
        p = os.path.join(OUT_DIR, f)
        print(f"  {p} ({os.path.getsize(p) // 1024} KB)")
