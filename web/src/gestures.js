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
