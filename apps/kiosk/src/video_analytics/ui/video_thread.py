import queue
import time
from typing import Optional

import cv2
from PyQt6.QtCore import QThread, pyqtSignal
from PyQt6.QtGui import QImage

from video_analytics.core.camera import CameraManager
from video_analytics.core.pipeline import MirrorPipeline


class VideoThread(QThread):
    change_pixmap_signal = pyqtSignal(QImage)
    info_signal = pyqtSignal(dict)
    fps_signal = pyqtSignal(float)

    def __init__(self, camera: CameraManager, pipeline: MirrorPipeline):
        super().__init__()
        self._camera = camera
        self._pipeline = pipeline
        self._running = True
        self._command_queue: queue.Queue[tuple[str, str, Optional[str]]] = queue.Queue()

    def set_garment(self, category: str, path: str) -> None:
        """Load an overlay image through the video thread command queue."""
        self._command_queue.put(("load", category, path))

    def clear_garment(self, category: str) -> None:
        """Clear an overlay image through the video thread command queue."""
        self._command_queue.put(("clear", category, None))

    def _drain_command_queue(self) -> None:
        while True:
            try:
                command, category, path = self._command_queue.get_nowait()
            except queue.Empty:
                break

            if command == "load" and path is not None:
                self._pipeline.load_garment(category, path)
            elif command == "clear":
                self._pipeline.clear_garment(category)

    def run(self):
        while self._running:
            frame = self._camera.get_frame()
            if frame is None:
                time.sleep(0.01)
                continue

            self._drain_command_queue()

            result_frame, info = self._pipeline.process(frame)
            rgb_image = cv2.cvtColor(result_frame, cv2.COLOR_BGR2RGB)
            h, w, ch = rgb_image.shape
            bytes_per_line = ch * w

            qt_img = QImage(
                rgb_image.data, w, h, bytes_per_line, QImage.Format.Format_RGB888
            ).copy()

            self.change_pixmap_signal.emit(qt_img)
            self.info_signal.emit(info)
            self.fps_signal.emit(self._camera.fps)

    def stop(self):
        self._running = False
        self.wait()
