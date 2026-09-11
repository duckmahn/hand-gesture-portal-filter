# RetroLens-Inspired Hand-Gesture Portal Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real-time webcam app where spreading both hands opens a "portal" region with a cycling visual filter (dual-tone, thermal, sketch, glitch) applied inside it, controlled by hand gestures (MediaPipe) plus keyboard fallback.

**Architecture:** `hand_tracker.py` wraps MediaPipe and converts results into plain `(x, y)` tuple lists (decouples the rest of the app from MediaPipe's types, keeps everything else unit-testable without a camera or MediaPipe installed). `gestures.py` turns landmark lists into gesture events (portal open/close, filter cycle) via a small state machine. `portal.py` holds smoothed portal state and does the circular-mask compositing. `filters.py` holds pure `frame -> frame` filter functions in a registry. `main.py` wires the per-frame loop together.

**Tech Stack:** Python 3.10+, OpenCV (`opencv-python`), MediaPipe `0.10.9` (pinned — do not upgrade on Apple Silicon, known ARM bugs), NumPy, pytest for tests.

**Design reference:** `docs/plans/2026-09-11-retrolens-filter-design.md`

---

## Task 0: Project scaffolding

**Files:**
- Create: `requirements.txt`
- Create: `requirements-dev.txt`
- Create: `.gitignore`

**Step 1: Create `requirements.txt`**

```
opencv-python>=4.8,<5
mediapipe==0.10.9
numpy>=1.24,<2
```

**Step 2: Create `requirements-dev.txt`**

```
-r requirements.txt
pytest>=7.4,<9
```

**Step 3: Create `.gitignore`**

```
__pycache__/
*.pyc
.venv/
venv/
screenshots/
.pytest_cache/
```

**Step 4: Create and activate a virtualenv, install dev deps**

Run:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```
Expected: install completes with no errors (MediaPipe wheel install can take a minute).

**Step 5: Commit**

```bash
git add requirements.txt requirements-dev.txt .gitignore
git commit -m "chore: project scaffolding (deps, gitignore)"
```

---

## Task 1: Filters module

**Files:**
- Create: `filters.py`
- Test: `tests/test_filters.py`

**Step 1: Write the failing tests**

```python
# tests/test_filters.py
import numpy as np
import pytest
import filters


def make_test_frame():
    # Deterministic gradient image, not a flat color, so filters have real work to do.
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
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_filters.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'filters'`

**Step 3: Write the implementation**

```python
# filters.py
import cv2
import numpy as np


def dual_tone(frame, color_dark=(40, 10, 90), color_light=(0, 200, 255)):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mask = gray > gray.mean()
    out = np.empty_like(frame)
    out[mask] = color_light
    out[~mask] = color_dark
    return out


def thermal(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.applyColorMap(gray, cv2.COLORMAP_JET)


def sketch(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    inverted = cv2.bitwise_not(gray)
    blurred = cv2.GaussianBlur(inverted, (21, 21), 0)
    inverted_blur = cv2.bitwise_not(blurred)
    sketch_gray = cv2.divide(gray, inverted_blur, scale=256.0)
    return cv2.cvtColor(sketch_gray, cv2.COLOR_GRAY2BGR)


def glitch(frame, rng=None):
    rng = rng if rng is not None else np.random.default_rng()
    out = frame.copy()
    h, _w = frame.shape[:2]
    num_slices = int(rng.integers(2, 6))
    for _ in range(num_slices):
        y0 = int(rng.integers(0, h))
        slice_h = int(rng.integers(2, max(3, h // 20)))
        y1 = min(h, y0 + slice_h)
        shift = int(rng.integers(-20, 20))
        out[y0:y1] = np.roll(out[y0:y1], shift, axis=1)
    b, g, r = cv2.split(out)
    b = np.roll(b, 3, axis=1)
    r = np.roll(r, -3, axis=1)
    return cv2.merge((b, g, r))


FILTERS = [dual_tone, thermal, sketch, glitch]
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_filters.py -v`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add filters.py tests/test_filters.py
git commit -m "feat: add dual-tone, thermal, sketch, glitch filters"
```

---

## Task 2: Gesture recognition

**Files:**
- Create: `gestures.py`
- Test: `tests/test_gestures.py`

**Step 1: Write the failing tests**

```python
# tests/test_gestures.py
import math
from gestures import GestureRecognizer


def make_hand(overrides):
    hand = [(0.0, 0.0)] * 21
    for i, pt in overrides.items():
        hand[i] = pt
    return hand


def two_far_apart_hands():
    # Palm landmarks are 0, 5, 17 - set all three to the same point per hand
    # so palm_center is exactly that point.
    left = make_hand({0: (0.1, 0.5), 5: (0.1, 0.5), 17: (0.1, 0.5)})
    right = make_hand({0: (0.9, 0.5), 5: (0.9, 0.5), 17: (0.9, 0.5)})
    return [left, right]


def two_close_hands():
    left = make_hand({0: (0.49, 0.5), 5: (0.49, 0.5), 17: (0.49, 0.5)})
    right = make_hand({0: (0.51, 0.5), 5: (0.51, 0.5), 17: (0.51, 0.5)})
    return [left, right]


def test_no_hands_portal_inactive():
    rec = GestureRecognizer()
    events = rec.update([], timestamp=0.0)
    assert events.portal_active is False
    assert events.portal_center is None


def test_one_hand_portal_inactive():
    rec = GestureRecognizer()
    hand = make_hand({0: (0.5, 0.5), 5: (0.5, 0.5), 17: (0.5, 0.5)})
    events = rec.update([hand], timestamp=0.0)
    assert events.portal_active is False


def test_two_hands_close_together_portal_inactive():
    rec = GestureRecognizer(spread_open_threshold=0.25)
    events = rec.update(two_close_hands(), timestamp=0.0)
    assert events.portal_active is False


def test_two_hands_spread_apart_opens_portal():
    rec = GestureRecognizer(spread_open_threshold=0.25)
    events = rec.update(two_far_apart_hands(), timestamp=0.0)
    assert events.portal_active is True
    assert events.portal_center == pytest_approx_tuple((0.5, 0.5))


def pytest_approx_tuple(t, tol=1e-9):
    class _Approx(tuple):
        def __eq__(self, other):
            return all(abs(a - b) < tol for a, b in zip(self, other))
    return _Approx(t)


def test_pinch_transition_triggers_cycle_once():
    rec = GestureRecognizer(pinch_threshold=0.06, pinch_cooldown=0.5)
    open_hand = make_hand({4: (0.0, 0.0), 20: (1.0, 1.0)})  # far apart -> not pinching
    pinched_hand = make_hand({4: (0.5, 0.5), 20: (0.5, 0.5001)})  # touching -> pinching

    events0 = rec.update([open_hand], timestamp=0.0)
    assert events0.cycle_filter is False

    events1 = rec.update([pinched_hand], timestamp=0.1)
    assert events1.cycle_filter is True

    # still pinching next frame -> should not fire again
    events2 = rec.update([pinched_hand], timestamp=0.2)
    assert events2.cycle_filter is False


def test_pinch_respects_cooldown_then_fires_again():
    rec = GestureRecognizer(pinch_threshold=0.06, pinch_cooldown=0.5)
    open_hand = make_hand({4: (0.0, 0.0), 20: (1.0, 1.0)})
    pinched_hand = make_hand({4: (0.5, 0.5), 20: (0.5, 0.5001)})

    rec.update([open_hand], timestamp=0.0)
    events1 = rec.update([pinched_hand], timestamp=0.1)
    assert events1.cycle_filter is True

    # release and re-pinch within cooldown window -> must not fire
    rec.update([open_hand], timestamp=0.2)
    events2 = rec.update([pinched_hand], timestamp=0.3)
    assert events2.cycle_filter is False

    # release and re-pinch after cooldown window -> fires again
    rec.update([open_hand], timestamp=0.5)
    events3 = rec.update([pinched_hand], timestamp=0.65)
    assert events3.cycle_filter is True
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_gestures.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'gestures'`

**Step 3: Write the implementation**

```python
# gestures.py
import math
from dataclasses import dataclass
from typing import List, Optional, Tuple

Hand = List[Tuple[float, float]]

PALM_LANDMARKS = (0, 5, 17)
THUMB_TIP = 4
PINKY_TIP = 20


def palm_center(hand: Hand) -> Tuple[float, float]:
    xs = [hand[i][0] for i in PALM_LANDMARKS]
    ys = [hand[i][1] for i in PALM_LANDMARKS]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


@dataclass
class GestureEvents:
    portal_active: bool
    portal_center: Optional[Tuple[float, float]]
    spread_distance: Optional[float]
    cycle_filter: bool


class GestureRecognizer:
    def __init__(self, spread_open_threshold=0.25, pinch_threshold=0.06, pinch_cooldown=0.5):
        self.spread_open_threshold = spread_open_threshold
        self.pinch_threshold = pinch_threshold
        self.pinch_cooldown = pinch_cooldown
        self._was_pinching = {}
        self._last_cycle_time = -math.inf

    def update(self, hands: List[Hand], timestamp: float) -> GestureEvents:
        portal_active = False
        portal_center = None
        spread_dist = None

        if len(hands) == 2:
            c0 = palm_center(hands[0])
            c1 = palm_center(hands[1])
            spread_dist = distance(c0, c1)
            if spread_dist >= self.spread_open_threshold:
                portal_active = True
                portal_center = ((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2)

        cycle_filter = False
        seen_indices = set()
        for idx, hand in enumerate(hands):
            seen_indices.add(idx)
            pinching = distance(hand[THUMB_TIP], hand[PINKY_TIP]) < self.pinch_threshold
            was_pinching = self._was_pinching.get(idx, False)
            if pinching and not was_pinching and (timestamp - self._last_cycle_time) >= self.pinch_cooldown:
                cycle_filter = True
                self._last_cycle_time = timestamp
            self._was_pinching[idx] = pinching

        # Drop stale hand-index state for hands no longer present.
        for idx in list(self._was_pinching.keys()):
            if idx not in seen_indices:
                del self._was_pinching[idx]

        return GestureEvents(portal_active, portal_center, spread_dist, cycle_filter)
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_gestures.py -v`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add gestures.py tests/test_gestures.py
git commit -m "feat: add gesture recognizer (spread-to-open, pinch-to-cycle)"
```

---

## Task 3: Portal state and mask compositing

**Files:**
- Create: `portal.py`
- Test: `tests/test_portal.py`

**Step 1: Write the failing tests**

```python
# tests/test_portal.py
import numpy as np
from portal import PortalState, composite_portal


def test_portal_starts_hidden():
    p = PortalState()
    assert p.is_visible is False


def test_portal_opens_toward_target_with_smoothing():
    p = PortalState(smoothing=0.5, min_radius_frac=0.05, max_radius_frac=0.4)
    p.update(active=True, target_center=(0.5, 0.5), target_spread_distance=0.3)
    assert p.is_visible is True
    assert p.center == (0.5, 0.5)  # first update snaps directly
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
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_portal.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'portal'`

**Step 3: Write the implementation**

```python
# portal.py
import cv2
import numpy as np


class PortalState:
    def __init__(self, smoothing=0.3, min_radius_frac=0.05, max_radius_frac=0.4, close_step=0.05):
        self.smoothing = smoothing
        self.min_radius_frac = min_radius_frac
        self.max_radius_frac = max_radius_frac
        self.close_step = close_step
        self.center = None
        self.radius_frac = 0.0

    def update(self, active, target_center, target_spread_distance):
        if active and target_center is not None:
            target_radius = min(self.max_radius_frac, max(self.min_radius_frac, target_spread_distance))
            if self.center is None:
                self.center = target_center
                self.radius_frac = target_radius
            else:
                self.center = self._lerp(self.center, target_center)
                self.radius_frac += (target_radius - self.radius_frac) * self.smoothing
        else:
            self.radius_frac = max(0.0, self.radius_frac - self.close_step)
            if self.radius_frac == 0.0:
                self.center = None

    def _lerp(self, current, target):
        return (
            current[0] + (target[0] - current[0]) * self.smoothing,
            current[1] + (target[1] - current[1]) * self.smoothing,
        )

    @property
    def is_visible(self):
        return self.center is not None and self.radius_frac > 0.0


def composite_portal(frame, filtered_frame, center_norm, radius_frac, edge_blur=15):
    h, w = frame.shape[:2]
    cx, cy = int(center_norm[0] * w), int(center_norm[1] * h)
    radius_px = int(radius_frac * w)

    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), radius_px, 255, -1)
    if edge_blur > 0:
        k = edge_blur | 1  # GaussianBlur kernel size must be odd
        mask = cv2.GaussianBlur(mask, (k, k), 0)

    mask_f = (mask.astype(np.float32) / 255.0)[..., None]
    blended = filtered_frame.astype(np.float32) * mask_f + frame.astype(np.float32) * (1 - mask_f)
    out = blended.astype(np.uint8)
    cv2.circle(out, (cx, cy), radius_px, (255, 255, 255), 2)
    return out
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_portal.py -v`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add portal.py tests/test_portal.py
git commit -m "feat: add portal state (smoothing) and circular mask compositing"
```

---

## Task 4: Hand tracker wrapper

**Files:**
- Create: `hand_tracker.py`
- Test: `tests/test_hand_tracker.py`

**Step 1: Write the failing test**

Test the pure landmark-extraction logic with fake MediaPipe-shaped objects, so it runs without a camera and without MediaPipe having to detect anything real.

```python
# tests/test_hand_tracker.py
from types import SimpleNamespace
from hand_tracker import HandTracker


def make_fake_results(hands_xy):
    hand_landmarks_list = []
    for hand in hands_xy:
        landmarks = [SimpleNamespace(x=x, y=y) for (x, y) in hand]
        hand_landmarks_list.append(SimpleNamespace(landmark=landmarks))
    if hand_landmarks_list:
        return SimpleNamespace(multi_hand_landmarks=hand_landmarks_list)
    return SimpleNamespace(multi_hand_landmarks=None)


def test_extract_hands_no_hands():
    results = make_fake_results([])
    assert HandTracker._extract_hands(results) == []


def test_extract_hands_one_hand():
    one_hand = [(0.1 * i, 0.2 * i) for i in range(21)]
    results = make_fake_results([one_hand])
    extracted = HandTracker._extract_hands(results)
    assert len(extracted) == 1
    assert extracted[0] == one_hand


def test_extract_hands_two_hands():
    hand_a = [(0.0, 0.0)] * 21
    hand_b = [(1.0, 1.0)] * 21
    results = make_fake_results([hand_a, hand_b])
    extracted = HandTracker._extract_hands(results)
    assert extracted == [hand_a, hand_b]
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_hand_tracker.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'hand_tracker'`

**Step 3: Write the implementation**

```python
# hand_tracker.py
import cv2
import mediapipe as mp


class HandTracker:
    def __init__(self, max_num_hands=2, min_detection_confidence=0.7, min_tracking_confidence=0.5):
        self._mp_hands = mp.solutions.hands
        self._hands = self._mp_hands.Hands(
            max_num_hands=max_num_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    def process(self, frame_bgr):
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = self._hands.process(rgb)
        return self._extract_hands(results)

    @staticmethod
    def _extract_hands(results):
        hands = []
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                hands.append([(lm.x, lm.y) for lm in hand_landmarks.landmark])
        return hands

    def close(self):
        self._hands.close()
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_hand_tracker.py -v`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add hand_tracker.py tests/test_hand_tracker.py
git commit -m "feat: add MediaPipe hand tracker wrapper"
```

---

## Task 5: Main application loop

**Files:**
- Create: `main.py`
- Create: `tests/__init__.py` (if not already implicitly created — Python 3 doesn't strictly need this for pytest, but add it for clarity if `tests/` has no `__init__.py` yet)

**Step 1: Write `main.py`**

This is the integration point — no camera in CI, so it's verified manually (Step 2), not with pytest.

```python
# main.py
import argparse
import time

import cv2

from filters import FILTERS
from gestures import GestureRecognizer
from hand_tracker import HandTracker
from portal import PortalState, composite_portal


def parse_args():
    parser = argparse.ArgumentParser(description="Hand-gesture portal filter")
    parser.add_argument("--camera", type=int, default=0, help="Camera index")
    return parser.parse_args()


def main():
    args = parse_args()

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit(f"Could not open camera index {args.camera}")

    tracker = HandTracker()
    recognizer = GestureRecognizer()
    portal = PortalState()
    filter_index = 0
    screenshot_count = 0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Warning: failed to read frame from camera, stopping.")
                break

            frame = cv2.flip(frame, 1)
            hands = tracker.process(frame)
            events = recognizer.update(hands, timestamp=time.time())

            portal.update(
                active=events.portal_active,
                target_center=events.portal_center,
                target_spread_distance=events.spread_distance,
            )
            if events.cycle_filter:
                filter_index = (filter_index + 1) % len(FILTERS)

            display = frame
            if portal.is_visible:
                filtered = FILTERS[filter_index](frame)
                display = composite_portal(frame, filtered, portal.center, portal.radius_frac)

            cv2.imshow("Hand Portal Filter", display)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("n"):
                filter_index = (filter_index + 1) % len(FILTERS)
            elif key == ord("p"):
                filter_index = (filter_index - 1) % len(FILTERS)
            elif key == ord("s"):
                screenshot_count += 1
                filename = f"screenshot_{screenshot_count}.png"
                cv2.imwrite(filename, display)
                print(f"Saved {filename}")
    finally:
        tracker.close()
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
```

**Step 2: Manual verification (no automated test — requires a real camera)**

Run: `python main.py`

Checklist:
- Window opens showing mirrored webcam feed.
- Spreading both hands apart opens a circular portal that grows with hand distance.
- Portal content shows the first filter (dual-tone); bringing hands together closes it smoothly (not an instant cut).
- Pinching thumb+pinky on either hand cycles to the next filter (one step per pinch, not rapid-firing).
- `N`/`P` keys cycle filters manually; `S` saves a screenshot file; `Q` quits cleanly (window closes, no traceback).

**Step 3: Commit**

```bash
git add main.py
git commit -m "feat: wire hand tracking, gestures, portal, and filters into main loop"
```

---

## Task 6: README

**Files:**
- Create: `README.md`

**Step 1: Write `README.md`**

```markdown
# Hand-Gesture Portal Filter

A real-time webcam filter controlled by hand gestures, inspired by
[RetroLens](https://github.com/syahdanfx/Retrolens). Spread both hands apart to
open a "portal" over the video feed; the region inside gets a visual filter.

## Setup

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

**Apple Silicon:** keep `mediapipe==0.10.9` — later versions have known bugs on ARM Macs.

## Run

    python main.py

## Controls

| Action | Gesture | Key |
|---|---|---|
| Open portal | Spread both hands apart | — |
| Close portal | Bring hands together / hide hands | — |
| Cycle filter | Pinch thumb + pinky (either hand) | `N` / `P` |
| Screenshot | — | `S` |
| Quit | — | `Q` |

## Filters

Dual-tone, Thermal, Sketch, Glitch — cycled in that order.

## Tests

    pip install -r requirements-dev.txt
    pytest
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and controls"
```

---

## Task 7: Full test suite sanity check

**Step 1: Run the whole suite**

Run: `pytest -v`
Expected: All tests from Tasks 1–4 pass (23 tests total), 0 failures.

**Step 2: Manual smoke test of main.py**

Repeat the Task 5 Step 2 checklist once more end-to-end after all commits, to confirm nothing regressed while wiring modules together.
