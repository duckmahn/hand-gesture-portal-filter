# RetroLens-Inspired Hand-Gesture Portal Filter — Design

Date: 2026-09-11
Status: Approved, ready for implementation planning

## Reference

Inspired by [RetroLens](https://github.com/syahdanfx/Retrolens) (Python, OpenCV + MediaPipe):
spreading both hands opens a "portal" region on the camera feed that gets a visual filter
applied inside it. Pinch cycles filters, fist toggles 2D/3D mode.

This design builds a similar app from scratch, not a fork/clone.

## Scope decisions

- Gestures: same core set as RetroLens — spread both hands to open portal, pinch
  (thumb tip + pinky tip) to cycle filter, keyboard fallback (`N`/`P`/`S`/`Q`).
- 2D/3D mode toggle: **out of scope for v1** (may add a perspective-warp variant later).
- Filters: small curated set of 4 (see below), registry-based so more can be added later.

## Stack

- Python 3.10+
- OpenCV — capture, image effects, rendering
- MediaPipe Hands — landmark detection
  - **Apple Silicon caveat**: pin `mediapipe==0.10.9` in requirements — later versions have
    known ARM Mac bugs (per RetroLens README).
- NumPy for array ops

## Architecture

```
Webcam -> OpenCV capture -> MediaPipe hand landmarks
   -> GestureRecognizer (landmarks -> events)
   -> PortalState (position/radius/active filter)
   -> FilterEngine (applies selected effect inside portal mask)
   -> OpenCV overlay/draw -> imshow
```

Single-process real-time loop; no threading needed at this scale.

### Per-frame loop

1. Read frame, flip horizontally (mirror view).
2. Run MediaPipe -> up to 2 hands' landmarks.
3. Feed landmarks to `GestureRecognizer`:
   - Both hands spread beyond a distance threshold -> portal opens, radius scales with
     hand distance, center = midpoint between hands.
   - Thumb-tip/pinky-tip pinch on either hand -> cycle filter (debounced, one pinch =
     one step).
   - No hands / hands together -> portal closes (smoothed, not instant).
4. `FilterEngine` renders the whole frame through the current filter into a second
   buffer, then composites: original frame outside a circular mask, filtered frame
   inside it, centered on the portal.
5. Draw a thin ring at the portal edge.
6. Keyboard: `N`/`P` cycle filter, `S` screenshot, `Q` quit.

## Gesture detection details

MediaPipe Hands gives 21 landmarks/hand, normalized to frame size. Key landmarks:
wrist (0), thumb tip (4), index tip (8), pinky tip (20).

**Spread-to-open (portal):**
- Only active with exactly 2 hands detected.
- Distance = Euclidean distance between palm centers (average of landmarks 0/5/17 for
  stability against finger wiggle).
- Threshold: portal opens once distance exceeds a calibrated fraction of frame width
  (e.g. 25%); radius grows proportionally (min/max capped).
- Center = midpoint between the two palm centers.
- Portal closes over a few frames when the condition drops, to avoid flicker.

**Pinch-to-cycle (filter switch):**
- Per hand: distance between thumb tip (4) and pinky tip (20); pinch = below a small
  threshold.
- State machine fires "cycle" only on transition into pinch (not every frame held),
  plus ~0.5s cooldown, so one gesture = one step.
- Works regardless of portal open/closed state.

**Smoothing:** Exponential moving average on palm-center and distance values before
threshold checks, to prevent jittery portal radius/position and false triggers.

**Mask compositing:** Circular mask with slightly blurred edges (small Gaussian blur
on the mask) so the portal blends rather than showing hard aliasing.

## Filters (v1, cycled via pinch or N/P)

1. **Dual-tone** — posterize to 2 colors based on a luminance threshold, mapped to a
   chosen color pair via `cv2.applyColorMap` on thresholded grayscale.
2. **Thermal** — grayscale -> `cv2.applyColorMap(..., cv2.COLORMAP_JET)` (or INFERNO).
3. **Sketch** — grayscale -> invert -> Gaussian blur -> color-dodge blend with original
   grayscale (standard pencil-sketch technique).
4. **Glitch** — random horizontal slice shifting + RGB channel offset per frame for a
   chromatic-aberration/datamosh look.

Each filter is a `frame -> frame` function registered in a list; cycling is index
increment mod `len(list)`. Adding a 5th filter later is a one-line registration.

## File layout

```
python-handtracking/
  main.py                 # capture loop, ties everything together
  hand_tracker.py         # MediaPipe wrapper: returns landmarks per hand
  gestures.py             # GestureRecognizer: spread/pinch detection + debounce
  portal.py               # PortalState (center, radius, smoothing) + mask compositing
  filters.py              # the 4 filter functions + registry
  requirements.txt        # opencv-python, mediapipe==0.10.9 (pinned), numpy
  README.md
```

## Error handling

- Webcam fails to open -> clear error message, exit.
- No hands detected -> portal stays closed / gestures no-op; not an error.
- MediaPipe returns no landmarks for a frame -> skip gesture update for that frame,
  reuse last smoothed state.

## Testing approach

Live camera/CV app — no meaningful unit tests for the vision pipeline itself, but:
- `gestures.py` threshold/debounce logic can be unit-tested with synthetic landmark
  coordinates.
- `filters.py` functions can be tested on a static sample image (assert output
  shape/dtype unchanged, values differ from input).
