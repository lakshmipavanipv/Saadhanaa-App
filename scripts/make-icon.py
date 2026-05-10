"""Generate a bold, simple, shiny icon: triangle inside circle on velvet."""
from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 1024
CX = CY = SIZE // 2

VELVET_DARK = (8, 11, 32, 255)
VELVET_MID = (16, 20, 50, 255)
VELVET_HIGH = (24, 30, 70, 255)
GOLD_DEEP = (138, 96, 12, 255)
GOLD = (212, 160, 23, 255)
GOLD_BRIGHT = (255, 215, 80, 255)
GOLD_PEAK = (255, 245, 200, 255)
SAFFRON = (255, 140, 66, 255)
CREAM = (245, 230, 211, 255)


def velvet_background(img: Image.Image) -> Image.Image:
    """Radial velvet — darker edges, lifted center."""
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

    # Big radial gold halo behind the symbol
    halo = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    for r in range(420, 100, -4):
        a = int(70 * (1 - r / 420) ** 1.6)
        if a > 0:
            hd.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*GOLD[:3], a))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=20))
    img = Image.alpha_composite(img, halo)

    # Outer glowing ring (made of stacked rings of varying brightness)
    ring_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring_layer)
    for r, w, color in [
        (370, 18, (*GOLD_DEEP[:3], 255)),
        (370, 8, (*GOLD[:3], 255)),
        (370, 3, (*GOLD_BRIGHT[:3], 255)),
        (336, 4, (*GOLD[:3], 255)),
        (336, 2, (*GOLD_BRIGHT[:3], 255)),
    ]:
        rd.ellipse([CX - r, CY - r, CX + r, CY + r], outline=color, width=w)
    img = Image.alpha_composite(img, ring_layer)

    # Triangle pointing up — bold, glowing, gradient-filled
    tri_r = 280
    pts = []
    for i in range(3):
        a = math.radians(-90 + i * 120)
        pts.append((CX + tri_r * math.cos(a), CY + tri_r * math.sin(a)))

    # Triangle gradient fill: bottom dark, top bright
    tri_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tri_d = ImageDraw.Draw(tri_layer)
    # Subtle inner gradient via stacked smaller triangles
    for shrink in range(0, 200, 6):
        scale = 1 - shrink / tri_r
        tpts = [(CX + (p[0] - CX) * scale, CY + (p[1] - CY) * scale) for p in pts]
        # Position-dependent shade — base of the original triangle was at apex y, so shade by shrink
        t = shrink / 200
        r = int(GOLD_DEEP[0] * t + GOLD_PEAK[0] * (1 - t))
        g = int(GOLD_DEEP[1] * t + GOLD_PEAK[1] * (1 - t))
        b = int(GOLD_DEEP[2] * t + GOLD_PEAK[2] * (1 - t))
        a_val = max(0, 245 - shrink * 1)
        tri_d.polygon(tpts, fill=(r, g, b, a_val))

    # Soft glow around triangle
    tri_glow = tri_layer.filter(ImageFilter.GaussianBlur(radius=14))
    img = Image.alpha_composite(img, tri_glow)
    img = Image.alpha_composite(img, tri_layer)

    # Bold gold outline on triangle
    d = ImageDraw.Draw(img)
    d.polygon(pts, outline=GOLD_BRIGHT, width=10)
    # Inner outline highlight
    inner_pts = [(CX + (p[0] - CX) * 0.93, CY + (p[1] - CY) * 0.93) for p in pts]
    d.polygon(inner_pts, outline=GOLD_PEAK, width=3)

    # Central bindu (Om-like point) with glow
    bindu_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = ImageDraw.Draw(bindu_glow)
    for r in range(80, 4, -3):
        a = int(180 * (1 - r / 80) ** 1.5)
        bg.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*SAFFRON[:3], a))
    bindu_glow = bindu_glow.filter(ImageFilter.GaussianBlur(radius=12))
    img = Image.alpha_composite(img, bindu_glow)

    d = ImageDraw.Draw(img)
    d.ellipse([CX - 28, CY - 28, CX + 28, CY + 28], fill=SAFFRON)
    d.ellipse([CX - 18, CY - 18, CX + 18, CY + 18], fill=GOLD_BRIGHT)
    d.ellipse([CX - 8, CY - 8, CX + 8, CY + 8], fill=CREAM)

    # Specular highlight on the triangle (top-left edge shine)
    spec = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(spec)
    # Highlight along the upper-left edge
    p1 = pts[0]  # top
    p2 = pts[2]  # bottom-left
    for off, alpha in [(0, 90), (-3, 60), (-6, 40)]:
        sd.line(
            [(p1[0] + off, p1[1] + off), (p2[0] + off, p2[1] + off)],
            fill=(*GOLD_PEAK[:3], alpha),
            width=4,
        )
    spec = spec.filter(ImageFilter.GaussianBlur(radius=4))
    img = Image.alpha_composite(img, spec)

    img.save(filename, "PNG", optimize=True)
    print(f"Saved: {filename}")


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "../assets/images/icon.png"
    make_icon(out)
