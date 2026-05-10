"""Tara Yantra style icon: upward triangle with circumscribed circle touching all 3 vertices."""
from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 1024
CX = CY = SIZE // 2

VELVET_DARK = (8, 11, 32, 255)
VELVET_HIGH = (24, 30, 70, 255)
GOLD_DEEP = (138, 96, 12, 255)
GOLD = (212, 160, 23, 255)
GOLD_BRIGHT = (255, 215, 80, 255)
GOLD_PEAK = (255, 245, 200, 255)
SAFFRON = (255, 140, 66, 255)
CREAM = (245, 230, 211, 255)


def velvet_background(img: Image.Image) -> Image.Image:
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            dx, dy = x - CX, y - CY
            d = math.hypot(dx, dy) / (SIZE / 2)
            t = min(1.0, d)
            r = int(VELVET_HIGH[0] * (1 - t) + VELVET_DARK[0] * t)
            g = int(VELVET_HIGH[1] * (1 - t) + VELVET_DARK[1] * t)
            b = int(VELVET_HIGH[2] * (1 - t) + VELVET_DARK[2] * t)
            px[x, y] = (r, g, b, 255)
    return img


def make_icon(filename: str) -> None:
    img = Image.new("RGBA", (SIZE, SIZE), VELVET_DARK)
    img = velvet_background(img)

    # ── Geometry: circle passes through all 3 triangle vertices ──
    R = 360  # circle radius = distance from center to triangle vertices

    # Triangle vertices
    pts = []
    for i in range(3):
        a = math.radians(-90 + i * 120)
        pts.append((CX + R * math.cos(a), CY + R * math.sin(a)))

    # Halo behind everything
    halo = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    for r in range(R + 80, 100, -4):
        a = int(75 * (1 - r / (R + 80)) ** 1.6)
        if a > 0:
            hd.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*GOLD[:3], a))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=24))
    img = Image.alpha_composite(img, halo)

    # Outer ring — slightly larger to frame everything
    OUTER_R = R + 50
    ring = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([CX - OUTER_R, CY - OUTER_R, CX + OUTER_R, CY + OUTER_R], outline=GOLD_DEEP, width=10)
    rd.ellipse([CX - OUTER_R, CY - OUTER_R, CX + OUTER_R, CY + OUTER_R], outline=GOLD, width=4)
    img = Image.alpha_composite(img, ring)

    # 8 small lotus petals at outer ring positions (between triangle vertices)
    petal_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pd = ImageDraw.Draw(petal_layer)
    for i in range(8):
        a = (i / 8) * 2 * math.pi + math.pi / 8
        px_p = CX + (OUTER_R - 25) * math.cos(a)
        py_p = CY + (OUTER_R - 25) * math.sin(a)
        pd.ellipse([px_p - 28, py_p - 18, px_p + 28, py_p + 18], outline=GOLD, width=3)
    img = Image.alpha_composite(img, petal_layer)

    # ── MAIN CIRCLE (circumscribed) — touches all triangle vertices ──
    main_circle = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mcd = ImageDraw.Draw(main_circle)
    # Thick gold ring
    mcd.ellipse([CX - R - 14, CY - R - 14, CX + R + 14, CY + R + 14], outline=GOLD_DEEP, width=8)
    mcd.ellipse([CX - R, CY - R, CX + R, CY + R], outline=GOLD_BRIGHT, width=6)
    mcd.ellipse([CX - R + 4, CY - R + 4, CX + R - 4, CY + R - 4], outline=GOLD_PEAK, width=2)
    img = Image.alpha_composite(img, main_circle)

    # ── TRIANGLE — gradient fill, vertices on the circle ──
    tri_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tri_d = ImageDraw.Draw(tri_layer)
    for shrink in range(0, 240, 5):
        scale = 1 - shrink / R
        if scale <= 0:
            break
        tpts = [(CX + (p[0] - CX) * scale, CY + (p[1] - CY) * scale) for p in pts]
        t = shrink / 240
        r = int(GOLD_DEEP[0] * t + GOLD_PEAK[0] * (1 - t))
        g = int(GOLD_DEEP[1] * t + GOLD_PEAK[1] * (1 - t))
        b = int(GOLD_DEEP[2] * t + GOLD_PEAK[2] * (1 - t))
        a_val = max(0, 250 - shrink * 0.9)
        tri_d.polygon(tpts, fill=(r, g, b, int(a_val)))

    # Bloom
    tri_bloom = tri_layer.filter(ImageFilter.GaussianBlur(radius=14))
    img = Image.alpha_composite(img, tri_bloom)
    img = Image.alpha_composite(img, tri_layer)

    # Triangle outline — bold gold
    d = ImageDraw.Draw(img)
    d.polygon(pts, outline=GOLD_BRIGHT, width=10)
    inner_pts = [(CX + (p[0] - CX) * 0.94, CY + (p[1] - CY) * 0.94) for p in pts]
    d.polygon(inner_pts, outline=GOLD_PEAK, width=3)

    # Dots at the 3 vertices (emphasize they touch the circle)
    for p in pts:
        x, y = p
        # Saffron dot
        d.ellipse([x - 14, y - 14, x + 14, y + 14], fill=SAFFRON)
        d.ellipse([x - 8, y - 8, x + 8, y + 8], fill=GOLD_BRIGHT)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=CREAM)

    # Central bindu with bright glow
    bindu_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = ImageDraw.Draw(bindu_glow)
    for r in range(90, 4, -3):
        a = int(185 * (1 - r / 90) ** 1.5)
        bg.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*SAFFRON[:3], a))
    bindu_glow = bindu_glow.filter(ImageFilter.GaussianBlur(radius=12))
    img = Image.alpha_composite(img, bindu_glow)

    d = ImageDraw.Draw(img)
    d.ellipse([CX - 30, CY - 30, CX + 30, CY + 30], fill=SAFFRON)
    d.ellipse([CX - 19, CY - 19, CX + 19, CY + 19], fill=GOLD_BRIGHT)
    d.ellipse([CX - 9, CY - 9, CX + 9, CY + 9], fill=CREAM)

    img.save(filename, "PNG", optimize=True)
    print(f"Saved: {filename}")


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "../assets/images/icon.png"
    make_icon(out)
