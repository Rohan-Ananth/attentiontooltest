# TideTrack
## Study Productivity Tracker

A Chrome extension that tracks how productively you spend your study sessions.

- **Whitelisted pages** (e.g. Google Docs, your LMS) = study time
- **Everything else** (e.g. YouTube, Reddit) = distraction time
- Click **"Done Studying"** for a full productivity report with pattern analysis

---

## How the soft timer works
- You land on a **non-whitelisted** page → grace period countdown starts
- If you stay past the grace period → distraction timer begins
- You go back to a **whitelisted** page → distraction saved, study timer resumes immediately
- You go **idle** past the threshold → current segment ends automatically
- You **close/switch windows** → current segment ends automatically

---

## Project structure

```
extension/           Chrome extension (load this folder in chrome://extensions)
  manifest.json        Extension config and permissions
  background.js        Core tracking engine — tabs, timers, segments, storage
  popup.html           Toolbar popup UI
  popup.js             Live timers, progress ring, "Done Studying" button
  options.html         Settings, whitelist, session history
  options.js           Whitelist management, streaks, heatmap
  utils.js             Shared utility functions
  auth.js              Firebase REST auth (no SDK needed)
  firebase-config.js   Firebase API key placeholder
  login.html / login.js  Auth login window
  agent/               AI Study Coach (Kai)
    tidetrack-agent.js   Agent logic and data analysis tools
    agent-ui.js          Chat UI renderer
    agent-ui.css         Chat styles
camera_ui.py         Python Flask camera app (face/presence detection)
tests/
  verify_logic.js      Automated tests for background.js logic
```

---

## Install (Chrome / Edge)
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Pin the extension to your toolbar

---

## Setup
1. Click the extension icon → settings page opens
2. Add your study sites to the whitelist (e.g. `docs.google.com`, `notion.so`)
3. Start studying — the extension tracks everything automatically

---

## Webcam integration
A Python camera module detects when you leave your desk and automatically
pauses tracking in the extension.

### Run
```bash
pip install flask opencv-python numpy
python3 camera_ui.py
```

Then open `http://localhost:5000`, click **Start Camera**, and enable
camera tracking in the extension settings. The extension polls
`localhost:5000/status` every 3 seconds.

---

## Run tests
```bash
node tests/verify_logic.js
```

---

## Dependencies
- Chrome or any Chromium-based browser (Edge, Brave, Arc)
- No npm, no build step — plain HTML/CSS/JS
- Python 3 + Flask + OpenCV (camera module only)
