# services/cart_service.py


class CartService:
    def __init__(self):
        # category -> product_id
        self._combo_items = {}

    @property
    def combo_items(self) -> dict:
        return dict(self._combo_items)

    def add_item(self, category: str, product_id: int):
        self._combo_items[category] = product_id

    def remove_item(self, category: str) -> bool:
        if category in self._combo_items:
            del self._combo_items[category]
            return True
        return False

    def clear(self):
        self._combo_items.clear()

    def get_selected_product_id(self, category: str) -> int:
        return self._combo_items.get(category, -1)

    def is_empty(self) -> bool:
        return len(self._combo_items) == 0

    def calculate_total_price(self, product_service) -> float:
        total = 0.0
        for p_id in self._combo_items.values():
            product = product_service.get_product_by_id(p_id)
            if product:
                total += float(product.price)
        return total
