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
