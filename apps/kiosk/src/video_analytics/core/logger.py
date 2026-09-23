import logging
import os
import sys
from logging.handlers import RotatingFileHandler


def setup_logger(log_file="logs/video_analitik.log"):
    # Göreli yolları proje kök dizinine göre hizala
    if not os.path.isabs(log_file):
        # src/video_analytics/core/logger.py -> Proje Kök Dizinini Hesaplarken
        project_root = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        )
        log_file = os.path.join(project_root, log_file)

    log_dir = os.path.dirname(log_file)
    if log_dir and (not os.path.exists(log_dir)):
        os.makedirs(log_dir, exist_ok=True)

    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Suppress noisy 3rd-party library loggers
    for noisy_logger in (
        "mediapipe",
        "ultralytics",
        "PIL",
        "matplotlib",
        "absl",
        "tensorflow",
    ):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    if logger.handlers:
        return

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )

    class NonErrorFilter(logging.Filter):
        def filter(self, record):
            return record.levelno < logging.ERROR

    file_handler = RotatingFileHandler(
        log_file, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    file_handler.addFilter(NonErrorFilter())
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(NonErrorFilter())
    logger.addHandler(console_handler)

    error_file = os.path.join(log_dir, "video_analitik_error.log")
    error_handler = RotatingFileHandler(
        error_file, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    error_handler.setFormatter(formatter)
    error_handler.setLevel(logging.ERROR)
    logger.addHandler(error_handler)

    # NOTE: When running under watchdog.py, stderr is also captured by the
    # watchdog process and written to video_analitik_error.log.  This means
    # ERROR-level messages may appear twice in the error log file (once from
    # this handler, once from watchdog).  This is intentional — it guarantees
    # errors are persisted even if one path fails.
    error_console_handler = logging.StreamHandler(sys.stderr)
    error_console_handler.setFormatter(formatter)
    error_console_handler.setLevel(logging.ERROR)
    logger.addHandler(error_console_handler)
