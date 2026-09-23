import logging
import threading
import time
from collections import Counter
from typing import Any, Optional

from deepface import DeepFace

from video_analytics.core.config_loader import DemographicsConfig

logger = logging.getLogger(__name__)


def classify_age(age: float) -> str:
    """Return the display bucket for an estimated age."""
    if age < 12:
        return "Çocuk"
    if age < 25:
        return "Genç"
    if age < 45:
        return "Yetişkin"
    if age < 60:
        return "Orta Yaşlı"
    return "Yaşlı"


class DemographicsAnalyzer:

    def __init__(self, config: DemographicsConfig):
        self._config = config
        self._lock = threading.Lock()  # Thread-safe erişim için kilit
        self.is_analyzing = False
        self.last_results: Optional[dict[str, Any]] = None
        self.last_analysis_time: float = 0.0
        self._gender_history: list[str] = []
        self._age_history: list[float] = []
        self._emotion_history: list[str] = []
        self._max_history = config.history_size

    def analyze_async(self, frame_bgr, face_box=None, callback=None):
        # 1 & 2. Adım: Atomic check-then-act için kilit kullanıyoruz
        with self._lock:
            if self.is_analyzing:
                return
            if (
                time.time() - self.last_analysis_time
                < self._config.analysis_interval_seconds
            ):
                return
            self.is_analyzing = True

        # KİLİT DIŞI: Ağır görüntü işleme (copy, crop) ve thread başlatma
        # işlemlerini kilidi serbest bıraktıktan sonra yapıyoruz.
        frame_copy = frame_bgr.copy()
        if face_box is not None:
            x, y, w, h = face_box
            margin = int(max(w, h) * self._config.face_margin_ratio)
            fh, fw = frame_copy.shape[:2]
            x1 = max(0, x - margin)
            y1 = max(0, y - margin)
            x2 = min(fw, x + w + margin)
            y2 = min(fh, y + h + margin)
            frame_copy = frame_copy[y1:y2, x1:x2]

        thread = threading.Thread(
            target=self._run_deepface, args=(frame_copy, callback), daemon=True
        )
        thread.start()

    def _run_deepface(self, frame, callback):
        try:
            # Model kilit dışında çalışır;
            # böylece diğer thread'ler bloklanmaz.
            results = DeepFace.analyze(
                img_path=frame,
                actions=["age", "gender", "emotion"],
                detector_backend=self._config.detector_backend,
                enforce_detection=False,
                silent=True,
            )
            if isinstance(results, list) and len(results) > 0:
                result = results[0]
            else:
                result = results

            raw_age = result.get("age", 0)
            raw_gender = result.get("dominant_gender", "Bilinmiyor")
            raw_emotion = result.get("dominant_emotion", "Bilinmiyor")

            # Paylaşılan veri yapılarını güncellerken kilit altına alıyoruz
            with self._lock:
                self._age_history.append(raw_age)
                self._gender_history.append(raw_gender)
                self._emotion_history.append(raw_emotion)

                if len(self._age_history) > self._max_history:
                    self._age_history = self._age_history[-self._max_history :]
                    self._gender_history = self._gender_history[-self._max_history :]
                    self._emotion_history = self._emotion_history[-self._max_history :]

                voted_gender = Counter(self._gender_history).most_common(1)[0][0]
                voted_emotion = Counter(self._emotion_history).most_common(1)[0][0]
                sorted_ages = sorted(self._age_history)
                voted_age = sorted_ages[len(sorted_ages) // 2]

            buckets = self._config.age_buckets
            if voted_age < buckets.child_upper_bound:
                age_str = "Çocuk"
            elif voted_age < buckets.youth_upper_bound:
                age_str = "Genç"
            elif voted_age < buckets.adult_upper_bound:
                age_str = "Yetişkin"
            elif voted_age < buckets.middle_age_upper_bound:
                age_str = "Orta Yaşlı"
            else:
                age_str = "Yaşlı"

            # Sonuçları güncellerken kilit kullanıyoruz
            with self._lock:
                self.last_results = {
                    "age": age_str,
                    # Ham sayisal deger de disari veriliyor: sunucu yas kovasini
                    # bundan turetiyor, boylece cihazdaki bant ayari degisse
                    # bile gecmis veri yeniden kovalanabiliyor.
                    "age_estimate": int(voted_age),
                    "gender": voted_gender,
                    "emotion": voted_emotion,
                }
                current_results = self.last_results

            if callback:
                callback(current_results)

        except Exception:
            logger.exception("DeepFace analizi başarısız oldu")
        finally:
            with self._lock:
                self.last_analysis_time = time.time()
                self.is_analyzing = False

    def get_latest_results(self):
        with self._lock:
            return self.last_results

    def reset(self):
        with self._lock:
            self.last_results = None
            self.is_analyzing = False
            self.last_analysis_time = 0
            self._gender_history.clear()
            self._age_history.clear()
            self._emotion_history.clear()
