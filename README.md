# Study Calendar — Soft Timer

## Overview
- A small web app that tracks study/work sessions using a soft timer.
- Soft timer starts when: current URL is NOT whitelisted, tab is visible continuously for >= 5s.
- Session ends when: tab hidden, URL becomes whitelisted, manual end, or user idle > 60s.

## Python Camera UI

A simple Python camera object + UI is included in `camera_ui.py`.

### Run

```bash
python3 camera_ui.py
```

### Install dependencies

```bash
pip install opencv-python pillow
```

Use the **Start Camera** button to view the live feed and **Stop Camera** to release the camera.
