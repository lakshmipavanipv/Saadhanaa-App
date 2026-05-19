"""Convert a user-supplied image into all required app-icon variants."""
from PIL import Image, ImageFilter
import sys, math

SRC = sys.argv[1]
SIZE = 1024

# Open & crop to square (centered) so we keep the yantra in view
src = Image.open(SRC).convert("RGBA")
w, h = src.size
short = min(w, h)
left = (w - short) // 2
top = (h - short) // 2
sq = src.crop((left, top, left + short, top + short)).resize((SIZE, SIZE), Image.LANCZOS)

# Main icon
sq.save("assets/images/icon.png", "PNG", optimize=True)
print("Saved icon.png")

# Splash icon (same)
sq.save("assets/images/splash-icon.png", "PNG", optimize=True)
print("Saved splash-icon.png")

# Favicon (small)
sq.resize((48, 48), Image.LANCZOS).save("assets/images/favicon.png", "PNG", optimize=True)
print("Saved favicon.png")

# Adaptive foreground — yantra centered on transparent, with safe-zone padding
fg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
inner = sq.resize((720, 720), Image.LANCZOS)
fg.paste(inner, ((SIZE - 720) // 2, (SIZE - 720) // 2), inner)
fg.save("assets/images/android-icon-foreground.png", "PNG", optimize=True)
print("Saved android-icon-foreground.png")

# Adaptive background — black (matches the original image background)
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
bg.save("assets/images/android-icon-background.png", "PNG", optimize=True)
print("Saved android-icon-background.png")
