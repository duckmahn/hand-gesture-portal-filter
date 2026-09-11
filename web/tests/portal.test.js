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
