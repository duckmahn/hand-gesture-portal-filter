import cv2
import numpy as np


class PortalState:
    def __init__(self, smoothing=0.3, min_radius_frac=0.05, max_radius_frac=0.4, close_step=0.05):
        self.smoothing = smoothing
        self.min_radius_frac = min_radius_frac
        self.max_radius_frac = max_radius_frac
        self.close_step = close_step
        self.center = None
        self.radius_frac = 0.0

    def update(self, active, target_center, target_spread_distance):
        if active and target_center is not None:
            target_radius = min(self.max_radius_frac, max(self.min_radius_frac, target_spread_distance))
            if self.center is None:
                self.center = target_center
                self.radius_frac = target_radius
            else:
                self.center = self._lerp(self.center, target_center)
                self.radius_frac += (target_radius - self.radius_frac) * self.smoothing
        else:
            self.radius_frac = max(0.0, self.radius_frac - self.close_step)
            if self.radius_frac == 0.0:
                self.center = None

    def _lerp(self, current, target):
        return (
            current[0] + (target[0] - current[0]) * self.smoothing,
            current[1] + (target[1] - current[1]) * self.smoothing,
        )

    @property
    def is_visible(self):
        return self.center is not None and self.radius_frac > 0.0


def composite_portal(frame, filtered_frame, center_norm, radius_frac, edge_blur=15):
    h, w = frame.shape[:2]
    cx, cy = int(center_norm[0] * w), int(center_norm[1] * h)
    radius_px = int(radius_frac * w)

    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), radius_px, 255, -1)
    if edge_blur > 0:
        k = edge_blur | 1
        mask = cv2.GaussianBlur(mask, (k, k), 0)

    mask_f = (mask.astype(np.float32) / 255.0)[..., None]
    blended = filtered_frame.astype(np.float32) * mask_f + frame.astype(np.float32) * (1 - mask_f)
    out = blended.astype(np.uint8)
    cv2.circle(out, (cx, cy), radius_px, (255, 255, 255), 2)
    return out
