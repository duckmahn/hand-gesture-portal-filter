import argparse
import time

import cv2

from filters import FILTERS
from gestures import GestureRecognizer
from hand_tracker import HandTracker
from portal import PortalState, composite_portal


def parse_args():
    parser = argparse.ArgumentParser(description="Hand-gesture portal filter")
    parser.add_argument("--camera", type=int, default=0, help="Camera index")
    return parser.parse_args()


def main():
    args = parse_args()

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit(f"Could not open camera index {args.camera}")

    tracker = HandTracker()
    recognizer = GestureRecognizer()
    portal = PortalState()
    filter_index = 0
    screenshot_count = 0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Warning: failed to read frame from camera, stopping.")
                break

            frame = cv2.flip(frame, 1)
            hands = tracker.process(frame)
            events = recognizer.update(hands, timestamp=time.time())

            portal.update(
                active=events.portal_active,
                target_center=events.portal_center,
                target_spread_distance=events.spread_distance,
            )
            if events.cycle_filter:
                filter_index = (filter_index + 1) % len(FILTERS)

            display = frame
            if portal.is_visible:
                filtered = FILTERS[filter_index](frame)
                display = composite_portal(frame, filtered, portal.center, portal.radius_frac)

            cv2.imshow("Hand Portal Filter", display)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("n"):
                filter_index = (filter_index + 1) % len(FILTERS)
            elif key == ord("p"):
                filter_index = (filter_index - 1) % len(FILTERS)
            elif key == ord("s"):
                screenshot_count += 1
                filename = f"screenshot_{screenshot_count}.png"
                cv2.imwrite(filename, display)
                print(f"Saved {filename}")
    finally:
        tracker.close()
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
