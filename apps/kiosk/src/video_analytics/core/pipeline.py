import logging
import time
from typing import Optional, cast

import cv2
import numpy as np

from video_analytics.ai.demographics import DemographicsAnalyzer
from video_analytics.ai.face_analyzer import FaceAnalyzer
from video_analytics.ai.garment_overlay import GarmentOverlay
from video_analytics.ai.person_detector import PersonDetector
from video_analytics.ai.pose_estimator import PoseEstimator
from video_analytics.core.analytics import AnalyticsManager
from video_analytics.core.config_loader import AppConfig
from video_analytics.telemetry import build_sinks

logger = logging.getLogger(__name__)


class MirrorPipeline:

    def __init__(self, config: AppConfig, db=None):
        self._config = config
        self._db = db
        self._frame_count = 0
        self._start_time = 0.0
        self._person_detector: Optional[PersonDetector] = None
        self._pose_estimator: Optional[PoseEstimator] = None
        self._face_analyzer: Optional[FaceAnalyzer] = None
        self._garment_overlay: Optional[GarmentOverlay] = None
        self._analytics: Optional[AnalyticsManager] = None
        self._demographics: Optional[DemographicsAnalyzer] = None
        self._last_log_time_looking = 0.0
        self._last_log_time_passing = 0.0
        self._shutdown_done = False
        privacy_cfg = config.privacy
        self._enable_demographics = privacy_cfg.enable_demographics
        self._store_raw_demographics = privacy_cfg.store_raw

    def initialize(self):
        cfg = self._config
        pd_cfg = cfg.person_detection
        self._person_detector = PersonDetector(
            model_path=cfg.models.yolo_model,
            run_interval=pd_cfg.yolo_interval,
            confidence_threshold=pd_cfg.yolo_confidence,
            min_person_area=pd_cfg.min_person_area,
            dilation_kernel_size=pd_cfg.mask_dilation_kernel,
            dilation_iterations=pd_cfg.mask_dilation_iterations,
        )
        pe_cfg = cfg.pose_estimation
        self._pose_estimator = PoseEstimator(
            model_path=cfg.models.pose_model,
            model_url=cfg.models.pose_model_url,
            num_poses=pe_cfg.num_poses,
            min_detection_confidence=pe_cfg.min_detection_confidence,
            min_presence_confidence=pe_cfg.min_presence_confidence,
            min_tracking_confidence=pe_cfg.min_tracking_confidence,
            min_landmark_visibility=pe_cfg.min_landmark_visibility,
            hip_visibility_threshold=pe_cfg.hip_visibility_threshold,
            ankle_visibility_threshold=pe_cfg.ankle_visibility_threshold,
            head_visibility_threshold=pe_cfg.head_visibility_threshold,
            estimated_torso_ratio=pe_cfg.estimated_torso_ratio,
            min_shoulder_width=pe_cfg.min_shoulder_width,
            min_torso_height=pe_cfg.min_torso_height,
            pose_reset_after=pe_cfg.pose_reset_after,
        )
        fa_cfg = cfg.face_analysis
        self._face_analyzer = FaceAnalyzer(
            model_path=cfg.models.face_model,
            model_url=cfg.models.face_model_url,
            num_faces=fa_cfg.num_faces,
            ear_threshold=fa_cfg.ear_threshold,
            gaze_left_threshold=fa_cfg.gaze_left_threshold,
            gaze_right_threshold=fa_cfg.gaze_right_threshold,
        )
        go_cfg = cfg.garment_overlay
        gl_cfg = cfg.glasses_overlay
        self._garment_overlay = GarmentOverlay(
            garment_smoothing_alpha=go_cfg.smoothing_alpha,
            shoulder_expand=go_cfg.shoulder_expand,
            shoulder_lift=go_cfg.shoulder_lift,
            hip_width_expand=go_cfg.hip_width_expand,
            hip_down_extend=go_cfg.hip_down_extend,
            neck_width_ratio=go_cfg.neck_width_ratio,
            neck_depth_ratio=go_cfg.neck_depth_ratio,
            neck_center_up_ratio=go_cfg.neck_center_up_ratio,
            neck_feather_size=go_cfg.neck_feather_size,
            glasses_scale=gl_cfg.scale,
            glasses_smoothing_alpha=gl_cfg.smoothing_alpha,
            min_target_area=go_cfg.min_target_area,
        )
        # Telemetri kapaliysa build_sinks bos liste doner ve AnalyticsManager
        # eskisi gibi yalnizca yerel SQLite'a yazar.
        self._sinks = build_sinks(cfg.telemetry)
        self._analytics = AnalyticsManager(
            self._db,
            store_raw_demographics=self._store_raw_demographics,
            sinks=self._sinks,
        )
        if self._enable_demographics:
            self._demographics = DemographicsAnalyzer(cfg.demographics)
        self._start_time = time.perf_counter()
        self._frame_count = 0

    def process(self, frame: np.ndarray) -> tuple:
        person_detector = self._person_detector
        pose_estimator = self._pose_estimator
        face_analyzer = self._face_analyzer
        garment_overlay = self._garment_overlay
        analytics = self._analytics
        demographics = self._demographics
        if any(
            component is None
            for component in (
                person_detector,
                pose_estimator,
                face_analyzer,
                garment_overlay,
                analytics,
            )
        ):
            raise RuntimeError("Pipeline must be initialized before processing")
        person_detector = cast(PersonDetector, person_detector)
        pose_estimator = cast(PoseEstimator, pose_estimator)
        face_analyzer = cast(FaceAnalyzer, face_analyzer)
        garment_overlay = cast(GarmentOverlay, garment_overlay)
        analytics = cast(AnalyticsManager, analytics)

        self._frame_count += 1
        h_frame, w_frame = frame.shape[:2]
        timestamp_ms = int((time.perf_counter() - self._start_time) * 1000)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        person_found, person_mask = person_detector.process(frame, self._frame_count)
        body_metrics = pose_estimator.process(rgb_frame, timestamp_ms)
        if pose_estimator.should_reset_smoothing:
            garment_overlay.reset_smoothing()
        face_metrics = face_analyzer.process(rgb_frame, timestamp_ms)
        result_frame = garment_overlay.render(
            frame,
            body_metrics=body_metrics if body_metrics.valid else None,
            face_metrics=face_metrics if face_metrics.valid else None,
            person_mask=person_mask,
        )
        num_people = 1 if person_found else 0
        is_looking = face_metrics.is_looking_at_screen if face_metrics.valid else False
        analytics.update(num_people=num_people, num_looking=1 if is_looking else 0)

        res = None
        if is_looking and demographics is not None:
            face_box = None
            if face_metrics.valid and hasattr(face_metrics, "face_box"):
                face_box = face_metrics.face_box
            demographics.analyze_async(frame, face_box=face_box)
            res = demographics.get_latest_results()
            if res:
                analytics.set_demographics(res)
        elif not person_found and demographics is not None:
            demographics.reset()

        now = time.time()
        if is_looking:
            if now - self._last_log_time_looking >= 10.0:
                privacy_status = (
                    "demografik analiz etkin; hassas değerler maskelendi"
                    if self._enable_demographics
                    else "demografik analiz kapalı"
                )
                logger.debug("[ANALİTİK] Kişi aynaya bakıyor | %s", privacy_status)
                self._last_log_time_looking = now
        elif person_found:
            if now - self._last_log_time_passing >= 1.0:
                logger.debug("[ANALİTİK] Arka plandan kişi geçiyor...")
                self._last_log_time_passing = now

        info = {
            "frame_number": self._frame_count,
            "person_found": person_found,
            "body_metrics": body_metrics,
            "face_metrics": face_metrics,
            "is_looking": (
                face_metrics.is_looking_at_screen if face_metrics.valid else False
            ),
        }
        return (result_frame, info)

    def load_garment(self, category: str, image_path: str):
        garment_overlay = self._garment_overlay
        if garment_overlay is None:
            raise RuntimeError("Pipeline must be initialized before loading garments")
        if category == "tshirt":
            garment_overlay.load_garment(image_path)
        elif category == "glasses":
            garment_overlay.load_glasses(image_path)
        elif category == "pants":
            garment_overlay.load_pants(image_path)

    def clear_garment(self, category: str):
        garment_overlay = self._garment_overlay
        if garment_overlay is None:
            raise RuntimeError("Pipeline must be initialized before clearing garments")
        if category == "tshirt":
            garment_overlay.clear(category)
        elif category == "glasses":
            garment_overlay.clear(category)
        elif category == "pants":
            garment_overlay.clear(category)

    def shutdown(self):
        if getattr(self, "_shutdown_done", False):
            return
        if self._analytics and self._analytics.current_session_active:
            self._analytics.end_session()
        # Kuyrukta bekleyen kayitlar icin son bir gonderim denemesi. Kisa
        # timeout'lu: kiosk cikisi ag yuzunden bloke olmamali.
        for sink in getattr(self, "_sinks", []):
            try:
                sink.close()
            except Exception:  # noqa: BLE001
                logger.exception("Telemetri sink'i kapatilamadi")
        if self._pose_estimator:
            self._pose_estimator.close()
        if self._face_analyzer:
            self._face_analyzer.close()
        self._shutdown_done = True
        logger.info("Pipeline kapatildi.")
