export class PortalState {
  constructor({ closeStep = 0.1 } = {}) {
    this.closeStep = closeStep;
    this.corners = null;
    this.opacity = 0;
  }

  update(active, targetCorners) {
    if (active && targetCorners?.length === 4) {
      // Follow the fingertips directly so the edge stays attached to the fingers.
      this.corners = targetCorners.map((point) => [...point]);
      this.opacity = 1;
    } else {
      this.opacity = Math.max(0, this.opacity - this.closeStep);
      if (this.opacity === 0) this.corners = null;
    }
  }

  get isVisible() {
    return this.corners !== null && this.opacity > 0;
  }
}

export function compositePortal(ctx, baseCanvas, filteredCanvas, corners, opacity = 1) {
  const w = baseCanvas.width;
  const h = baseCanvas.height;
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  corners.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x * w, y * h);
    else ctx.lineTo(x * w, y * h);
  });
  ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.drawImage(filteredCanvas, 0, 0);
  ctx.restore();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
