# Study Calendar — Soft Timer

## What it does
A Chrome extension that tracks how productively you spend your study sessions.

- **Whitelisted pages** (e.g. Google Docs, your LMS) = study time ✅
- **Everything else** (e.g. YouTube, Reddit) = distraction time ⚠️
- At the end of your session, click **"Done Studying"** to get a full productivity report

---

## How the soft timer works
- You land on a **non-whitelisted** page → 5 second countdown starts
- If you stay for 5s → distraction timer begins
- You go back to a **whitelisted** page → distraction saved, study timer resumes immediately
- You go **idle for 60s** → current segment ends automatically
- You **close/switch windows** → current segment ends automatically

---

## Files
| File | Purpose |
|------|---------|
| `manifest.json` | Extension config, permissions |
| `background.js` | Core logic — tracks tabs, stores segments, generates reports |
| `popup.html` | Toolbar popup UI |
| `popup.js` | Live study/distraction timers + "Done Studying" button |
| `options.html` | Settings page UI |
| `options.js` | Whitelist management + session history table |

---

## Install (Chrome / Edge)
1. Put all files in one folder
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select your folder
5. Pin the extension to your toolbar

---

## Setup
1. Click the extension icon → options page opens
2. Add your study sites to the whitelist (e.g. `docs.google.com`, `notion.so`)
3. Start studying — the extension tracks everything automatically

---

## End of session report
Click **"Done Studying — Get Report"** in the popup to see:
- Total session duration
- Study time vs distraction time
- Productivity percentage
- Top distracting sites
- Personalized tips to improve focus

---

## Webcam integration (coming soon)
A Python camera module (`camera_ui.py`) is being developed by a contributor.
It will detect when you leave your desk and automatically trigger `endSegment()`
in the extension — so even physical distractions get tracked.

---

## Dependencies
- Chrome or any Chromium-based browser (Edge, Brave, Arc)
- No npm, no build step — plain HTML/CSS/JS

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
