from engine.ir import FormatSpec

FORMATS: list[FormatSpec] = [
    FormatSpec(id="1:1", width_ratio=1, height_ratio=1),
    FormatSpec(id="3:2", width_ratio=3, height_ratio=2),
    FormatSpec(id="2:3", width_ratio=2, height_ratio=3),
    FormatSpec(id="3:4", width_ratio=3, height_ratio=4),
    FormatSpec(id="4:3", width_ratio=4, height_ratio=3),
    FormatSpec(id="4:5", width_ratio=4, height_ratio=5),
    FormatSpec(id="5:4", width_ratio=5, height_ratio=4),
    FormatSpec(id="9:16", width_ratio=9, height_ratio=16),
    FormatSpec(id="16:9", width_ratio=16, height_ratio=9),
    FormatSpec(id="21:9", width_ratio=21, height_ratio=9),
]
