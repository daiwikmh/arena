from dataclasses import dataclass, field

from PIL import Image

from engine.critic.typography import TextLayout

_SAFE_BG = (12, 14, 18)
_LIGHT_TEXT = (245, 246, 248)
_CLEAN_TEXT = "steady headline copy"


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


@dataclass
class CorpusCase:
    case_id: str
    layout: TextLayout
    metrics: FakeFontMetrics
    box_width_px: float
    image: Image.Image
    box_px: tuple[int, int, int, int]
    text_rgb: tuple[float, float, float]
    locale_code: str
    format_id: str
    expected_broken: bool
    expected_codes: set[str]


def _clean_case(idx: int, locale_code: str, format_id: str) -> CorpusCase:
    metrics = FakeFontMetrics(default_width_ratio=0.45)
    layout = TextLayout(text=_CLEAN_TEXT, font_size_px=36, line_height_px=46)
    image = Image.new("RGB", (400, 160), color=_SAFE_BG)
    return CorpusCase(
        case_id=f"clean-{idx}-{locale_code}-{format_id}",
        layout=layout,
        metrics=metrics,
        box_width_px=900,
        image=image,
        box_px=(0, 0, 400, 160),
        text_rgb=_LIGHT_TEXT,
        locale_code=locale_code,
        format_id=format_id,
        expected_broken=False,
        expected_codes=set(),
    )


def _overflow_case(idx: int, locale_code: str, format_id: str) -> CorpusCase:
    metrics = FakeFontMetrics(default_width_ratio=0.7)
    layout = TextLayout(
        text="a much longer headline that will not fit",
        font_size_px=48,
        line_height_px=58,
    )
    image = Image.new("RGB", (400, 160), color=_SAFE_BG)
    return CorpusCase(
        case_id=f"overflow-{idx}-{locale_code}-{format_id}",
        layout=layout,
        metrics=metrics,
        box_width_px=200,
        image=image,
        box_px=(0, 0, 400, 160),
        text_rgb=_LIGHT_TEXT,
        locale_code=locale_code,
        format_id=format_id,
        expected_broken=True,
        expected_codes={"text_overflow"},
    )


def _clipping_case(idx: int, locale_code: str, format_id: str) -> CorpusCase:
    metrics = FakeFontMetrics(
        ascent_ratio=0.75,
        descent_ratio=0.2,
        default_extent=(0.0, 0.65),
        extents={"M": (0.0, 1.2)},
    )
    layout = TextLayout(text="jaM giE", font_size_px=40, line_height_px=48)
    image = Image.new("RGB", (400, 160), color=_SAFE_BG)
    return CorpusCase(
        case_id=f"clip-{idx}-{locale_code}-{format_id}",
        layout=layout,
        metrics=metrics,
        box_width_px=900,
        image=image,
        box_px=(0, 0, 400, 160),
        text_rgb=_LIGHT_TEXT,
        locale_code=locale_code,
        format_id=format_id,
        expected_broken=True,
        expected_codes={"glyph_clipping"},
    )


def _low_contrast_case(idx: int, locale_code: str, format_id: str) -> CorpusCase:
    metrics = FakeFontMetrics(default_width_ratio=0.45)
    layout = TextLayout(text=_CLEAN_TEXT, font_size_px=36, line_height_px=46)
    image = Image.new("RGB", (400, 160), color=(230, 230, 230))
    return CorpusCase(
        case_id=f"contrast-{idx}-{locale_code}-{format_id}",
        layout=layout,
        metrics=metrics,
        box_width_px=900,
        image=image,
        box_px=(0, 0, 400, 160),
        text_rgb=(255.0, 255.0, 255.0),
        locale_code=locale_code,
        format_id=format_id,
        expected_broken=True,
        expected_codes={"low_contrast"},
    )


def build_corpus() -> list[CorpusCase]:
    locales = ["en-US", "de-DE", "ar-EG", "ja-JP", "hi-IN"]
    formats = ["1:1", "4:5", "9:16", "16:9", "21:9", "3:4"]
    combos = [(locale, fmt) for locale in locales for fmt in formats]
    assert len(combos) == 30

    broken_at = {
        2: _overflow_case,
        7: _overflow_case,
        12: _overflow_case,
        17: _clipping_case,
        20: _clipping_case,
        23: _clipping_case,
        26: _low_contrast_case,
        29: _low_contrast_case,
    }

    cases: list[CorpusCase] = []
    for idx, (locale_code, format_id) in enumerate(combos):
        builder = broken_at.get(idx, _clean_case)
        cases.append(builder(idx, locale_code, format_id))
    return cases
