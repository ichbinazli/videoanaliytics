from typing import Optional, Tuple

import cv2
import numpy as np

from video_analytics.ai.face_analyzer import FaceMetrics
from video_analytics.ai.pose_estimator import BodyMetrics


class GarmentOverlay:

    def __init__(
        self,
        garment_smoothing_alpha: float,
        shoulder_expand: float,
        shoulder_lift: float,
        hip_width_expand: float,
        hip_down_extend: float,
        neck_width_ratio: float,
        neck_depth_ratio: float,
        neck_center_up_ratio: float,
        neck_feather_size: int,
        glasses_scale: float,
        glasses_smoothing_alpha: float,
        min_target_area: float,
    ):
        self._garment_alpha = garment_smoothing_alpha
        self._shoulder_expand = shoulder_expand
        self._shoulder_lift = shoulder_lift
        self._hip_width_expand = hip_width_expand
        self._hip_down_extend = hip_down_extend
        self._neck_width_ratio = neck_width_ratio
        self._neck_depth_ratio = neck_depth_ratio
        self._neck_center_up_ratio = neck_center_up_ratio
        self._neck_feather_size = neck_feather_size
        self._glasses_scale = glasses_scale
        self._glasses_alpha = glasses_smoothing_alpha
        self._min_target_area = min_target_area
        self._garment_img: Optional[np.ndarray] = None
        self._garment_src_quad: Optional[np.ndarray] = None
        self._glasses_img: Optional[np.ndarray] = None
        self._pants_img: Optional[np.ndarray] = None
        self._pants_src_quad: Optional[np.ndarray] = None
        self._smooth_garment_pts: Optional[np.ndarray] = None
        self._smooth_glasses_state: Optional[np.ndarray] = None
        self._smooth_pants_pts: Optional[np.ndarray] = None

    def load_garment(self, image_path: str) -> bool:
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)

        if img is None:
            return False
        if img.shape[2] == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, alpha = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
            img = cv2.merge((img[:, :, 0], img[:, :, 1], img[:, :, 2], alpha))

        self._garment_img = img
        h, w = img.shape[:2]
        self._garment_src_quad = np.asarray(
            [
                [w * 0.2, h * 0.12],
                [w * 0.8, h * 0.12],
                [w * 0.82, h * 0.9],
                [w * 0.18, h * 0.9],
            ],
            dtype=np.float32,
        )
        self._smooth_garment_pts = None

        return True

    def load_glasses(self, image_path: str) -> bool:
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)

        if img is None:
            return False

        if img.shape[2] == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, alpha = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY_INV)
            img = cv2.merge((img[:, :, 0], img[:, :, 1], img[:, :, 2], alpha))

        self._glasses_img = img
        self._smooth_glasses_state = None
        h, w = img.shape[:2]

        return True

    def load_pants(self, image_path: str) -> bool:
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)

        if img is None:
            return False

        if img.shape[2] == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, alpha = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
            img = cv2.merge((img[:, :, 0], img[:, :, 1], img[:, :, 2], alpha))

        self._pants_img = img
        h, w = img.shape[:2]
        self._pants_src_quad = np.asarray(
            [
                [w * 0.15, h * 0.05],
                [w * 0.85, h * 0.05],
                [w * 0.85, h * 0.95],
                [w * 0.15, h * 0.95],
            ],
            dtype=np.float32,
        )
        self._smooth_pants_pts = None

        return True

    def clear(self, category: str) -> None:
        """Clear the loaded overlay image for the given category."""
        if category == "tshirt":
            self._garment_img = None
        elif category == "glasses":
            self._glasses_img = None
        elif category == "pants":
            self._pants_img = None

    def render(
        self,
        frame: np.ndarray,
        body_metrics: Optional[BodyMetrics] = None,
        face_metrics: Optional[FaceMetrics] = None,
        person_mask: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        result = frame.copy()

        if (
            self._pants_img is not None
            and body_metrics is not None
            and body_metrics.valid
        ):
            result = self._render_pants(result, body_metrics, person_mask)

        if (
            self._garment_img is not None
            and body_metrics is not None
            and body_metrics.valid
        ):
            result = self._render_garment(
                result, body_metrics, face_metrics, person_mask
            )

        if (
            self._glasses_img is not None
            and face_metrics is not None
            and face_metrics.valid
        ):
            result = self._render_glasses(result, face_metrics)

        return result

    def _render_garment(
        self,
        frame: np.ndarray,
        metrics: BodyMetrics,
        face_metrics: Optional[FaceMetrics],
        person_mask: Optional[np.ndarray],
    ) -> np.ndarray:
        garment_img = self._garment_img
        garment_src_quad = self._garment_src_quad
        if garment_img is None or garment_src_quad is None:
            return frame
        h_frame, w_frame = frame.shape[:2]
        shoulder_vector = metrics.shoulder_right - metrics.shoulder_left
        shoulder_expand = shoulder_vector * self._shoulder_expand
        top_lift = np.array(
            [0.0, -metrics.shoulder_width * self._shoulder_lift], dtype=np.float32
        )
        target_sl = metrics.shoulder_left - shoulder_expand + top_lift
        target_sr = metrics.shoulder_right + shoulder_expand + top_lift
        hip_vector = metrics.hip_right - metrics.hip_left
        hip_width = float(np.linalg.norm(hip_vector))

        if hip_width > 0:
            hip_unit = hip_vector / hip_width
        else:
            hip_unit = np.array([1.0, 0.0], dtype=np.float32)

        torso_vector = metrics.hip_center - metrics.shoulder_center
        torso_length = float(np.linalg.norm(torso_vector))

        if torso_length > 0:
            torso_down = torso_vector / torso_length
        else:
            torso_down = np.array([0.0, 1.0], dtype=np.float32)

        hip_expand = hip_unit * hip_width * self._hip_width_expand
        hip_down = torso_down * torso_length * self._hip_down_extend
        target_hl = metrics.hip_left - hip_expand + hip_down
        target_hr = metrics.hip_right + hip_expand + hip_down
        raw_target = np.asarray(
            [target_sl, target_sr, target_hr, target_hl], dtype=np.float32
        )
        target_area = abs(cv2.contourArea(raw_target))

        if target_area < self._min_target_area:
            return frame

        if self._smooth_garment_pts is None:
            self._smooth_garment_pts = raw_target.copy()
        else:
            self._smooth_garment_pts = (
                self._garment_alpha * raw_target
                + (1.0 - self._garment_alpha) * self._smooth_garment_pts
            )

        smooth_garment_pts = self._smooth_garment_pts
        if smooth_garment_pts is None:
            return frame
        perspective_matrix = cv2.getPerspectiveTransform(
            garment_src_quad, smooth_garment_pts.astype(np.float32)
        )
        warped = cv2.warpPerspective(
            garment_img,
            perspective_matrix,
            (w_frame, h_frame),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
        garment_rgb = warped[:, :, :3]
        garment_alpha = warped[:, :, 3]
        chin_point = None

        if face_metrics is not None and face_metrics.chin_point is not None:
            chin_point = face_metrics.chin_point

        garment_alpha = self._cut_neckline(
            garment_alpha,
            metrics.shoulder_left,
            metrics.shoulder_right,
            metrics.shoulder_center,
            metrics.shoulder_width,
            chin_point,
        )

        if (
            person_mask is not None
            and person_mask.shape == garment_alpha.shape
            and np.any(person_mask)
        ):
            garment_alpha = cv2.bitwise_and(garment_alpha, person_mask)

        mask_norm = (garment_alpha.astype(np.float32) / 255.0)[:, :, np.newaxis]
        frame = (
            mask_norm * garment_rgb.astype(np.float32)
            + (1.0 - mask_norm) * frame.astype(np.float32)
        ).astype(np.uint8)

        return frame

    def _cut_neckline(
        self,
        alpha: np.ndarray,
        shoulder_left: np.ndarray,
        shoulder_right: np.ndarray,
        shoulder_center: np.ndarray,
        shoulder_width: float,
        chin_point: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        if shoulder_width <= 0:
            return alpha
        shoulder_vector = shoulder_right - shoulder_left
        shoulder_angle = float(
            np.degrees(np.arctan2(shoulder_vector[1], shoulder_vector[0]))
        )
        if chin_point is not None:
            neckline_center = shoulder_center * 0.72 + chin_point * 0.28
        else:
            neckline_center = shoulder_center.copy()
            neckline_center[1] -= shoulder_width * self._neck_center_up_ratio
        radius_x = max(12, int(shoulder_width * self._neck_width_ratio * 0.5))
        radius_y = max(10, int(shoulder_width * self._neck_depth_ratio))
        cutout: np.ndarray = np.zeros_like(alpha, dtype=np.uint8)
        cv2.ellipse(
            cutout,
            (int(neckline_center[0]), int(neckline_center[1])),
            (radius_x, radius_y),
            shoulder_angle,
            0,
            360,
            255,
            -1,
            cv2.LINE_AA,
        )
        feather = self._neck_feather_size
        if feather % 2 == 0:
            feather += 1
        cutout = cv2.GaussianBlur(cutout, (feather, feather), 0)
        alpha_float = alpha.astype(np.float32)
        keep_mask = 1.0 - cutout.astype(np.float32) / 255.0
        return np.clip(alpha_float * keep_mask, 0, 255).astype(np.uint8)

    def _render_glasses(self, frame: np.ndarray, metrics: FaceMetrics) -> np.ndarray:
        glasses_img = self._glasses_img
        if glasses_img is None:
            return frame
        raw_w = metrics.face_width * self._glasses_scale
        raw_state = np.array(
            [
                metrics.glasses_center_x,
                metrics.glasses_center_y,
                raw_w,
                metrics.face_angle,
            ],
            dtype=np.float32,
        )
        if self._smooth_glasses_state is None:
            self._smooth_glasses_state = raw_state
        else:
            self._smooth_glasses_state = (
                self._glasses_alpha * raw_state
                + (1 - self._glasses_alpha) * self._smooth_glasses_state
            )
        cx, cy, gw, angle = self._smooth_glasses_state
        gw = int(gw)
        gh = int(gw * (glasses_img.shape[0] / glasses_img.shape[1]))
        if gw <= 0 or gh <= 0:
            return frame
        gx = int(cx - gw // 2)
        gy = int(cy - gh // 2)
        return self._overlay_transparent(
            frame, glasses_img, gx, gy, size=(gw, gh), angle=angle
        )

    def _render_pants(
        self, frame: np.ndarray, metrics: BodyMetrics, person_mask: Optional[np.ndarray]
    ) -> np.ndarray:
        pants_img = self._pants_img
        pants_src_quad = self._pants_src_quad
        if pants_img is None or pants_src_quad is None:
            return frame
        if not metrics.hips_visible or not metrics.legs_visible:
            return frame
        h_frame, w_frame = frame.shape[:2]
        target_tl = metrics.hip_left
        target_tr = metrics.hip_right
        target_bl = metrics.ankle_left
        target_br = metrics.ankle_right
        hip_vector = target_tr - target_tl
        hip_w = float(np.linalg.norm(hip_vector))
        if hip_w > 0:
            expand_vec = hip_vector / hip_w * hip_w * 0.15
            target_tl = target_tl - expand_vec
            target_tr = target_tr + expand_vec
            target_bl = target_bl - expand_vec
            target_br = target_br + expand_vec
        torso_vector = metrics.shoulder_center - metrics.hip_center
        torso_length = float(np.linalg.norm(torso_vector))
        if torso_length > 0:
            up_vec = torso_vector / torso_length * torso_length * 0.15
            target_tl += up_vec
            target_tr += up_vec
        raw_target = np.asarray(
            [target_tl, target_tr, target_br, target_bl], dtype=np.float32
        )
        if self._smooth_pants_pts is None:
            self._smooth_pants_pts = raw_target.copy()
        else:
            self._smooth_pants_pts = (
                self._garment_alpha * raw_target
                + (1.0 - self._garment_alpha) * self._smooth_pants_pts
            )
        smooth_pants_pts = self._smooth_pants_pts
        if smooth_pants_pts is None:
            return frame
        perspective_matrix = cv2.getPerspectiveTransform(
            pants_src_quad, smooth_pants_pts.astype(np.float32)
        )
        warped = cv2.warpPerspective(
            pants_img,
            perspective_matrix,
            (w_frame, h_frame),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
        garment_rgb = warped[:, :, :3]
        garment_alpha = warped[:, :, 3]
        if person_mask is not None and person_mask.shape == garment_alpha.shape:
            garment_alpha = cv2.bitwise_and(garment_alpha, person_mask)
        mask_norm = (garment_alpha.astype(np.float32) / 255.0)[:, :, np.newaxis]
        frame = (
            mask_norm * garment_rgb.astype(np.float32)
            + (1.0 - mask_norm) * frame.astype(np.float32)
        ).astype(np.uint8)
        return frame

    @staticmethod
    def _overlay_transparent(
        background: np.ndarray,
        overlay: np.ndarray,
        x: int,
        y: int,
        size: Optional[Tuple[int, int]] = None,
        angle: float = 0,
    ) -> np.ndarray:
        if size is not None:
            overlay = cv2.resize(overlay, size, interpolation=cv2.INTER_AREA)
        if angle != 0:
            h, w = overlay.shape[:2]
            M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
            overlay = cv2.warpAffine(
                overlay,
                M,
                (w, h),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_CONSTANT,
                borderValue=(0, 0, 0, 0),
            )
        h, w = overlay.shape[:2]
        bg_h, bg_w = background.shape[:2]
        if x >= bg_w or y >= bg_h or x + w <= 0 or (y + h <= 0):
            return background
        x1, x2 = (max(0, x), min(bg_w, x + w))
        y1, y2 = (max(0, y), min(bg_h, y + h))
        ox1, ox2 = (max(0, -x), min(w, bg_w - x))
        oy1, oy2 = (max(0, -y), min(h, bg_h - y))
        sub_overlay = overlay[oy1:oy2, ox1:ox2]
        sub_bg = background[y1:y2, x1:x2]
        overlay_rgb = sub_overlay[:, :, :3]
        overlay_mask = (sub_overlay[:, :, 3:] / 255.0).astype(np.float32)
        blend = (1.0 - overlay_mask) * sub_bg.astype(
            np.float32
        ) + overlay_mask * overlay_rgb.astype(np.float32)
        background[y1:y2, x1:x2] = blend.astype(np.uint8)
        return background

    def reset_smoothing(self):
        self._smooth_garment_pts = None
        self._smooth_glasses_state = None
        self._smooth_pants_pts = None
