import math
from dataclasses import dataclass
from typing import List, Optional, Tuple

Hand = List[Tuple[float, float]]

PALM_LANDMARKS = (0, 5, 17)
THUMB_TIP = 4
PINKY_TIP = 20


def palm_center(hand: Hand) -> Tuple[float, float]:
    xs = [hand[i][0] for i in PALM_LANDMARKS]
    ys = [hand[i][1] for i in PALM_LANDMARKS]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


@dataclass
class GestureEvents:
    portal_active: bool
    portal_center: Optional[Tuple[float, float]]
    spread_distance: Optional[float]
    cycle_filter: bool


class GestureRecognizer:
    def __init__(self, spread_open_threshold=0.25, pinch_threshold=0.06, pinch_cooldown=0.5):
        self.spread_open_threshold = spread_open_threshold
        self.pinch_threshold = pinch_threshold
        self.pinch_cooldown = pinch_cooldown
        self._was_pinching = {}
        self._last_cycle_time = -math.inf

    def update(self, hands: List[Hand], timestamp: float) -> GestureEvents:
        portal_active = False
        portal_center = None
        spread_dist = None

        if len(hands) == 2:
            c0 = palm_center(hands[0])
            c1 = palm_center(hands[1])
            spread_dist = distance(c0, c1)
            if spread_dist >= self.spread_open_threshold:
                portal_active = True
                portal_center = ((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2)

        cycle_filter = False
        seen_indices = set()
        for idx, hand in enumerate(hands):
            seen_indices.add(idx)
            pinching = distance(hand[THUMB_TIP], hand[PINKY_TIP]) < self.pinch_threshold
            was_pinching = self._was_pinching.get(idx, False)
            if pinching and not was_pinching and (timestamp - self._last_cycle_time) >= self.pinch_cooldown:
                cycle_filter = True
                self._last_cycle_time = timestamp
            self._was_pinching[idx] = pinching

        for idx in list(self._was_pinching.keys()):
            if idx not in seen_indices:
                del self._was_pinching[idx]

        return GestureEvents(portal_active, portal_center, spread_dist, cycle_filter)
