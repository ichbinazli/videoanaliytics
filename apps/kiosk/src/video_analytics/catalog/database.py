import logging
import os
import sqlite3
import threading
from typing import List, Optional

from video_analytics.catalog.models import Product

logger = logging.getLogger(__name__)


class ProductDatabase:

    def __init__(self, db_path: str = "catalog/video_analitik_products.db"):
        self._db_path = db_path
        db_dir = os.path.dirname(db_path)
        if db_dir and (not os.path.exists(db_dir)):
            os.makedirs(db_dir, exist_ok=True)
        self._conn: Optional[sqlite3.Connection] = None
        self._lock = threading.Lock()

    def _get_connection(self) -> sqlite3.Connection:
        if self._conn is None:
            raise RuntimeError("Database must be initialized before use")
        return self._conn

    def initialize(self):
        with self._lock:
            if self._conn is None:
                # Main thread GUI'yi yönetirken video thread de
                # analiz sırasında DB okumaları yapar.
                # Aynı bağlantının farklı thread'lerde kullanılabilmesi için
                # check_same_thread=False gereklidir.
                self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
                self._conn.row_factory = sqlite3.Row

            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("PRAGMA user_version;")
            current_version = cursor.fetchone()[0]

            if current_version == 0:
                # Tabloları Oluştur
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS products (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        category TEXT NOT NULL DEFAULT 'tshirt',
                        price REAL DEFAULT 0.0,
                        currency TEXT DEFAULT 'TL',
                        color TEXT DEFAULT '',
                        sizes TEXT DEFAULT 'S,M,L,XL',
                        image_path TEXT DEFAULT '',
                        thumbnail_path TEXT DEFAULT '',
                        brand TEXT DEFAULT '',
                        description TEXT DEFAULT '',
                        in_stock INTEGER DEFAULT 1,
                        sku TEXT DEFAULT '',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    """)

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS analytics (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
                        session_duration_sec INTEGER DEFAULT 0,
                        total_persons_passed INTEGER DEFAULT 0,
                        total_persons_looked INTEGER DEFAULT 0,
                        main_user_age INTEGER NULL,
                        main_user_gender TEXT NULL,
                        main_user_emotion TEXT NULL,
                        total_looking_seconds REAL DEFAULT 0
                    );
                    """)

                # v0 → v1 migration: Eski DB'lerde
                # total_looking_seconds kolonu eksik olabilir.
                cols = [
                    row[1]
                    for row in cursor.execute(
                        "PRAGMA table_info(analytics);"
                    ).fetchall()
                ]
                if cols and "total_looking_seconds" not in cols:
                    cursor.execute("""
                        ALTER TABLE analytics
                        ADD COLUMN total_looking_seconds REAL DEFAULT 0;
                        """)
                    logger.info(
                        "Migration: analytics.total_looking_seconds kolonu eklendi."
                    )

                # İndeks yoksa oluştur
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_products_category
                    ON products(category);
                    """)

                cursor.execute("PRAGMA user_version = 1;")
                conn.commit()
                logger.info("Veritabani v1 migration / baslatma tamamlandi.")

    def log_analytics(self, session_data: dict):
        with self._lock:
            conn = self._get_connection()
            conn.execute(
                """
                INSERT INTO analytics (
                    session_duration_sec,
                    total_persons_passed,
                    total_persons_looked,
                    total_looking_seconds,
                    main_user_age,
                    main_user_gender,
                    main_user_emotion
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_data.get("duration", 0),
                    session_data.get("passed", 0),
                    session_data.get("looked", 0),
                    session_data.get("looking_seconds", 0),
                    session_data.get("age", None),
                    session_data.get("gender", None),
                    session_data.get("emotion", None),
                ),
            )
            conn.commit()

    def delete_analytics_older_than(self, retention_days: int) -> int:
        """Delete analytics records older than the configured retention period."""
        if retention_days < 0:
            raise ValueError("retention_days cannot be negative")

        with self._lock:
            conn = self._get_connection()
            cursor = conn.execute(
                """
                DELETE FROM analytics
                WHERE session_start < datetime('now', ?)
                """,
                (f"-{retention_days} days",),
            )
            conn.commit()
            return cursor.rowcount

    def add_product(self, product: Product) -> int:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.execute(
                """
                INSERT INTO products (
                    name, category, price, currency, color, sizes,
                    image_path, thumbnail_path, brand, description,
                    in_stock, sku
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    product.name,
                    product.category,
                    product.price,
                    product.currency,
                    product.color,
                    product.sizes,
                    product.image_path,
                    product.thumbnail_path,
                    product.brand,
                    product.description,
                    1 if product.in_stock else 0,
                    product.sku,
                ),
            )
            conn.commit()
            if cursor.lastrowid is None:
                raise RuntimeError("Database did not return a product id")
            return cursor.lastrowid

    def get_all_products(self) -> List[Product]:
        with self._lock:
            cursor = self._get_connection().execute("""
                SELECT * FROM products
                ORDER BY category, name
                """)
            return [self._row_to_product(row) for row in cursor.fetchall()]

    def get_products_by_category(self, category: str) -> List[Product]:
        with self._lock:
            cursor = self._get_connection().execute(
                """
                SELECT * FROM products
                WHERE category = ?
                ORDER BY name
                """,
                (category,),
            )
            return [self._row_to_product(row) for row in cursor.fetchall()]

    def get_product_by_id(self, product_id: int) -> Optional[Product]:
        with self._lock:
            cursor = self._get_connection().execute(
                """
                SELECT * FROM products
                WHERE id = ?
                """,
                (product_id,),
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_product(row)
            return None

    def update_product(self, product: Product) -> bool:
        with self._lock:
            conn = self._get_connection()
            conn.execute(
                """
                UPDATE products SET
                    name = ?, category = ?, price = ?, currency = ?,
                    color = ?, sizes = ?, image_path = ?,
                    thumbnail_path = ?, brand = ?, description = ?,
                    in_stock = ?, sku = ?
                WHERE id = ?
                """,
                (
                    product.name,
                    product.category,
                    product.price,
                    product.currency,
                    product.color,
                    product.sizes,
                    product.image_path,
                    product.thumbnail_path,
                    product.brand,
                    product.description,
                    1 if product.in_stock else 0,
                    product.sku,
                    product.id,
                ),
            )
            conn.commit()
            return True

    def delete_product(self, product_id: int) -> bool:
        with self._lock:
            conn = self._get_connection()
            conn.execute(
                """
                DELETE FROM products
                WHERE id = ?
                """,
                (product_id,),
            )
            conn.commit()
            return True

    def get_categories(self) -> List[str]:
        with self._lock:
            cursor = self._get_connection().execute("""
                SELECT DISTINCT category
                FROM products
                ORDER BY category
                """)
            return [row["category"] for row in cursor.fetchall()]

    def product_count(self) -> int:
        with self._lock:
            cursor = self._get_connection().execute("""
                SELECT COUNT(*) as cnt
                FROM products
                """)
            return cursor.fetchone()["cnt"]

    def seed_demo_products(self):
        """Dışarıdan çağrılır (ör. main.py --demo). Lock alarak seed yapar."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as cnt FROM products;")
            if cursor.fetchone()["cnt"] == 0:
                self._seed_demo_products_internal(cursor)
                conn.commit()
                logger.info("Demo urunler eklendi.")

    def _seed_demo_products_internal(self, cursor):
        """Kilit zaten tutuluyorken doğrudan SQL ile seed yapar.
        add_product çağırmaz — deadlock önlenir."""
        demos = [
            (
                "Video Analitik Kırmızı Ceket",
                "jacket",
                899.9,
                "TL",
                "Kırmızı",
                "S,M,L,XL",
                "catalog/product_images/shirt.png",
                "",
                "Video Analitik",
                "Sportif kırmızı ceket",
                1,
                "",
            ),
            (
                "Klasik Beyaz Tişört",
                "tshirt",
                199.9,
                "TL",
                "Beyaz",
                "S,M,L,XL,XXL",
                "catalog/product_images/tisort.png",
                "",
                "Video Analitik",
                "",
                1,
                "",
            ),
            (
                "Spor Tişört",
                "tshirt",
                249.9,
                "TL",
                "Siyah",
                "S,M,L,XL",
                "catalog/product_images/tisort1.png",
                "",
                "Video Analitik",
                "",
                1,
                "",
            ),
            (
                "Aviator Güneş Gözlüğü",
                "glasses",
                249.9,
                "TL",
                "Siyah",
                "Tek Beden",
                "catalog/product_images/gozluk.png",
                "",
                "Video Analitik",
                "",
                1,
                "",
            ),
            (
                "Denim Kot Pantolon",
                "pants",
                1599.99,
                "TL",
                "Mavi",
                "30,32,34",
                "catalog/product_images/pants1.png",
                "",
                "Video Analitik",
                "",
                1,
                "",
            ),
        ]
        cursor.executemany(
            """
            INSERT INTO products (
                name, category, price, currency, color, sizes,
                image_path, thumbnail_path, brand, description,
                in_stock, sku
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            demos,
        )

    @staticmethod
    def _row_to_product(row) -> Product:
        return Product(
            id=row["id"],
            name=row["name"],
            category=row["category"],
            price=row["price"],
            currency=row["currency"],
            color=row["color"],
            sizes=row["sizes"],
            image_path=row["image_path"],
            thumbnail_path=row["thumbnail_path"],
            brand=row["brand"],
            description=row["description"],
            in_stock=bool(row["in_stock"]),
            sku=row["sku"],
        )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    def close(self):
        with self._lock:
            if self._conn:
                self._conn.close()
                self._conn = None
                logger.info("Veritabani baglantisi kapatildi.")
