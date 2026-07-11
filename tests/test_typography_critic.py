from dataclasses import dataclass, field

import pytest
from PIL import Image

from engine.critic.typography import (
    TextLayout,
    check_contrast,
    check_glyph_clipping,
    check_overflow,
    contrast_ratio,
    run_deterministic_critic,
)


@dataclass
class FakeFontMetrics:
    ascent_ratio: float = 0.8
    descent_ratio: float = 0.2
    widths: dict[str, float] = field(default_factory=dict)
    extents: dict[str, tuple[float, float]] = field(default_factory=dict)
    default_width_ratio: float = 0.5
    default_extent: tuple[float, float] = (0.0, 0.7)

    def advance_width(self, char: str, font_size_px: float) -> float:
        return self.widths.get(char, self.default_width_ratio) * font_size_px

    def glyph_extent(self, char: str, font_size_px: float) -> tuple[float, float]:
        ymin_ratio, ymax_ratio = self.extents.get(char, self.default_extent)
        return (ymin_ratio * font_size_px, ymax_ratio * font_size_px)


def test_check_overflow_flags_text_wider_than_box():
    metrics = FakeFontMetrics(default_width_ratio=0.6)
    layout = TextLayout(text="Wach langsamer auf", font_size_px=40, line_height_px=48)
    finding = check_overflow(
        layout, metrics, box_width_px=200, locale_code="de-DE", format_id="9:16"
    )
    assert finding is not None
    assert finding.code == "text_overflow"
    assert finding.severity == "critical"


def test_check_overflow_passes_when_text_fits():
    metrics = FakeFontMetrics(default_width_ratio=0.5)
    layout = TextLayout(text="Hi", font_size_px=40, line_height_px=48)
    finding = check_overflow(
        layout, metrics, box_width_px=2000, locale_code="en-US", format_id="1:1"
    )
    assert finding is None


def test_check_glyph_clipping_flags_tall_glyph():
    metrics = FakeFontMetrics(
        ascent_ratio=0.8,
        default_extent=(0.0, 0.7),
        extents={"j": (0.0, 1.15)},
    )
    layout = TextLayout(text="j", font_size_px=40, line_height_px=48)
    finding = check_glyph_clipping(layout, metrics, locale_code="hi-IN", format_id="1:1")
    assert finding is not None
    assert finding.code == "glyph_clipping"
    assert finding.severity == "warning"


def test_check_glyph_clipping_passes_within_bounds():
    metrics = FakeFontMetrics(ascent_ratio=0.8, descent_ratio=0.2, default_extent=(0.0, 0.7))
    layout = TextLayout(text="hello", font_size_px=40, line_height_px=48)
    finding = check_glyph_clipping(layout, metrics, locale_code="en-US", format_id="1:1")
    assert finding is None


def test_contrast_ratio_matches_wcag_black_on_white():
    ratio = contrast_ratio((0, 0, 0), (255, 255, 255))
    assert ratio == pytest.approx(21.0, abs=0.1)


def test_check_contrast_flags_low_contrast_region():
    image = Image.new("RGB", (100, 100), color=(230, 230, 230))
    finding = check_contrast(
        image,
        (0, 0, 100, 100),
        text_rgb=(255, 255, 255),
        locale_code="ja-JP",
        format_id="4:5",
    )
    assert finding is not None
    assert finding.code == "low_contrast"


def test_check_contrast_passes_high_contrast_region():
    image = Image.new("RGB", (100, 100), color=(10, 10, 10))
    finding = check_contrast(
        image,
        (0, 0, 100, 100),
        text_rgb=(255, 255, 255),
        locale_code="en-US",
        format_id="4:5",
    )
    assert finding is None


def test_run_deterministic_critic_aggregates_all_checks():
    metrics = FakeFontMetrics(default_width_ratio=0.6)
    layout = TextLayout(
        text="Wach langsamer auf und bleib", font_size_px=40, line_height_px=48
    )
    image = Image.new("RGB", (200, 100), color=(235, 235, 235))
    findings = run_deterministic_critic(
        layout=layout,
        metrics=metrics,
        box_width_px=150,
        locale_code="de-DE",
        format_id="9:16",
        image=image,
        box_px=(0, 0, 200, 100),
        text_rgb=(255, 255, 255),
    )
    codes = {f.code for f in findings}
    assert "text_overflow" in codes
    assert "low_contrast" in codes


def test_run_deterministic_critic_returns_nothing_when_clean():
    metrics = FakeFontMetrics(default_width_ratio=0.4)
    layout = TextLayout(text="Hi", font_size_px=30, line_height_px=40)
    image = Image.new("RGB", (200, 100), color=(10, 10, 10))
    findings = run_deterministic_critic(
        layout=layout,
        metrics=metrics,
        box_width_px=2000,
        locale_code="en-US",
        format_id="1:1",
        image=image,
        box_px=(0, 0, 200, 100),
        text_rgb=(255, 255, 255),
    )
    assert findings == []
