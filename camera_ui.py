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
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

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
