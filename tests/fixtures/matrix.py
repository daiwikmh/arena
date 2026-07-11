from collections.abc import Iterator

from engine.ir import FormatSpec, LocaleSpec, SceneSpec
from tests.fixtures.formats import FORMATS
from tests.fixtures.locales import LOCALES
from tests.fixtures.scenes import SCENES


def cases() -> Iterator[tuple[SceneSpec, LocaleSpec, FormatSpec]]:
    for scene in SCENES:
        for locale in LOCALES:
            for fmt in FORMATS:
                yield scene, locale, fmt


def case_id(scene: SceneSpec, locale: LocaleSpec, fmt: FormatSpec) -> str:
    subject_slug = scene.subject.split(",")[0].replace(" ", "-")
    return f"{subject_slug}|{locale.code}|{fmt.id}"
