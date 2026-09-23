import os
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

import mediapipe as mp
import numpy as np


@dataclass
class BodyMetrics:
    valid: bool = False
    shoulder_left: np.ndarray = field(
        default_factory=lambda: np.zeros(2, dtype=np.float32)
    )
    shoulder_right: np.ndarray = field(
        default_factory=lambda: np.zeros(2, dtype=np.float32)
    )
    shoulder_center: np.ndarray = field(
        default_factory=lambda: np.zeros(2, dtype=np.float32)
    )
    shoulder_width: float = 0.0
    hip_left: np.ndarray = field(default_factory=lambda: np.zeros(2, dtype=np.float32))
    hip_right: np.ndarray = field(default_factory=lambda: np.zeros(2, dtype=np.float32))
    hip_center: np.ndarray = field(
        default_factory=lambda: np.zeros(2, dtype=np.float32)
    )
    torso_height: float = 0.0
    hips_visible: bool = False
    ankle_left: np.ndarray = field(
        default_factory=lambda: np.zeros(2, dtype=np.float32)
    )
    ankle_right: np.ndarray = field(
        default_factory=lambda: np.zeros(2, dtype=np.float32)
    )
    legs_visible: bool = False
    nose: np.ndarray = field(default_factory=lambda: np.zeros(2, dtype=np.float32))
    ear_dist: float = 0.0
    head_visible: bool = False


class PoseEstimator:
    NOSE = 0
    LEFT_EAR = 7
    RIGHT_EAR = 8
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28

    def __init__(
        self,
        model_path: str,
        model_url: Optional[str],
        num_poses: int,
        min_detection_confidence: float,
        min_presence_confidence: float,
        min_tracking_confidence: float,
        min_landmark_visibility: float,
        hip_visibility_threshold: float,
        ankle_visibility_threshold: float,
        head_visibility_threshold: float,
        estimated_torso_ratio: float,
        min_shoulder_width: float,
        min_torso_height: float,
        pose_reset_after: int,
    ):
        self.model_path = model_path
        self.model_url = model_url

        # Eğer model bilgisayarda yoksa ve model_url verilmişse otomatik indir
        if not os.path.exists(self.model_path):
            if self.model_url:
                os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
                urllib.request.urlretrieve(self.model_url, self.model_path)
            else:
                raise FileNotFoundError(f"Pose modeli bulunamadı: {self.model_path}")

        self._min_visibility = min_landmark_visibility
        self._hip_visibility_threshold = hip_visibility_threshold
        self._ankle_visibility_threshold = ankle_visibility_threshold
        self._head_visibility_threshold = head_visibility_threshold
        self._estimated_torso_ratio = estimated_torso_ratio
        self._min_shoulder_width = min_shoulder_width
        self._min_torso_height = min_torso_height
        self._pose_reset_after = pose_reset_after
        self._pose_lost_frames = 0
        self._last_timestamp_ms = -1
        BaseOptions = mp.tasks.BaseOptions
        VisionRunningMode = mp.tasks.vision.RunningMode
        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=self.model_path),
            running_mode=VisionRunningMode.VIDEO,
            num_poses=num_poses,
            min_pose_detection_confidence=min_detection_confidence,
            min_pose_presence_confidence=min_presence_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self._landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(options)

    def process(self, rgb_frame: np.ndarray, timestamp_ms: int) -> BodyMetrics:
        h_frame, w_frame = rgb_frame.shape[:2]
        if timestamp_ms <= self._last_timestamp_ms:
            timestamp_ms = self._last_timestamp_ms + 1
        self._last_timestamp_ms = timestamp_ms
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        result = self._landmarker.detect_for_video(mp_image, timestamp_ms)
        if not result or not result.pose_landmarks:
            self._pose_lost_frames += 1
            return BodyMetrics(valid=False)
        landmarks = result.pose_landmarks[0]
        metrics = self._compute_metrics(landmarks, w_frame, h_frame)
        if metrics.valid:
            self._pose_lost_frames = 0
        else:
            self._pose_lost_frames += 1
        return metrics

    def _landmark_is_valid(self, landmark, threshold: Optional[float] = None) -> bool:
        if threshold is None:
            threshold = self._min_visibility
        return (
            landmark.visibility >= threshold
            and 0.0 <= landmark.x <= 1.0
            and (0.0 <= landmark.y <= 1.0)
        )

    def _compute_metrics(self, landmarks, w_frame: int, h_frame: int) -> BodyMetrics:
        metrics = BodyMetrics()
        l_shoulder = landmarks[self.LEFT_SHOULDER]
        r_shoulder = landmarks[self.RIGHT_SHOULDER]
        l_hip = landmarks[self.LEFT_HIP]
        r_hip = landmarks[self.RIGHT_HIP]
        if not (
            self._landmark_is_valid(l_shoulder) and self._landmark_is_valid(r_shoulder)
        ):
            return metrics
        left_body = {
            "shoulder": np.array(
                [l_shoulder.x * w_frame, l_shoulder.y * h_frame], dtype=np.float32
            )
        }
        right_body = {
            "shoulder": np.array(
                [r_shoulder.x * w_frame, r_shoulder.y * h_frame], dtype=np.float32
            )
        }
        hips_valid = self._landmark_is_valid(
            l_hip, self._hip_visibility_threshold
        ) and self._landmark_is_valid(r_hip, self._hip_visibility_threshold)
        if hips_valid:
            left_body["hip"] = np.array(
                [l_hip.x * w_frame, l_hip.y * h_frame], dtype=np.float32
            )
            right_body["hip"] = np.array(
                [r_hip.x * w_frame, r_hip.y * h_frame], dtype=np.float32
            )
        screen_left, screen_right = sorted(
            [left_body, right_body], key=lambda side: side["shoulder"][0]
        )
        metrics.shoulder_left = screen_left["shoulder"]
        metrics.shoulder_right = screen_right["shoulder"]
        shoulder_vector = metrics.shoulder_right - metrics.shoulder_left
        metrics.shoulder_width = float(np.linalg.norm(shoulder_vector))
        metrics.shoulder_center = (metrics.shoulder_left + metrics.shoulder_right) / 2.0
        if metrics.shoulder_width < self._min_shoulder_width:
            return metrics
        if hips_valid:
            metrics.hip_left = screen_left["hip"]
            metrics.hip_right = screen_right["hip"]
            metrics.hips_visible = True
        else:
            unit_shoulder = shoulder_vector / metrics.shoulder_width
            down_vector = np.array(
                [-unit_shoulder[1], unit_shoulder[0]], dtype=np.float32
            )
            if down_vector[1] < 0:
                down_vector *= -1
            estimated_torso = metrics.shoulder_width * self._estimated_torso_ratio
            metrics.hip_left = metrics.shoulder_left + down_vector * estimated_torso
            metrics.hip_right = metrics.shoulder_right + down_vector * estimated_torso
            metrics.hips_visible = False
        metrics.hip_center = (metrics.hip_left + metrics.hip_right) / 2.0
        metrics.torso_height = float(
            np.linalg.norm(metrics.hip_center - metrics.shoulder_center)
        )
        if metrics.torso_height >= self._min_torso_height:
            metrics.valid = True
        l_ankle = landmarks[self.LEFT_ANKLE]
        r_ankle = landmarks[self.RIGHT_ANKLE]
        if self._landmark_is_valid(
            l_ankle, self._ankle_visibility_threshold
        ) and self._landmark_is_valid(r_ankle, self._ankle_visibility_threshold):
            metrics.ankle_left = np.array(
                [l_ankle.x * w_frame, l_ankle.y * h_frame], dtype=np.float32
            )
            metrics.ankle_right = np.array(
                [r_ankle.x * w_frame, r_ankle.y * h_frame], dtype=np.float32
            )
            if metrics.ankle_left[0] > metrics.ankle_right[0]:
                metrics.ankle_left, metrics.ankle_right = (
                    metrics.ankle_right,
                    metrics.ankle_left,
                )
            metrics.legs_visible = True
        nose = landmarks[self.NOSE]
        l_ear = landmarks[self.LEFT_EAR]
        r_ear = landmarks[self.RIGHT_EAR]
        if (
            self._landmark_is_valid(nose, self._head_visibility_threshold)
            and self._landmark_is_valid(l_ear, self._head_visibility_threshold)
            and self._landmark_is_valid(r_ear, self._head_visibility_threshold)
        ):
            metrics.nose = np.array(
                [nose.x * w_frame, nose.y * h_frame], dtype=np.float32
            )
            ear_l = np.array([l_ear.x * w_frame, l_ear.y * h_frame])
            ear_r = np.array([r_ear.x * w_frame, r_ear.y * h_frame])
            metrics.ear_dist = float(np.linalg.norm(ear_l - ear_r))
            metrics.head_visible = True
        return metrics

    @property
    def should_reset_smoothing(self) -> bool:
        return self._pose_lost_frames >= self._pose_reset_after

    def close(self):
        if self._landmarker:
            self._landmarker.close()
