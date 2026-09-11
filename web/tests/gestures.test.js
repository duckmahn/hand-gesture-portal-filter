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
