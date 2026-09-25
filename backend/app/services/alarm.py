"""Theft alarm: sound on the demo computer (the Pi buzzer is driven by the station)."""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys

log = logging.getLogger(__name__)

SOUNDS = [
    ["afplay", "/System/Library/Sounds/Sosumi.aiff"],                # macOS
    ["paplay", "/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga"],  # Linux
]


class Alarm:
    """Records every ring; plays a sound when enabled."""

    def __init__(self, sound: bool = True) -> None:
        self.sound = sound
        self.rings: list[tuple[str, str]] = []

    def ring(self, board_id: str, station: str) -> None:
        self.rings.append((board_id, station))
        log.warning("ALARM: %s left station %s without a rental", board_id, station)
        if not self.sound:
            return
        for cmd in SOUNDS:
            if shutil.which(cmd[0]):
                try:
                    subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    return
                except OSError:
                    continue
        sys.stderr.write("\a")
        sys.stderr.flush()
