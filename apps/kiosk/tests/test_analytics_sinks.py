"""AnalyticsManager'in sink davranisi.

Buradaki en onemli test `test_failing_sink_does_not_break_local_logging`:
telemetri HICBIR kosulda kiosk'u ya da yerel kaydi bozamamali.
"""

import time

from video_analytics.core.analytics import AnalyticsManager


class FakeDatabase:
    def __init__(self):
        self.logged = []

    def log_analytics(self, session_data):
        # Gercek ProductDatabase.log_analytics gibi .get() ile okur:
        # fazladan anahtarlar onu etkilemez.
        self.logged.append(dict(session_data))


class RecordingSink:
    def __init__(self):
        self.sessions = []

    def handle_session(self, session_data):
        self.sessions.append(session_data)


class ExplodingSink:
    def handle_session(self, session_data):
        raise RuntimeError("ag coktu")


def _run_session(manager):
    manager.start_session()
    manager.set_demographics(
        {"age": "Yetiskin", "age_estimate": 31, "gender": "Man", "emotion": "happy"}
    )
    time.sleep(0.01)
    manager.end_session()


def test_without_sinks_behaviour_is_unchanged():
    """Telemetri kapaliyken eski davranis birebir korunmali."""
    db = FakeDatabase()
    manager = AnalyticsManager(db, store_raw_demographics=True)

    _run_session(manager)

    assert len(db.logged) == 1
    assert db.logged[0]["gender"] == "Man"


def test_sink_receives_the_same_session_as_the_database():
    db = FakeDatabase()
    sink = RecordingSink()
    manager = AnalyticsManager(db, store_raw_demographics=True, sinks=[sink])

    _run_session(manager)

    assert len(db.logged) == 1
    assert len(sink.sessions) == 1
    assert sink.sessions[0]["gender"] == "Man"


def test_session_gains_uuid_and_iso_timestamps():
    sink = RecordingSink()
    manager = AnalyticsManager(None, sinks=[sink])

    _run_session(manager)

    session = sink.sessions[0]
    assert session["session_uuid"]
    assert session["started_at"].endswith("Z")
    assert session["ended_at"].endswith("Z")
    assert session["ended_at"] >= session["started_at"]


def test_each_session_gets_a_new_uuid():
    """UUID oturum basina uretilmeli — aksi hâlde sunucu hepsini tekrar sayar."""
    sink = RecordingSink()
    manager = AnalyticsManager(None, sinks=[sink])

    _run_session(manager)
    _run_session(manager)

    assert sink.sessions[0]["session_uuid"] != sink.sessions[1]["session_uuid"]


def test_numeric_age_is_forwarded_when_raw_storage_enabled():
    sink = RecordingSink()
    manager = AnalyticsManager(None, store_raw_demographics=True, sinks=[sink])

    _run_session(manager)

    assert sink.sessions[0]["age_estimate"] == 31


def test_privacy_default_keeps_raw_demographics_off_the_wire():
    """Gizlilik varsayilani: cinsiyet, duygu ve SAYISAL yas sunucuya gitmez.

    store_raw_demographics varsayilan olarak False. Bu durumda telemetri
    yalnizca yas KOVASINI ("Yetiskin") tasir; sayisal yas (31) daha ayirt
    edici oldugu icin o da disarida kalir. Sunucu tarafi zaten kova adindan
    turetmeye geri duser.
    """
    sink = RecordingSink()
    manager = AnalyticsManager(None, sinks=[sink])

    _run_session(manager)

    session = sink.sessions[0]
    assert session["age"] == "Yetiskin"  # kaba kova gecer
    assert session["gender"] is None
    assert session["emotion"] is None
    assert session["age_estimate"] is None


def test_privacy_flag_does_not_disable_telemetry_itself():
    """Gizlilik acikken de oturum SAYIMI gonderilir — sadece demografi kisilir.

    Bu ayrim onemli: gizlilik modu "hicbir sey gonderme" demek degil, "kisiyi
    ayirt edecek veriyi gonderme" demek. Kac kisi gecti, kaci bakti, ne kadar
    izledi bilgisi anonimdir ve raporlamanin cekirdegidir.
    """
    sink = RecordingSink()
    manager = AnalyticsManager(None, sinks=[sink])

    manager.start_session()
    manager.update(num_people=3, num_looking=2)
    manager.set_demographics({"age": "Yetiskin", "gender": "Man", "emotion": "happy"})
    time.sleep(0.01)
    manager.end_session()

    session = sink.sessions[0]
    assert session["session_uuid"]
    assert session["passed"] == 3
    assert session["looked"] == 2
    assert session["gender"] is None  # ama demografi yine de kisitli


def test_failing_sink_does_not_break_local_logging():
    """Telemetri patlarsa yerel SQLite yazimi ETKILENMEMELI."""
    db = FakeDatabase()
    good = RecordingSink()
    manager = AnalyticsManager(db, sinks=[ExplodingSink(), good])

    _run_session(manager)  # istisna disari sizmamali

    assert len(db.logged) == 1  # yerel kayit yapildi
    assert len(good.sessions) == 1  # patlayan sink digerini engellemedi


def test_session_is_closed_even_if_sink_fails():
    manager = AnalyticsManager(None, sinks=[ExplodingSink()])

    _run_session(manager)

    assert manager.current_session_active is False
