from types import SimpleNamespace
from hand_tracker import HandTracker


def make_fake_results(hands_xy):
    hand_landmarks_list = []
    for hand in hands_xy:
        landmarks = [SimpleNamespace(x=x, y=y) for (x, y) in hand]
        hand_landmarks_list.append(SimpleNamespace(landmark=landmarks))
    if hand_landmarks_list:
        return SimpleNamespace(multi_hand_landmarks=hand_landmarks_list)
    return SimpleNamespace(multi_hand_landmarks=None)


def test_extract_hands_no_hands():
    results = make_fake_results([])
    assert HandTracker._extract_hands(results) == []


def test_extract_hands_one_hand():
    one_hand = [(0.1 * i, 0.2 * i) for i in range(21)]
    results = make_fake_results([one_hand])
    extracted = HandTracker._extract_hands(results)
    assert len(extracted) == 1
    assert extracted[0] == one_hand


def test_extract_hands_two_hands():
    hand_a = [(0.0, 0.0)] * 21
    hand_b = [(1.0, 1.0)] * 21
    results = make_fake_results([hand_a, hand_b])
    extracted = HandTracker._extract_hands(results)
    assert extracted == [hand_a, hand_b]
