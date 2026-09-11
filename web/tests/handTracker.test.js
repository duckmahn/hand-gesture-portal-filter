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
