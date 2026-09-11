# Hand-Gesture Portal Filter Web App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a browser version of the hand-gesture portal filter (spread hands to open a portal, pinch to cycle dual-tone/thermal/sketch/glitch filters) that runs entirely client-side and deploys to GitHub Pages.

**Architecture:** New `web/` folder in this repo, Vite + vanilla JS. `handTracker.js` wraps `@mediapipe/tasks-vision`'s `HandLandmarker` and returns plain `[x, y]` arrays (mirrors the Python `hand_tracker.py` decoupling). `gestures.js` and the `PortalState` part of `portal.js` are line-for-line ports of the Python logic and get the same unit-test coverage via Vitest. `filters.js` splits into pure ImageData functions (`dualTone`, `thermal` — unit tested) and canvas-native functions (`sketch`, `glitch` — need a real canvas, verified manually). `main.js` wires camera + tracker + gestures + portal + filters into a `requestAnimationFrame` loop.

**Tech Stack:** Vite, vanilla JS (ES modules), `@mediapipe/tasks-vision`, Canvas 2D API, Vitest, GitHub Actions + GitHub Pages.

**Design reference:** `docs/plans/2026-09-11-web-app-design.md`

---

## Task 0: Scaffold the web/ project

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.js`
- Create: `web/index.html`
- Create: `web/.gitignore`

**Step 1: Create the directory and package.json**

```bash
mkdir -p web/src web/tests
```

```json
// web/package.json
{
  "name": "hand-gesture-portal-filter-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "^0.10.14"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Create `web/vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/hand-gesture-portal-filter/',
});
```

**Step 3: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hand-Gesture Portal Filter</title>
  <style>
    body { margin: 0; background: #111; color: #eee; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; }
    #stage { position: relative; margin-top: 1rem; }
    video { display: none; }
    canvas { max-width: 100%; border-radius: 8px; }
    #controls { margin: 1rem; display: flex; gap: 0.5rem; }
    button { padding: 0.5rem 1rem; cursor: pointer; }
    #status { min-height: 1.5rem; color: #f88; }
  </style>
</head>
<body>
  <h1>Hand-Gesture Portal Filter</h1>
  <div id="status"></div>
  <div id="stage">
    <video id="video" playsinline></video>
    <canvas id="canvas"></canvas>
  </div>
  <div id="controls">
    <button id="prevBtn">&larr; Prev filter</button>
    <button id="nextBtn">Next filter &rarr;</button>
    <button id="screenshotBtn">Screenshot</button>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

**Step 4: Create `web/.gitignore`**

```
node_modules/
dist/
```

**Step 5: Install dependencies and verify the dev server boots**

Run:
```bash
cd web
npm install
npm run dev
```
Expected: Vite prints a local URL (e.g. `http://localhost:5173/`); visit it and confirm the page loads with the title and buttons (blank video/canvas is expected — nothing wired up yet). Stop the dev server (Ctrl+C) once confirmed.

**Step 6: Commit**

```bash
cd ..
git add web/package.json web/package-lock.json web/vite.config.js web/index.html web/.gitignore
git commit -m "chore: scaffold web/ Vite project"
```

---

## Task 1: Gesture recognition (ported from gestures.py)

**Files:**
- Create: `web/src/gestures.js`
- Test: `web/tests/gestures.test.js`

**Step 1: Write the failing tests**

```js
// web/tests/gestures.test.js
import { describe, it, expect } from 'vitest';
import { GestureRecognizer } from '../src/gestures.js';

function makeHand(overrides) {
  const hand = Array.from({ length: 21 }, () => [0.0, 0.0]);
  for (const [i, pt] of Object.entries(overrides)) {
    hand[Number(i)] = pt;
  }
  return hand;
}

function twoFarApartHands() {
  const left = makeHand({ 0: [0.1, 0.5], 5: [0.1, 0.5], 17: [0.1, 0.5] });
  const right = makeHand({ 0: [0.9, 0.5], 5: [0.9, 0.5], 17: [0.9, 0.5] });
  return [left, right];
}

function twoCloseHands() {
  const left = makeHand({ 0: [0.49, 0.5], 5: [0.49, 0.5], 17: [0.49, 0.5] });
  const right = makeHand({ 0: [0.51, 0.5], 5: [0.51, 0.5], 17: [0.51, 0.5] });
  return [left, right];
}

function approxEqual(a, b, tol = 1e-9) {
  return a.every((v, i) => Math.abs(v - b[i]) < tol);
}

describe('GestureRecognizer', () => {
  it('no hands -> portal inactive', () => {
    const rec = new GestureRecognizer();
    const events = rec.update([], 0.0);
    expect(events.portalActive).toBe(false);
    expect(events.portalCenter).toBe(null);
  });

  it('one hand -> portal inactive', () => {
    const rec = new GestureRecognizer();
    const hand = makeHand({ 0: [0.5, 0.5], 5: [0.5, 0.5], 17: [0.5, 0.5] });
    const events = rec.update([hand], 0.0);
    expect(events.portalActive).toBe(false);
  });

  it('two close hands -> portal inactive', () => {
    const rec = new GestureRecognizer({ spreadOpenThreshold: 0.25 });
    const events = rec.update(twoCloseHands(), 0.0);
    expect(events.portalActive).toBe(false);
  });

  it('two far apart hands -> portal opens', () => {
    const rec = new GestureRecognizer({ spreadOpenThreshold: 0.25 });
    const events = rec.update(twoFarApartHands(), 0.0);
    expect(events.portalActive).toBe(true);
    expect(approxEqual(events.portalCenter, [0.5, 0.5])).toBe(true);
  });

  it('pinch transition triggers cycle once', () => {
    const rec = new GestureRecognizer({ pinchThreshold: 0.06, pinchCooldown: 0.5 });
    const openHand = makeHand({ 4: [0.0, 0.0], 20: [1.0, 1.0] });
    const pinchedHand = makeHand({ 4: [0.5, 0.5], 20: [0.5, 0.5001] });

    const e0 = rec.update([openHand], 0.0);
    expect(e0.cycleFilter).toBe(false);

    const e1 = rec.update([pinchedHand], 0.1);
    expect(e1.cycleFilter).toBe(true);

    const e2 = rec.update([pinchedHand], 0.2);
    expect(e2.cycleFilter).toBe(false);
  });

  it('pinch respects cooldown then fires again', () => {
    const rec = new GestureRecognizer({ pinchThreshold: 0.06, pinchCooldown: 0.5 });
    const openHand = makeHand({ 4: [0.0, 0.0], 20: [1.0, 1.0] });
    const pinchedHand = makeHand({ 4: [0.5, 0.5], 20: [0.5, 0.5001] });

    rec.update([openHand], 0.0);
    const e1 = rec.update([pinchedHand], 0.1);
    expect(e1.cycleFilter).toBe(true);

    rec.update([openHand], 0.2);
    const e2 = rec.update([pinchedHand], 0.3);
    expect(e2.cycleFilter).toBe(false);

    rec.update([openHand], 0.5);
    const e3 = rec.update([pinchedHand], 0.65);
    expect(e3.cycleFilter).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run tests/gestures.test.js`
Expected: FAIL — cannot find module `../src/gestures.js`

**Step 3: Write the implementation**

```js
// web/src/gestures.js
const PALM_LANDMARKS = [0, 5, 17];
const THUMB_TIP = 4;
const PINKY_TIP = 20;

export function palmCenter(hand) {
  const xs = PALM_LANDMARKS.map((i) => hand[i][0]);
  const ys = PALM_LANDMARKS.map((i) => hand[i][1]);
  return [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
}

export function distance(p1, p2) {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
}

export class GestureRecognizer {
  constructor({ spreadOpenThreshold = 0.25, pinchThreshold = 0.06, pinchCooldown = 0.5 } = {}) {
    this.spreadOpenThreshold = spreadOpenThreshold;
    this.pinchThreshold = pinchThreshold;
    this.pinchCooldown = pinchCooldown;
    this._wasPinching = new Map();
    this._lastCycleTime = -Infinity;
  }

  update(hands, timestamp) {
    let portalActive = false;
    let portalCenter = null;
    let spreadDistance = null;

    if (hands.length === 2) {
      const c0 = palmCenter(hands[0]);
      const c1 = palmCenter(hands[1]);
      spreadDistance = distance(c0, c1);
      if (spreadDistance >= this.spreadOpenThreshold) {
        portalActive = true;
        portalCenter = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
      }
    }

    let cycleFilter = false;
    const seenIndices = new Set();
    hands.forEach((hand, idx) => {
      seenIndices.add(idx);
      const pinching = distance(hand[THUMB_TIP], hand[PINKY_TIP]) < this.pinchThreshold;
      const wasPinching = this._wasPinching.get(idx) ?? false;
      if (pinching && !wasPinching && timestamp - this._lastCycleTime >= this.pinchCooldown) {
        cycleFilter = true;
        this._lastCycleTime = timestamp;
      }
      this._wasPinching.set(idx, pinching);
    });

    for (const idx of Array.from(this._wasPinching.keys())) {
      if (!seenIndices.has(idx)) this._wasPinching.delete(idx);
    }

    return { portalActive, portalCenter, spreadDistance, cycleFilter };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/gestures.test.js`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
cd ..
git add web/src/gestures.js web/tests/gestures.test.js
git commit -m "feat(web): add gesture recognizer (ported from gestures.py)"
```

---

## Task 2: Portal state and mask compositing

**Files:**
- Create: `web/src/portal.js`
- Test: `web/tests/portal.test.js`

**Step 1: Write the failing tests (PortalState only — `compositePortal` needs a real canvas, verified manually in Task 5)**

```js
// web/tests/portal.test.js
import { describe, it, expect } from 'vitest';
import { PortalState } from '../src/portal.js';

describe('PortalState', () => {
  it('starts hidden', () => {
    const p = new PortalState();
    expect(p.isVisible).toBe(false);
  });

  it('opens toward target with smoothing', () => {
    const p = new PortalState({ smoothing: 0.5, minRadiusFrac: 0.05, maxRadiusFrac: 0.4 });
    p.update(true, [0.5, 0.5], 0.3);
    expect(p.isVisible).toBe(true);
    expect(p.center).toEqual([0.5, 0.5]);
    expect(p.radiusFrac).toBeGreaterThanOrEqual(0.05);
    expect(p.radiusFrac).toBeLessThanOrEqual(0.4);
  });

  it('clamps radius to max', () => {
    const p = new PortalState({ minRadiusFrac: 0.05, maxRadiusFrac: 0.2 });
    p.update(true, [0.5, 0.5], 0.9);
    expect(p.radiusFrac).toBe(0.2);
  });

  it('clamps radius to min', () => {
    const p = new PortalState({ minRadiusFrac: 0.05, maxRadiusFrac: 0.4 });
    p.update(true, [0.5, 0.5], 0.01);
    expect(p.radiusFrac).toBe(0.05);
  });

  it('closes gradually then hides', () => {
    const p = new PortalState({ closeStep: 0.05 });
    p.update(true, [0.5, 0.5], 0.3);
    const radiusBefore = p.radiusFrac;
    p.update(false, null, null);
    expect(p.radiusFrac).toBeLessThan(radiusBefore);
    for (let i = 0; i < 20; i++) {
      p.update(false, null, null);
    }
    expect(p.radiusFrac).toBe(0.0);
    expect(p.isVisible).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run tests/portal.test.js`
Expected: FAIL — cannot find module `../src/portal.js`

**Step 3: Write the implementation**

```js
// web/src/portal.js
export class PortalState {
  constructor({ smoothing = 0.3, minRadiusFrac = 0.05, maxRadiusFrac = 0.4, closeStep = 0.05 } = {}) {
    this.smoothing = smoothing;
    this.minRadiusFrac = minRadiusFrac;
    this.maxRadiusFrac = maxRadiusFrac;
    this.closeStep = closeStep;
    this.center = null;
    this.radiusFrac = 0.0;
  }

  update(active, targetCenter, targetSpreadDistance) {
    if (active && targetCenter) {
      const targetRadius = Math.min(this.maxRadiusFrac, Math.max(this.minRadiusFrac, targetSpreadDistance));
      if (this.center === null) {
        this.center = targetCenter;
        this.radiusFrac = targetRadius;
      } else {
        this.center = this._lerp(this.center, targetCenter);
        this.radiusFrac += (targetRadius - this.radiusFrac) * this.smoothing;
      }
    } else {
      this.radiusFrac = Math.max(0.0, this.radiusFrac - this.closeStep);
      if (this.radiusFrac === 0.0) {
        this.center = null;
      }
    }
  }

  _lerp(current, target) {
    return [
      current[0] + (target[0] - current[0]) * this.smoothing,
      current[1] + (target[1] - current[1]) * this.smoothing,
    ];
  }

  get isVisible() {
    return this.center !== null && this.radiusFrac > 0.0;
  }
}

export function compositePortal(ctx, baseCanvas, filteredCanvas, centerNorm, radiusFrac, edgeBlurPx = 15) {
  const w = baseCanvas.width;
  const h = baseCanvas.height;
  const cx = centerNorm[0] * w;
  const cy = centerNorm[1] * h;
  const radiusPx = radiusFrac * w;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.filter = edgeBlurPx > 0 ? `blur(${edgeBlurPx}px)` : 'none';
  maskCtx.fillStyle = 'white';
  maskCtx.beginPath();
  maskCtx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  maskCtx.fill();

  const maskedCanvas = document.createElement('canvas');
  maskedCanvas.width = w;
  maskedCanvas.height = h;
  const maskedCtx = maskedCanvas.getContext('2d');
  maskedCtx.drawImage(filteredCanvas, 0, 0);
  maskedCtx.globalCompositeOperation = 'destination-in';
  maskedCtx.drawImage(maskCanvas, 0, 0);

  ctx.drawImage(baseCanvas, 0, 0);
  ctx.drawImage(maskedCanvas, 0, 0);
  ctx.beginPath();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/portal.test.js`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
cd ..
git add web/src/portal.js web/tests/portal.test.js
git commit -m "feat(web): add portal state and circular mask compositing"
```

---

## Task 3: Filters

**Files:**
- Create: `web/src/filters.js`
- Test: `web/tests/filters.test.js`

`dualTone` and `thermal` operate on plain `{data, width, height}` objects shaped
like `ImageData` (no DOM dependency) — unit tested. `sketch` and `glitch` need a
real `<canvas>` element and are verified manually in Task 5, matching the design.

**Step 1: Write the failing tests**

```js
// web/tests/filters.test.js
import { describe, it, expect } from 'vitest';
import { dualTone, thermal } from '../src/filters.js';

function makeGradientImageData(width = 8, height = 4) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const v = Math.round((x / (width - 1)) * 255);
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('dualTone', () => {
  it('preserves width/height and outputs at most two colors', () => {
    const src = makeGradientImageData();
    const out = dualTone(src);
    expect(out.width).toBe(src.width);
    expect(out.height).toBe(src.height);

    const seenColors = new Set();
    for (let i = 0; i < out.data.length; i += 4) {
      seenColors.add(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`);
    }
    expect(seenColors.size).toBeLessThanOrEqual(2);
  });
});

describe('thermal', () => {
  it('preserves width/height and changes the image', () => {
    const src = makeGradientImageData();
    const out = thermal(src);
    expect(out.width).toBe(src.width);
    expect(out.height).toBe(src.height);
    expect(out.data).not.toEqual(src.data);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run tests/filters.test.js`
Expected: FAIL — cannot find module `../src/filters.js`

**Step 3: Write the implementation**

```js
// web/src/filters.js

// --- Pure filters (operate on plain {data, width, height}, no DOM) ---

export function dualTone(imageData, colorDark = [40, 10, 90], colorLight = [0, 200, 255]) {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);

  let sum = 0;
  const pixelCount = width * height;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const mean = sum / pixelCount;

  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const color = luminance > mean ? colorLight : colorDark;
    out[i] = color[0];
    out[i + 1] = color[1];
    out[i + 2] = color[2];
    out[i + 3] = 255;
  }

  return { data: out, width, height };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function buildJetLut() {
  const lut = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const r = Math.round(255 * clamp(1.5 - Math.abs(4 * t - 3), 0, 1));
    const g = Math.round(255 * clamp(1.5 - Math.abs(4 * t - 2), 0, 1));
    const b = Math.round(255 * clamp(1.5 - Math.abs(4 * t - 1), 0, 1));
    lut.push([r, g, b]);
  }
  return lut;
}

const JET_LUT = buildJetLut();

export function thermal(imageData) {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const [r, g, b] = JET_LUT[luminance];
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  }
  return { data: out, width, height };
}

// --- Canvas-native filters (need a real <canvas>, manual verification) ---

export function sketch(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  const grayCanvas = document.createElement('canvas');
  grayCanvas.width = w;
  grayCanvas.height = h;
  const grayCtx = grayCanvas.getContext('2d');
  grayCtx.filter = 'grayscale(100%)';
  grayCtx.drawImage(sourceCanvas, 0, 0);

  const blurredInvertedCanvas = document.createElement('canvas');
  blurredInvertedCanvas.width = w;
  blurredInvertedCanvas.height = h;
  const blurredCtx = blurredInvertedCanvas.getContext('2d');
  blurredCtx.filter = 'grayscale(100%) invert(100%) blur(6px)';
  blurredCtx.drawImage(sourceCanvas, 0, 0);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  outCtx.drawImage(grayCanvas, 0, 0);
  outCtx.globalCompositeOperation = 'color-dodge';
  outCtx.drawImage(blurredInvertedCanvas, 0, 0);

  return outCanvas;
}

export function glitch(sourceCanvas, rng = Math.random) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  const numSlices = 2 + Math.floor(rng() * 4);
  for (let s = 0; s < numSlices; s++) {
    const sliceH = Math.max(2, Math.floor(rng() * (h / 20)));
    const y0 = Math.floor(rng() * h);
    const shift = Math.floor((rng() - 0.5) * 40);
    ctx.drawImage(outCanvas, 0, y0, w, sliceH, shift, y0, w, sliceH);
  }

  ctx.globalCompositeOperation = 'lighten';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(outCanvas, 3, 0);
  ctx.drawImage(outCanvas, -3, 0);
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';

  return outCanvas;
}

// --- Canvas-in/canvas-out adapters for the pure filters, and the registry main.js cycles through ---

function applyImageDataFilter(sourceCanvas, pureFn) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext('2d');
  const imageData = srcCtx.getImageData(0, 0, w, h);
  const result = pureFn({ data: imageData.data, width: w, height: h });

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  outCtx.putImageData(new ImageData(result.data, w, h), 0, 0);
  return outCanvas;
}

export function dualToneOnCanvas(sourceCanvas) {
  return applyImageDataFilter(sourceCanvas, dualTone);
}

export function thermalOnCanvas(sourceCanvas) {
  return applyImageDataFilter(sourceCanvas, thermal);
}

export const FILTERS = [dualToneOnCanvas, thermalOnCanvas, sketch, glitch];
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/filters.test.js`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
cd ..
git add web/src/filters.js web/tests/filters.test.js
git commit -m "feat(web): add dual-tone, thermal, sketch, glitch filters"
```

---

## Task 4: Hand tracker wrapper

**Files:**
- Create: `web/src/handTracker.js`
- Test: `web/tests/handTracker.test.js`

`extractHands` (pure landmark-shaping logic) is unit tested. `createHandTracker`
(loads the WASM runtime + model from a CDN, needs a browser) is verified manually
in Task 5.

**Step 1: Write the failing test**

```js
// web/tests/handTracker.test.js
import { describe, it, expect } from 'vitest';
import { extractHands } from '../src/handTracker.js';

describe('extractHands', () => {
  it('returns empty array when no landmarks', () => {
    expect(extractHands({ landmarks: [] })).toEqual([]);
    expect(extractHands({ landmarks: null })).toEqual([]);
    expect(extractHands(null)).toEqual([]);
  });

  it('extracts x/y pairs for one hand', () => {
    const hand = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.01, y: i * 0.02, z: 0 }));
    const result = extractHands({ landmarks: [hand] });
    expect(result.length).toBe(1);
    expect(result[0][0]).toEqual([0, 0]);
    expect(result[0][20]).toEqual([0.2, 0.4]);
  });

  it('extracts two hands', () => {
    const handA = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    const handB = Array.from({ length: 21 }, () => ({ x: 1, y: 1 }));
    const result = extractHands({ landmarks: [handA, handB] });
    expect(result).toEqual([
      Array.from({ length: 21 }, () => [0, 0]),
      Array.from({ length: 21 }, () => [1, 1]),
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/handTracker.test.js`
Expected: FAIL — cannot find module `../src/handTracker.js`

**Step 3: Write the implementation**

```js
// web/src/handTracker.js
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export function extractHands(result) {
  if (!result || !result.landmarks) return [];
  return result.landmarks.map((hand) => hand.map((lm) => [lm.x, lm.y]));
}

export async function createHandTracker() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  });

  return {
    detect(videoElement, timestampMs) {
      const result = handLandmarker.detectForVideo(videoElement, timestampMs);
      return extractHands(result);
    },
    close() {
      handLandmarker.close();
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/handTracker.test.js`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
cd ..
git add web/src/handTracker.js web/tests/handTracker.test.js
git commit -m "feat(web): add MediaPipe Tasks Vision hand tracker wrapper"
```

---

## Task 5: Main application loop

**Files:**
- Modify: `web/index.html` (already created in Task 0 — no changes needed, listed for reference)
- Create: `web/src/main.js`

**Step 1: Write `main.js`**

```js
// web/src/main.js
import { createHandTracker } from './handTracker.js';
import { GestureRecognizer } from './gestures.js';
import { PortalState, compositePortal } from './portal.js';
import { FILTERS } from './filters.js';

const statusEl = document.getElementById('status');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const screenshotBtn = document.getElementById('screenshotBtn');

let filterIndex = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function drawMirroredFrame(baseCanvas) {
  const bctx = baseCanvas.getContext('2d');
  bctx.save();
  bctx.scale(-1, 1);
  bctx.drawImage(video, -baseCanvas.width, 0, baseCanvas.width, baseCanvas.height);
  bctx.restore();
}

async function main() {
  try {
    await setupCamera();
  } catch (err) {
    setStatus('Camera access denied or unavailable. Please allow camera access and reload.');
    return;
  }

  let tracker;
  try {
    tracker = await createHandTracker();
  } catch (err) {
    setStatus('Failed to load hand-tracking model. Check your connection and reload.');
    return;
  }

  const recognizer = new GestureRecognizer();
  const portal = new PortalState();

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = canvas.width;
  baseCanvas.height = canvas.height;

  function loop() {
    drawMirroredFrame(baseCanvas);

    const timestampMs = performance.now();
    const rawHands = tracker.detect(video, timestampMs);
    const hands = rawHands.map((hand) => hand.map(([x, y]) => [1 - x, y]));

    const events = recognizer.update(hands, timestampMs / 1000);
    portal.update(events.portalActive, events.portalCenter, events.spreadDistance);
    if (events.cycleFilter) {
      filterIndex = (filterIndex + 1) % FILTERS.length;
    }

    if (portal.isVisible) {
      const filteredCanvas = FILTERS[filterIndex](baseCanvas);
      compositePortal(ctx, baseCanvas, filteredCanvas, portal.center, portal.radiusFrac);
    } else {
      ctx.drawImage(baseCanvas, 0, 0);
    }

    requestAnimationFrame(loop);
  }

  nextBtn.addEventListener('click', () => {
    filterIndex = (filterIndex + 1) % FILTERS.length;
  });
  prevBtn.addEventListener('click', () => {
    filterIndex = (filterIndex - 1 + FILTERS.length) % FILTERS.length;
  });
  screenshotBtn.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `screenshot-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  requestAnimationFrame(loop);
}

main();
```

**Step 2: Manual verification (no automated test — requires a real browser, camera, and network for the model download)**

Run:
```bash
cd web
npm run dev
```
Open the printed local URL in a browser.

Checklist:
- Browser prompts for camera permission; after allowing, the mirrored webcam feed appears on the canvas.
- Spreading both hands apart opens a circular portal with the dual-tone filter inside, growing with hand distance.
- Bringing hands together closes the portal smoothly (not an instant cut).
- Pinching thumb + pinky on either hand cycles to the next filter, one step per pinch (not rapid-firing).
- "Prev filter" / "Next filter" buttons cycle manually.
- "Screenshot" button downloads a PNG of the current canvas.
- Denying camera permission (test in a fresh incognito window) shows the "Camera access denied" status message instead of a blank/broken page.

**Step 3: Commit**

```bash
cd ..
git add web/src/main.js
git commit -m "feat(web): wire camera, hand tracking, gestures, portal, and filters into main loop"
```

---

## Task 6: Web app README

**Files:**
- Create: `web/README.md`

**Step 1: Write `web/README.md`**

```markdown
# Hand-Gesture Portal Filter — Web

Browser version of the [Python hand-gesture portal filter](../README.md). Runs
entirely client-side — the camera feed never leaves your browser.

Live: https://duckmahn.github.io/hand-gesture-portal-filter/

## Develop

    cd web
    npm install
    npm run dev

## Build

    npm run build

## Test

    npm test

## Controls

Spread both hands apart to open the portal. Pinch thumb + pinky (either hand) to
cycle filters. Buttons below the video: Prev filter / Next filter / Screenshot.
```

**Step 2: Commit**

```bash
git add web/README.md
git commit -m "docs(web): add README with setup and controls"
```

---

## Task 7: GitHub Pages deployment

**Files:**
- Create: `.github/workflows/deploy-web.yml`

**Step 1: Write the workflow**

```yaml
# .github/workflows/deploy-web.yml
name: Deploy web app to GitHub Pages

on:
  push:
    branches: [main, dev]
    paths:
      - 'web/**'
      - '.github/workflows/deploy-web.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
        working-directory: web
      - run: npm test
        working-directory: web
      - run: npm run build
        working-directory: web
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Commit**

```bash
git add .github/workflows/deploy-web.yml
git commit -m "ci: add GitHub Pages deploy workflow for web app"
```

**Step 3: Enable GitHub Actions as the Pages source**

Try via the API first:
```bash
gh api -X POST repos/duckmahn/hand-gesture-portal-filter/pages -f "build_type=workflow"
```
If that fails with a permissions error, tell the user to do it manually: repo
**Settings → Pages → Build and deployment → Source → GitHub Actions**.

**Step 4: Push and verify the deploy**

```bash
git push origin dev
gh run watch
```
Expected: workflow run succeeds (build + deploy jobs both green).

Then visit `https://duckmahn.github.io/hand-gesture-portal-filter/` and confirm the
page loads and the camera flow works (same checklist as Task 5 Step 2, run once on
the deployed site over HTTPS — required for `getUserMedia`).

---

## Task 8: Full test suite sanity check

**Step 1: Run the whole web test suite**

Run: `cd web && npx vitest run`
Expected: All tests from Tasks 1–4 pass (16 tests total), 0 failures.

**Step 2: Repeat the manual smoke test**

Repeat the Task 5 Step 2 checklist once more against the deployed GitHub Pages URL,
to confirm nothing regressed between local dev and the production build.
