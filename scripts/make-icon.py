"""Generate a richer Sri Yantra app icon using PIL."""
from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 1024
CX = CY = SIZE // 2

DEEP = (10, 14, 39, 255)
DEEP_TOP = (18, 22, 56, 255)
GOLD = (212, 160, 23, 255)
GOLD_BRIGHT = (255, 215, 80, 255)
GOLD_DIM = (140, 100, 18, 255)
SAFFRON = (255, 140, 66, 255)
CREAM = (245, 230, 211, 255)


def make_icon(filename: str) -> None:
    # Vertical gradient background
    img = Image.new("RGBA", (SIZE, SIZE), DEEP)
    px = img.load()
    for y in range(SIZE):
        t = y / SIZE
        r = int(DEEP_TOP[0] * (1 - t) + DEEP[0] * t)
        g = int(DEEP_TOP[1] * (1 - t) + DEEP[1] * t)
        b = int(DEEP_TOP[2] * (1 - t) + DEEP[2] * t)
        for x in range(SIZE):
            px[x, y] = (r, g, b, 255)

    # Big radial glow behind everything
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(SIZE // 2, 100, -6):
        a = int(55 * (1 - r / (SIZE / 2)) ** 1.4)
        if a > 0:
            gd.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(212, 160, 23, a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=24))
    img = Image.alpha_composite(img, glow)

    # Build the yantra on a high-res transparent layer (then composite)
    yantra = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(yantra)

    # Outer triple square frame
    sq = 870
    sq_l, sq_t = CX - sq // 2, CY - sq // 2
    sq_r, sq_b = sq_l + sq, sq_t + sq

    for off, w in ((0, 5), (16, 4), (32, 3)):
        d.rectangle(
            [sq_l - off, sq_t - off, sq_r + off, sq_b + off],
            outline=GOLD,
            width=w,
        )

    # 4 T-shape gates
    gw, gd_ = 160, 70
    for x1, y1, x2, y2 in [
        (CX - gw // 2, sq_t - 32 - gd_, CX + gw // 2, sq_t - 32),  # top
        (CX - gw // 2, sq_b + 32, CX + gw // 2, sq_b + 32 + gd_),  # bottom
        (sq_l - 32 - gd_, CY - gw // 2, sq_l - 32, CY + gw // 2),  # left
        (sq_r + 32, CY - gw // 2, sq_r + 32 + gd_, CY + gw // 2),  # right
    ]:
        d.rectangle([x1, y1, x2, y2], outline=GOLD, width=4)
        # Inner T-line
        if x2 - x1 > y2 - y1:  # horizontal gate
            mid_y = (y1 + y2) // 2
            d.line([x1, mid_y, x2, mid_y], fill=GOLD_DIM, width=2)
        else:
            mid_x = (x1 + x2) // 2
            d.line([mid_x, y1, mid_x, y2], fill=GOLD_DIM, width=2)

    # Outer 16-petal lotus — stylized teardrop petals
    outer_petal_r = 380
    for i in range(16):
        a = (i / 16) * 2 * math.pi
        cx_p = CX + outer_petal_r * math.cos(a)
        cy_p = CY + outer_petal_r * math.sin(a)
        # Teardrop petal: ellipse oriented radially
        petal_l, petal_w = 80, 48
        # Compute corner points of bounding box
        d.ellipse(
            [cx_p - petal_l, cy_p - petal_w, cx_p + petal_l, cy_p + petal_w],
            outline=GOLD,
            width=4,
        )
        d.ellipse(
            [cx_p - petal_l + 6, cy_p - petal_w + 6,
             cx_p + petal_l - 6, cy_p + petal_w - 6],
            outline=GOLD_DIM,
            width=2,
        )

    # Two outer rings
    d.ellipse([CX - 360, CY - 360, CX + 360, CY + 360], outline=GOLD, width=4)
    d.ellipse([CX - 348, CY - 348, CX + 348, CY + 348], outline=GOLD_DIM, width=2)

    # Inner 8-petal lotus
    inner_petal_r = 285
    for i in range(8):
        a = (i / 8) * 2 * math.pi + math.pi / 8
        cx_p = CX + inner_petal_r * math.cos(a)
        cy_p = CY + inner_petal_r * math.sin(a)
        petal_l, petal_w = 75, 55
        d.ellipse(
            [cx_p - petal_l, cy_p - petal_w, cx_p + petal_l, cy_p + petal_w],
            outline=GOLD,
            width=4,
        )

    # Inner ring
    d.ellipse([CX - 252, CY - 252, CX + 252, CY + 252], outline=GOLD, width=4)
    d.ellipse([CX - 240, CY - 240, CX + 240, CY + 240], outline=GOLD_DIM, width=2)

    # Sri Yantra core: 9 interlocking triangles (4 up, 5 down)
    # Sized progressively
    up_radii = [235, 195, 155, 115]
    down_radii = [240, 205, 170, 135, 100]
    for r in up_radii:
        d.polygon(
            _equi_triangle(CX, CY, r, 0),
            outline=GOLD_BRIGHT,
            width=5,
        )
    for r in down_radii:
        d.polygon(
            _equi_triangle(CX, CY, r, 180),
            outline=GOLD_BRIGHT,
            width=5,
        )

    # Gentle glow on the triangles
    triangle_glow = yantra.filter(ImageFilter.GaussianBlur(radius=4))
    yantra = Image.alpha_composite(triangle_glow, yantra)

    img = Image.alpha_composite(img, yantra)

    # Central bindu with bright glow
    bindu_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = ImageDraw.Draw(bindu_glow)
    for r in range(75, 4, -3):
        a = int(155 * (1 - r / 75) ** 1.5)
        bg.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(255, 140, 66, a))
    bindu_glow = bindu_glow.filter(ImageFilter.GaussianBlur(radius=10))
    img = Image.alpha_composite(img, bindu_glow)

    d2 = ImageDraw.Draw(img)
    d2.ellipse([CX - 18, CY - 18, CX + 18, CY + 18], fill=SAFFRON)
    d2.ellipse([CX - 10, CY - 10, CX + 10, CY + 10], fill=GOLD_BRIGHT)
    d2.ellipse([CX - 4, CY - 4, CX + 4, CY + 4], fill=CREAM)

    img.save(filename, "PNG", optimize=True)
    print(f"Saved: {filename}")


def _equi_triangle(cx: float, cy: float, r: float, rotate_deg: float) -> list:
    pts = []
    for i in range(3):
        a = math.radians(-90 + rotate_deg + i * 120)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "../assets/images/icon.png"
    make_icon(out)
