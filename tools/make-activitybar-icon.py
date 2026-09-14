#!/usr/bin/env python3
"""Draws the extension's Activity Bar glyph (GrumpyWhite.png) — solid white only.

WHY THIS IS A SCRIPT AND NOT A HAND-DRAWN FILE (NOTES.md §93)
The first version was made by scaling the coloured badge artwork down and clearing everything that was
not the glyph. That leaves *no fully opaque pixel at all*: each surviving pixel is a remainder of
antialiasing plus the badge's own translucency, so at 24 px in the sidebar the icon looks washed out
and "very faint". The fix is not a different picture — it is drawing the same motif again as shapes:
pure #FFFFFF, fully opaque, with thick forms and negative space for the details, then downsampled from
8x so the edges stay smooth.

Kept here so the icon can be regenerated or adjusted (thicker ring, different face) without hunting for
artwork: `python3 tools/make-activitybar-icon.py` rewrites GrumpyWhite.png and writes previews to /tmp.

The design is the current one, reduced to what survives at 24 px: the badge's ring (the outline that
makes it recognisable) and Grumpy's face — cap with a visor, and sunglasses cut out as transparent
"holes" so the eyes read as dark, which is what gives the glyph its contrast.
"""

import os
from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'GrumpyWhite.png')

CANVAS = 1024          # working size; downsampled to 128 (the manifest's minimum, and square)
SUPER = 8              # 1024 / 128 — the supersampling factor for smooth edges
WHITE = 255


def draw_glyph(size: int = CANVAS) -> Image.Image:
    """The glyph as a greyscale mask: 255 = ink, 0 = transparent."""
    im = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(im)
    s = size / 1024  # everything below is authored at 1024

    def box(x0, y0, x1, y1):
        return [x0 * s, y0 * s, x1 * s, y1 * s]

    def ell(cx, cy, rx, ry):
        return [(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s]

    # --- the ring: the badge's outline, thick enough to survive 24 px (104/1024 ≈ 2.4 px there).
    #     The 64-unit inset (8 px at 128) is deliberate: downsampling with LANCZOS overshoots the
    #     geometric edge by a pixel or two, and a glyph whose fringe touches the canvas edge is both
    #     clipped in the sidebar and flagged by the icon test. ---
    d.ellipse(box(64, 64, 960, 960), outline=WHITE, width=max(1, round(104 * s)))

    # --- Grumpy: shoulders, head, cap ---
    # The shoulders are deliberately kept NARROWER than the ring's inner circle at every height: an
    # earlier version let them run to the bottom of the canvas, which both looked clipped and left the
    # whole lower half white once the glyph was clipped to the badge — at 24 px that reads as a blob
    # with a face rather than a person. Their top edge is the shoulder line that makes the glyph an
    # avatar, and they merge into the ring at the bottom exactly as they do in the artwork.
    d.ellipse(ell(512, 780, 215, 125), fill=WHITE)                           # shoulders
    d.ellipse(ell(512, 600, 186, 200), fill=WHITE)                           # head
    d.ellipse(ell(512, 445, 178, 140), fill=WHITE)                           # cap crown
    d.rounded_rectangle(box(312, 545, 712, 600), radius=26 * s, fill=WHITE)  # cap band

    # A hairline of negative space under the band is what stops the cap and the face from merging into
    # one white mass. Measured at 24 px, thickening it further just adds noise — this reads as a cap
    # edge and nothing else.
    d.rounded_rectangle(box(338, 604, 686, 630), radius=13 * s, fill=0)

    # --- the sunglasses: two transparent lenses with a white bridge between them. At 24 px these are
    #     the only facial detail that survives — which is what makes the glyph read as a face and not as
    #     a generic account avatar. (An earlier attempt at a single wide visor read as a headset boom,
    #     and a `</>` inside the ring collapsed into a "%" sign; both were rendered at 24 px and looked
    #     at before choosing — see NOTES.md §93.) ---
    d.rounded_rectangle(box(352, 644, 466, 716), radius=26 * s, fill=0)   # left lens
    d.rounded_rectangle(box(558, 644, 672, 716), radius=26 * s, fill=0)   # right lens
    d.rounded_rectangle(box(492, 660, 532, 690), radius=10 * s, fill=WHITE)  # bridge

    # --- the moustache: a transparent bar with drooping ends, below the glasses ---
    d.rounded_rectangle(box(404, 748, 620, 790), radius=20 * s, fill=0)
    d.ellipse(ell(372, 786, 32, 28), fill=0)
    d.ellipse(ell(652, 786, 32, 28), fill=0)

    # --- clip everything to the ring's outer circle. The shoulders are drawn wider than the badge on
    #     purpose (they should merge into the ring, as in the artwork), and this is what guarantees that
    #     nothing — including the antialiased fringe — is ever cut off by the canvas edge, which is both
    #     ugly in the sidebar and flagged by the icon test. ---
    clip = Image.new('L', (size, size), 0)
    ImageDraw.Draw(clip).ellipse(box(64, 64, 960, 960), fill=WHITE)
    return ImageChops.multiply(im, clip)


def render(target: int = 128) -> Image.Image:
    """A white RGBA icon at `target` x `target`, drawn big and downsampled."""
    mask = draw_glyph().resize((target * SUPER, target * SUPER), Image.LANCZOS)
    mask = mask.resize((target, target), Image.LANCZOS)
    icon = Image.new('RGBA', (target, target), (255, 255, 255, 0))
    icon.putalpha(mask)
    return icon


def previews(icon: Image.Image) -> None:
    """Side-by-side proof: the old glyph and the new one on the sidebar's dark background."""
    old_path = OUT
    for bg, name in ((0x33, 'dark'), (0x25, 'vs-dark'), (0xF3, 'light')):
        strip = Image.new('RGBA', (24 * 2 + 60, 60), (bg, bg, bg, 255))
        if os.path.exists(old_path):
            before = Image.open(old_path).convert('RGBA').resize((24, 24), Image.LANCZOS)
            strip.alpha_composite(before, (12, 18))
        strip.alpha_composite(icon.resize((24, 24), Image.LANCZOS), (48, 18))
        strip.resize((strip.width * 4, strip.height * 4), Image.NEAREST).save(f'/tmp/icon-{name}.png')
    icon.resize((24 * 8, 24 * 8), Image.NEAREST).save('/tmp/icon-new-zoomed.png')


def report(icon: Image.Image) -> None:
    px = list(icon.getchannel('A').getdata())
    nz = [p for p in px if p > 0]
    print(f'wrote {OUT} ({icon.width}x{icon.height})')
    print(f'  ink: {len(nz)}/{len(px)} px, fully opaque: {sum(1 for p in nz if p == 255)}, '
          f'antialiased edge: {sum(1 for p in nz if p < 255)}')
    print(f'  colours: {sorted({c for c in icon.convert("RGB").getdata()} )}')


if __name__ == '__main__':
    icon = render(128)
    report(icon)
    previews(icon)
    icon.save(OUT)
