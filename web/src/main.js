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
  return stream;
}

function drawMirroredFrame(baseCanvas) {
  const bctx = baseCanvas.getContext('2d');
  bctx.save();
  bctx.scale(-1, 1);
  bctx.drawImage(video, -baseCanvas.width, 0, baseCanvas.width, baseCanvas.height);
  bctx.restore();
}

async function main() {
  let stream;
  try {
    stream = await setupCamera();
  } catch (err) {
    setStatus('Camera access denied or unavailable. Please allow camera access and reload.');
    return;
  }

  let tracker;
  try {
    tracker = await createHandTracker();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
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
    portal.update(events.portalActive, events.portalCorners);
    if (events.cycleFilter) {
      filterIndex = (filterIndex + 1) % FILTERS.length;
    }

    if (portal.isVisible) {
      const filteredCanvas = FILTERS[filterIndex](baseCanvas);
      compositePortal(ctx, baseCanvas, filteredCanvas, portal.corners, portal.opacity);
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
