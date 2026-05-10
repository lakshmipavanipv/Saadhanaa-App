"""Generate all required app icons."""
from PIL import Image, ImageDraw, ImageFilter
import math
import importlib.util

spec = importlib.util.spec_from_file_location("make_icon", "scripts/make-icon.py")
make_icon_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(make_icon_mod)

# Main icon (already generated)
make_icon_mod.make_icon("assets/images/icon.png")

# Adaptive icon foreground — smaller, centered, transparent background
SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# Render to a smaller temp image, paste centered with safe zone
tmp_size = 700
tmp = Image.new("RGBA", (tmp_size, tmp_size), (0, 0, 0, 0))
draw = ImageDraw.Draw(tmp)

CX = CY = tmp_size // 2
GOLD = (212, 160, 23, 255)
SAFFRON = (255, 140, 66, 255)
CREAM = (245, 230, 211, 255)

# Outer ring
draw.ellipse([CX - 320, CY - 320, CX + 320, CY + 320], outline=GOLD, width=4)

# 16-petal lotus
for i in range(16):
    a = (i / 16) * 2 * math.pi
    x = CX + 280 * math.cos(a)
    y = CY + 280 * math.sin(a)
    pr = 50
    draw.ellipse([x - pr, y - pr, x + pr, y + pr], outline=GOLD, width=4)

# Inner ring
draw.ellipse([CX - 240, CY - 240, CX + 240, CY + 240], outline=GOLD, width=4)

# 8-petal lotus
for i in range(8):
    a = (i / 8) * 2 * math.pi + math.pi / 8
    x = CX + 195 * math.cos(a)
    y = CY + 195 * math.sin(a)
    pr = 55
    draw.ellipse([x - pr, y - pr, x + pr, y + pr], outline=GOLD, width=4)

# Inner ring 2
draw.ellipse([CX - 175, CY - 175, CX + 175, CY + 175], outline=GOLD, width=4)


def equi(cx, cy, r, rotate):
    pts = []
    for i in range(3):
        a = math.radians(-90 + rotate + i * 120)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# 9 triangles
for r in (165, 140, 115, 85):
    draw.polygon(equi(CX, CY, r, 0), outline=GOLD, width=4)
for r in (165, 145, 120, 95, 70):
    draw.polygon(equi(CX, CY, r, 180), outline=GOLD, width=4)

# Bindu
glow = Image.new("RGBA", (tmp_size, tmp_size), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for r in range(40, 4, -2):
    alpha = int(150 * (1 - r / 40))
    gd.ellipse([CX - r, CY - r, CX + r, CY + r], fill=(255, 140, 66, alpha))
glow = glow.filter(ImageFilter.GaussianBlur(radius=6))
tmp = Image.alpha_composite(tmp, glow)
draw = ImageDraw.Draw(tmp)
draw.ellipse([CX - 10, CY - 10, CX + 10, CY + 10], fill=SAFFRON)
draw.ellipse([CX - 4, CY - 4, CX + 4, CY + 4], fill=CREAM)

# Paste into 1024x1024 transparent
offset = (SIZE - tmp_size) // 2
img.paste(tmp, (offset, offset), tmp)
img.save("assets/images/android-icon-foreground.png", "PNG", optimize=True)
print("Saved: android-icon-foreground.png")

# Background — solid deep blue
bg = Image.new("RGBA", (SIZE, SIZE), (10, 14, 39, 255))
# Subtle radial glow
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for r in range(SIZE // 2, 50, -10):
    alpha = int(20 * (1 - r / (SIZE / 2)))
    if alpha > 0:
        gd.ellipse(
            [SIZE // 2 - r, SIZE // 2 - r, SIZE // 2 + r, SIZE // 2 + r],
            fill=(212, 160, 23, alpha),
        )
glow = glow.filter(ImageFilter.GaussianBlur(radius=20))
bg = Image.alpha_composite(bg, glow)
bg.save("assets/images/android-icon-background.png", "PNG", optimize=True)
print("Saved: android-icon-background.png")

# Splash icon — same as main, scaled down a bit
splash = Image.open("assets/images/icon.png")
splash.save("assets/images/splash-icon.png", "PNG", optimize=True)
print("Saved: splash-icon.png")

# Favicon
fav = Image.open("assets/images/icon.png").resize((48, 48), Image.LANCZOS)
fav.save("assets/images/favicon.png", "PNG", optimize=True)
print("Saved: favicon.png")
