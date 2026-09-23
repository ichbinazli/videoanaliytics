import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


class AnalyticsManager:

    def __init__(self, db, store_raw_demographics: bool = False, sinks=None):
        self.db = db
        self.store_raw_demographics = store_raw_demographics
        # Oturum bittiginde haberdar edilecek dinleyiciler (ornek: telemetri).
        # Bos liste = eski davranis, sadece yerel SQLite.
        self._sinks = list(sinks or [])
        self.session_uuid: str | None = None
        self.current_session_active = False
        self.session_start_time = 0.0
        self.total_persons_passed = 0
        self.total_persons_looked = 0
        self.total_looking_seconds = 0.0  # YENİ: ekrana bakılan toplam süre (sn)
        self.last_detection_time = 0.0
        self._last_tick: float | None = None
        self.current_demographics: dict[str, Any] | None = None

    def update(self, num_people: int, num_looking: int) -> None:
        """Update the active analytics session with the latest counts."""
        now = time.time()

        # YENİ: son update() çağrısından bu yana geçen süre (dt)
        dt = 0.0
        if self._last_tick is not None:
            dt = now - self._last_tick
        self._last_tick = now

        if num_people > 0:
            self.last_detection_time = now
            if not self.current_session_active:
                self.start_session()
            if num_people > self.total_persons_passed:
                self.total_persons_passed = num_people
            if num_looking > self.total_persons_looked:
                self.total_persons_looked = num_looking
            # YENİ: o an biri ekrana bakıyorsa, geçen süreyi sayaca ekle
            if num_looking > 0:
                self.total_looking_seconds += dt
        elif self.current_session_active and now - self.last_detection_time > 5.0:
            self.end_session()

    def set_demographics(self, demo_data: dict) -> None:
        """Attach demographic data to the active session."""
        if self.current_session_active:
            self.current_demographics = {"age": demo_data.get("age")}
            if self.store_raw_demographics:
                self.current_demographics.update(
                    {
                        "gender": demo_data.get("gender"),
                        "emotion": demo_data.get("emotion"),
                        # Sayisal yas, yas KOVASINDAN daha ayirt edicidir
                        # (31 vs "Yetiskin"), bu yuzden veri minimizasyonu
                        # geregi o da store_raw'a tabidir. Kapaliyken sunucu
                        # kova adindan turetmeye geri duser.
                        "age_estimate": demo_data.get("age_estimate"),
                    }
                )

    def start_session(self) -> None:
        """Start and initialize a new analytics session."""
        self.current_session_active = True
        self.session_start_time = time.time()
        # Oturumun kimligi BURADA uretilir ve gonderim denemeleri boyunca
        # degismez; sunucu tarafindaki tekrar korumasinin anahtari budur.
        self.session_uuid = str(uuid.uuid4())
        self.total_persons_passed = 1
        self.total_persons_looked = 0
        self.total_looking_seconds = 0.0  # YENİ: her session başında sıfırla
        self._last_tick = None  # YENİ: dt'nin session'a özel başlaması için
        self.current_demographics = None

    def end_session(self) -> None:
        """Finish the active session and persist its summary."""
        duration = int(time.time() - self.session_start_time)
        session_data = {
            "duration": duration,
            "passed": self.total_persons_passed,
            "looked": self.total_persons_looked,
            "looking_seconds": round(self.total_looking_seconds, 1),  # YENİ
            "age": None,
            "gender": None,
            "emotion": None,
        }
        if self.current_demographics:
            session_data["age"] = self.current_demographics.get("age")
            session_data["gender"] = self.current_demographics.get("gender")
            session_data["emotion"] = self.current_demographics.get("emotion")
        # Merkezi API icin gereken ek alanlar. log_analytics bunlari .get() ile
        # okumadigi icin yerel SQLite yolu BIREBIR ayni kalir.
        session_data["session_uuid"] = self.session_uuid
        session_data["started_at"] = _to_iso(self.session_start_time)
        session_data["ended_at"] = _to_iso(time.time())
        if self.current_demographics:
            # store_raw kapaliyken bu anahtar hic yoktur ve None kalir;
            # telemetri de sunucuya sayisal yas GONDERMEZ.
            session_data["age_estimate"] = self.current_demographics.get("age_estimate")

        if self.db:
            self.db.log_analytics(session_data)

        for sink in self._sinks:
            try:
                sink.handle_session(session_data)
            except Exception:  # noqa: BLE001
                # Telemetri hicbir kosulda kiosk'u dusurmemeli; yerel kayit
                # zaten yukarida yapildi.
                logger.exception("Telemetri sink'i hata verdi, yok sayiliyor")

        self.current_session_active = False


def _to_iso(epoch_seconds: float) -> str:
    """Epoch saniyeyi UTC ISO-8601'e cevirir (sunucunun bekledigi format)."""
    return (
        datetime.fromtimestamp(epoch_seconds, timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )
