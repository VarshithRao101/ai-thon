"""Cut the TRNT BEE bee mark out of the JPEG and emit PNG/SVG/favicon assets.

Usage: python scripts/brand/make_logo.py
Input:  brand/trntbee-logo.jpeg (black embossed bee on a yellow texture)
Output: brand/bee-mark-{black,honey}.png, brand/bee-mark.svg,
        apps/web/app/{favicon.ico,icon.png,apple-icon.png},
        apps/web/public/brand/{bee-mark.svg,bee-mark-honey.png,bee-mark-black.png}
"""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "brand" / "trntbee-logo.jpeg"
BRAND = ROOT / "brand"
WEB_APP = ROOT / "apps" / "web" / "app"
WEB_PUBLIC = ROOT / "apps" / "web" / "public" / "brand"

HONEY = (0xFF, 0xC3, 0x26)
INK = (0x0A, 0x0A, 0x0A)


def bee_alpha(gray: np.ndarray) -> np.ndarray:
    """Soft alpha: dark bee pixels -> 1, yellow background -> 0, cleaned of texture."""
    _, hard = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    hard = cv2.morphologyEx(hard, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    # keep only sizeable components (the bee parts), drop paper-texture specks
    n, labels, stats, _ = cv2.connectedComponentsWithStats(hard, connectivity=8)
    keep = np.zeros_like(hard)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 400:
            keep[labels == i] = 255
    region = cv2.dilate(keep, np.ones((7, 7), np.uint8))
    lo, hi = 70.0, 150.0  # anti-aliased ramp between bee ink and background
    soft = np.clip((hi - gray.astype(np.float32)) / (hi - lo), 0, 1)
    return np.where(region > 0, soft, 0).astype(np.float32), keep


def crop_box(mask: np.ndarray, pad_ratio: float = 0.06):
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = max(x1 - x0, y1 - y0)
    pad = int(side * pad_ratio)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    half = side // 2 + pad
    return cx - half, cy - half, cx + half, cy + half


def rgba(alpha: np.ndarray, color) -> Image.Image:
    h, w = alpha.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = color
    out[..., 3] = (alpha * 255).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def to_svg(mask: np.ndarray, size: int) -> str:
    """Trace at 2x resolution after smoothing away the emboss texture, emit size x size coords."""
    work = 2 * size
    smooth = cv2.GaussianBlur(mask, (0, 0), sigmaX=4)
    smooth = cv2.resize(smooth, (work, work), interpolation=cv2.INTER_AREA)
    _, smooth = cv2.threshold(smooth, 127, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(smooth, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in contours:
        if cv2.contourArea(c) < 120:
            continue
        poly = cv2.approxPolyDP(c, 1.6, True).reshape(-1, 2) / 2
        parts.append("M" + "L".join(f"{x:g},{y:g}" for x, y in poly) + "Z")
    d = "".join(parts)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'role="img" aria-label="TRNT BEE"><path fill="currentColor" fill-rule="evenodd" d="{d}"/></svg>\n'
    )


def app_icon(mark: Image.Image, px: int) -> Image.Image:
    """Black bee on a honey rounded square (matches the original logo)."""
    tile = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    radius = int(px * 0.22)
    bg = Image.new("RGBA", (px, px), HONEY + (255,))
    rmask = Image.new("L", (px, px), 0)
    from PIL import ImageDraw

    ImageDraw.Draw(rmask).rounded_rectangle([0, 0, px - 1, px - 1], radius=radius, fill=255)
    tile.paste(bg, (0, 0), rmask)
    inner = int(px * 0.80)
    m = mark.resize((inner, inner), Image.LANCZOS)
    off = (px - inner) // 2
    tile.alpha_composite(m, (off, off))
    return tile


def main() -> None:
    img = cv2.imread(str(SRC))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    alpha, hard = bee_alpha(gray)
    x0, y0, x1, y1 = crop_box(hard)
    h, w = gray.shape
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, w), min(y1, h)
    alpha_c = alpha[y0:y1, x0:x1]
    hard_c = hard[y0:y1, x0:x1]

    BRAND.mkdir(exist_ok=True)
    WEB_PUBLIC.mkdir(parents=True, exist_ok=True)
    black = rgba(alpha_c, INK).resize((512, 512), Image.LANCZOS)
    honey = rgba(alpha_c, HONEY).resize((512, 512), Image.LANCZOS)
    for target in (BRAND, WEB_PUBLIC):
        black.save(target / "bee-mark-black.png")
        honey.save(target / "bee-mark-honey.png")

    svg = to_svg(hard_c, 512)
    (BRAND / "bee-mark.svg").write_text(svg, encoding="utf-8")
    (WEB_PUBLIC / "bee-mark.svg").write_text(svg, encoding="utf-8")

    app_icon(black, 512).save(WEB_APP / "icon.png")
    app_icon(black, 180).convert("RGB").save(WEB_APP / "apple-icon.png")
    app_icon(black, 256).save(WEB_APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"crop=({x0},{y0},{x1},{y1}) svg_bytes={len(svg)} contours_ok")


if __name__ == "__main__":
    main()
