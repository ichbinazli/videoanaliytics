import logging
import threading
import time
from typing import Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class CameraManager:

    def __init__(
        self,
        device_id: int,
        width: int,
        height: int,
        flip_horizontal: bool,
        warmup_seconds: float,
    ):
        self.device_id = device_id
        self.target_width = width
        self.target_height = height
        self.flip_horizontal = flip_horizontal
        self.warmup_seconds = warmup_seconds
        self._cap: Optional[cv2.VideoCapture] = None
        self._frame: Optional[np.ndarray] = None
        self._frame_lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._fps = 0.0
        self._frame_count = 0
        self._fps_start_time = 0.0
        self.actual_width = 0
        self.actual_height = 0

    def start(self) -> bool:
        """Open the camera and start background frame capture."""
        self._cap = cv2.VideoCapture(self.device_id)
        if not self._cap.isOpened():
            return False
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.target_width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.target_height)
        time.sleep(self.warmup_seconds)
        self.actual_width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.actual_height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self._running = True
        self._fps_start_time = time.time()
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        return True

    def _capture_loop(self):
        while self._running and self._cap is not None and self._cap.isOpened():
            success, frame = self._cap.read()
            if not success:
                continue
            if self.flip_horizontal:
                frame = cv2.flip(frame, 1)
            with self._frame_lock:
                self._frame = frame
            self._frame_count += 1
            elapsed = time.time() - self._fps_start_time
            if elapsed >= 1.0:
                self._fps = self._frame_count / elapsed
                self._frame_count = 0
                self._fps_start_time = time.time()

    def get_frame(self) -> Optional[np.ndarray]:
        """Return a copy of the latest captured frame when available."""
        with self._frame_lock:
            if self._frame is not None:
                return self._frame.copy()
            return None

    def get_frame_dimensions(self) -> Tuple[int, int]:
        """Return the actual camera frame dimensions."""
        return (self.actual_width, self.actual_height)

    @property
    def fps(self) -> float:
        """Return the measured capture rate."""
        return round(self._fps, 1)

    @property
    def is_running(self) -> bool:
        """Return whether the camera capture loop is active."""
        return self._running and self._cap is not None and self._cap.isOpened()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
        return False

    def stop(self) -> None:
        """Stop capture and release the camera resource."""
        if not self._running and self._cap is None:
            return
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=3.0)
            self._thread = None
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        logger.info("Kamera durduruldu.")
