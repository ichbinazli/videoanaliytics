from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QImage, QPixmap
from PyQt6.QtWidgets import (
    QAbstractButton,
    QButtonGroup,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from video_analytics.core.constants import CATEGORY_DISPLAY_NAMES, IDLE_TIMEOUT_MS
from video_analytics.core.utils import get_project_root
from video_analytics.services.cart_service import CartService
from video_analytics.services.product_service import ProductService
from video_analytics.ui.video_thread import VideoThread


class MainWindow(QMainWindow):

    def __init__(
        self,
        product_service: ProductService,
        cart_service: CartService,
        video_thread: VideoThread,
        privacy_notice: str = "",
    ):
        super().__init__()
        self.product_service = product_service
        self.cart_service = cart_service
        self.video_thread = video_thread
        self.privacy_notice = privacy_notice
        self.project_root = get_project_root()

        self.init_ui()
        self.connect_signals()
        self.load_categories()

        self.idle_timer = QTimer(self)
        self.idle_timer.timeout.connect(self.show_idle_mode)
        self.idle_timer.start(IDLE_TIMEOUT_MS)
        self.is_idle = False

    def init_ui(self):
        self.setWindowTitle("Video Analitik Mirror")
        self.setMinimumSize(1200, 800)
        self.central_widget = QWidget(self)
        self.setCentralWidget(self.central_widget)
        self.main_layout = QVBoxLayout(self.central_widget)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(0)
        self.video_label = QLabel(self.central_widget)
        self.video_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.video_label.setStyleSheet("background-color: black;")
        self.video_label.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding
        )
        self.video_label.setScaledContents(False)
        self.overlay_widget = QWidget(self.central_widget)
        self.overlay_layout = QVBoxLayout(self.overlay_widget)
        self.overlay_layout.setContentsMargins(20, 20, 20, 20)
        self.top_h_layout = QHBoxLayout()
        self.top_h_layout.addStretch(1)
        self.combo_panel = QFrame()
        self.combo_panel.setObjectName("combo_panel")
        self.combo_panel.setFixedWidth(300)
        self.combo_layout = QVBoxLayout(self.combo_panel)
        self.combo_layout.setContentsMargins(15, 15, 15, 15)
        title_lbl = QLabel("ÜZERİMDEKİLER (Kombin)")
        title_lbl.setObjectName("combo_title")
        title_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.combo_layout.addWidget(title_lbl)
        self.combo_scroll = QScrollArea()
        self.combo_scroll.setWidgetResizable(True)
        self.combo_scroll.setStyleSheet("background: transparent; border: none;")
        self.combo_scroll.setHorizontalScrollBarPolicy(
            Qt.ScrollBarPolicy.ScrollBarAlwaysOff
        )
        self.combo_content = QWidget()
        self.combo_items_layout = QVBoxLayout(self.combo_content)
        self.combo_items_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.combo_items_layout.setSpacing(10)
        self.combo_scroll.setWidget(self.combo_content)
        self.combo_layout.addWidget(self.combo_scroll)
        self.total_price_label = QLabel("Toplam: 0.00 TL")
        self.total_price_label.setObjectName("combo_total")
        self.total_price_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.combo_layout.addWidget(self.total_price_label)
        self.btn_clear = QPushButton("Kombini Temizle")
        self.btn_clear.setObjectName("clear_all_btn")
        self.combo_layout.addWidget(self.btn_clear)
        self.btn_buy = QPushButton("Satın Al (QR)")
        self.btn_buy.setObjectName("checkout_btn")
        self.combo_layout.addWidget(self.btn_buy)
        self.top_h_layout.addWidget(self.combo_panel)
        self.overlay_layout.addLayout(self.top_h_layout, stretch=1)
        self.bottom_panel = QFrame()
        self.bottom_panel.setObjectName("bottomPanel")
        self.bottom_panel.setFixedHeight(260)
        self.bottom_layout = QVBoxLayout(self.bottom_panel)
        self.bottom_layout.setContentsMargins(20, 10, 20, 10)
        self.bottom_layout.setSpacing(10)
        self.category_layout = QHBoxLayout()
        self.category_layout.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.category_group = QButtonGroup(self)
        self.category_group.setExclusive(True)
        self.bottom_layout.addLayout(self.category_layout)
        self.gallery_scroll = QScrollArea()
        self.gallery_scroll.setWidgetResizable(True)
        self.gallery_scroll.setVerticalScrollBarPolicy(
            Qt.ScrollBarPolicy.ScrollBarAlwaysOff
        )
        self.gallery_scroll.setHorizontalScrollBarPolicy(
            Qt.ScrollBarPolicy.ScrollBarAsNeeded
        )
        self.gallery_content = QWidget()
        self.gallery_layout = QHBoxLayout(self.gallery_content)
        self.gallery_layout.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.gallery_layout.setContentsMargins(0, 5, 0, 5)
        self.gallery_layout.setSpacing(15)
        self.gallery_scroll.setWidget(self.gallery_content)
        self.product_group = QButtonGroup(self)
        self.product_group.setExclusive(False)
        self.bottom_layout.addWidget(self.gallery_scroll)
        self.overlay_layout.addWidget(self.bottom_panel)
        self.idle_widget = QWidget(self.central_widget)
        self.idle_widget.setStyleSheet("background-color: rgba(0, 0, 0, 200);")
        idle_layout = QVBoxLayout(self.idle_widget)
        promo_label = QLabel(
            "YENİ SEZON KOLEKSİYONUNU KEŞFET!\n\n"
            "Giydirme ekranına geçmek için aynaya yaklaşın."
        )
        promo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        promo_label.setStyleSheet(
            "color: white; font-size: 36px; font-weight: bold; background: transparent;"
        )
        idle_layout.addWidget(promo_label)
        privacy_label = QLabel(self.privacy_notice)
        privacy_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        privacy_label.setWordWrap(True)
        privacy_label.setStyleSheet(
            "color: #DDDDDD; font-size: 16px; padding: 20px; background: transparent;"
        )
        idle_layout.addWidget(privacy_label)
        self.idle_widget.hide()
        self.update_combo_ui()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.video_label.resize(self.width(), self.height())
        self.overlay_widget.resize(self.width(), self.height())
        self.idle_widget.resize(self.width(), self.height())

    def connect_signals(self):
        self.video_thread.change_pixmap_signal.connect(self.update_image)
        self.video_thread.info_signal.connect(self.handle_ai_info)
        self.category_group.buttonClicked.connect(self.on_category_changed)
        self.product_group.buttonClicked.connect(self.on_product_selected)
        self.btn_clear.clicked.connect(self.clear_combo)
        self.btn_buy.clicked.connect(self.show_buy_qr)

    def handle_ai_info(self, info: dict):
        if info.get("person_found", False):
            self.idle_timer.start(IDLE_TIMEOUT_MS)
            if self.is_idle:
                self.hide_idle_mode()

    def show_idle_mode(self):
        if not self.is_idle:
            self.is_idle = True
            self.overlay_widget.hide()
            self.idle_widget.show()
            self.idle_widget.raise_()

    def hide_idle_mode(self):
        if self.is_idle:
            self.is_idle = False
            self.idle_widget.hide()
            self.overlay_widget.show()

    def update_image(self, qt_img: QImage):
        scaled_img = qt_img.scaled(
            self.video_label.size(),
            Qt.AspectRatioMode.KeepAspectRatioByExpanding,
            Qt.TransformationMode.SmoothTransformation,
        )
        self.video_label.setPixmap(QPixmap.fromImage(scaled_img))

    def load_categories(self):
        categories = self.product_service.get_categories()
        first_btn = None
        for i, cat in enumerate(categories):
            btn = QPushButton(CATEGORY_DISPLAY_NAMES.get(cat, cat.capitalize()))
            btn.setProperty("categoryId", cat)
            btn.setCheckable(True)
            btn.setProperty("class", "categoryBtn")
            self.category_group.addButton(btn, i)
            self.category_layout.addWidget(btn)
            if i == 0:
                first_btn = btn
        self.category_layout.addStretch(1)
        if first_btn:
            first_btn.setChecked(True)
            self.on_category_changed(first_btn)

    def on_category_changed(self, button):
        cat_id = button.property("categoryId")
        self.load_products(cat_id)

    def load_products(self, category: str):
        while self.gallery_layout.count():
            child = self.gallery_layout.takeAt(0)
            if child is None:
                continue
            widget = child.widget()
            if widget is not None:
                if isinstance(widget, QAbstractButton):
                    self.product_group.removeButton(widget)
                widget.deleteLater()

        products = self.product_service.get_products_by_category(category)
        selected_in_cat = self.cart_service.get_selected_product_id(category)

        for p in products:
            btn = QPushButton()
            btn.setFixedSize(140, 160)
            btn.setCheckable(True)
            btn.setProperty("class", "productCard")
            btn.setProperty("productId", p.id)
            btn.setProperty("category", p.category)
            btn.setProperty("imagePath", p.image_path)

            card_layout = QVBoxLayout(btn)
            card_layout.setContentsMargins(5, 5, 5, 5)
            card_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

            img_label = QLabel()
            img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            full_path = self.project_root / p.image_path

            if full_path.exists():
                pixmap = QPixmap(str(full_path)).scaled(
                    100,
                    100,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
                img_label.setPixmap(pixmap)
            else:
                img_label.setText("Resim Yok")

            name_label = QLabel(p.name)
            name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            name_label.setWordWrap(True)
            name_label.setStyleSheet("color: white; font-size: 12px;")

            price_label = QLabel(f"{p.price} {p.currency}")
            price_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            price_label.setStyleSheet(
                "color: #00E5FF; font-weight: bold; font-size: 13px;"
            )

            card_layout.addWidget(img_label)
            card_layout.addWidget(name_label)
            card_layout.addWidget(price_label)

            self.product_group.addButton(btn)
            self.gallery_layout.addWidget(btn)

            if p.id == selected_in_cat:
                btn.setChecked(True)

    def on_product_selected(self, button):
        p_id = button.property("productId")
        cat = button.property("category")
        img_path = button.property("imagePath")
        full_path = self.project_root / img_path

        if not button.isChecked():
            self.remove_from_combo(cat)
            return

        for btn in self.product_group.buttons():
            if btn != button and btn.property("category") == cat:
                btn.setChecked(False)

        self.cart_service.add_item(cat, p_id)
        self.update_combo_ui()

        if not full_path.exists():
            return

        if cat in ("tshirt", "shirt", "jacket"):
            self.video_thread.set_garment("tshirt", str(full_path))
        elif cat == "glasses":
            self.video_thread.set_garment("glasses", str(full_path))
        elif cat == "pants":
            self.video_thread.set_garment("pants", str(full_path))

    def remove_from_combo(self, category: str):
        self.cart_service.remove_item(category)

        for btn in self.product_group.buttons():
            if btn.property("category") == category:
                btn.setChecked(False)

        self.update_combo_ui()

        if category in ("tshirt", "shirt", "jacket"):
            self.video_thread.clear_garment("tshirt")
        elif category == "glasses":
            self.video_thread.clear_garment("glasses")
        elif category == "pants":
            self.video_thread.clear_garment("pants")

    def update_combo_ui(self):
        while self.combo_items_layout.count():
            child = self.combo_items_layout.takeAt(0)
            if child is None:
                continue
            widget = child.widget()
            if widget is not None:
                widget.deleteLater()

        if self.cart_service.is_empty():
            empty_lbl = QLabel("Henüz ürün seçmediniz.")
            empty_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_lbl.setStyleSheet("color: #AAAAAA; padding: 20px;")
            self.combo_items_layout.addWidget(empty_lbl)
        else:
            for cat, p_id in self.cart_service.combo_items.items():
                p = self.product_service.get_product_by_id(p_id)
                if not p:
                    continue

                item_frame = QFrame()
                item_frame.setProperty("class", "combo_item_card")
                item_frame.setObjectName("combo_item_card")
                item_layout = QHBoxLayout(item_frame)
                item_layout.setContentsMargins(5, 5, 5, 5)

                img_lbl = QLabel()
                full_path = self.project_root / p.image_path
                if full_path.exists():
                    pixmap = QPixmap(str(full_path)).scaled(
                        40,
                        40,
                        Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.SmoothTransformation,
                    )
                    img_lbl.setPixmap(pixmap)

                info_layout = QVBoxLayout()
                name_lbl = QLabel(p.name)
                name_lbl.setObjectName("item_name")
                name_lbl.setWordWrap(True)
                price_lbl = QLabel(f"{p.price} {p.currency}")
                price_lbl.setObjectName("item_price")
                info_layout.addWidget(name_lbl)
                info_layout.addWidget(price_lbl)

                rm_btn = QPushButton("X")
                rm_btn.setProperty("class", "remove_btn")
                rm_btn.setObjectName("remove_btn")
                rm_btn.setFixedSize(24, 24)
                rm_btn.clicked.connect(lambda checked, c=cat: self.remove_from_combo(c))

                item_layout.addWidget(img_lbl)
                item_layout.addLayout(info_layout, stretch=1)
                item_layout.addWidget(rm_btn)
                self.combo_items_layout.addWidget(item_frame)

        self.combo_items_layout.addStretch(1)
        total_price = self.cart_service.calculate_total_price(self.product_service)
        self.total_price_label.setText(f"Toplam: {total_price:.2f} TL")

    def clear_combo(self):
        categories = list(self.cart_service.combo_items.keys())
        for cat in categories:
            self.remove_from_combo(cat)

    def show_buy_qr(self):
        if self.cart_service.is_empty():
            QMessageBox.warning(self, "Uyarı", "Sepetiniz boş. Lütfen önce ürün seçin!")
            return
        QMessageBox.information(
            self,
            "Satın Al",
            "QR Kod Telefonunuza Gönderiliyor...\n\n"
            "(Bu özellik Kiosk/POS entegrasyonu aşamasında aktif olacaktır.)",
        )

    def closeEvent(self, event):
        event.accept()
