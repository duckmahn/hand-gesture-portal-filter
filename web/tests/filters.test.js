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
