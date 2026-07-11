from __future__ import annotations

from engine.ir import (
    REGION_OPPOSITE,
    CopyBox,
    Direction,
    Directive,
    FormatSpec,
    LocaleSpec,
    Region,
    ResolvedSpec,
    SceneSpec,
)

_DEFAULT_LTR_BOX = CopyBox(x=0.06, y=0.08, w=0.4, h=0.2)


def default_copy_box(direction: Direction) -> CopyBox:
    if direction is Direction.RTL:
        mirrored_x = 1 - (_DEFAULT_LTR_BOX.x + _DEFAULT_LTR_BOX.w)
        return CopyBox(x=mirrored_x, y=_DEFAULT_LTR_BOX.y, w=_DEFAULT_LTR_BOX.w, h=_DEFAULT_LTR_BOX.h)
    return _DEFAULT_LTR_BOX


def quantize(box: CopyBox) -> Region:
    cx = box.x + box.w / 2
    cy = box.y + box.h / 2
    col = "left" if cx < 1 / 3 else "center" if cx < 2 / 3 else "right"
    row = "upper" if cy < 1 / 3 else "middle" if cy < 2 / 3 else "lower"
    return Region(f"{row}-{col}")


def negative_space(region: Region) -> Directive:
    return Directive(region=region, luminance="low", subject_bias=REGION_OPPOSITE[region])


def resolve(
    scene: SceneSpec,
    locale: LocaleSpec,
    fmt: FormatSpec,
    copy_box: CopyBox | None = None,
) -> ResolvedSpec:
    box = copy_box if copy_box is not None else default_copy_box(locale.direction)
    region = quantize(box)
    directive = negative_space(region)
    return ResolvedSpec(
        scene=scene,
        locale_code=locale.code,
        direction=locale.direction,
        format_id=fmt.id,
        copy_region=region,
        directive=directive,
        object_refs=scene.object_refs,
    )
