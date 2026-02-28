"""Web camera tracking app with nose/face alerts and draggable horizontal band."""

from __future__ import annotations

import base64
from dataclasses import dataclass

import cv2
import numpy as np
from flask import Flask, jsonify, request


app = Flask(__name__)


@dataclass
class TrackingState:
    tracked_face: tuple[int, int, int, int] | None = None


STATE = TrackingState()

FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
PROFILE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
NOSE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_mcs_nose.xml")

if FACE_CASCADE.empty():
    raise RuntimeError("Could not load frontal face cascade")
if PROFILE_CASCADE.empty():
    PROFILE_CASCADE = None
if NOSE_CASCADE.empty():
    NOSE_CASCADE = None


INDEX_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Camera Tracking Web App</title>
  <style>
    body { font-family: Arial, sans-serif; background: #111; color: #eee; margin: 0; }
    .wrap { max-width: 980px; margin: 20px auto; padding: 0 12px; }
    .toolbar { margin-bottom: 10px; display: flex; gap: 8px; align-items: center; }
    button { padding: 8px 12px; cursor: pointer; }
    #status { font-weight: 600; }
    .stage { position: relative; width: fit-content; border: 1px solid #333; background: #000; }
    video, canvas { display: block; max-width: 100%; }
    canvas { position: absolute; inset: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="toolbar">
      <button id="startBtn">Start Camera</button>
      <button id="stopBtn">Stop Camera</button>
      <span id="status">Camera stopped</span>
    </div>
    <div class="stage">
      <video id="video" autoplay playsinline muted></video>
      <canvas id="overlay"></canvas>
    </div>
  </div>

<script>
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

let stream = null;
let analyzeTimer = null;
let draggingBand = false;
let horizontalBandCenterY = 240;
const horizontalBandHeight = 50;
let latestTracking = null;

function drawOverlay() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const bandHalf = Math.floor(horizontalBandHeight / 2);
  const bandTop = Math.max(0, horizontalBandCenterY - bandHalf);
  const bandBottom = Math.min(h - 1, horizontalBandCenterY + bandHalf);

  ctx.strokeStyle = 'rgb(255,180,0)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, bandTop, w - 2, Math.max(1, bandBottom - bandTop));

  if (latestTracking && latestTracking.face) {
    const color = latestTracking.tracking_bad ? 'rgb(220,30,30)' : 'rgb(30,220,30)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const [x, y, fw, fh] = latestTracking.face;
    ctx.strokeRect(x, y, fw, fh);

    if (latestTracking.nose) {
      const [nx, ny] = latestTracking.nose;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(nx, ny, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(drawOverlay);
}

function eventToVideoY(event) {
  const rect = canvas.getBoundingClientRect();
  const y = event.clientY - rect.top;
  return Math.max(0, Math.min(canvas.height - 1, Math.round((y / rect.height) * canvas.height)));
}

canvas.addEventListener('mousedown', (event) => {
  const y = eventToVideoY(event);
  if (Math.abs(y - horizontalBandCenterY) <= Math.floor(horizontalBandHeight / 2)) {
    draggingBand = true;
  }
});

window.addEventListener('mousemove', (event) => {
  if (!draggingBand) return;
  horizontalBandCenterY = eventToVideoY(event);
});

window.addEventListener('mouseup', () => { draggingBand = false; });

async function analyzeFrame() {
  if (!stream) return;

  const sendCanvas = document.createElement('canvas');
  sendCanvas.width = video.videoWidth;
  sendCanvas.height = video.videoHeight;
  const sendCtx = sendCanvas.getContext('2d');
  sendCtx.drawImage(video, 0, 0, sendCanvas.width, sendCanvas.height);
  const dataUrl = sendCanvas.toDataURL('image/jpeg', 0.8);

  try {
    const resp = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_data: dataUrl,
        horizontal_band_center_y: horizontalBandCenterY,
        horizontal_band_height: horizontalBandHeight,
      }),
    });

    const data = await resp.json();
    latestTracking = data;
    statusEl.textContent = data.status;
  } catch (_err) {
    statusEl.textContent = 'Tracking alert: analysis request failed';
  }
}

startBtn.addEventListener('click', async () => {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = stream;

  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (horizontalBandCenterY >= canvas.height) {
    horizontalBandCenterY = Math.floor(canvas.height / 2);
  }

  statusEl.textContent = 'Camera running';
  analyzeTimer = setInterval(analyzeFrame, 120);
});

stopBtn.addEventListener('click', () => {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (analyzeTimer) {
    clearInterval(analyzeTimer);
    analyzeTimer = null;
  }
  latestTracking = null;
  statusEl.textContent = 'Camera stopped';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

requestAnimationFrame(drawOverlay);
</script>
</body>
</html>
"""


@app.get("/")
def index() -> str:
    return INDEX_HTML


@app.post("/analyze")
def analyze():
    payload = request.get_json(silent=True) or {}
    image_data = payload.get("image_data", "")
    band_center_y = int(payload.get("horizontal_band_center_y", 240))
    band_height = max(1, int(payload.get("horizontal_band_height", 50)))

    if not image_data.startswith("data:image"):
        return jsonify({"status": "Tracking alert: invalid frame payload", "tracking_bad": True}), 400

    encoded = image_data.split(",", 1)[1]
    frame_bytes = base64.b64decode(encoded)
    image_array = cv2.imdecode(np.frombuffer(frame_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)

    if image_array is None:
        return jsonify({"status": "Tracking alert: invalid frame data", "tracking_bad": True}), 400

    frame = cv2.flip(image_array, 1)
    frame_h = frame.shape[0]

    band_center_y = max(0, min(frame_h - 1, band_center_y))
    band_half = band_height // 2
    band_top = max(0, band_center_y - band_half)
    band_bottom = min(frame_h - 1, band_center_y + band_half)

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
    profile_faces = []
    if PROFILE_CASCADE is not None:
        profile_faces = PROFILE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4)

    result = {
        "face": None,
        "nose": None,
        "tracking_bad": False,
        "status": "Tracking good",
    }

    if len(faces) > 0:
        x, y, w, h = map(int, max(faces, key=lambda box: box[2] * box[3]))
        STATE.tracked_face = (x, y, w, h)

        nose_x = x + w // 2
        nose_y = y + h // 2
        nose_found = False

        nose_roi = gray[y + h // 4 : y + h, x : x + w]
        if NOSE_CASCADE is not None and nose_roi.size > 0:
            noses = NOSE_CASCADE.detectMultiScale(nose_roi, scaleFactor=1.1, minNeighbors=4)
            if len(noses) > 0:
                nx, ny, nw, nh = max(noses, key=lambda box: box[2] * box[3])
                nose_x = x + int(nx + nw / 2)
                nose_y = y + h // 4 + int(ny + nh / 2)
                nose_found = True

        nose_outside_band = nose_y < band_top or nose_y > band_bottom
        turned_away = NOSE_CASCADE is not None and not nose_found
        tracking_bad = turned_away or nose_outside_band

        result["face"] = [x, y, w, h]
        result["nose"] = [nose_x, nose_y]
        result["tracking_bad"] = tracking_bad
        if tracking_bad:
            result["status"] = "Tracking alert: face turned away or nose outside horizontal rectangle"

    elif STATE.tracked_face is not None:
        x, y, w, h = STATE.tracked_face
        result["face"] = [x, y, w, h]
        result["tracking_bad"] = True
        if len(profile_faces) > 0:
            result["status"] = "Tracking alert: user turned away from camera"
        else:
            result["status"] = "Tracking alert: face not found"

    else:
        result["tracking_bad"] = True
        result["status"] = "Tracking alert: face not found"

    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
