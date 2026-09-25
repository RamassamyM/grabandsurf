"""Settings: business values from config.json, secrets and switches from .env and the environment."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
log = logging.getLogger(__name__)

# New variable names first, then the legacy ones (README of the first prototype).
ENV_ALIASES = {
    "OPERATOR_KEY": ["OPERATOR_KEY", "KORKO_CLE_OPERATEUR"],
    "CONTRACT_ADDRESS": ["CONTRACT_ADDRESS", "KORKO_CONTRAT"],
    "CHAIN_MODE": ["CHAIN_MODE", "KORKO_MODE"],
    "RPC_URL": ["RPC_URL", "KORKO_RPC"],
    "CHAIN_ID": ["CHAIN_ID", "KORKO_CHAIN_ID"],
    "EXPLORER_URL": ["EXPLORER_URL", "KORKO_EXPLORATEUR"],
}


def read_env_file(path: Path) -> dict[str, str]:
    """Parse a .env file without ever printing it."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split(" #", 1)[0].strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if value:
                values[key.strip()] = value
    return values


def merged_env(env_file: Path | None = None) -> dict[str, str]:
    """.env values overridden by the process environment."""
    values = read_env_file(env_file or ROOT / ".env")
    values.update({k: v for k, v in os.environ.items() if v})
    return values


def env_get(env: dict[str, str], name: str, default: str = "") -> str:
    """Read a variable under its new name or any legacy alias."""
    for alias in ENV_ALIASES.get(name, [name]):
        if env.get(alias):
            return env[alias]
    return default


def normalize_chain_mode(raw: str) -> str:
    """Map legacy and new values to auto, team, personal, fake or off."""
    raw = (raw or "auto").strip().lower()
    return {"equipe": "team", "équipe": "team", "perso": "personal",
            "simulation": "fake"}.get(raw, raw)


@dataclass
class Settings:
    config: dict[str, Any]
    database_url: str
    data_dir: Path
    chain_mode: str = "auto"
    secret_key: str = "dev-only-secret"
    operator_pin: str = ""
    demo_mode: bool = True
    alarm_sound: bool = True
    frontend_dist: Path = ROOT / "frontend" / "dist"
    env: dict[str, str] = field(default_factory=dict)


def load_config(path: Path | None = None) -> dict[str, Any]:
    """Business values (prices in cents, timers in flow seconds)."""
    with open(path or ROOT / "config.json", encoding="utf-8") as f:
        return json.load(f)


def load_settings(**overrides: Any) -> Settings:
    """Build settings from config.json, .env and the environment; keyword overrides win."""
    env = merged_env()
    data_dir = Path(env.get("DATA_DIR", str(ROOT / "data")))
    secret = overrides.get("secret_key") or env.get("SECRET_KEY", "")
    if not secret:
        log.warning("SECRET_KEY missing from .env: using a development key")
        secret = "dev-only-secret"
    values: dict[str, Any] = dict(
        config=load_config(Path(env["CONFIG_PATH"]) if env.get("CONFIG_PATH") else None),
        database_url=env.get("DATABASE_URL", "sqlite:///%s" % (data_dir / "grabandsurf.db")),
        data_dir=data_dir,
        chain_mode=normalize_chain_mode(env_get(env, "CHAIN_MODE", "auto")),
        secret_key=secret,
        operator_pin=env.get("OPERATOR_PIN", ""),
        demo_mode=env.get("DEMO_MODE", "1") not in ("0", "false", "no"),
        alarm_sound=env.get("ALARM_SOUND", "1") not in ("0", "false", "no"),
        env=env,
    )
    values.update(overrides)
    return Settings(**values)
