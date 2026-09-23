import logging
from typing import Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

logger = logging.getLogger(__name__)


class PersonDetector:

    def __init__(
        self,
        model_path: str,
        run_interval: int,
        confidence_threshold: float,
        min_person_area: float,
        dilation_kernel_size: int,
        dilation_iterations: int,
    ):
        self._model = YOLO(model_path)
        self._run_interval = run_interval
        self._confidence_threshold = confidence_threshold
        self._min_person_area = min_person_area
        self._dilation_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (dilation_kernel_size, dilation_kernel_size)
        )
        self._dilation_iterations = dilation_iterations
        self._cached_mask: Optional[np.ndarray] = None
        self._cached_person_found: bool = False

    def process(
        self, frame: np.ndarray, frame_number: int
    ) -> Tuple[bool, Optional[np.ndarray]]:
        """Detect a person and return the detection flag with its cached mask."""
        if frame_number % self._run_interval == 0 or self._cached_mask is None:
            self._run_detection(frame)
        return (self._cached_person_found, self._cached_mask)

    def _run_detection(self, frame: np.ndarray) -> None:
        try:
            h_frame, w_frame = frame.shape[:2]
            results = self._model.predict(frame, classes=[0], verbose=False)
            if (
                results
                and len(results[0]) > 0
                and results[0].masks is not None
                and results[0].boxes is not None
            ):
                box_values = results[0].boxes.xywh
                if hasattr(box_values, "cpu"):
                    box_values = box_values.cpu().numpy()
                boxes = np.asarray(box_values)
                areas = boxes[:, 2] * boxes[:, 3]
                largest_person_idx = np.argmax(areas)
                largest_area = areas[largest_person_idx]
                if largest_area > self._min_person_area:
                    yolo_mask = results[0].masks.data[largest_person_idx].cpu().numpy()
                    yolo_mask_resized = cv2.resize(yolo_mask, (w_frame, h_frame))
                    binary_mask = (
                        yolo_mask_resized > self._confidence_threshold
                    ).astype(np.uint8) * 255
                    self._cached_mask = cv2.dilate(
                        binary_mask,
                        self._dilation_kernel,
                        iterations=self._dilation_iterations,
                    )
                    self._cached_person_found = True
                else:
                    self._cached_mask = np.zeros((h_frame, w_frame), dtype=np.uint8)
                    self._cached_person_found = False
            else:
                if self._cached_mask is None:
                    self._cached_mask = np.zeros((h_frame, w_frame), dtype=np.uint8)
                self._cached_person_found = False
        except Exception:
            logger.exception("Person detection failed")
            if self._cached_mask is None:
                try:
                    self._cached_mask = np.zeros(
                        (frame.shape[0], frame.shape[1]), dtype=np.uint8
                    )
                except (IndexError, ValueError):
                    # Last-resort fallback: use standard VGA dimensions when
                    # frame metadata is completely unavailable.
                    self._cached_mask = np.zeros((480, 640), dtype=np.uint8)

    def reset(self) -> None:
        """Clear the cached detection state."""
        self._cached_mask = None
        self._cached_person_found = False
