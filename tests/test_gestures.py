from gestures import GestureRecognizer


def make_hand(overrides):
    hand = [(0.0, 0.0)] * 21
    for i, pt in overrides.items():
        hand[i] = pt
    return hand


def two_far_apart_hands():
    left = make_hand({0: (0.1, 0.5), 5: (0.1, 0.5), 17: (0.1, 0.5)})
    right = make_hand({0: (0.9, 0.5), 5: (0.9, 0.5), 17: (0.9, 0.5)})
    return [left, right]


def two_close_hands():
    left = make_hand({0: (0.49, 0.5), 5: (0.49, 0.5), 17: (0.49, 0.5)})
    right = make_hand({0: (0.51, 0.5), 5: (0.51, 0.5), 17: (0.51, 0.5)})
    return [left, right]


def approx_eq_tuple(a, b, tol=1e-9):
    return all(abs(x - y) < tol for x, y in zip(a, b))


def test_no_hands_portal_inactive():
    rec = GestureRecognizer()
    events = rec.update([], timestamp=0.0)
    assert events.portal_active is False
    assert events.portal_center is None


def test_one_hand_portal_inactive():
    rec = GestureRecognizer()
    hand = make_hand({0: (0.5, 0.5), 5: (0.5, 0.5), 17: (0.5, 0.5)})
    events = rec.update([hand], timestamp=0.0)
    assert events.portal_active is False


def test_two_hands_close_together_portal_inactive():
    rec = GestureRecognizer(spread_open_threshold=0.25)
    events = rec.update(two_close_hands(), timestamp=0.0)
    assert events.portal_active is False


def test_two_hands_spread_apart_opens_portal():
    rec = GestureRecognizer(spread_open_threshold=0.25)
    events = rec.update(two_far_apart_hands(), timestamp=0.0)
    assert events.portal_active is True
    assert approx_eq_tuple(events.portal_center, (0.5, 0.5))


def test_pinch_transition_triggers_cycle_once():
    rec = GestureRecognizer(pinch_threshold=0.06, pinch_cooldown=0.5)
    open_hand = make_hand({4: (0.0, 0.0), 20: (1.0, 1.0)})
    pinched_hand = make_hand({4: (0.5, 0.5), 20: (0.5, 0.5001)})

    events0 = rec.update([open_hand], timestamp=0.0)
    assert events0.cycle_filter is False

    events1 = rec.update([pinched_hand], timestamp=0.1)
    assert events1.cycle_filter is True

    events2 = rec.update([pinched_hand], timestamp=0.2)
    assert events2.cycle_filter is False


def test_pinch_respects_cooldown_then_fires_again():
    rec = GestureRecognizer(pinch_threshold=0.06, pinch_cooldown=0.5)
    open_hand = make_hand({4: (0.0, 0.0), 20: (1.0, 1.0)})
    pinched_hand = make_hand({4: (0.5, 0.5), 20: (0.5, 0.5001)})

    rec.update([open_hand], timestamp=0.0)
    events1 = rec.update([pinched_hand], timestamp=0.1)
    assert events1.cycle_filter is True

    rec.update([open_hand], timestamp=0.2)
    events2 = rec.update([pinched_hand], timestamp=0.3)
    assert events2.cycle_filter is False

    rec.update([open_hand], timestamp=0.5)
    events3 = rec.update([pinched_hand], timestamp=0.65)
    assert events3.cycle_filter is True
