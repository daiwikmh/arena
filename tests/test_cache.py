import pytest

from engine.cache import SceneCache, compute_cache_key
from engine.prompt import compile_prompt
from tests.fixtures.formats import FORMATS
from tests.fixtures.locales import LOCALES
from tests.fixtures.scenes import SCENES


@pytest.fixture
def cache(tmp_path):
    return SceneCache(root=tmp_path / "scenes")


def test_cache_key_is_deterministic():
    resolved = compile_prompt(SCENES[0], LOCALES[0], FORMATS[0]).resolved
    a = compute_cache_key(resolved, "v1", "gemini-3.1-flash-lite-image")
    b = compute_cache_key(resolved, "v1", "gemini-3.1-flash-lite-image")
    assert a == b


def test_cache_key_ignores_headline_copy():
    de = LOCALES[1]
    assert de.code == "de-DE"
    de_edited = de.model_copy(update={"headline": "Something totally different, much longer."})

    resolved_before = compile_prompt(SCENES[0], de, FORMATS[0]).resolved
    resolved_after = compile_prompt(SCENES[0], de_edited, FORMATS[0]).resolved

    key_before = compute_cache_key(resolved_before, "v1", "gemini-3.1-flash-lite-image")
    key_after = compute_cache_key(resolved_after, "v1", "gemini-3.1-flash-lite-image")
    assert key_before == key_after


def test_cache_key_changes_with_template_version():
    resolved = compile_prompt(SCENES[0], LOCALES[0], FORMATS[0]).resolved
    a = compute_cache_key(resolved, "v1", "gemini-3.1-flash-lite-image")
    b = compute_cache_key(resolved, "v2", "gemini-3.1-flash-lite-image")
    assert a != b


def test_cache_key_changes_with_model_id():
    resolved = compile_prompt(SCENES[0], LOCALES[0], FORMATS[0]).resolved
    a = compute_cache_key(resolved, "v1", "gemini-3.1-flash-lite-image")
    b = compute_cache_key(resolved, "v1", "gemini-3.1-flash-image")
    assert a != b


def test_cache_key_changes_across_locale_and_format():
    resolved_de = compile_prompt(SCENES[0], LOCALES[1], FORMATS[0]).resolved
    resolved_ar = compile_prompt(SCENES[0], LOCALES[2], FORMATS[0]).resolved
    key_de = compute_cache_key(resolved_de, "v1", "gemini-3.1-flash-lite-image")
    key_ar = compute_cache_key(resolved_ar, "v1", "gemini-3.1-flash-lite-image")
    assert key_de != key_ar


def test_put_then_get_round_trips(cache):
    resolved = compile_prompt(SCENES[0], LOCALES[0], FORMATS[0]).resolved
    key = compute_cache_key(resolved, "v1", "gemini-3.1-flash-lite-image")

    assert cache.has(key) is False
    assert cache.get(key) is None

    cache.put(key, b"\x89PNG-fake-bytes", "image/png")

    assert cache.has(key) is True
    cached = cache.get(key)
    assert cached is not None
    assert cached.image_bytes == b"\x89PNG-fake-bytes"
    assert cached.mime_type == "image/png"


def test_put_is_idempotent_for_same_key(cache):
    resolved = compile_prompt(SCENES[0], LOCALES[0], FORMATS[0]).resolved
    key = compute_cache_key(resolved, "v1", "gemini-3.1-flash-lite-image")

    cache.put(key, b"first", "image/png")
    cache.put(key, b"first", "image/png")

    cached = cache.get(key)
    assert cached.image_bytes == b"first"
