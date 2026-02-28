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
        self.last_frame_shape: tuple[int, int] | None = None
        self.tracked_face: tuple[int, int, int, int] | None = None
        self.horizontal_bar_y = 240
        self.dragging_bar = False

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        if self.face_cascade.empty():
            self.face_cascade = None
            messagebox.showwarning(
                "Face detection unavailable",
                "Could not load OpenCV Haar cascade. Camera preview will still work.",
            )

        profile_path = cv2.data.haarcascades + "haarcascade_profileface.xml"
        self.profile_cascade = cv2.CascadeClassifier(profile_path)
        if self.profile_cascade.empty():
            self.profile_cascade = None

        nose_path = cv2.data.haarcascades + "haarcascade_mcs_nose.xml"
        self.nose_cascade = cv2.CascadeClassifier(nose_path)
        if self.nose_cascade.empty():
            self.nose_cascade = None

        self.video_label.bind("<Button-1>", self._on_drag_start)
        self.video_label.bind("<B1-Motion>", self._on_drag_motion)
        self.video_label.bind("<ButtonRelease-1>", self._on_drag_end)

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
        self.last_frame_shape = frame.shape[:2]
        frame = self._draw_face_boxes(frame)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        self.current_image = ImageTk.PhotoImage(image=image)
        self.video_label.configure(image=self.current_image)

        self.root.after(15, self._update_frame)

    def _draw_face_boxes(self, frame):
        frame_h, frame_w = frame.shape[:2]
        self.horizontal_bar_y = max(0, min(self.horizontal_bar_y, frame_h - 1))

        cv2.line(frame, (0, self.horizontal_bar_y), (frame_w, self.horizontal_bar_y), (255, 180, 0), 2)


        if self.detect_faces and self.face_cascade is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
            profile_faces = []
            if self.profile_cascade is not None:
                profile_faces = self.profile_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4)

            nose_x: int | None = None
            nose_y: int | None = None
            turned_away = len(faces) == 0

            if len(faces) > 0:
                largest_face = max(faces, key=lambda box: box[2] * box[3])
                x, y, w, h = map(int, largest_face)
                self.tracked_face = (x, y, w, h)

                nose_roi = gray[y + h // 4 : y + h, x : x + w]
                if self.nose_cascade is not None and nose_roi.size > 0:
                    noses = self.nose_cascade.detectMultiScale(nose_roi, scaleFactor=1.1, minNeighbors=4)
                    if len(noses) > 0:
                        nx, ny, nw, nh = max(noses, key=lambda box: box[2] * box[3])
                        nose_x = x + int(nx + nw / 2)
                        nose_y = y + h // 4 + int(ny + nh / 2)
                        cv2.circle(frame, (nose_x, nose_y), 6, (255, 255, 255), -1)

                if nose_x is None:
                    nose_x = x + w // 2
                if nose_y is None:
                    nose_y = y + h // 2

                nose_breaks_bar = nose_y <= self.horizontal_bar_y
                tracking_bad = turned_away or nose_breaks_bar
                box_color = (30, 255, 30) if not tracking_bad else (20, 20, 255)

                cv2.rectangle(frame, (x, y), (x + w, y + h), box_color, 2)
                cv2.circle(frame, (nose_x, nose_y), 4, box_color, -1)

                if tracking_bad:
                    self.status_var.set("Tracking alert: face turned away or nose crossed horizontal bar")
                else:
                    self.status_var.set("Tracking good")

            elif self.tracked_face is not None:
                x, y, w, h = self.tracked_face
                cv2.rectangle(frame, (x, y), (x + w, y + h), (20, 20, 255), 2)
                if len(profile_faces) > 0:
                    self.status_var.set("Tracking alert: user turned away from camera")
                else:
                    self.status_var.set("Tracking alert: face not found")

        return frame

    def _on_drag_start(self, event: tk.Event) -> None:
        if self.last_frame_shape is None:
            return
        y = self._event_y_to_frame_y(event)
        if abs(y - self.horizontal_bar_y) <= 20:
            self.dragging_bar = True

    def _on_drag_motion(self, event: tk.Event) -> None:
        if not self.dragging_bar or self.last_frame_shape is None:
            return
        frame_h = self.last_frame_shape[0]
        self.horizontal_bar_y = max(0, min(self._event_y_to_frame_y(event), frame_h - 1))

    def _on_drag_end(self, _event: tk.Event) -> None:
        self.dragging_bar = False

    def _event_y_to_frame_y(self, event: tk.Event) -> int:
        if self.last_frame_shape is None:
            return 0
        frame_h = self.last_frame_shape[0]
        widget_h = max(self.video_label.winfo_height(), 1)
        return int((event.y / widget_h) * frame_h)

    def on_close(self) -> None:
        self.stop_camera()
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = CameraUI(root)
    root.mainloop()
