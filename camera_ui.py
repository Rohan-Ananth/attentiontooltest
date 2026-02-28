"""Simple camera object with a Tkinter UI preview.

Run:
    python3 camera_ui.py

Dependencies:
    pip install opencv-python pillow
"""

from __future__ import annotations

import tkinter as tk
from tkinter import messagebox

import cv2
import PIL
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

        controls = tk.Frame(self.root)
        controls.pack(fill="x", padx=12, pady=(0, 12))

        self.start_button = tk.Button(controls, text="Start Camera", command=self.start_camera)
        self.start_button.pack(side="left")

        self.stop_button = tk.Button(controls, text="Stop Camera", command=self.stop_camera, state="disabled")
        self.stop_button.pack(side="left", padx=(8, 0))

        self.running = False
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self.nose_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_mcs_nose.xml"
        )
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _is_user_attentive(self, frame: cv2.typing.MatLike, face: tuple[int, int, int, int]) -> bool:
        """Check if nose placement suggests the user is facing the screen and not looking down."""
        x, y, w, h = face
        face_roi = frame[y : y + h, x : x + w]
        gray_face = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)

        noses = self.nose_cascade.detectMultiScale(gray_face, scaleFactor=1.12, minNeighbors=5)
        if len(noses) == 0:
            return False

        nx, ny, nw, nh = max(noses, key=lambda n: n[2] * n[3])
        nose_center_x = nx + nw / 2
        nose_center_y = ny + nh / 2

        # A centered nose indicates the user is facing the screen.
        facing_screen = w * 0.3 <= nose_center_x <= w * 0.7
        # A lower nose position often indicates the user is looking down.
        looking_down = nose_center_y > h * 0.68

        return facing_screen and not looking_down

    def start_camera(self) -> None:
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
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))

            if len(faces) > 0:
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
                attentive = self._is_user_attentive(frame, (x, y, w, h))
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
