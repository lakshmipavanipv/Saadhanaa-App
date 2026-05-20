"""Clean glowing upward triangle on black — no mantras, no bija, no inner symbols.
One simplified outer lotus ring (not the dense double ring)."""
from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 1024
CX = CY = SIZE // 2

BLACK = (0, 0, 0, 255)
GOLD_DEEP = (140, 95, 12, 255)
GOLD = (220, 165, 25, 255)
GOLD_BRIGHT = (255, 215, 80, 255)
GOLD_PEAK = (255, 245, 200, 255)


def make_icon(filename: str) -> None:
    img = Image.new("RGBA", (SIZE, SIZE), BLACK)

    # Large radial halo
    halo = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    for r in range(SIZE // 2, 80, -4):
        a = int(75 * (1 - r / (SIZE / 2)) ** 1.6)
        if a > 0:
            hd.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*GOLD[:3], a))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=28))
    img = Image.alpha_composite(img, halo)

    # ── Triangle geometry — circle touches all 3 vertices ──
    R = 340
    pts = []
    for i in range(3):
        a = math.radians(-90 + i * 120)
        pts.append((CX + R * math.cos(a), CY + R * math.sin(a)))

    # ── Outer simplified lotus ring — petals further out, lighter density ──
    petal_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pd = ImageDraw.Draw(petal_layer)
    LOTUS_R = R + 78  # spaced away from the triangle
    PETAL_COUNT = 12  # fewer petals → less busy
    for i in range(PETAL_COUNT):
        a = (i / PETAL_COUNT) * 2 * math.pi - math.pi / 2
        cx_p = CX + LOTUS_R * math.cos(a)
        cy_p = CY + LOTUS_R * math.sin(a)
        # Simple radial petal (rotated ellipse via two-stroke outline)
        pd.ellipse([cx_p - 42, cy_p - 22, cx_p + 42, cy_p + 22], outline=GOLD, width=4)
        pd.ellipse([cx_p - 36, cy_p - 16, cx_p + 36, cy_p + 16], outline=GOLD_DEEP, width=2)

    # Soft glow under petals
    petal_glow = petal_layer.filter(ImageFilter.GaussianBlur(radius=10))
    img = Image.alpha_composite(img, petal_glow)
    img = Image.alpha_composite(img, petal_layer)

    # Outer ring (subtle, single) holding the lotus
    outer_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    od = ImageDraw.Draw(outer_layer)
    od.ellipse([CX - (LOTUS_R + 22), CY - (LOTUS_R + 22), CX + (LOTUS_R + 22), CY + (LOTUS_R + 22)], outline=GOLD, width=3)
    od.ellipse([CX - (LOTUS_R + 32), CY - (LOTUS_R + 32), CX + (LOTUS_R + 32), CY + (LOTUS_R + 32)], outline=GOLD_DEEP, width=2)
    img = Image.alpha_composite(img, outer_layer)

    # ── Main glowing triangle ──
    # Outline only, with multiple-stroke glow + bright crisp top
    tri = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    td = ImageDraw.Draw(tri)
    # Wide soft outline (glow)
    td.polygon(pts, outline=(*GOLD[:3], 220), width=22)
    img = Image.alpha_composite(img, tri.filter(ImageFilter.GaussianBlur(radius=10)))

    # Crisp gold outline
    tri2 = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    td2 = ImageDraw.Draw(tri2)
    td2.polygon(pts, outline=GOLD_BRIGHT, width=10)
    img = Image.alpha_composite(img, tri2)

    # Bright inner highlight on the three vertices
    d = ImageDraw.Draw(img)
    inner_pts = [(CX + (p[0] - CX) * 0.96, CY + (p[1] - CY) * 0.96) for p in pts]
    d.polygon(inner_pts, outline=GOLD_PEAK, width=3)
    for p in pts:
        d.ellipse([p[0] - 12, p[1] - 12, p[0] + 12, p[1] + 12], fill=GOLD_BRIGHT)
        d.ellipse([p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5], fill=GOLD_PEAK)

    # Central bindu — single bright dot, no symbol around
    bindu_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = ImageDraw.Draw(bindu_glow)
    for r in range(95, 4, -3):
        a = int(180 * (1 - r / 95) ** 1.5)
        bg.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*GOLD_BRIGHT[:3], a))
    bindu_glow = bindu_glow.filter(ImageFilter.GaussianBlur(radius=12))
    img = Image.alpha_composite(img, bindu_glow)

    d = ImageDraw.Draw(img)
    d.ellipse([CX - 22, CY - 22, CX + 22, CY + 22], fill=GOLD_BRIGHT)
    d.ellipse([CX - 12, CY - 12, CX + 12, CY + 12], fill=GOLD_PEAK)
    d.ellipse([CX - 4, CY - 4, CX + 4, CY + 4], fill=(255, 255, 255, 255))

    img.save(filename, "PNG", optimize=True)
    print(f"Saved: {filename}")


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "../assets/images/icon.png"
    make_icon(out)
