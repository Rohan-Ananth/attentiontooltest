"""Simple camera object with a Tkinter UI preview.

Run:
    python3 camera_ui.py

Dependencies:
    pip install opencv-python pillow
"""

from __future__ import annotations

import os
import tkinter as tk
from tkinter import messagebox

import cv2
from PIL import Image, ImageTk


class Camera:
    """Thin wrapper around OpenCV VideoCapture."""

    def __init__(self, camera_index: int = 0) -> None:
        self.camera_index = camera_index
        self.capture: cv2.VideoCapture | None = None

    def start(self) -> bool:
        if self.capture is not None and self.capture.isOpened():
            return True

        self.capture = cv2.VideoCapture(self.camera_index)
        return bool(self.capture.isOpened())

    def read_frame(self) -> cv2.typing.MatLike | None:
        if self.capture is None or not self.capture.isOpened():
            return None

        ok, frame = self.capture.read()
        if not ok:
            return None
        return frame

    def stop(self) -> None:
        if self.capture is not None:
            self.capture.release()
            self.capture = None


class CameraUI:
    """Tkinter UI for showing the live camera feed."""

    def __init__(self, camera: Camera) -> None:
        self.camera = camera

        self.root = tk.Tk()
        self.root.title("Camera Viewer")
        self.root.geometry("860x560")

        self.preview = tk.Label(self.root, text="Click Start Camera to begin preview")
        self.preview.pack(expand=True, fill="both", padx=12, pady=12)

        self.line_position_percent = tk.IntVar(value=55)

        controls = tk.Frame(self.root)
        controls.pack(fill="x", padx=12, pady=(0, 12))

        self.start_button = tk.Button(controls, text="Start Camera", command=self.start_camera)
        self.start_button.pack(side="left")

        self.stop_button = tk.Button(controls, text="Stop Camera", command=self.stop_camera, state="disabled")
        self.stop_button.pack(side="left", padx=(8, 0))

        self.line_slider_label = tk.Label(controls, text="Attention line")
        self.line_slider_label.pack(side="left", padx=(16, 6))

        self.line_slider = tk.Scale(
            controls,
            from_=20,
            to=85,
            orient="horizontal",
            showvalue=True,
            variable=self.line_position_percent,
            length=180,
        )
        self.line_slider.pack(side="left")

        self.running = False
        self.face_cascade = self._load_cascade(["haarcascade_frontalface_default.xml"])
        self.nose_cascade = self._load_cascade(["haarcascade_mcs_nose.xml", "haarcascade_nose.xml"])
        self.detectors_ready = self.face_cascade is not None
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _load_cascade(self, names: list[str]) -> cv2.CascadeClassifier | None:
        """Load the first available Haar cascade from OpenCV's data directory."""
        for name in names:
            cascade_path = os.path.join(cv2.data.haarcascades, name)
            if not os.path.exists(cascade_path):
                continue

            cascade = cv2.CascadeClassifier(cascade_path)
            if not cascade.empty():
                return cascade

        return None

    def _get_nose_center(
        self, frame: cv2.typing.MatLike, face: tuple[int, int, int, int]
    ) -> tuple[int, int]:
        """Return nose center point; fallback to a stable face-based proxy when unavailable."""
        x, y, w, h = face

        if self.nose_cascade is not None:
            face_roi = frame[y : y + h, x : x + w]
            gray_face = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
            noses = self.nose_cascade.detectMultiScale(gray_face, scaleFactor=1.12, minNeighbors=5)
            if len(noses) > 0:
                nx, ny, nw, nh = max(noses, key=lambda n: n[2] * n[3])
                return x + nx + nw // 2, y + ny + nh // 2

        # Fallback proxy: approximate nose location near face center/lower-middle.
        return x + w // 2, y + int(h * 0.58)

    def _is_user_attentive(
        self, frame: cv2.typing.MatLike, face: tuple[int, int, int, int], line_y: int
    ) -> bool:
        """User is attentive when the tracked nose point stays above the configured line."""
        nose_center_x, nose_center_y = self._get_nose_center(frame, face)
        cv2.circle(frame, (nose_center_x, nose_center_y), 4, (255, 255, 0), -1)

        # If the nose breaks (crosses below) the line, the user is inattentive.
        return nose_center_y <= line_y

    def start_camera(self) -> None:
        detectors_ready = getattr(self, "detectors_ready", self.face_cascade is not None)
        if not detectors_ready:
            messagebox.showerror(
                "Model Error",
                "Face Haar cascade was not found. "
                "Please install OpenCV data files that include face detection.",
            )
            return

        if not self.camera.start():
            messagebox.showerror("Camera Error", "Could not open your camera.")
            return

        self.running = True
        self.start_button.config(state="disabled")
        self.stop_button.config(state="normal")
        self.update_preview()

    def stop_camera(self) -> None:
        self.running = False
        self.camera.stop()
        self.start_button.config(state="normal")
        self.stop_button.config(state="disabled")
        self.preview.config(image="", text="Camera stopped")

    def update_preview(self) -> None:
        if not self.running:
            return

        frame = self.camera.read_frame()
        if frame is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces: tuple[tuple[int, int, int, int], ...] | list[tuple[int, int, int, int]] = []
            if self.detectors_ready and self.face_cascade is not None:
                faces = self.face_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.2,
                    minNeighbors=5,
                    minSize=(80, 80),
                )

            if len(faces) > 0:
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
                line_y = int(frame.shape[0] * (self.line_position_percent.get() / 100.0))
                attentive = self._is_user_attentive(frame, (x, y, w, h), line_y)
                box_color = (0, 255, 0) if attentive else (0, 0, 255)
                label = "Facing screen" if attentive else "Look at screen"
                cv2.rectangle(frame, (x, y), (x + w, y + h), box_color, 2)
                cv2.putText(
                    frame,
                    label,
                    (x, max(24, y - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    box_color,
                    2,
                    cv2.LINE_AA,
                )

            line_y = int(frame.shape[0] * (self.line_position_percent.get() / 100.0))
            cv2.line(frame, (0, line_y), (frame.shape[1], line_y), (255, 200, 0), 2)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(rgb)
            photo = ImageTk.PhotoImage(image=image)

            self.preview.config(image=photo, text="")
            self.preview.image = photo
        else:
            self.preview.config(text="No frame received from camera")

        self.root.after(15, self.update_preview)

    def on_close(self) -> None:
        self.running = False
        self.camera.stop()
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    app = CameraUI(Camera())
    app.run()
