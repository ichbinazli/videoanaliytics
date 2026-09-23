# core/utils.py

from pathlib import Path


def get_project_root() -> Path:
    """Projenin kök dizinini döndürür."""
    return Path(__file__).resolve().parent.parent
