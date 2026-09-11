import numpy as np
import pytest
import filters


def make_test_frame():
    h, w = 60, 80
    x = np.linspace(0, 255, w, dtype=np.uint8)
    frame = np.tile(x, (h, 1))
    frame = np.stack([frame, frame, frame], axis=-1)  # BGR
    return frame


@pytest.mark.parametrize("fn", [filters.dual_tone, filters.thermal, filters.sketch, filters.glitch])
def test_filter_preserves_shape_and_dtype(fn):
    frame = make_test_frame()
    out = fn(frame)
    assert out.shape == frame.shape
    assert out.dtype == np.uint8


@pytest.mark.parametrize("fn", [filters.dual_tone, filters.thermal, filters.sketch, filters.glitch])
def test_filter_changes_the_image(fn):
    frame = make_test_frame()
    out = fn(frame)
    assert not np.array_equal(out, frame)


def test_glitch_is_deterministic_with_seeded_rng():
    frame = make_test_frame()
    rng1 = np.random.default_rng(42)
    rng2 = np.random.default_rng(42)
    out1 = filters.glitch(frame, rng=rng1)
    out2 = filters.glitch(frame, rng=rng2)
    assert np.array_equal(out1, out2)


def test_filters_registry_contains_all_four():
    assert filters.FILTERS == [filters.dual_tone, filters.thermal, filters.sketch, filters.glitch]
