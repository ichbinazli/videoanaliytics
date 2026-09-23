from dataclasses import dataclass
from typing import List


@dataclass
class Product:
    id: int = 0
    name: str = ""
    category: str = "tshirt"
    price: float = 0.0
    currency: str = "TL"
    color: str = ""
    sizes: str = "S,M,L,XL"
    image_path: str = ""
    thumbnail_path: str = ""
    brand: str = ""
    description: str = ""
    in_stock: bool = True
    sku: str = ""

    @property
    def size_list(self) -> List[str]:
        return [s.strip() for s in self.sizes.split(",") if s.strip()]

    @property
    def category_display(self) -> str:
        display_names = {
            "tshirt": "Tişört",
            "shirt": "Gömlek",
            "jacket": "Ceket",
            "glasses": "Gözlük",
            "pants": "Pantolon",
        }
        return display_names.get(self.category, self.category)

    @property
    def is_accessory(self) -> bool:
        return self.category == "glasses"

    @property
    def is_upper_body(self) -> bool:
        return self.category in ("tshirt", "shirt", "jacket")
