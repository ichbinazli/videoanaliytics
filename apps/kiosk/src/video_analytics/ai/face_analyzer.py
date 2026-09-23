import math
import os
import urllib.request
from dataclasses import dataclass
from typing import Optional

import mediapipe as mp
import numpy as np


@dataclass
class FaceMetrics:
    valid: bool = False
    face_width: float = 0.0
    glasses_center_x: float = 0.0
    glasses_center_y: float = 0.0
    face_angle: float = 0.0
    forehead_point: Optional[np.ndarray] = None
    chin_point: Optional[np.ndarray] = None
    is_looking_at_screen: bool = False
    avg_ear: float = 0.0
    avg_gaze_ratio: float = 0.0


class FaceAnalyzer:
    RIGHT_TEMPLE = 127
    LEFT_TEMPLE = 356
    NOSE_BRIDGE = 168
    CHIN = 152
    FOREHEAD = 10
    RIGHT_EYE_INNER = 133
    LEFT_EYE_INNER = 362
    RIGHT_IRIS = 468
    LEFT_IRIS = 473
    RIGHT_EYE_OUTER = 33
    RIGHT_EYE_INNER_GZ = 133
    LEFT_EYE_OUTER = 362
    LEFT_EYE_INNER_GZ = 263
    R_EAR_TOP = 159
    R_EAR_BOTTOM = 145
    R_EAR_LEFT = 33
    R_EAR_RIGHT = 133
    L_EAR_TOP = 386
    L_EAR_BOTTOM = 374
    L_EAR_LEFT = 362
    L_EAR_RIGHT = 263

    def __init__(
        self,
        model_path: str,
        model_url: Optional[str],
        num_faces: int,
        ear_threshold: float,
        gaze_left_threshold: float,
        gaze_right_threshold: float,
    ):
        self.model_path = model_path
        self.model_url = model_url

        # Eğer model local'de yoksa ve URL sağlandıysa otomatik indir
        if not os.path.exists(self.model_path):
            if self.model_url:
                os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
                urllib.request.urlretrieve(self.model_url, self.model_path)
            else:
                raise FileNotFoundError(f"Face modeli bulunamadı: {self.model_path}")

        self._ear_threshold = ear_threshold
        self._gaze_left = gaze_left_threshold
        self._gaze_right = gaze_right_threshold
        self._last_timestamp_ms = -1
        BaseOptions = mp.tasks.BaseOptions
        VisionRunningMode = mp.tasks.vision.RunningMode
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=self.model_path),
            running_mode=VisionRunningMode.VIDEO,
            num_faces=num_faces,
        )
        self._landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def process(self, rgb_frame: np.ndarray, timestamp_ms: int) -> FaceMetrics:
        h_frame, w_frame = rgb_frame.shape[:2]
        if timestamp_ms <= self._last_timestamp_ms:
            timestamp_ms = self._last_timestamp_ms + 1
        self._last_timestamp_ms = timestamp_ms
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        result = self._landmarker.detect_for_video(mp_image, timestamp_ms)
        if not result or not result.face_landmarks:
            return FaceMetrics(valid=False)
        landmarks = result.face_landmarks[0]
        return self._compute_metrics(landmarks, w_frame, h_frame)

    def _compute_metrics(self, landmarks, w_frame: int, h_frame: int) -> FaceMetrics:
        metrics = FaceMetrics()
        right_temple = landmarks[self.RIGHT_TEMPLE]
        left_temple = landmarks[self.LEFT_TEMPLE]
        nose_bridge = landmarks[self.NOSE_BRIDGE]
        chin = landmarks[self.CHIN]
        rt_x = right_temple.x * w_frame
        rt_y = right_temple.y * h_frame
        lt_x = left_temple.x * w_frame
        lt_y = left_temple.y * h_frame
        nb_x = nose_bridge.x * w_frame
        nb_y = nose_bridge.y * h_frame
        metrics.face_width = float(np.hypot(lt_x - rt_x, lt_y - rt_y))
        metrics.glasses_center_x = nb_x
        metrics.glasses_center_y = nb_y
        metrics.face_angle = -float(np.degrees(np.arctan2(lt_y - rt_y, lt_x - rt_x)))
        metrics.chin_point = np.array(
            [chin.x * w_frame, chin.y * h_frame], dtype=np.float32
        )
        forehead = landmarks[self.FOREHEAD]
        metrics.forehead_point = np.array(
            [forehead.x * w_frame, forehead.y * h_frame], dtype=np.float32
        )
        ear_right = self._calculate_ear(
            landmarks,
            w_frame,
            h_frame,
            self.R_EAR_TOP,
            self.R_EAR_BOTTOM,
            self.R_EAR_LEFT,
            self.R_EAR_RIGHT,
        )
        ear_left = self._calculate_ear(
            landmarks,
            w_frame,
            h_frame,
            self.L_EAR_TOP,
            self.L_EAR_BOTTOM,
            self.L_EAR_LEFT,
            self.L_EAR_RIGHT,
        )
        metrics.avg_ear = (ear_right + ear_left) / 2.0
        if metrics.avg_ear > self._ear_threshold:
            right_gaze = self._get_gaze_ratio(
                landmarks, self.RIGHT_IRIS, self.R_EAR_LEFT, self.R_EAR_RIGHT
            )
            left_gaze = self._get_gaze_ratio(
                landmarks, self.LEFT_IRIS, self.L_EAR_LEFT, self.L_EAR_RIGHT
            )
            metrics.avg_gaze_ratio = (right_gaze + left_gaze) / 2.0
            if self._gaze_left <= metrics.avg_gaze_ratio <= self._gaze_right:
                metrics.is_looking_at_screen = True
        metrics.valid = True
        return metrics

    @staticmethod
    def _calculate_ear(
        landmarks, frame_w, frame_h, top_idx, bottom_idx, left_idx, right_idx
    ) -> float:
        top_y = landmarks[top_idx].y * frame_h
        bottom_y = landmarks[bottom_idx].y * frame_h
        left_x = landmarks[left_idx].x * frame_w
        right_x = landmarks[right_idx].x * frame_w
        vert_dist = abs(bottom_y - top_y)
        horz_dist = abs(right_x - left_x)
        if horz_dist == 0:
            return 0
        return vert_dist / horz_dist

    @staticmethod
    def _euclidean_distance(p1, p2) -> float:
        return math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)

    def _get_gaze_ratio(
        self, landmarks, iris_idx: int, left_corner_idx: int, right_corner_idx: int
    ) -> float:
        iris = landmarks[iris_idx]
        left_corner = landmarks[left_corner_idx]
        right_corner = landmarks[right_corner_idx]
        dist_to_left = self._euclidean_distance(iris, left_corner)
        dist_to_right = self._euclidean_distance(iris, right_corner)
        if dist_to_right == 0:
            return 1.0
        return dist_to_left / dist_to_right

    def close(self):
        if self._landmarker:
            self._landmarker.close()
