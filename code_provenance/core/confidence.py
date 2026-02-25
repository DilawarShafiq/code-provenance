"""Confidence calibration and classification from raw scores."""

from __future__ import annotations

import math

from code_provenance.types import Classification, ConfidenceLevel

# Sigmoid calibration -- tuned so that:
# - Raw score 0.35+ maps to "ai-generated" territory
# - Raw score 0.20-0.35 maps to "unknown"
# - Raw score < 0.20 maps to "human-written"
SIGMOID_K = 8
SIGMOID_MIDPOINT = 0.40

# Classification thresholds on RAW score (before sigmoid)
AI_THRESHOLD = 0.42  # > 0.42 = ai-generated
HUMAN_THRESHOLD = 0.25  # < 0.25 = human-written


def calibrate_confidence(raw_score: float) -> int:
    """Map a raw 0-1 score through sigmoid to calibrated 0-100 confidence."""
    sigmoid = 1 / (1 + math.exp(-SIGMOID_K * (raw_score - SIGMOID_MIDPOINT)))
    return round(sigmoid * 100)


def classify_from_score(raw_score: float) -> Classification:
    """Classify based on raw score thresholds."""
    if raw_score >= AI_THRESHOLD:
        return Classification.AI_GENERATED
    if raw_score <= HUMAN_THRESHOLD:
        return Classification.HUMAN_WRITTEN
    return Classification.UNKNOWN


def overall_confidence_level(
    ranges: list[dict],
    total_lines: int,
) -> ConfidenceLevel:
    """Determine overall confidence level from line ranges.

    Args:
        ranges: List of dicts with 'confidence', 'classification',
                'start_line', 'end_line' keys.
        total_lines: Total number of lines in the file.
    """
    if not ranges:
        return ConfidenceLevel.LOW

    total_confidence = 0.0
    unknown_lines = 0

    for r in ranges:
        range_lines = r["end_line"] - r["start_line"] + 1
        total_confidence += r["confidence"] * range_lines
        if r["classification"] == "unknown":
            unknown_lines += range_lines

    avg_confidence = total_confidence / total_lines
    unknown_pct = unknown_lines / total_lines

    if avg_confidence > 65 and unknown_pct <= 0.20:
        return ConfidenceLevel.HIGH
    if avg_confidence >= 40 and unknown_pct <= 0.40:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW
