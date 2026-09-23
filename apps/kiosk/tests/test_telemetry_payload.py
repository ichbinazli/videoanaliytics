"""session_data -> wire JSON donusumu."""

from video_analytics.telemetry.payload import build_batch, build_session_payload


def _session(**overrides) -> dict:
    base = {
        "session_uuid": "8f14e45f-ceea-467a-9c4c-0f2c0f2c0f2c",
        "started_at": "2026-08-06T09:10:02.100Z",
        "ended_at": "2026-08-06T09:10:31.400Z",
        "duration": 29,
        "passed": 3,
        "looked": 2,
        "looking_seconds": 18.4,
        "age": "Yetiskin",
        "age_estimate": 31,
        "gender": "Man",
        "emotion": "happy",
    }
    base.update(overrides)
    return base


def test_maps_every_field_to_wire_names():
    payload = build_session_payload(_session())

    assert payload == {
        "sessionUuid": "8f14e45f-ceea-467a-9c4c-0f2c0f2c0f2c",
        "startedAt": "2026-08-06T09:10:02.100Z",
        "endedAt": "2026-08-06T09:10:31.400Z",
        "durationSec": 29,
        "personsPassed": 3,
        "personsLooked": 2,
        "lookingSeconds": 18.4,
        "ageEstimate": 31,
        "ageBucketRaw": "Yetiskin",
        "gender": "Man",
        "emotion": "happy",
    }


def test_returns_none_without_session_uuid():
    """Telemetri devrede degilken uretilen eski sozlukler sessizce atlanmali."""
    assert build_session_payload(_session(session_uuid=None)) is None


def test_returns_none_without_timestamps():
    assert build_session_payload(_session(started_at=None)) is None
    assert build_session_payload(_session(ended_at=None)) is None


def test_missing_demographics_become_null_not_crash():
    payload = build_session_payload(
        _session(age=None, age_estimate=None, gender=None, emotion=None)
    )

    assert payload["ageEstimate"] is None
    assert payload["ageBucketRaw"] is None
    assert payload["gender"] is None
    assert payload["emotion"] is None


def test_numeric_fields_are_coerced():
    """DeepFace bazen numpy tipleri dondurebiliyor; JSON'a int/float gitmeli."""
    payload = build_session_payload(_session(duration="45", passed="2", looking_seconds="7"))

    assert payload["durationSec"] == 45
    assert isinstance(payload["durationSec"], int)
    assert payload["personsPassed"] == 2
    assert payload["lookingSeconds"] == 7.0
    assert isinstance(payload["lookingSeconds"], float)


def test_batch_envelope_has_schema_version_and_device_block():
    batch = build_batch(
        sessions=[build_session_payload(_session())],
        sent_at="2026-08-06T09:12:33.412Z",
        app_version="0.1.0",
        spool_depth=128,
    )

    assert batch["schemaVersion"] == 1
    assert batch["sentAt"] == "2026-08-06T09:12:33.412Z"
    assert batch["device"] == {"appVersion": "0.1.0", "spoolDepth": 128}
    assert len(batch["sessions"]) == 1
