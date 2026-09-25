"""Shared test helpers."""

from backend.app.settings import load_config


def config() -> dict:
    """The real config.json, so tests follow the business values."""
    return load_config()
