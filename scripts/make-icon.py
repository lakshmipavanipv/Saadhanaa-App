"""Generate Sri Yantra app icon as PNG using PIL."""
from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 1024
CX = CY = SIZE // 2

DEEP = (10, 14, 39, 255)
GOLD = (212, 160, 23, 255)
GOLD_BRIGHT = (255, 215, 80, 255)
SAFFRON = (255, 140, 66, 255)
CREAM = (245, 230, 211, 255)


def make_icon(filename: str) -> None:
    img = Image.new("RGBA", (SIZE, SIZE), DEEP)

    # Radial glow
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(SIZE // 2, 50, -8):
        alpha = int(40 * (1 - r / (SIZE / 2)))
        if alpha > 0:
            gd.ellipse(
                [CX - r, CY - r, CX + r, CY + r],
                fill=(212, 160, 23, alpha),
            )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=18))
    img = Image.alpha_composite(img, glow)

    draw = ImageDraw.Draw(img)

    # Outer square frame with 4 T-shape gates
    sq_size = 880
    sq_left = CX - sq_size // 2
    sq_top = CY - sq_size // 2
    sq_right = sq_left + sq_size
    sq_bottom = sq_top + sq_size

    # Outer square (3 concentric)
    for offset in (0, 14, 28):
        draw.rectangle(
            [
                sq_left - offset,
                sq_top - offset,
                sq_right + offset,
                sq_bottom + offset,
            ],
            outline=GOLD,
            width=4,
        )

    # 4 T-shape gates (top, bottom, left, right)
    gate_w = 140
    gate_d = 60
    # Top
    draw.rectangle(
        [CX - gate_w // 2, sq_top - 28 - gate_d, CX + gate_w // 2, sq_top - 28],
        outline=GOLD,
        width=4,
    )
    # Bottom
    draw.rectangle(
        [
            CX - gate_w // 2,
            sq_bottom + 28,
            CX + gate_w // 2,
            sq_bottom + 28 + gate_d,
        ],
        outline=GOLD,
        width=4,
    )
    # Left
    draw.rectangle(
        [
            sq_left - 28 - gate_d,
            CY - gate_w // 2,
            sq_left - 28,
            CY + gate_w // 2,
        ],
        outline=GOLD,
        width=4,
    )
    # Right
    draw.rectangle(
        [
            sq_right + 28,
            CY - gate_w // 2,
            sq_right + 28 + gate_d,
            CY + gate_w // 2,
        ],
        outline=GOLD,
        width=4,
    )

    # Outer 16-petal lotus
    outer_r = 380
    petal_count = 16
    for i in range(petal_count):
        a = (i / petal_count) * 2 * math.pi
        x = CX + outer_r * math.cos(a)
        y = CY + outer_r * math.sin(a)
        # tear-drop petal
        pr = 56
        draw.ellipse([x - pr, y - pr, x + pr, y + pr], outline=GOLD, width=4)

    # Outer ring
    draw.ellipse(
        [CX - 360, CY - 360, CX + 360, CY + 360],
        outline=GOLD,
        width=4,
    )
    draw.ellipse(
        [CX - 340, CY - 340, CX + 340, CY + 340],
        outline=GOLD,
        width=3,
    )

    # Inner 8-petal lotus
    inner_r = 280
    for i in range(8):
        a = (i / 8) * 2 * math.pi + math.pi / 8
        x = CX + inner_r * math.cos(a)
        y = CY + inner_r * math.sin(a)
        pr = 64
        draw.ellipse([x - pr, y - pr, x + pr, y + pr], outline=GOLD, width=4)

    # Inner ring
    draw.ellipse(
        [CX - 250, CY - 250, CX + 250, CY + 250],
        outline=GOLD,
        width=4,
    )

    # Sri Yantra: 9 interlocking triangles (4 up, 5 down)
    # Centred set of triangles, varying sizes
    triangle_sets = [
        # Upward triangles (Shiva)
        {"pts": _equi_triangle(CX, CY, 240, 0), "color": GOLD, "width": 4},
        {"pts": _equi_triangle(CX, CY, 200, 0), "color": GOLD, "width": 4},
        {"pts": _equi_triangle(CX, CY, 165, 0), "color": GOLD, "width": 4},
        {"pts": _equi_triangle(CX, CY, 120, 0), "color": GOLD, "width": 4},
        # Downward triangles (Shakti)
        {"pts": _equi_triangle(CX, CY, 240, 180), "color": GOLD, "width": 4},
        {"pts": _equi_triangle(CX, CY, 210, 180), "color": GOLD, "width": 4},
        {"pts": _equi_triangle(CX, CY, 175, 180), "color": GOLD, "width": 4},
        {"pts": _equi_triangle(CX, CY, 140, 180), "color": GOLD, "width": 4},
        {"pts": _equi_triangle(CX, CY, 100, 180), "color": GOLD, "width": 4},
    ]

    for ts in triangle_sets:
        draw.polygon(ts["pts"], outline=ts["color"], width=ts["width"])

    # Central bindu with glow
    bindu_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = ImageDraw.Draw(bindu_glow)
    for r in range(60, 6, -3):
        alpha = int(120 * (1 - r / 60))
        bg.ellipse(
            [CX - r, CY - r, CX + r, CY + r],
            fill=(255, 140, 66, alpha),
        )
    bindu_glow = bindu_glow.filter(ImageFilter.GaussianBlur(radius=8))
    img = Image.alpha_composite(img, bindu_glow)

    draw = ImageDraw.Draw(img)
    # Central bindu dot
    draw.ellipse([CX - 14, CY - 14, CX + 14, CY + 14], fill=SAFFRON)
    draw.ellipse([CX - 6, CY - 6, CX + 6, CY + 6], fill=CREAM)

    img.save(filename, "PNG", optimize=True)
    print(f"Saved: {filename}")


def _equi_triangle(cx: float, cy: float, r: float, rotate_deg: float) -> list:
    """Equilateral triangle, pointing up by default."""
    pts = []
    for i in range(3):
        a = math.radians(-90 + rotate_deg + i * 120)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


if __name__ == "__main__":
    import sys
    out = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "../assets/images/icon.png"
    )
    make_icon(out)
