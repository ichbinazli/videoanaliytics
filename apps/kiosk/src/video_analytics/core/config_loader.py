import os
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any, Mapping, Optional, TypeVar

import yaml


def _validate_positive(name: str, value: int | float) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise ValueError(f"{name} must be a positive number; got {value!r}")


def _validate_probability(name: str, value: float) -> None:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not 0.0 <= value <= 1.0
    ):
        raise ValueError(f"{name} must be between 0.0 and 1.0; got {value!r}")


def _validate_integer(name: str, value: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer; got {value!r}")


def _validate_boolean(name: str, value: bool) -> None:
    if not isinstance(value, bool):
        raise ValueError(f"{name} must be a boolean; got {value!r}")


def _validate_non_negative(name: str, value: int | float) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise ValueError(f"{name} must be zero or greater; got {value!r}")


@dataclass(frozen=True)
class CameraConfig:
    device_id: int = 0
    width: int = 1280
    height: int = 720
    flip_horizontal: bool = True
    warmup_seconds: float = 1.0

    def __post_init__(self) -> None:
        _validate_integer("camera.device_id", self.device_id)
        _validate_positive("camera.width", self.width)
        _validate_positive("camera.height", self.height)
        _validate_boolean("camera.flip_horizontal", self.flip_horizontal)
        _validate_non_negative("camera.warmup_seconds", self.warmup_seconds)


@dataclass(frozen=True)
class ModelsConfig:
    yolo_model: str = "yolov8n-seg.pt"
    pose_model: str = "pose_landmarker_full.task"
    face_model: str = "face_landmarker.task"
    pose_model_url: Optional[str] = (
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_full/float16/1/pose_landmarker_full.task"
    )
    face_model_url: Optional[str] = (
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
        "face_landmarker/float16/1/face_landmarker.task"
    )

    def __post_init__(self) -> None:
        for field_name in ("yolo_model", "pose_model", "face_model"):
            value = getattr(self, field_name)
            if not isinstance(value, str) or not value:
                raise ValueError(f"models.{field_name} must be a non-empty string")
        for field_name in ("pose_model_url", "face_model_url"):
            value = getattr(self, field_name)
            if value is not None and not isinstance(value, str):
                raise ValueError(f"models.{field_name} must be a string or null")


@dataclass(frozen=True)
class PersonDetectionConfig:
    yolo_interval: int = 5
    yolo_confidence: float = 0.4
    min_person_area: float = 20_000.0
    mask_dilation_kernel: int = 5
    mask_dilation_iterations: int = 1

    def __post_init__(self) -> None:
        _validate_integer("person_detection.yolo_interval", self.yolo_interval)
        _validate_integer(
            "person_detection.mask_dilation_kernel", self.mask_dilation_kernel
        )
        _validate_integer(
            "person_detection.mask_dilation_iterations",
            self.mask_dilation_iterations,
        )
        _validate_positive("person_detection.yolo_interval", self.yolo_interval)
        _validate_probability("person_detection.yolo_confidence", self.yolo_confidence)
        _validate_positive("person_detection.min_person_area", self.min_person_area)
        _validate_positive(
            "person_detection.mask_dilation_kernel", self.mask_dilation_kernel
        )
        if self.mask_dilation_kernel % 2 == 0:
            raise ValueError("person_detection.mask_dilation_kernel must be odd")
        _validate_non_negative(
            "person_detection.mask_dilation_iterations",
            self.mask_dilation_iterations,
        )


@dataclass(frozen=True)
class PoseConfig:
    """MediaPipe Pose estimation tunables.

    Note: min_shoulder_width and min_torso_height are filtering thresholds
    used in PoseEstimator._compute_metrics(). They are intentionally NOT
    passed to GarmentOverlay — the overlay relies on BodyMetrics.valid,
    which PoseEstimator sets based on these thresholds.
    """

    num_poses: int = 1
    min_detection_confidence: float = 0.60
    min_presence_confidence: float = 0.60
    min_tracking_confidence: float = 0.65
    min_landmark_visibility: float = 0.60
    hip_visibility_threshold: float = 0.55
    ankle_visibility_threshold: float = 0.40
    head_visibility_threshold: float = 0.50
    estimated_torso_ratio: float = 1.35
    min_shoulder_width: float = 40.0
    min_torso_height: float = 50.0
    pose_reset_after: int = 8

    def __post_init__(self) -> None:
        _validate_integer("pose_estimation.num_poses", self.num_poses)
        _validate_integer("pose_estimation.pose_reset_after", self.pose_reset_after)
        _validate_positive("pose_estimation.num_poses", self.num_poses)
        _validate_probability(
            "pose_estimation.min_detection_confidence",
            self.min_detection_confidence,
        )
        _validate_probability(
            "pose_estimation.min_presence_confidence",
            self.min_presence_confidence,
        )
        _validate_probability(
            "pose_estimation.min_tracking_confidence",
            self.min_tracking_confidence,
        )
        _validate_probability(
            "pose_estimation.min_landmark_visibility",
            self.min_landmark_visibility,
        )
        _validate_probability(
            "pose_estimation.hip_visibility_threshold",
            self.hip_visibility_threshold,
        )
        _validate_probability(
            "pose_estimation.ankle_visibility_threshold",
            self.ankle_visibility_threshold,
        )
        _validate_probability(
            "pose_estimation.head_visibility_threshold",
            self.head_visibility_threshold,
        )
        _validate_positive(
            "pose_estimation.estimated_torso_ratio",
            self.estimated_torso_ratio,
        )
        _validate_positive(
            "pose_estimation.min_shoulder_width",
            self.min_shoulder_width,
        )
        _validate_positive(
            "pose_estimation.min_torso_height",
            self.min_torso_height,
        )
        _validate_positive("pose_estimation.pose_reset_after", self.pose_reset_after)


@dataclass(frozen=True)
class FaceConfig:
    num_faces: int = 1
    ear_threshold: float = 0.20
    gaze_left_threshold: float = 0.85
    gaze_right_threshold: float = 1.25

    def __post_init__(self) -> None:
        _validate_integer("face_analysis.num_faces", self.num_faces)
        _validate_positive("face_analysis.num_faces", self.num_faces)
        _validate_probability("face_analysis.ear_threshold", self.ear_threshold)
        _validate_positive(
            "face_analysis.gaze_left_threshold", self.gaze_left_threshold
        )
        _validate_positive(
            "face_analysis.gaze_right_threshold", self.gaze_right_threshold
        )
        if self.gaze_left_threshold >= self.gaze_right_threshold:
            raise ValueError(
                "face_analysis.gaze_left_threshold must be lower than "
                "face_analysis.gaze_right_threshold"
            )


@dataclass(frozen=True)
class GlassesOverlayConfig:
    enabled: bool = True
    scale: float = 1.05
    smoothing_alpha: float = 0.60

    def __post_init__(self) -> None:
        _validate_boolean("glasses_overlay.enabled", self.enabled)
        _validate_positive("glasses_overlay.scale", self.scale)
        _validate_probability("glasses_overlay.smoothing_alpha", self.smoothing_alpha)


@dataclass(frozen=True)
class GarmentOverlayConfig:
    smoothing_alpha: float = 0.35
    shoulder_expand: float = 0.12
    shoulder_lift: float = 0.04
    hip_width_expand: float = 0.15
    hip_down_extend: float = 0.08
    neck_width_ratio: float = 0.35
    neck_depth_ratio: float = 0.18
    neck_center_up_ratio: float = 0.07
    neck_feather_size: int = 15
    min_target_area: float = 2_000.0

    def __post_init__(self) -> None:
        _validate_integer("garment_overlay.neck_feather_size", self.neck_feather_size)
        _validate_probability("garment_overlay.smoothing_alpha", self.smoothing_alpha)
        for field_name in (
            "shoulder_expand",
            "shoulder_lift",
            "hip_width_expand",
            "hip_down_extend",
            "neck_width_ratio",
            "neck_depth_ratio",
            "neck_center_up_ratio",
        ):
            _validate_positive(
                f"garment_overlay.{field_name}", getattr(self, field_name)
            )
        _validate_positive("garment_overlay.neck_feather_size", self.neck_feather_size)
        _validate_positive("garment_overlay.min_target_area", self.min_target_area)


@dataclass(frozen=True)
class AgeBucketsConfig:
    child_upper_bound: int = 12
    youth_upper_bound: int = 25
    adult_upper_bound: int = 45
    middle_age_upper_bound: int = 60

    def __post_init__(self) -> None:
        boundaries = (
            self.child_upper_bound,
            self.youth_upper_bound,
            self.adult_upper_bound,
            self.middle_age_upper_bound,
        )
        if any(
            isinstance(boundary, bool) or not isinstance(boundary, int)
            for boundary in boundaries
        ):
            raise ValueError("demographics.age_buckets values must be integers")
        if any(boundary <= 0 for boundary in boundaries):
            raise ValueError(
                "demographics.age_buckets values must be positive integers"
            )
        if boundaries != tuple(sorted(boundaries)) or len(set(boundaries)) != 4:
            raise ValueError(
                "demographics.age_buckets values must be strictly increasing"
            )


@dataclass(frozen=True)
class DemographicsConfig:
    analysis_interval_seconds: float = 2.0
    history_size: int = 5
    face_margin_ratio: float = 0.30
    detector_backend: str = "ssd"
    age_buckets: AgeBucketsConfig = field(default_factory=AgeBucketsConfig)

    def __post_init__(self) -> None:
        _validate_integer("demographics.history_size", self.history_size)
        _validate_positive(
            "demographics.analysis_interval_seconds",
            self.analysis_interval_seconds,
        )
        _validate_positive("demographics.history_size", self.history_size)
        _validate_probability("demographics.face_margin_ratio", self.face_margin_ratio)
        if not isinstance(self.detector_backend, str) or not self.detector_backend:
            raise ValueError("demographics.detector_backend must be a non-empty string")


@dataclass(frozen=True)
class CatalogConfig:
    database_path: str = "catalog/video_analitik_products.db"
    product_images_dir: str = "catalog/product_images"

    def __post_init__(self) -> None:
        for field_name in ("database_path", "product_images_dir"):
            value = getattr(self, field_name)
            if not isinstance(value, str) or not value:
                raise ValueError(f"catalog.{field_name} must be a non-empty string")


@dataclass(frozen=True)
class PerformanceConfig:
    """Reserved for a future pipeline-performance story; not consumed yet."""

    target_fps: int = 30
    ai_frame_skip: int = 1
    enable_threading: bool = True
    max_queue_size: int = 2

    def __post_init__(self) -> None:
        _validate_integer("performance.target_fps", self.target_fps)
        _validate_integer("performance.ai_frame_skip", self.ai_frame_skip)
        _validate_integer("performance.max_queue_size", self.max_queue_size)
        _validate_boolean("performance.enable_threading", self.enable_threading)
        _validate_positive("performance.target_fps", self.target_fps)
        _validate_non_negative("performance.ai_frame_skip", self.ai_frame_skip)
        _validate_positive("performance.max_queue_size", self.max_queue_size)


@dataclass(frozen=True)
class KioskConfig:
    fullscreen: bool = False
    window_title: str = "video_analitik "
    show_debug_info: bool = True
    quit_key: str = "q"

    def __post_init__(self) -> None:
        _validate_boolean("kiosk.fullscreen", self.fullscreen)
        _validate_boolean("kiosk.show_debug_info", self.show_debug_info)
        if not isinstance(self.window_title, str) or not self.window_title:
            raise ValueError("kiosk.window_title must be a non-empty string")
        if not isinstance(self.quit_key, str) or len(self.quit_key) != 1:
            raise ValueError("kiosk.quit_key must be exactly one character")


@dataclass(frozen=True)
class PrivacyConfig:
    """Privacy-by-default controls for demographic processing and retention."""

    enable_demographics: bool = False
    store_raw: bool = False
    retention_days: int = 30
    notice: str = (
        "Bu kiosk anonim kullanım metrikleri işler. "
        "Demografik analiz varsayılan olarak kapalıdır."
    )

    def __post_init__(self) -> None:
        _validate_boolean("privacy.enable_demographics", self.enable_demographics)
        _validate_boolean("privacy.store_raw", self.store_raw)
        _validate_non_negative("privacy.retention_days", self.retention_days)
        if not isinstance(self.notice, str) or not self.notice:
            raise ValueError("privacy.notice must be a non-empty string")


@dataclass(frozen=True)
class TelemetryConfig:
    """Merkezi veri toplama API'sine gonderim ayarlari.

    DIKKAT: api_key BURADA TUTULMAZ. Bu dosya git'te; sadece key'i tasiyan
    ORTAM DEGISKENININ ADI yaziliyor.

    Gonderilen alanlar PrivacyConfig'e tabidir: privacy.store_raw kapaliyken
    cinsiyet, duygu ve sayisal yas oturum verisine hic girmez, dolayisiyla
    sunucuya da gitmez.
    """

    enabled: bool = False
    base_url: str = ""
    api_key_env: str = "VA_TELEMETRY_API_KEY"
    spool_path: str = "telemetry/spool.db"
    timeout_seconds: float = 5.0
    batch_size: int = 50
    flush_interval_seconds: float = 30.0
    max_queue_rows: int = 50_000
    max_backoff_seconds: float = 300.0
    verify_tls: bool = True

    def __post_init__(self) -> None:
        _validate_boolean("telemetry.enabled", self.enabled)
        _validate_boolean("telemetry.verify_tls", self.verify_tls)
        for field_name in ("base_url", "api_key_env", "spool_path"):
            value = getattr(self, field_name)
            if not isinstance(value, str):
                raise ValueError(f"telemetry.{field_name} must be a string")
        if not self.api_key_env:
            raise ValueError("telemetry.api_key_env must be a non-empty string")
        if not self.spool_path:
            raise ValueError("telemetry.spool_path must be a non-empty string")
        _validate_positive("telemetry.timeout_seconds", self.timeout_seconds)
        _validate_integer("telemetry.batch_size", self.batch_size)
        _validate_positive("telemetry.batch_size", self.batch_size)
        _validate_positive(
            "telemetry.flush_interval_seconds", self.flush_interval_seconds
        )
        _validate_integer("telemetry.max_queue_rows", self.max_queue_rows)
        _validate_positive("telemetry.max_queue_rows", self.max_queue_rows)
        _validate_positive("telemetry.max_backoff_seconds", self.max_backoff_seconds)
        if self.enabled and not self.base_url:
            raise ValueError(
                "telemetry.base_url is required when telemetry.enabled is true"
            )


@dataclass(frozen=True)
class AppConfig:
    camera: CameraConfig = field(default_factory=CameraConfig)
    models: ModelsConfig = field(default_factory=ModelsConfig)
    person_detection: PersonDetectionConfig = field(
        default_factory=PersonDetectionConfig
    )
    pose_estimation: PoseConfig = field(default_factory=PoseConfig)
    face_analysis: FaceConfig = field(default_factory=FaceConfig)
    glasses_overlay: GlassesOverlayConfig = field(default_factory=GlassesOverlayConfig)
    garment_overlay: GarmentOverlayConfig = field(default_factory=GarmentOverlayConfig)
    demographics: DemographicsConfig = field(default_factory=DemographicsConfig)
    catalog: CatalogConfig = field(default_factory=CatalogConfig)
    performance: PerformanceConfig = field(default_factory=PerformanceConfig)
    kiosk: KioskConfig = field(default_factory=KioskConfig)
    privacy: PrivacyConfig = field(default_factory=PrivacyConfig)
    telemetry: TelemetryConfig = field(default_factory=TelemetryConfig)


ConfigSection = TypeVar("ConfigSection")


def _as_mapping(value: Any, path: str) -> Mapping[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise ValueError(f"{path} must be a mapping; got {type(value).__name__}")
    return value


def _build_section(
    config_type: type[ConfigSection], raw_section: Any, section_name: str
) -> ConfigSection:
    values = dict(_as_mapping(raw_section, section_name))
    allowed_keys = {item.name for item in fields(config_type)}  # type: ignore[arg-type]
    unknown_keys = sorted(set(values) - allowed_keys)
    if unknown_keys:
        unknown_list = ", ".join(unknown_keys)
        raise ValueError(f"Unknown config key(s) in {section_name}: {unknown_list}")
    try:
        return config_type(**values)
    except TypeError as error:
        raise ValueError(f"Invalid configuration in {section_name}: {error}") from error


def _parse_typed_config(raw_config: Any) -> AppConfig:
    root = dict(_as_mapping(raw_config, "config"))
    allowed_sections = {item.name for item in fields(AppConfig)}
    unknown_sections = sorted(set(root) - allowed_sections)
    if unknown_sections:
        unknown_list = ", ".join(unknown_sections)
        raise ValueError(f"Unknown config section(s): {unknown_list}")

    demographics_values = dict(_as_mapping(root.get("demographics"), "demographics"))
    age_buckets = _build_section(
        AgeBucketsConfig,
        demographics_values.pop("age_buckets", None),
        "demographics.age_buckets",
    )
    demographics = _build_section(
        DemographicsConfig,
        {**demographics_values, "age_buckets": age_buckets},
        "demographics",
    )

    return AppConfig(
        camera=_build_section(CameraConfig, root.get("camera"), "camera"),
        models=_build_section(ModelsConfig, root.get("models"), "models"),
        person_detection=_build_section(
            PersonDetectionConfig,
            root.get("person_detection"),
            "person_detection",
        ),
        pose_estimation=_build_section(
            PoseConfig,
            root.get("pose_estimation"),
            "pose_estimation",
        ),
        face_analysis=_build_section(
            FaceConfig,
            root.get("face_analysis"),
            "face_analysis",
        ),
        glasses_overlay=_build_section(
            GlassesOverlayConfig,
            root.get("glasses_overlay"),
            "glasses_overlay",
        ),
        garment_overlay=_build_section(
            GarmentOverlayConfig,
            root.get("garment_overlay"),
            "garment_overlay",
        ),
        demographics=demographics,
        catalog=_build_section(CatalogConfig, root.get("catalog"), "catalog"),
        performance=_build_section(
            PerformanceConfig,
            root.get("performance"),
            "performance",
        ),
        kiosk=_build_section(KioskConfig, root.get("kiosk"), "kiosk"),
        privacy=_build_section(PrivacyConfig, root.get("privacy"), "privacy"),
        # Bu satir ZORUNLU: _parse_typed_config yukarida bilinmeyen
        # bolumleri reddediyor, dolayisiyla dataclass'i AppConfig'e eklemek
        # tek basina yetmez.
        telemetry=_build_section(
            TelemetryConfig, root.get("telemetry"), "telemetry"
        ),
    )


def load_typed_config(config_path: Optional[str] = None) -> AppConfig:
    """Load YAML overrides into a validated, immutable AppConfig instance."""
    if config_path is None:
        project_root = Path(__file__).resolve().parents[3]
        config_path = str(project_root / "config.yaml")
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config file not found: {config_path}")
    try:
        with open(config_path, "r", encoding="utf-8") as config_file:
            raw_config = yaml.safe_load(config_file)
    except yaml.YAMLError as error:
        raise ValueError(
            f"Invalid YAML in config file {config_path}: {error}"
        ) from error
    return _parse_typed_config(raw_config)


def load_config(config_path: Optional[str] = None) -> AppConfig:
    """Load the validated application configuration."""
    return load_typed_config(config_path)


def get_model_dir(config: AppConfig) -> str:
    return str(Path(__file__).resolve().parents[3])


_config_cache = None


def get_config() -> AppConfig:
    global _config_cache
    if _config_cache is None:
        _config_cache = load_config()
    return _config_cache
