from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

HexColor = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")]


class Direction(str, Enum):
    LTR = "ltr"
    RTL = "rtl"


class Region(str, Enum):
    UPPER_LEFT = "upper-left"
    UPPER_CENTER = "upper-center"
    UPPER_RIGHT = "upper-right"
    MIDDLE_LEFT = "middle-left"
    MIDDLE_CENTER = "middle-center"
    MIDDLE_RIGHT = "middle-right"
    LOWER_LEFT = "lower-left"
    LOWER_CENTER = "lower-center"
    LOWER_RIGHT = "lower-right"


REGION_OPPOSITE: dict[Region, Region] = {
    Region.UPPER_LEFT: Region.LOWER_RIGHT,
    Region.UPPER_CENTER: Region.LOWER_CENTER,
    Region.UPPER_RIGHT: Region.LOWER_LEFT,
    Region.MIDDLE_LEFT: Region.MIDDLE_RIGHT,
    Region.MIDDLE_CENTER: Region.MIDDLE_CENTER,
    Region.MIDDLE_RIGHT: Region.MIDDLE_LEFT,
    Region.LOWER_LEFT: Region.UPPER_RIGHT,
    Region.LOWER_CENTER: Region.UPPER_CENTER,
    Region.LOWER_RIGHT: Region.UPPER_LEFT,
}


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ObjectRef(Frozen):
    asset_id: str
    label: str


class BrandSpec(Frozen):
    wordmark: str
    legal: str
    palette: list[HexColor] = Field(max_length=4)
    logo_asset: str | None = None


class LocaleSpec(Frozen):
    code: str
    language: str
    direction: Direction
    headline: str
    legal: str


class FormatSpec(Frozen):
    id: str
    width_ratio: float = Field(gt=0)
    height_ratio: float = Field(gt=0)


class SceneSpec(Frozen):
    subject: str
    setting: str
    time_of_day: Literal["dawn", "day", "dusk", "night"]
    palette: list[HexColor] = Field(max_length=4)
    mood: str
    lens_mm: int = Field(ge=24, le=135)
    lighting: Literal["soft", "hard", "backlit", "diffused", "golden-hour"]
    excludes: list[str] = Field(default_factory=list, max_length=6)
    object_refs: list[ObjectRef] = Field(default_factory=list, max_length=14)


CameraMovement = Literal[
    "static",
    "pan_left",
    "pan_right",
    "tilt_up",
    "tilt_down",
    "zoom_in",
    "zoom_out",
    "tracking",
    "handheld",
]


class ShotSpec(Frozen):
    subject: str
    setting: str
    action: str
    camera_movement: CameraMovement
    time_of_day: Literal["dawn", "day", "dusk", "night"]
    palette: list[HexColor] = Field(max_length=4)
    mood: str
    lighting: Literal["soft", "hard", "backlit", "diffused", "golden-hour"]
    duration_sec: int = Field(ge=1, le=10)
    aspect_ratio: str
    excludes: list[str] = Field(default_factory=list, max_length=6)
    object_refs: list[ObjectRef] = Field(default_factory=list, max_length=14)


class CopyBox(Frozen):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class Directive(Frozen):
    region: Region
    luminance: Literal["low", "mid", "high"]
    subject_bias: Region


class ResolvedSpec(Frozen):
    scene: SceneSpec
    locale_code: str
    direction: Direction
    format_id: str
    copy_region: Region
    directive: Directive
    object_refs: list[ObjectRef]


class Finding(Frozen):
    severity: Literal["critical", "warning"]
    tier: Literal["deterministic", "vision"]
    code: str
    message: str
    locale_code: str
    format_id: str
    fix_hint: str | None = None


class Draft(Frozen):
    id: str
    prompt_hash: str
    template_version: str
    model_id: str
    image_ref: str
    author: Literal["agent", "user"]
    interaction_id: str | None = None
    parent: str | None = None
    findings: list[Finding] = Field(default_factory=list)


class LocalizationPlan(Frozen):
    brand: BrandSpec
    scene: SceneSpec
    locales: list[LocaleSpec]
    formats: list[FormatSpec]


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    input: str
    plan: LocalizationPlan | None = None
    drafts_created: list[str] = Field(default_factory=list)
