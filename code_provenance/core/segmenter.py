"""Window-based code segmentation and classification."""

from __future__ import annotations

from code_provenance.types import (
    Classification,
    DetectionSignal,
    LineRange,
    WindowClassification,
)
from code_provenance.core.confidence import calibrate_confidence, classify_from_score

WINDOW_SIZE = 20
WINDOW_STRIDE = 10
MIN_RANGE_LINES = 5


def _aggregate_signals(
    signals: list[DetectionSignal],
    start_line: int,
    end_line: int,
) -> tuple[float, list[DetectionSignal]]:
    """Aggregate signal strengths for a window into a raw AI score (0-1).

    Strategy: Take the MAX signal strength per detector (not average),
    then compute weighted sum across detectors. This prevents multiple
    weak signals from the same detector from diluting the score.

    Returns:
        Tuple of (score, relevant_signals).
    """
    relevant = [
        s for s in signals
        if s.location.start_line <= end_line and s.location.end_line >= start_line
    ]

    if not relevant:
        return 0.5, []

    # Detector weights
    weights: dict[str, float] = {
        "entropy": 0.30,
        "comment-patterns": 0.25,
        "naming-patterns": 0.20,
        "structural": 0.15,
        "model-signatures": 0.10,
    }

    # Group signals by detector, take max strength per detector
    # BUT track human-marker signals separately as a penalty
    detector_max: dict[str, float] = {}
    human_marker_penalty = 0.0

    for signal in relevant:
        # Human markers (strength 0) act as penalties, not contributors
        if signal.signal_type == "human-markers":
            human_marker_penalty = 0.5  # Strong penalty
            continue
        current = detector_max.get(signal.detector, 0)
        detector_max[signal.detector] = max(current, signal.strength)

    # Weighted sum using max-per-detector
    weighted_sum = 0.0
    total_weight = 0.0

    for detector, max_strength in detector_max.items():
        w = weights.get(detector, 0.10)
        weighted_sum += max_strength * w
        total_weight += w

    score = weighted_sum / total_weight if total_weight > 0 else 0.5

    # Apply human marker penalty -- reduces AI score significantly
    if human_marker_penalty > 0:
        score = score * (1 - human_marker_penalty)

    return score, relevant


def classify_windows(
    lines: tuple[str, ...],
    signals: list[DetectionSignal],
) -> list[WindowClassification]:
    """Classify code into overlapping windows."""
    windows: list[WindowClassification] = []

    start = 0
    while start < len(lines):
        end = min(start + WINDOW_SIZE, len(lines))
        start_line = start + 1  # 1-indexed
        end_line = end

        score, relevant_signals = _aggregate_signals(signals, start_line, end_line)
        confidence = calibrate_confidence(score)
        classification = classify_from_score(score)

        windows.append(WindowClassification(
            start_line=start_line,
            end_line=end_line,
            classification=classification,
            confidence=confidence,
            signals=tuple(relevant_signals),
        ))

        start += WINDOW_STRIDE

    return windows


def _finalize_range(
    start_line: int,
    end_line: int,
    classification: Classification,
    confidences: list[int],
    signals: list[DetectionSignal],
) -> LineRange:
    """Finalize a merged range with averaged confidence and deduplicated signals."""
    avg_confidence = round(sum(confidences) / len(confidences))

    # Deduplicate signals
    seen: set[str] = set()
    unique_signals: list[DetectionSignal] = []
    for s in signals:
        key = f"{s.detector}:{s.signal_type}:{s.location.start_line}"
        if key not in seen:
            seen.add(key)
            unique_signals.append(s)

    return LineRange(
        start_line=start_line,
        end_line=end_line,
        classification=classification,
        confidence=avg_confidence,
        model_attribution=None,  # Set later by model-signatures detector
        signals=tuple(unique_signals),
    )


def _absorb_tiny_ranges(ranges: list[LineRange], total_lines: int) -> list[LineRange]:
    """Absorb tiny ranges (< MIN_RANGE_LINES) into neighbors."""
    if len(ranges) <= 1:
        return ranges

    result: list[LineRange] = []
    for r in ranges:
        size = r.end_line - r.start_line + 1
        if size < MIN_RANGE_LINES and result:
            # Absorb into previous range
            prev = result[-1]
            result[-1] = LineRange(
                start_line=prev.start_line,
                end_line=r.end_line,
                classification=prev.classification,
                confidence=prev.confidence,
                model_attribution=prev.model_attribution,
                signals=prev.signals,
            )
        else:
            result.append(r)

    # Ensure ranges cover the full file
    if result:
        first = result[0]
        result[0] = LineRange(
            start_line=1,
            end_line=first.end_line,
            classification=first.classification,
            confidence=first.confidence,
            model_attribution=first.model_attribution,
            signals=first.signals,
        )
        last = result[-1]
        result[-1] = LineRange(
            start_line=last.start_line,
            end_line=total_lines,
            classification=last.classification,
            confidence=last.confidence,
            model_attribution=last.model_attribution,
            signals=last.signals,
        )

    return result


def merge_windows(
    windows: list[WindowClassification],
    total_lines: int,
) -> list[LineRange]:
    """Merge adjacent windows with the same classification into line ranges.

    Discards ranges smaller than MIN_RANGE_LINES.
    """
    if not windows:
        return [LineRange(
            start_line=1,
            end_line=total_lines,
            classification=Classification.UNKNOWN,
            confidence=0,
            model_attribution=None,
            signals=(),
        )]

    merged: list[LineRange] = []

    # Current accumulator
    cur_start = windows[0].start_line
    cur_end = windows[0].end_line
    cur_class = windows[0].classification
    cur_confidences = [windows[0].confidence]
    cur_signals: list[DetectionSignal] = list(windows[0].signals)

    for w in windows[1:]:
        if w.classification == cur_class:
            # Extend current range
            cur_end = w.end_line
            cur_confidences.append(w.confidence)
            cur_signals.extend(w.signals)
        else:
            # Flush current range
            merged.append(_finalize_range(
                cur_start, cur_end, cur_class, cur_confidences, cur_signals,
            ))
            cur_start = w.start_line
            cur_end = w.end_line
            cur_class = w.classification
            cur_confidences = [w.confidence]
            cur_signals = list(w.signals)

    # Flush last range
    merged.append(_finalize_range(
        cur_start, cur_end, cur_class, cur_confidences, cur_signals,
    ))

    # Post-process: absorb tiny ranges into neighbors
    return _absorb_tiny_ranges(merged, total_lines)
