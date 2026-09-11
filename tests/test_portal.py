import numpy as np
from portal import PortalState, composite_portal


def test_portal_starts_hidden():
    p = PortalState()
    assert p.is_visible is False


def test_portal_opens_toward_target_with_smoothing():
    p = PortalState(smoothing=0.5, min_radius_frac=0.05, max_radius_frac=0.4)
    p.update(active=True, target_center=(0.5, 0.5), target_spread_distance=0.3)
    assert p.is_visible is True
    assert p.center == (0.5, 0.5)
    assert 0.05 <= p.radius_frac <= 0.4


def test_portal_radius_is_clamped_to_max():
    p = PortalState(min_radius_frac=0.05, max_radius_frac=0.2)
    p.update(active=True, target_center=(0.5, 0.5), target_spread_distance=0.9)
    assert p.radius_frac == 0.2


def test_portal_radius_is_clamped_to_min():
    p = PortalState(min_radius_frac=0.05, max_radius_frac=0.4)
    p.update(active=True, target_center=(0.5, 0.5), target_spread_distance=0.01)
    assert p.radius_frac == 0.05


def test_portal_closes_gradually_then_hides():
    p = PortalState(close_step=0.05)
    p.update(active=True, target_center=(0.5, 0.5), target_spread_distance=0.3)
    radius_before = p.radius_frac
    p.update(active=False, target_center=None, target_spread_distance=None)
    assert p.radius_frac < radius_before
    for _ in range(20):
        p.update(active=False, target_center=None, target_spread_distance=None)
    assert p.radius_frac == 0.0
    assert p.is_visible is False


def test_composite_portal_preserves_shape_and_dtype():
    frame = np.zeros((40, 60, 3), dtype=np.uint8)
    filtered = np.full((40, 60, 3), 255, dtype=np.uint8)
    out = composite_portal(frame, filtered, center_norm=(0.5, 0.5), radius_frac=0.3, edge_blur=0)
    assert out.shape == frame.shape
    assert out.dtype == np.uint8


def test_composite_portal_uses_filtered_pixels_at_center():
    frame = np.zeros((40, 60, 3), dtype=np.uint8)
    filtered = np.full((40, 60, 3), 255, dtype=np.uint8)
    out = composite_portal(frame, filtered, center_norm=(0.5, 0.5), radius_frac=0.3, edge_blur=0)
    cy, cx = 20, 30
    assert tuple(out[cy, cx]) == (255, 255, 255)


def test_composite_portal_uses_original_pixels_far_from_center():
    frame = np.zeros((40, 60, 3), dtype=np.uint8)
    filtered = np.full((40, 60, 3), 255, dtype=np.uint8)
    out = composite_portal(frame, filtered, center_norm=(0.5, 0.5), radius_frac=0.1, edge_blur=0)
    corner = tuple(out[0, 0])
    assert corner == (0, 0, 0)
