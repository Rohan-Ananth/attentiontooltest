"""Simple Tkinter camera UI with optional face detection overlay.

This module provides a small desktop app that previews webcam input,
can optionally detect faces via OpenCV Haar cascades, and handles common
runtime errors with user-friendly message boxes.
"""

from __future__ import annotations

import tkinter as tk
from tkinter import messagebox

import cv2
from PIL import Image, ImageTk


class CameraUI:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Camera UI")
        self.root.geometry("900x620")

        self.video_label = tk.Label(self.root, bg="black")
        self.video_label.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        controls = tk.Frame(self.root)
        controls.pack(fill=tk.X, padx=10, pady=(0, 10))

        self.status_var = tk.StringVar(value="Camera stopped")
        tk.Label(controls, textvariable=self.status_var, anchor="w").pack(side=tk.LEFT)

        tk.Button(controls, text="Start", command=self.start_camera).pack(side=tk.RIGHT, padx=4)
        tk.Button(controls, text="Stop", command=self.stop_camera).pack(side=tk.RIGHT, padx=4)

        self.capture: cv2.VideoCapture | None = None
        self.running = False
        self.detect_faces = True
        self.current_image = None

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        if self.face_cascade.empty():
            self.face_cascade = None
            messagebox.showwarning(
                "Face detection unavailable",
                "Could not load OpenCV Haar cascade. Camera preview will still work.",
            )

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def start_camera(self) -> None:
        if self.running:
            return

        self.capture = cv2.VideoCapture(0)
        if not self.capture.isOpened():
            self.capture.release()
            self.capture = None
            messagebox.showerror(
                "Camera Error",
                "Could not open camera device 0. Make sure no other app is using the webcam.",
            )
            return

        self.running = True
        self.status_var.set("Camera running")
        self._update_frame()

    def stop_camera(self) -> None:
        self.running = False
        if self.capture is not None:
            self.capture.release()
            self.capture = None
        self.status_var.set("Camera stopped")

    def _update_frame(self) -> None:
        if not self.running or self.capture is None:
            return

        ok, frame = self.capture.read()
        if not ok:
            self.stop_camera()
            messagebox.showerror(
                "Frame Error",
                "Failed to read a frame from the camera.",
            )
            return

        frame = cv2.flip(frame, 1)
        frame = self._draw_face_boxes(frame)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        self.current_image = ImageTk.PhotoImage(image=image)
        self.video_label.configure(image=self.current_image)

        self.root.after(15, self._update_frame)

    def _draw_face_boxes(self, frame):
        if self.detect_faces and self.face_cascade is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
            for (x, y, w, h) in faces:
                cv2.rectangle(frame, (x, y), (x + w, y + h), (30, 255, 30), 2)
        return frame

    def on_close(self) -> None:
        self.stop_camera()
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = CameraUI(root)
    root.mainloop()