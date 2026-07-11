from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from PIL import Image

from engine.ir import Finding

WCAG_AA_LARGE_TEXT_MIN_RATIO = 3.0
WCAG_AA_NORMAL_TEXT_MIN_RATIO = 4.5


class FontMetrics(Protocol):
    ascent_ratio: float
    descent_ratio: float

    def advance_width(self, char: str, font_size_px: float) -> float: ...

    def glyph_extent(self, char: str, font_size_px: float) -> tuple[float, float]: ...


class TTFontMetrics:
    def __init__(self, font_path: str) -> None:
        from fontTools.ttLib import TTFont

        self._font = TTFont(font_path)
        self._units_per_em = self._font["head"].unitsPerEm
        hhea = self._font["hhea"]
        self.ascent_ratio = hhea.ascent / self._units_per_em
        self.descent_ratio = abs(hhea.descent) / self._units_per_em
        self._cmap = self._font.getBestCmap()
        self._glyph_set = self._font.getGlyphSet()
        self._hmtx = self._font["hmtx"]

    def _glyph_name(self, char: str) -> str | None:
        return self._cmap.get(ord(char))

    def advance_width(self, char: str, font_size_px: float) -> float:
        name = self._glyph_name(char)
        if name is None:
            return 0.0
        width, _ = self._hmtx[name]
        return width / self._units_per_em * font_size_px

    def glyph_extent(self, char: str, font_size_px: float) -> tuple[float, float]:
        name = self._glyph_name(char)
        if name is None:
            return (0.0, 0.0)
        from fontTools.pens.boundsPen import BoundsPen

        pen = BoundsPen(self._glyph_set)
        self._glyph_set[name].draw(pen)
        if pen.bounds is None:
            return (0.0, 0.0)
        _xmin, ymin, _xmax, ymax = pen.bounds
        scale = font_size_px / self._units_per_em
        return (ymin * scale, ymax * scale)


@dataclass(frozen=True)
class TextLayout:
    text: str
    font_size_px: float
    line_height_px: float


def measure_line_width(layout: TextLayout, metrics: FontMetrics) -> float:
    return sum(metrics.advance_width(ch, layout.font_size_px) for ch in layout.text)


def check_overflow(
    layout: TextLayout,
    metrics: FontMetrics,
    box_width_px: float,
    *,
    locale_code: str,
    format_id: str,
) -> Finding | None:
    width = measure_line_width(layout, metrics)
    if width <= box_width_px:
        return None
    overflow_px = width - box_width_px
    overflow_pct = overflow_px / box_width_px * 100
    return Finding(
        severity="critical",
        tier="deterministic",
        code="text_overflow",
        message=(
            f"Headline is {overflow_px:.0f}px ({overflow_pct:.0f}%) wider than "
            f"the artboard's safe area."
        ),
        locale_code=locale_code,
        format_id=format_id,
        fix_hint=(
            "Reflow to an additional line, or regenerate the scene with a "
            "wider negative-space region."
        ),
    )


def check_glyph_clipping(
    layout: TextLayout,
    metrics: FontMetrics,
    *,
    locale_code: str,
    format_id: str,
) -> Finding | None:
    allotted_ascent = layout.line_height_px * metrics.ascent_ratio
    allotted_descent = layout.line_height_px * metrics.descent_ratio
    worst_overshoot = 0.0
    clipped_chars: set[str] = set()

    for ch in layout.text:
        if ch.isspace():
            continue
        ymin, ymax = metrics.glyph_extent(ch, layout.font_size_px)
        if ymax > allotted_ascent:
            worst_overshoot = max(worst_overshoot, ymax - allotted_ascent)
            clipped_chars.add(ch)
        if ymin < -allotted_descent:
            worst_overshoot = max(worst_overshoot, -allotted_descent - ymin)
            clipped_chars.add(ch)

    if not clipped_chars:
        return None

    return Finding(
        severity="warning",
        tier="deterministic",
        code="glyph_clipping",
        message=(
            f"{len(clipped_chars)} glyph(s) exceed the line box "
            f"(worst overshoot: {worst_overshoot:.1f}px): {''.join(sorted(clipped_chars))}"
        ),
        locale_code=locale_code,
        format_id=format_id,
        fix_hint="Increase line-height for this script; the box was sized from the Latin master.",
    )


def _relative_luminance(rgb: tuple[float, float, float]) -> float:
    def channel(c: float) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast_ratio(
    fg_rgb: tuple[float, float, float], bg_rgb: tuple[float, float, float]
) -> float:
    l1 = _relative_luminance(fg_rgb)
    l2 = _relative_luminance(bg_rgb)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def sample_region_average_color(
    image: Image.Image, box_px: tuple[int, int, int, int]
) -> tuple[float, float, float]:
    region = image.crop(box_px).convert("RGB")
    pixels = region.get_flattened_data()
    n = len(pixels)
    r = sum(p[0] for p in pixels) / n
    g = sum(p[1] for p in pixels) / n
    b = sum(p[2] for p in pixels) / n
    return (r, g, b)


def check_contrast(
    image: Image.Image,
    box_px: tuple[int, int, int, int],
    text_rgb: tuple[float, float, float],
    *,
    locale_code: str,
    format_id: str,
    large_text: bool = False,
) -> Finding | None:
    bg_rgb = sample_region_average_color(image, box_px)
    ratio = contrast_ratio(text_rgb, bg_rgb)
    minimum = WCAG_AA_LARGE_TEXT_MIN_RATIO if large_text else WCAG_AA_NORMAL_TEXT_MIN_RATIO
    if ratio >= minimum:
        return None
    return Finding(
        severity="warning",
        tier="deterministic",
        code="low_contrast",
        message=(
            f"Headline contrast is {ratio:.1f}:1 against the scene; "
            f"WCAG AA needs {minimum:.1f}:1."
        ),
        locale_code=locale_code,
        format_id=format_id,
        fix_hint="Darken the scene under the copy box, or add a scrim behind the text.",
    )


def run_deterministic_critic(
    *,
    layout: TextLayout,
    metrics: FontMetrics,
    box_width_px: float,
    locale_code: str,
    format_id: str,
    image: Image.Image | None = None,
    box_px: tuple[int, int, int, int] | None = None,
    text_rgb: tuple[float, float, float] = (255.0, 255.0, 255.0),
    large_text: bool = False,
) -> list[Finding]:
    findings: list[Finding] = []

    overflow = check_overflow(
        layout, metrics, box_width_px, locale_code=locale_code, format_id=format_id
    )
    if overflow is not None:
        findings.append(overflow)

    clipping = check_glyph_clipping(
        layout, metrics, locale_code=locale_code, format_id=format_id
    )
    if clipping is not None:
        findings.append(clipping)

    if image is not None and box_px is not None:
        contrast = check_contrast(
            image,
            box_px,
            text_rgb,
            locale_code=locale_code,
            format_id=format_id,
            large_text=large_text,
        )
        if contrast is not None:
            findings.append(contrast)

    return findings
