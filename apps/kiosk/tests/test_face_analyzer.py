import sys
from dataclasses import dataclass
from unittest.mock import MagicMock

import pytest

sys.modules["mediapipe"] = MagicMock()

from video_analytics.ai.face_analyzer import FaceAnalyzer


@dataclass
class FakeLandmark:
    x: float
    y: float


@pytest.mark.parametrize(
    ("first", "second", "expected"),
    [
        (FakeLandmark(0.0, 0.0), FakeLandmark(3.0, 4.0), 5.0),
        (FakeLandmark(2.0, 2.0), FakeLandmark(2.0, 2.0), 0.0),
    ],
)
def test_euclidean_distance(first, second, expected):
    assert FaceAnalyzer._euclidean_distance(first, second) == pytest.approx(expected)


def test_calculate_ear_returns_expected_ratio():
    landmarks = [
        FakeLandmark(0.0, 0.4),
        FakeLandmark(0.0, 0.6),
        FakeLandmark(0.2, 0.0),
        FakeLandmark(0.6, 0.0),
    ]

    result = FaceAnalyzer._calculate_ear(landmarks, 100, 100, 0, 1, 2, 3)

    assert result == pytest.approx(0.5)


def test_calculate_ear_returns_zero_when_horizontal_distance_is_zero():
    landmarks = [
        FakeLandmark(0.0, 0.4),
        FakeLandmark(0.0, 0.6),
        FakeLandmark(0.2, 0.0),
        FakeLandmark(0.2, 0.0),
    ]

    result = FaceAnalyzer._calculate_ear(landmarks, 100, 100, 0, 1, 2, 3)

    assert result == 0


def test_get_gaze_ratio_returns_expected_ratio():
    analyzer = FaceAnalyzer.__new__(FaceAnalyzer)
    landmarks = [
        FakeLandmark(0.0, 0.0),
        FakeLandmark(3.0, 0.0),
        FakeLandmark(1.0, 0.0),
    ]

    result = analyzer._get_gaze_ratio(landmarks, 0, 1, 2)

    assert result == pytest.approx(3.0)


def test_get_gaze_ratio_returns_one_when_right_distance_is_zero():
    analyzer = FaceAnalyzer.__new__(FaceAnalyzer)
    landmarks = [
        FakeLandmark(1.0, 0.0),
        FakeLandmark(3.0, 0.0),
        FakeLandmark(1.0, 0.0),
    ]

    result = analyzer._get_gaze_ratio(landmarks, 0, 1, 2)

    assert result == 1.0
