import cv2
import numpy as np


def dual_tone(frame, color_dark=(40, 10, 90), color_light=(0, 200, 255)):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mask = gray > gray.mean()
    out = np.empty_like(frame)
    out[mask] = color_light
    out[~mask] = color_dark
    return out


def thermal(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.applyColorMap(gray, cv2.COLORMAP_JET)


def sketch(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    inverted = cv2.bitwise_not(gray)
    blurred = cv2.GaussianBlur(inverted, (21, 21), 0)
    inverted_blur = cv2.bitwise_not(blurred)
    sketch_gray = cv2.divide(gray, inverted_blur, scale=256.0)
    return cv2.cvtColor(sketch_gray, cv2.COLOR_GRAY2BGR)


def glitch(frame, rng=None):
    rng = rng if rng is not None else np.random.default_rng()
    out = frame.copy()
    h, _w = frame.shape[:2]
    num_slices = int(rng.integers(2, 6))
    for _ in range(num_slices):
        y0 = int(rng.integers(0, h))
        slice_h = int(rng.integers(2, max(3, h // 20)))
        y1 = min(h, y0 + slice_h)
        shift = int(rng.integers(-20, 20))
        out[y0:y1] = np.roll(out[y0:y1], shift, axis=1)
    b, g, r = cv2.split(out)
    b = np.roll(b, 3, axis=1)
    r = np.roll(r, -3, axis=1)
    return cv2.merge((b, g, r))


FILTERS = [dual_tone, thermal, sketch, glitch]
