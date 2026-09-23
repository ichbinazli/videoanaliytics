import unittest
from unittest.mock import MagicMock

from video_analytics.services.cart_service import CartService


class TestCartService(unittest.TestCase):

    def test_add_and_get_item(self):
        cart = CartService()
        cart.add_item("tshirt", 101)
        self.assertEqual(cart.get_selected_product_id("tshirt"), 101)
        self.assertFalse(cart.is_empty())

    def test_remove_item(self):
        cart = CartService()
        cart.add_item("tshirt", 101)
        removed = cart.remove_item("tshirt")
        self.assertTrue(removed)
        self.assertTrue(cart.is_empty())

    def test_calculate_total_price(self):
        cart = CartService()
        cart.add_item("tshirt", 101)
        cart.add_item("pants", 102)

        # Mock ProductService
        mock_product_service = MagicMock()
        mock_product_service.get_product_by_id.side_effect = lambda p_id: {
            101: MagicMock(price=150.0),
            102: MagicMock(price=250.0),
        }.get(p_id)

        total = cart.calculate_total_price(mock_product_service)
        self.assertEqual(total, 400.0)

    def test_clear_cart(self):
        cart = CartService()
        cart.add_item("tshirt", 101)
        cart.clear()
        self.assertTrue(cart.is_empty())


if __name__ == "__main__":
    unittest.main()
