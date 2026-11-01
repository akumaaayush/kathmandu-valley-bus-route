"""Generates public/og-image.png, the 1200 x 630 link-preview image (Open Graph / X cards).

A crop of the map tiles around central Kathmandu, with the app icon, name and network size on a dark panel.
Run from the repo root after the tiles or the trip network change:

    .\\.venv\\Scripts\\python scripts/generate_og_image.py

Needs Pillow. Uses Segoe UI (Windows) when available, else Pillow's default font.
"""

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TILES = ROOT / "public" / "tiles"
OUT = ROOT / "public" / "og-image.png"

WIDTH, HEIGHT = 1200, 630
TILE = 256
ZOOM = 4  # canvas pixels / 4 (canvas = zoom 6)
CENTER = (4409.3, 4143.9)  # Ratnapark on the zoom-6 canvas
CENTER_AT_X = 790  # where the centre lands in the image, right of the text panel
BACKGROUND = (10, 10, 10)
FONT_DIR = Path("C:/Windows/Fonts")
SITE = "ktmroute.shahaayush.com.np"

# App icon geometry (same as scripts/generate_app_icons.py), on a 512 grid
ROUTES = [
    ("#c99629", [(256, 112), (256, 400)]),
    ("#1ba546", [(112, 256), (400, 256)]),
    ("#e11d48", [(142, 370), (370, 142)]),
]
STOPS = [(256, 256), (256, 112), (256, 400), (112, 256), (400, 256), (142, 370), (370, 142)]


def font(name, size):
    try:
        return ImageFont.truetype(str(FONT_DIR / name), size)
    except OSError:
        return ImageFont.load_default(size)


def network_counts():
    """Routes, stops and operators from the generated trip network."""
    text = (ROOT / "src" / "data" / "tripNetwork.js").read_text(encoding="utf-8")
    stations_line = next(line for line in text.splitlines() if line.startswith("export const STATIONS"))
    stations = stations_line.count('["')
    lines = text.count('"svgId"')
    operators = len(set(re.findall(r'"op":\s*"([A-Z])"', text)))
    return lines, stations, operators


def map_crop():
    scale = 2 ** (6 - ZOOM)
    cx, cy = CENTER[0] / scale, CENTER[1] / scale
    left, top = int(cx - CENTER_AT_X), int(cy - HEIGHT / 2)
    img = Image.new("RGB", (WIDTH, HEIGHT), (255, 255, 255))
    for tx in range(left // TILE, (left + WIDTH) // TILE + 1):
        for ty in range(top // TILE, (top + HEIGHT) // TILE + 1):
            path = TILES / str(ZOOM) / str(tx) / f"{ty}.png"
            if path.exists():
                tile = Image.open(path).convert("RGB")
                img.paste(tile, (tx * TILE - left, ty * TILE - top))
    return img


def dark_panel(img):
    """Solid dark on the left, fading into the map."""
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    solid, fade = 470, 300
    px = overlay.load()
    for x in range(WIDTH):
        if x < solid:
            alpha = 255
        elif x < solid + fade:
            t = (x - solid) / fade
            alpha = int(255 * (1 - t) ** 1.6)
        else:
            alpha = 0
        for y in range(HEIGHT):
            px[x, y] = (*BACKGROUND, alpha)
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def draw_logo(size):
    s = 4  # supersample
    canvas = size * s
    scale = canvas / 512
    logo = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(logo)
    d.rounded_rectangle((0, 0, canvas - 1, canvas - 1), radius=int(112 * scale), fill=BACKGROUND, outline=(60, 60, 60), width=s * 2)
    width = int(30 * scale)
    for color, pts in ROUTES:
        pts = [(x * scale, y * scale) for x, y in pts]
        d.line(pts, fill=color, width=width)
        for x, y in (pts[0], pts[-1]):
            d.ellipse((x - width / 2, y - width / 2, x + width / 2, y + width / 2), fill=color)
    for x, y in STOPS:
        cx, cy = x * scale, y * scale
        d.ellipse((cx - 26 * scale, cy - 26 * scale, cx + 26 * scale, cy + 26 * scale), fill=BACKGROUND)
        d.ellipse((cx - 14 * scale, cy - 14 * scale, cx + 14 * scale, cy + 14 * scale), fill="#ffffff")
    return logo.resize((size, size), Image.LANCZOS)


def main():
    lines, stations, operators = network_counts()
    img = dark_panel(map_crop())
    d = ImageDraw.Draw(img)

    x = 64
    img.alpha_composite(draw_logo(88), (x, 72))
    d.text((x, 196), "Kathmandu Valley", font=font("segoeuib.ttf", 58), fill="#fafafa")
    d.text((x, 262), "Bus Route Map", font=font("segoeuib.ttf", 58), fill="#fafafa")
    d.text((x, 348), "Which bus to take, where to change,", font=font("segoeui.ttf", 26), fill="#a3a3a3")
    d.text((x, 382), "and every stop on the way.", font=font("segoeui.ttf", 26), fill="#a3a3a3")

    # Network size as small pills
    pill_font = font("seguisb.ttf", 22)
    px = x
    for label in (f"{lines} routes", f"{stations} stops", f"{operators} operators"):
        w = d.textlength(label, font=pill_font)
        d.rounded_rectangle((px, 450, px + w + 32, 492), radius=21, fill=(38, 38, 38), outline=(64, 64, 64))
        d.text((px + 16, 471), label, font=pill_font, fill="#e5e5e5", anchor="lm")
        px += w + 44

    d.text((x, 556), SITE, font=font("segoeui.ttf", 22), fill="#737373")
    img.convert("RGB").save(OUT, optimize=True)
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB): {lines} routes, {stations} stops, {operators} operators")


if __name__ == "__main__":
    main()
