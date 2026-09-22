# Hand-Gesture Portal Filter

A real-time webcam filter controlled by hand gestures, inspired by
[RetroLens](https://github.com/syahdanfx/Retrolens). Spread both hands apart to
open a "portal" over the video feed; the region inside gets a visual filter.

## Web app

For the browser version, local preview, and GitHub Pages deployment, see
[web/README.md](web/README.md). No Python server is needed for the web app.

## Setup

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

**Note on MediaPipe version:** pinned to `mediapipe==0.10.14`. Newer MediaPipe
releases (0.10.30+) removed the legacy `mp.solutions.hands` API this project uses
in favor of the new Tasks API, and `0.10.9` (an older ARM-Mac-safe version some
similar projects pin) has no wheel for Python 3.12+. `0.10.14` is the newest
release that still has the `solutions` API and installs cleanly on Python 3.12/3.13.

## Run

    python main.py

## Controls

| Action | Gesture | Key |
|---|---|---|
| Open portal | Spread both hands apart | — |
| Close portal | Bring hands together / hide hands | — |
| Cycle filter | Pinch thumb + pinky (either hand) | `N` / `P` |
| Screenshot | — | `S` |
| Quit | — | `Q` |

## Filters

Dual-tone, Thermal, Sketch, Glitch — cycled in that order.

## Tests

    pip install -r requirements-dev.txt
    pytest
