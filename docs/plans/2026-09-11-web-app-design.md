# Hand-Gesture Portal Filter — Web App Design

Date: 2026-09-11
Status: Approved, ready for implementation planning

## Goal

Bring the existing Python/OpenCV/MediaPipe hand-gesture portal filter to the browser
so users can try it on the web with no install. This is a from-scratch JS rewrite,
not a port of the Python source — Python + OpenCV + MediaPipe's `solutions` API
does not run in a browser.

## Scope decisions

- Lives in the **same repo**, in a new `web/` folder, alongside the existing Python
  project (not a separate repo).
- **Vanilla JS + Vite** — no framework, matches the small single-purpose scope.
- Deployed to **GitHub Pages** at `https://duckmahn.github.io/hand-gesture-portal-filter/`.

## Stack

- **`@mediapipe/tasks-vision`** (official npm package) — `HandLandmarker`, the modern
  browser/WASM hand-landmark detector. This is the actively maintained successor to
  the old `@mediapipe/hands` package, and to Python's `mp.solutions.hands` (which is
  removed in current MediaPipe releases — same reason the Python side had to pin an
  older MediaPipe version).
- **Vite** — dev server + static build.
- **Canvas 2D API** — all rendering and filter effects. No WebGL needed; native
  `globalCompositeOperation` blend modes and CSS `filter: blur()` on canvas cover
  everything the OpenCV filters did.
- **Vitest** — unit tests for pure-logic modules (Vite's native test runner).
- Runs entirely **client-side** — no backend, no signup, camera never leaves the browser.

## Architecture

```
Webcam (getUserMedia) -> <video> element
   -> HandLandmarker.detectForVideo() -> per-frame hand landmarks
   -> GestureRecognizer (ported from gestures.py)
   -> PortalState (ported from portal.py)
   -> Filters (dualTone/thermal/sketch/glitch, canvas-based)
   -> Composite onto visible <canvas> via requestAnimationFrame loop
```

## File layout

```
web/
  index.html
  package.json
  vite.config.js
  src/
    main.js          # camera setup, HandLandmarker init, render loop
    handTracker.js    # wraps HandLandmarker, returns plain landmark arrays
    gestures.js        # GestureRecognizer (ported from gestures.py)
    portal.js           # PortalState + circular soft-mask compositing
    filters.js           # dualTone, thermal, sketch, glitch
  tests/
    gestures.test.js
    portal.test.js
  README.md
```

## Filters

1. **Dual-tone** — `getImageData`, per-pixel luminance, threshold against the frame's
   mean, write one of two flat colors into a new `ImageData`, `putImageData` back.
   Direct port of the numpy version.
2. **Thermal** — grayscale via `ImageData` luminance, map each 0-255 value through a
   hardcoded 256-entry JET-like color lookup table (browser equivalent of
   `cv2.applyColorMap`).
3. **Sketch** — draw grayscale frame to an offscreen canvas; draw an inverted+blurred
   copy on top using `ctx.filter = 'blur(Npx)'` (native Gaussian blur) with
   `globalCompositeOperation = 'color-dodge'` (native blend mode).
4. **Glitch** — copy horizontal strips of the frame to random y-offsets via
   `drawImage` slices (mirrors numpy `np.roll` strip-shifting); channel-shift effect
   via drawing the frame twice more, offset +-3px horizontally, with
   `globalCompositeOperation = 'lighten'` per isolated color channel.

## Portal soft-mask compositing

1. Draw the original frame to the main canvas as the base layer.
2. Render the filtered frame to an offscreen canvas.
3. Build a mask on a second offscreen canvas: filled circle at the portal
   center/radius, with `ctx.filter = 'blur(15px)'` applied before drawing (soft edge,
   same idea as the Python Gaussian-blurred mask).
4. Apply the mask to the filtered offscreen canvas via
   `globalCompositeOperation = 'destination-in'`.
5. Draw the masked result onto the main canvas over the base frame.
6. Stroke a thin white ring at the portal edge.

## Camera & mirroring

`getUserMedia({video: true})` feeds a hidden `<video>`; each rAF tick draws the
current video frame into canvas mirrored (`ctx.scale(-1, 1)`), matching
`cv2.flip(frame, 1)` in Python ("selfie view"). `HandLandmarker.detectForVideo` runs
on the unmirrored video element; landmark x-coordinates are mirrored in code, not the
pixels, to avoid confusing the detector.

## Gesture porting

`gestures.js` is a line-for-line port of `gestures.py`'s `GestureRecognizer`: same
landmark indices (wrist/5/17 for palm center, thumb tip 4, pinky tip 20), same
spread-threshold/portal-center math, same pinch-debounce-with-cooldown state machine
using `performance.now() / 1000` in place of `time.time()`. Thresholds (spread 0.25,
pinch 0.06, cooldown 0.5s) start identical to Python and can be retuned independently
if webcam FOV/landmark scale differs across platforms.

## Controls

Same core gestures as Python (spread to open, pinch to cycle), plus on-screen buttons
(Next/Prev filter, Screenshot) since there's no terminal for keyboard shortcuts to
feel natural in a browser tab. Screenshot uses `canvas.toBlob()` + a download link
instead of `cv2.imwrite`.

## Testing

- `gestures.js` and `portal.js` are pure logic (no DOM/canvas) — same test coverage
  as Python, ported to Vitest from `test_gestures.py`/`test_portal.py`.
- `filters.js` and camera wiring need a real canvas/webcam — verified manually in
  browser, not automated (same caveat as `main.py` on the Python side).

## Error handling

- Camera permission denied / no camera -> catch `getUserMedia` rejection, show an
  on-page message.
- `HandLandmarker` fails to load its WASM/model assets (e.g. offline) -> catch and
  show a loading-error message instead of a blank canvas.
- No hands detected -> normal state, portal stays closed (not an error).

## Deployment

- Vite `base: '/hand-gesture-portal-filter/'` (project page, not a user page).
- `.github/workflows/deploy-web.yml`: on push to `main`/`dev` touching `web/**`, run
  `npm ci && npm run build` in `web/`, deploy `web/dist` via
  `actions/upload-pages-artifact` + `actions/deploy-pages`.
- One-time repo setting: enable "GitHub Actions" as the Pages source in
  Settings -> Pages (attempt via `gh api`, otherwise a manual one-click step).
- Final URL: `https://duckmahn.github.io/hand-gesture-portal-filter/`
