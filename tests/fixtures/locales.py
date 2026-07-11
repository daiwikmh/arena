from engine.ir import Direction, LocaleSpec

LOCALES: list[LocaleSpec] = [
    LocaleSpec(
        code="en-US",
        language="English",
        direction=Direction.LTR,
        headline="Wake up slower.",
        legal="Cold brew. 2x caffeine.",
    ),
    LocaleSpec(
        code="de-DE",
        language="German",
        direction=Direction.LTR,
        headline="Wach langsamer auf.",
        legal="Cold Brew. Doppelt Koffein.",
    ),
    LocaleSpec(
        code="ar-EG",
        language="Arabic",
        direction=Direction.RTL,
        headline="استيقظ على مهلك",
        legal="قهوة باردة",
    ),
    LocaleSpec(
        code="ja-JP",
        language="Japanese",
        direction=Direction.LTR,
        headline="ゆっくり目覚めよう",
        legal="コールドブリュー",
    ),
    LocaleSpec(
        code="hi-IN",
        language="Hindi",
        direction=Direction.LTR,
        headline="धीरे जागिए।",
        legal="कोल्ड ब्रू",
    ),
]
