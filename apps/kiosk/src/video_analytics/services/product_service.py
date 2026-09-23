# services/product_service.py


class ProductService:
    def __init__(self, db):
        self._db = db

    def get_categories(self) -> list:
        return self._db.get_categories()

    def get_products_by_category(self, category: str) -> list:
        return self._db.get_products_by_category(category)

    def get_product_by_id(self, product_id: int):
        return self._db.get_product_by_id(product_id)
