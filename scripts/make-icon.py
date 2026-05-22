"""Clean minimalist Sadhana icon: glowing upward triangle inside a circle.
NO TEXT, no mantras, no lotus petals — just sacred geometry."""
from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 1024
CX = CY = SIZE // 2

BLACK = (8, 11, 32, 255)        # deep midnight, not pure black
GOLD_DEEP = (140, 95, 12, 255)
GOLD = (220, 165, 25, 255)
GOLD_BRIGHT = (255, 215, 80, 255)
GOLD_PEAK = (255, 245, 200, 255)
SAFFRON = (255, 140, 66, 255)


def make_icon(filename: str) -> None:
    img = Image.new("RGBA", (SIZE, SIZE), BLACK)

    # Subtle radial halo
    halo = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    for r in range(SIZE // 2, 80, -4):
        a = int(70 * (1 - r / (SIZE / 2)) ** 1.6)
        if a > 0:
            hd.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*GOLD[:3], a))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=24))
    img = Image.alpha_composite(img, halo)

    # ── Geometry: circle that passes through the 3 triangle vertices ──
    R = 360
    pts = []
    for i in range(3):
        a = math.radians(-90 + i * 120)
        pts.append((CX + R * math.cos(a), CY + R * math.sin(a)))

    # Main gold circle (double-stroke for shine)
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([CX - R - 14, CY - R - 14, CX + R + 14, CY + R + 14],
               outline=GOLD_DEEP, width=10)
    ld.ellipse([CX - R, CY - R, CX + R, CY + R],
               outline=GOLD_BRIGHT, width=6)
    ld.ellipse([CX - R + 5, CY - R + 5, CX + R - 5, CY + R - 5],
               outline=GOLD_PEAK, width=2)
    img = Image.alpha_composite(img, layer)

    # ── Triangle: gradient fill (bright apex → deep base) ──
    tri = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tri_d = ImageDraw.Draw(tri)
    for shrink in range(0, 240, 4):
        scale = 1 - shrink / R
        if scale <= 0:
            break
        tpts = [(CX + (p[0] - CX) * scale, CY + (p[1] - CY) * scale) for p in pts]
        t = shrink / 240
        r_v = int(GOLD_DEEP[0] * t + GOLD_PEAK[0] * (1 - t))
        g_v = int(GOLD_DEEP[1] * t + GOLD_PEAK[1] * (1 - t))
        b_v = int(GOLD_DEEP[2] * t + GOLD_PEAK[2] * (1 - t))
        a_v = max(0, 250 - shrink * 0.85)
        tri_d.polygon(tpts, fill=(r_v, g_v, b_v, int(a_v)))

    # Bloom glow around the triangle
    tri_bloom = tri.filter(ImageFilter.GaussianBlur(radius=12))
    img = Image.alpha_composite(img, tri_bloom)
    img = Image.alpha_composite(img, tri)

    # Crisp triangle outline
    d = ImageDraw.Draw(img)
    d.polygon(pts, outline=GOLD_BRIGHT, width=10)
    inner_pts = [(CX + (p[0] - CX) * 0.94, CY + (p[1] - CY) * 0.94) for p in pts]
    d.polygon(inner_pts, outline=GOLD_PEAK, width=3)

    # ── Vertex dots — where the triangle touches the circle ──
    for p in pts:
        d.ellipse([p[0] - 14, p[1] - 14, p[0] + 14, p[1] + 14], fill=SAFFRON)
        d.ellipse([p[0] - 8, p[1] - 8, p[0] + 8, p[1] + 8], fill=GOLD_BRIGHT)
        d.ellipse([p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3], fill=GOLD_PEAK)

    # ── Central bindu with bright glow ──
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r_x in range(95, 4, -3):
        a = int(180 * (1 - r_x / 95) ** 1.5)
        gd.ellipse([CX - r_x, CY - r_x, CX + r_x, CY + r_x], fill=(*SAFFRON[:3], a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=10))
    img = Image.alpha_composite(img, glow)

    d = ImageDraw.Draw(img)
    d.ellipse([CX - 24, CY - 24, CX + 24, CY + 24], fill=SAFFRON)
    d.ellipse([CX - 14, CY - 14, CX + 14, CY + 14], fill=GOLD_BRIGHT)
    d.ellipse([CX - 5, CY - 5, CX + 5, CY + 5], fill=GOLD_PEAK)

    img.save(filename, "PNG", optimize=True)
    print(f"Saved: {filename}")


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "../assets/images/icon.png"
    make_icon(out)
