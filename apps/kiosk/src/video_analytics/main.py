import argparse
import logging
import os
import signal
import sys
import warnings

os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["ABSL_LOG_LEVEL"] = "3"

warnings.filterwarnings("ignore")

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import QApplication

from video_analytics.catalog.database import ProductDatabase
from video_analytics.core.camera import CameraManager
from video_analytics.core.config_loader import load_config
from video_analytics.core.logger import setup_logger
from video_analytics.core.pipeline import MirrorPipeline
from video_analytics.core.utils import get_project_root
from video_analytics.services.cart_service import CartService
from video_analytics.services.product_service import ProductService
from video_analytics.ui.main_window import MainWindow
from video_analytics.ui.video_thread import VideoThread

logger = logging.getLogger(__name__)
logging.getLogger("tensorflow").setLevel(logging.ERROR)

PROJECT_ROOT = str(get_project_root())
PKG_DIR = os.path.dirname(os.path.abspath(__file__))

logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="Video Analitik Mirror")
    parser.add_argument("--config", default=None)
    parser.add_argument("--demo", action="store_true")
    return parser.parse_args()


def load_stylesheet(app: QApplication):
    qss_path = os.path.join(PKG_DIR, "ui", "style.qss")
    if not os.path.exists(qss_path):
        qss_path = os.path.join(
            PROJECT_ROOT, "src", "video_analytics", "ui", "style.qss"
        )
    if not os.path.exists(qss_path):
        qss_path = os.path.join(PROJECT_ROOT, "ui", "style.qss")

    if os.path.exists(qss_path):
        with open(qss_path, "r", encoding="utf-8") as f:
            app.setStyleSheet(f.read())


def main():
    setup_logger()
    args = parse_args()
    config = load_config(args.config)
    catalog_cfg = config.catalog
    db_path = catalog_cfg.database_path
    if not os.path.isabs(db_path):
        pkg_db = os.path.join(PKG_DIR, db_path)
        db_path = (
            pkg_db
            if os.path.exists(os.path.dirname(pkg_db))
            else os.path.join(PROJECT_ROOT, db_path)
        )

    db = ProductDatabase(db_path=db_path)
    db.initialize()
    privacy_cfg = config.privacy
    deleted_records = db.delete_analytics_older_than(privacy_cfg.retention_days)
    if deleted_records:
        logger.info("Saklama süresi dolan %d analytics kaydı silindi.", deleted_records)
    if args.demo and db.product_count() == 0:
        db.seed_demo_products()
    # Servis katmanlarının başlatılması
    product_service = ProductService(db)
    cart_service = CartService()
    cam_cfg = config.camera
    camera = CameraManager(
        device_id=cam_cfg.device_id,
        width=cam_cfg.width,
        height=cam_cfg.height,
        flip_horizontal=cam_cfg.flip_horizontal,
        warmup_seconds=cam_cfg.warmup_seconds,
    )

    if not camera.start():
        db.close()
        sys.exit(1)

    pipeline = MirrorPipeline(config, db=db)
    pipeline.initialize()
    tshirts = product_service.get_products_by_category("tshirt")
    if tshirts and tshirts[0].image_path:
        pipeline.load_garment(
            "tshirt", os.path.join(PROJECT_ROOT, tshirts[0].image_path)
        )
    glasses = product_service.get_products_by_category("glasses")
    if glasses and glasses[0].image_path:
        img_p = os.path.join(PKG_DIR, glasses[0].image_path)
        if not os.path.exists(img_p):
            img_p = os.path.join(PROJECT_ROOT, glasses[0].image_path)
        pipeline.load_garment("glasses", img_p)

    app = QApplication(sys.argv)
    if hasattr(Qt.ApplicationAttribute, "AA_UseHighDpiPixmaps"):
        app.setAttribute(Qt.ApplicationAttribute.AA_UseHighDpiPixmaps)

    load_stylesheet(app)

    # Signal handler: Ctrl+C / kill ile düzgün kapanma
    def _signal_handler(sig, frame):
        logger.info("Sinyal alındı (%s), kapatılıyor...", signal.Signals(sig).name)
        app.quit()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    # QTimer trick: Qt event loop içinde Python sinyallerinin işlenmesine izin ver
    timer = QTimer()
    timer.timeout.connect(lambda: None)
    timer.start(200)

    logger.info("=======================================")
    logger.info("Video Analitik Sistemi Başlatıldı")
    logger.info("=======================================")

    video_thread = VideoThread(camera, pipeline)
    video_thread.start()
    main_window = MainWindow(
        product_service,
        cart_service,
        video_thread,
        privacy_notice=privacy_cfg.notice,
    )
    kiosk_cfg = config.kiosk
    if kiosk_cfg.fullscreen:
        main_window.showFullScreen()
        app.setOverrideCursor(Qt.CursorShape.BlankCursor)
    else:
        main_window.show()

    try:
        exit_code = app.exec()
    finally:
        logger.info("Sistem kapatılıyor...")
        video_thread.stop()
        pipeline.shutdown()
        camera.stop()
        db.close()
        logger.info("=======================================")
        logger.info("Video Analitik Sistemi Kapatıldı.")
        logger.info("=======================================")

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
