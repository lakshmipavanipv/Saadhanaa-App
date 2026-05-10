"""Generate all required app icons."""
from PIL import Image, ImageDraw, ImageFilter
import math
import importlib.util

spec = importlib.util.spec_from_file_location("make_icon", "scripts/make-icon.py")
make_icon_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(make_icon_mod)

# Main icon
make_icon_mod.make_icon("assets/images/icon.png")

SIZE = 1024
CX = CY = SIZE // 2
GOLD = (212, 160, 23, 255)
GOLD_BRIGHT = (255, 215, 80, 255)
GOLD_PEAK = (255, 245, 200, 255)
GOLD_DEEP = (138, 96, 12, 255)
SAFFRON = (255, 140, 66, 255)
CREAM = (245, 230, 211, 255)


def make_foreground(filename: str) -> None:
    """Adaptive foreground — symbol on transparent, smaller for safe zone."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # Halo (subtle)
    halo = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    for r in range(330, 80, -4):
        a = int(50 * (1 - r / 330) ** 1.6)
        if a > 0:
            hd.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*GOLD[:3], a))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=18))
    img = Image.alpha_composite(img, halo)

    # Outer ring
    rl = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rl)
    for r, w, color in [
        (290, 14, (*GOLD_DEEP[:3], 255)),
        (290, 6, (*GOLD[:3], 255)),
        (290, 3, (*GOLD_BRIGHT[:3], 255)),
        (262, 3, (*GOLD[:3], 255)),
    ]:
        rd.ellipse([CX - r, CY - r, CX + r, CY + r], outline=color, width=w)
    img = Image.alpha_composite(img, rl)

    # Triangle
    tri_r = 220
    pts = []
    for i in range(3):
        a = math.radians(-90 + i * 120)
        pts.append((CX + tri_r * math.cos(a), CY + tri_r * math.sin(a)))

    tri = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    td = ImageDraw.Draw(tri)
    for shrink in range(0, 160, 5):
        scale = 1 - shrink / tri_r
        tpts = [(CX + (p[0] - CX) * scale, CY + (p[1] - CY) * scale) for p in pts]
        t = shrink / 160
        r = int(GOLD_DEEP[0] * t + GOLD_PEAK[0] * (1 - t))
        g = int(GOLD_DEEP[1] * t + GOLD_PEAK[1] * (1 - t))
        b = int(GOLD_DEEP[2] * t + GOLD_PEAK[2] * (1 - t))
        a_val = max(0, 245 - shrink * 1)
        td.polygon(tpts, fill=(r, g, b, a_val))
    tri_glow = tri.filter(ImageFilter.GaussianBlur(radius=12))
    img = Image.alpha_composite(img, tri_glow)
    img = Image.alpha_composite(img, tri)

    d = ImageDraw.Draw(img)
    d.polygon(pts, outline=GOLD_BRIGHT, width=8)
    inner_pts = [(CX + (p[0] - CX) * 0.93, CY + (p[1] - CY) * 0.93) for p in pts]
    d.polygon(inner_pts, outline=GOLD_PEAK, width=2)

    # Bindu
    bg_l = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg_d = ImageDraw.Draw(bg_l)
    for r in range(60, 4, -3):
        a = int(160 * (1 - r / 60) ** 1.5)
        bg_d.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(*SAFFRON[:3], a))
    bg_l = bg_l.filter(ImageFilter.GaussianBlur(radius=10))
    img = Image.alpha_composite(img, bg_l)

    d = ImageDraw.Draw(img)
    d.ellipse([CX - 22, CY - 22, CX + 22, CY + 22], fill=SAFFRON)
    d.ellipse([CX - 14, CY - 14, CX + 14, CY + 14], fill=GOLD_BRIGHT)
    d.ellipse([CX - 6, CY - 6, CX + 6, CY + 6], fill=CREAM)

    img.save(filename, "PNG", optimize=True)
    print(f"Saved: {filename}")


def make_background(filename: str) -> None:
    """Adaptive background — solid velvet."""
    img = Image.new("RGBA", (SIZE, SIZE), (8, 11, 32, 255))
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(SIZE // 2, 50, -10):
        a = int(28 * (1 - r / (SIZE / 2)))
        if a > 0:
            gd.ellipse(
                [SIZE // 2 - r, SIZE // 2 - r, SIZE // 2 + r, SIZE // 2 + r],
                fill=(212, 160, 23, a),
            )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=22))
    img = Image.alpha_composite(img, glow)
    img.save(filename, "PNG", optimize=True)
    print(f"Saved: {filename}")


make_foreground("assets/images/android-icon-foreground.png")
make_background("assets/images/android-icon-background.png")

# Splash and favicon = main icon
splash = Image.open("assets/images/icon.png")
splash.save("assets/images/splash-icon.png", "PNG", optimize=True)
print("Saved: splash-icon.png")

fav = Image.open("assets/images/icon.png").resize((48, 48), Image.LANCZOS)
fav.save("assets/images/favicon.png", "PNG", optimize=True)
print("Saved: favicon.png")
