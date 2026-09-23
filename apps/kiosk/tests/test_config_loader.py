import tempfile
import unittest
from pathlib import Path

from video_analytics.core.config_loader import (
    AppConfig,
    _parse_typed_config,
    load_config,
)


class ConfigLoaderTests(unittest.TestCase):
    def test_empty_config_uses_model_defaults(self) -> None:
        config = _parse_typed_config({})

        self.assertIsInstance(config, AppConfig)
        self.assertEqual(config.camera.width, 1280)
        self.assertEqual(config.person_detection.min_person_area, 20_000.0)

    def test_partial_config_overrides_only_given_value(self) -> None:
        config = _parse_typed_config({"camera": {"width": 1920}})

        self.assertEqual(config.camera.width, 1920)
        self.assertEqual(config.camera.height, 720)

    def test_missing_garment_override_uses_model_default(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "garment_overlay:\n" "  smoothing_alpha: 0.45\n",
                encoding="utf-8",
            )

            config = load_config(config_path)

        self.assertEqual(config.garment_overlay.shoulder_expand, 0.12)
        self.assertEqual(config.garment_overlay.smoothing_alpha, 0.45)

    def test_invalid_width_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "camera.width"):
            _parse_typed_config({"camera": {"width": 0}})

    def test_invalid_boolean_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "camera.flip_horizontal"):
            _parse_typed_config({"camera": {"flip_horizontal": "yes"}})

    def test_invalid_smoothing_alpha_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "garment_overlay.smoothing_alpha"):
            _parse_typed_config({"garment_overlay": {"smoothing_alpha": 1.2}})

    def test_zero_ai_frame_skip_is_allowed(self) -> None:
        config = _parse_typed_config({"performance": {"ai_frame_skip": 0}})

        self.assertEqual(config.performance.ai_frame_skip, 0)

    def test_unknown_key_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown config key"):
            _parse_typed_config({"camera": {"widht": 1280}})

    def test_age_buckets_must_be_strictly_increasing(self) -> None:
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            _parse_typed_config(
                {
                    "demographics": {
                        "age_buckets": {
                            "child_upper_bound": 25,
                            "youth_upper_bound": 12,
                        }
                    }
                }
            )


if __name__ == "__main__":
    unittest.main()
