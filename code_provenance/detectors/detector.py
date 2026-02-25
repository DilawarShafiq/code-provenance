"""Detector registry for Code Provenance."""

from __future__ import annotations

from code_provenance.types import Detector


def create_detector_registry() -> list[Detector]:
    """Create an empty detector registry.

    Registry of all active detectors.
    Populated by the analyzer -- detectors are registered at startup.
    """
    return []
