"""Compatibility entry point for safe ID-based headshot discovery."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("sync-player-headshots.py")), run_name="__main__")
