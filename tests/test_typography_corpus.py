from engine.critic.typography import run_deterministic_critic
from tests.fixtures.typography_corpus import build_corpus


def test_corpus_is_thirty_cases_with_eight_known_broken():
    corpus = build_corpus()
    assert len(corpus) == 30
    assert sum(1 for c in corpus if c.expected_broken) == 8


def test_deterministic_critic_catches_every_broken_case_with_zero_false_positives():
    corpus = build_corpus()
    false_negatives = []
    false_positives = []
    wrong_code = []

    for case in corpus:
        findings = run_deterministic_critic(
            layout=case.layout,
            metrics=case.metrics,
            box_width_px=case.box_width_px,
            locale_code=case.locale_code,
            format_id=case.format_id,
            image=case.image,
            box_px=case.box_px,
            text_rgb=case.text_rgb,
        )
        codes = {f.code for f in findings}

        if case.expected_broken and not codes:
            false_negatives.append(case.case_id)
        if not case.expected_broken and codes:
            false_positives.append((case.case_id, codes))
        if case.expected_broken and codes and not (codes & case.expected_codes):
            wrong_code.append((case.case_id, codes, case.expected_codes))

    assert not false_negatives, f"missed broken cases: {false_negatives}"
    assert not false_positives, f"false positives on clean cases: {false_positives}"
    assert not wrong_code, f"flagged the wrong failure code: {wrong_code}"
