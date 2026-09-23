import pytest

from video_analytics.catalog.models import Product


@pytest.mark.parametrize(
    ("sizes", "expected"),
    [
        ("S,M,L", ["S", "M", "L"]),
        (" S, M, , XL ", ["S", "M", "XL"]),
        ("", []),
    ],
)
def test_size_list_cleans_comma_separated_values(sizes, expected):
    product = Product(sizes=sizes)

    assert product.size_list == expected


def test_category_display_returns_unknown_category_unchanged():
    product = Product(category="unknown")

    assert product.category_display == "unknown"


@pytest.mark.parametrize(
    ("category", "expected"),
    [
        ("tshirt", True),
        ("shirt", True),
        ("jacket", True),
        ("glasses", False),
        ("pants", False),
    ],
)
def test_is_upper_body_identifies_supported_categories(category, expected):
    product = Product(category=category)

    assert product.is_upper_body is expected


@pytest.mark.parametrize(
    ("category", "expected"),
    [
        ("glasses", True),
        ("tshirt", False),
    ],
)
def test_is_accessory_identifies_glasses(category, expected):
    product = Product(category=category)

    assert product.is_accessory is expected
