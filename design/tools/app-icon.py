"""Generate the round-17 app icon options as SVG (1024 x 1024 vector sources).

The user picked option A (2026-09-25). This writes the final sources into
design/app-icon/:
  app-icon-ios.svg          full-bleed, opaque, no rounded corners (iOS 1024, Google Play 512)
  app-icon-android-fg.svg   adaptive foreground (108dp canvas, art inside the 66dp safe circle)
  app-icon-android-bg.svg   adaptive background (flat paper colour)
Options B and C are kept below for the record (design/artboards/round17).
Usage: python3 design/tools/app-icon.py
"""
import math
from pathlib import Path

PAPER, SUN, MINT, PINK, INK = "#fff4dc", "#ffd23f", "#3ddc97", "#ff5fa2", "#1b1b1f"
OUT = Path(__file__).resolve().parents[1] / "app-icon"


def piece(cx, cy, r, colour, uid):
    """A game piece: ink rim, colour-blind pattern (ring / two stripes), sticker gloss."""
    sw = r * 0.15
    fill = MINT if colour == "g" else PINK
    parts = [f'<circle cx="{cx}" cy="{cy}" r="{r - sw / 2:.1f}" fill="{fill}" stroke="{INK}" stroke-width="{sw:.1f}"/>']
    if colour == "g":
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r * 0.42:.1f}" fill="none" stroke="{INK}" stroke-width="{r * 0.13:.1f}"/>')
    else:
        parts.append(f'<clipPath id="c{uid}"><circle cx="{cx}" cy="{cy}" r="{r - sw:.1f}"/></clipPath>')
        parts.append(f'<g clip-path="url(#c{uid})" transform="rotate(-28 {cx} {cy})" stroke="{INK}" stroke-width="{r * 0.13:.1f}">')
        for dy in (-0.3, 0.3):
            y = cy + dy * r
            parts.append(f'<line x1="{cx - r}" y1="{y:.1f}" x2="{cx + r}" y2="{y:.1f}"/>')
        parts.append("</g>")
    parts.append(
        f'<ellipse cx="{cx - r * 0.36:.1f}" cy="{cy - r * 0.46:.1f}" rx="{r * 0.24:.1f}" ry="{r * 0.14:.1f}" '
        f'fill="#fff" fill-opacity="0.7" transform="rotate(-30 {cx - r * 0.36:.1f} {cy - r * 0.46:.1f})"/>'
    )
    return "".join(parts)


def board(x, y, cols, rows, d, gap, pad, cells, rim=26, shadow=26, radius=56, win=None, uid="b"):
    """Sun-yellow board with paper holes; cells maps (row, col) -> 'g' / 'p'."""
    w = cols * d + (cols - 1) * gap + 2 * pad
    h = rows * d + (rows - 1) * gap + 2 * pad
    out = [
        f'<rect x="{x + shadow}" y="{y + shadow}" width="{w}" height="{h}" rx="{radius}" fill="{INK}"/>',
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{SUN}" stroke="{INK}" stroke-width="{rim}"/>',
    ]
    centres = {}
    for r in range(rows):
        for c in range(cols):
            cx = x + pad + c * (d + gap) + d / 2
            cy = y + pad + r * (d + gap) + d / 2
            centres[(r, c)] = (cx, cy)
            out.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{d / 2 - rim * 0.3:.1f}" fill="{PAPER}" stroke="{INK}" stroke-width="{rim * 0.6:.1f}"/>')
            if (r, c) in cells:
                out.append(piece(round(cx, 1), round(cy, 1), d / 2 + rim * 0.05, cells[(r, c)], f"{uid}{r}{c}"))
    if win:
        (x1, y1), (x2, y2) = centres[win[0]], centres[win[1]]
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#fff" stroke-width="{d * 0.26:.1f}" stroke-linecap="round"/>')
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{INK}" stroke-width="{d * 0.14:.1f}" stroke-linecap="round"/>')
    return "".join(out), (x, y, w + shadow, h + shadow)


def option_a():
    """A: a 4 x 4 board with a winning diagonal of four green pieces."""
    cells = {
        (3, 0): "g", (3, 1): "p", (2, 1): "g", (3, 2): "g", (2, 2): "p", (1, 2): "g",
        (3, 3): "p", (2, 3): "g", (1, 3): "p", (0, 3): "g",
    }
    d, gap, pad = 150, 24, 40
    w = 4 * d + 3 * gap + 2 * pad
    x = (1024 - w - 26) / 2
    art, box = board(x, x, 4, 4, d, gap, pad, cells, win=((3, 0), (0, 3)), uid="a")
    return PAPER, art, box


def option_b():
    """B: a green piece dropping into a 3 x 2 board (the game's signature move)."""
    cells = {(1, 0): "g", (1, 1): "p", (1, 2): "g", (0, 0): "p"}
    d, gap, pad = 186, 26, 44
    w = 3 * d + 2 * gap + 2 * pad
    x = (1024 - w - 26) / 2
    y = 430
    art, box = board(x, y, 3, 2, d, gap, pad, cells, uid="bb")
    cx = x + pad + d + gap + d / 2
    r = d / 2
    drop = (
        f'<g stroke="{INK}" stroke-width="22" stroke-linecap="round">'
        f'<line x1="{cx - 120}" y1="120" x2="{cx - 120}" y2="220"/><line x1="{cx + 120}" y1="100" x2="{cx + 120}" y2="230"/>'
        f'<line x1="{cx - 150}" y1="250" x2="{cx - 150}" y2="300"/><line x1="{cx + 150}" y1="260" x2="{cx + 150}" y2="310"/></g>'
        f'<circle cx="{cx + 14}" cy="{250 + 14}" r="{r}" fill="{INK}"/>' + piece(cx, 250, r, "g", "drop")
        + f'<path d="M{cx - 30} {y - 34} L{cx + 30} {y - 34} L{cx} {y - 4} Z" fill="{INK}"/>'
    )
    top = 250 - r
    return PAPER, art + drop, (box[0], top, box[2], box[1] + box[3] - top)


def option_c():
    """C: the icon is the board itself, a bottom row of four greens."""
    cells = {
        (3, 0): "g", (3, 1): "g", (3, 2): "g", (3, 3): "g",
        (2, 0): "p", (2, 1): "p", (2, 3): "p", (1, 1): "p", (1, 3): "g", (0, 3): "p",
    }
    d, gap, pad = 186, 32, 88
    out = []
    centres = {}
    for r in range(4):
        for c in range(4):
            cx = pad + c * (d + gap) + d / 2
            cy = pad + r * (d + gap) + d / 2
            centres[(r, c)] = (cx, cy)
            out.append(f'<circle cx="{cx}" cy="{cy}" r="{d / 2 - 8}" fill="{PAPER}" stroke="{INK}" stroke-width="16"/>')
            if (r, c) in cells:
                out.append(piece(cx, cy, d / 2 + 1, cells[(r, c)], f"c{r}{c}"))
    (x1, y1), (x2, y2) = centres[(3, 0)], centres[(3, 3)]
    out.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#fff" stroke-width="48" stroke-linecap="round"/>')
    out.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="26" stroke-linecap="round"/>')
    return SUN, "".join(out), (pad, pad, 1024 - 2 * pad, 1024 - 2 * pad)


def write(name, bg, art, box):
    ios = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="{bg}"/>{art}</svg>\n'
    (OUT / f"{name}-ios.svg").write_text(ios)
    # Android adaptive: 108dp canvas mapped to 1024; the art must sit inside the
    # 66dp safe circle (diameter 0.611 x 1024 = 626). Scale the art's bounding box
    # so its diagonal fits the circle, centred on the canvas.
    bx, by, bw, bh = box
    diag = math.hypot(bw, bh)
    s = 626 / diag
    tx = 512 - (bx + bw / 2) * s
    ty = 512 - (by + bh / 2) * s
    fg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate({tx:.1f} {ty:.1f}) scale({s:.4f})">{art}</g></svg>\n'
    (OUT / f"{name}-android-fg.svg").write_text(fg)
    (OUT / f"{name}-android-bg.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="{bg}"/></svg>\n'
    )
    print(name, f"android scale {s:.3f}")


OUT.mkdir(exist_ok=True)
write("app-icon", *option_a())
