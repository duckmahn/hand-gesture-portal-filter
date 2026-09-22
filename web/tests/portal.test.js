import { describe, it, expect, vi } from 'vitest';
import { PortalState, compositePortal } from '../src/portal.js';

const corners = [[0.1, 0.2], [0.8, 0.1], [0.9, 0.8], [0.2, 0.7]];

describe('PortalState', () => {
  it('starts hidden', () => {
    expect(new PortalState().isVisible).toBe(false);
  });

  it('attaches all four corners to the fingertips and follows movement', () => {
    const p = new PortalState();
    p.update(true, corners);
    expect(p.isVisible).toBe(true);
    expect(p.corners).toEqual(corners);
    const moved = corners.map(([x, y]) => [x + 0.02, y - 0.01]);
    p.update(true, moved);
    expect(p.corners).toEqual(moved);
    expect(p.corners[0]).not.toBe(moved[0]);
  });

  it('fades out when hands disappear, then reopens at the new fingertips', () => {
    const p = new PortalState({ closeStep: 0.25 });
    p.update(true, corners);
    p.update(false, null);
    expect(p.opacity).toBe(0.75);
    expect(p.corners).toEqual(corners);
    for (let i = 0; i < 3; i++) p.update(false, null);
    expect(p.isVisible).toBe(false);
    expect(p.corners).toBe(null);
    p.update(true, corners);
    expect(p.opacity).toBe(1);
  });

  it('clips the filtered frame to a closed four-sided path in pixel coordinates', () => {
    const ctx = Object.fromEntries(['drawImage', 'save', 'restore', 'beginPath',
      'moveTo', 'lineTo', 'closePath', 'clip', 'stroke'].map((name) => [name, vi.fn()]));
    const base = { width: 640, height: 480 };
    const filtered = {};
    compositePortal(ctx, base, filtered, corners);
    expect(ctx.moveTo).toHaveBeenCalledWith(64, 96);
    expect(ctx.lineTo.mock.calls).toEqual([[512, 48], [576, 384], [128, 336]]);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.drawImage.mock.calls).toEqual([[base, 0, 0], [filtered, 0, 0]]);
    expect(ctx.clip.mock.invocationCallOrder[0]).toBeLessThan(ctx.drawImage.mock.invocationCallOrder[1]);
  });
});
