"""Cevrimdisi kuyruk testleri — ag erisimi YOK."""

import time

import pytest

from video_analytics.telemetry.spool import SpoolQueue


@pytest.fixture
def spool(tmp_path):
    queue = SpoolQueue(str(tmp_path / "spool.db"), max_rows=100)
    yield queue
    queue.close()


def _payload(uuid: str) -> dict:
    return {"sessionUuid": uuid, "durationSec": 10}


def test_enqueue_then_claim_returns_payload(spool):
    spool.enqueue("uuid-1", _payload("uuid-1"))

    claimed = spool.claim(10)

    assert len(claimed) == 1
    row_id, session_uuid, payload = claimed[0]
    assert isinstance(row_id, int)
    assert session_uuid == "uuid-1"
    assert payload["sessionUuid"] == "uuid-1"


def test_same_uuid_enqueued_twice_is_stored_once(spool):
    """Yerel idempotency: ayni oturum iki kez kuyruga girmemeli."""
    spool.enqueue("uuid-1", _payload("uuid-1"))
    spool.enqueue("uuid-1", _payload("uuid-1"))

    assert spool.depth() == 1


def test_claim_respects_limit(spool):
    for index in range(10):
        spool.enqueue(f"uuid-{index}", _payload(f"uuid-{index}"))

    assert len(spool.claim(3)) == 3


def test_delete_by_uuids_removes_only_given_rows(spool):
    for index in range(3):
        spool.enqueue(f"uuid-{index}", _payload(f"uuid-{index}"))

    deleted = spool.delete_by_uuids(["uuid-0", "uuid-2"])

    assert deleted == 2
    assert spool.depth() == 1
    assert spool.claim(10)[0][1] == "uuid-1"


def test_reschedule_hides_rows_until_their_time(spool):
    spool.enqueue("uuid-1", _payload("uuid-1"))

    spool.reschedule(["uuid-1"], delay_seconds=60)

    # Kayit hala kuyrukta ama simdilik gonderilmeye hazir degil.
    assert spool.depth() == 1
    assert spool.claim(10) == []


def test_reschedule_increments_attempt_counter(spool):
    spool.enqueue("uuid-1", _payload("uuid-1"))

    spool.reschedule(["uuid-1"], delay_seconds=0)
    spool.reschedule(["uuid-1"], delay_seconds=0)

    assert spool.attempts_for("uuid-1") == 2


def test_rescheduled_row_becomes_claimable_again(spool):
    spool.enqueue("uuid-1", _payload("uuid-1"))
    spool.reschedule(["uuid-1"], delay_seconds=-1)  # gecmise ertele

    assert len(spool.claim(10)) == 1


def test_queue_cap_drops_oldest_rows(tmp_path):
    """Aylardir cevrimdisi olan cihaz diski doldurmamali."""
    queue = SpoolQueue(str(tmp_path / "spool.db"), max_rows=5)
    try:
        for index in range(12):
            queue.enqueue(f"uuid-{index:02d}", _payload(f"uuid-{index:02d}"))

        assert queue.depth() == 5

        remaining = [session_uuid for _, session_uuid, _ in queue.claim(10)]
        # En eskiler dusurulmus, en yeniler durmali.
        assert remaining == [f"uuid-{index:02d}" for index in range(7, 12)]
    finally:
        queue.close()


def test_survives_reopen(tmp_path):
    """Kiosk yeniden baslasa da kuyruk kaybolmamali."""
    path = str(tmp_path / "spool.db")

    first = SpoolQueue(path, max_rows=100)
    first.enqueue("uuid-1", _payload("uuid-1"))
    first.close()

    second = SpoolQueue(path, max_rows=100)
    try:
        assert second.depth() == 1
    finally:
        second.close()


def test_claim_is_ordered_oldest_first(spool):
    for index in range(3):
        spool.enqueue(f"uuid-{index}", _payload(f"uuid-{index}"))
        time.sleep(0.001)

    order = [session_uuid for _, session_uuid, _ in spool.claim(10)]
    assert order == ["uuid-0", "uuid-1", "uuid-2"]
