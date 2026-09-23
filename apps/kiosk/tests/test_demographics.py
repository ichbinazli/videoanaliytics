import sys
from unittest.mock import MagicMock

import pytest

sys.modules["cv2"] = MagicMock()
sys.modules["deepface"] = MagicMock()

from video_analytics.ai.demographics import classify_age


@pytest.mark.parametrize(
    ("age", "expected"),
    [
        (-1, "Çocuk"),
        (0, "Çocuk"),
        (11.99, "Çocuk"),
        (12, "Genç"),
        (24.99, "Genç"),
        (25, "Yetişkin"),
        (44.99, "Yetişkin"),
        (45, "Orta Yaşlı"),
        (59.99, "Orta Yaşlı"),
        (60, "Yaşlı"),
        (85, "Yaşlı"),
    ],
)
def test_classify_age_uses_expected_bucket(age, expected):
    assert classify_age(age) == expected
