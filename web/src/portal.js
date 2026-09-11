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
