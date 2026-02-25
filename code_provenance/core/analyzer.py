"""Core analysis engine for Code Provenance."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

from code_provenance import __version__
from code_provenance.types import (
    AnalysisMetadata,
    Classification,
    ConfidenceLevel,
    DetectionSignal,
    FileMetadata,
    LineRange,
    ParsedCode,
    ScanResult,
    ScanSummary,
)
from code_provenance.parsers.parser import select_parser, is_binary_content
from code_provenance.core.segmenter import classify_windows, merge_windows
from code_provenance.core.confidence import overall_confidence_level
from code_provenance.detectors.entropy import entropy_detector
from code_provenance.detectors.comment_patterns import comment_patterns_detector
from code_provenance.detectors.naming_patterns import naming_patterns_detector
from code_provenance.detectors.structural import structural_detector
from code_provenance.detectors.model_signatures import (
    model_signatures_detector,
    score_claude_patterns,
    score_gpt_patterns,
    score_copilot_patterns,
    attribute_model,
)

# All registered detectors. New detectors are added here.
_detectors: list = [
    entropy_detector,
    comment_patterns_detector,
    naming_patterns_detector,
    structural_detector,
    model_signatures_detector,
]


def register_detector(detector) -> None:
    """Register an additional detector (e.g., model-signatures, ngram)."""
    _detectors.append(detector)


def analyze(file_path: str) -> ScanResult:
    """Analyze a single file for AI-generated code."""
    start_time = time.perf_counter()
    abs_path = str(Path(file_path).resolve())
    try:
        rel_path = str(Path(abs_path).relative_to(Path.cwd()))
    except ValueError:
        rel_path = abs_path

    # Read file
    try:
        content = Path(abs_path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as err:
        raise RuntimeError(f"Cannot read file: {abs_path} -- {err}") from err

    # Binary check
    if is_binary_content(content):
        raise RuntimeError(f"Binary file not supported: {rel_path}")

    # Empty file
    lines = content.split("\n")
    if not lines or content.strip() == "":
        return _empty_result(abs_path, rel_path, start_time)

    # Parse
    parser = select_parser(file_path)
    parsed: ParsedCode = parser.parse(content, file_path)

    # Run all detectors
    all_signals: list[DetectionSignal] = []
    for detector in _detectors:
        signals = detector.detect(parsed)
        all_signals.extend(signals)

    # Segment into windows and merge into line ranges
    windows = classify_windows(parsed.lines, all_signals)
    raw_ranges = merge_windows(windows, len(lines))

    # Attach model attribution to AI-generated ranges
    model_scores = [
        score_claude_patterns(parsed),
        score_gpt_patterns(parsed),
        score_copilot_patterns(parsed),
    ]
    attribution = attribute_model(model_scores)

    ranges: list[LineRange] = []
    for r in raw_ranges:
        if r.classification == Classification.AI_GENERATED and attribution:
            ranges.append(LineRange(
                start_line=r.start_line,
                end_line=r.end_line,
                classification=r.classification,
                confidence=r.confidence,
                model_attribution=attribution,
                signals=r.signals,
            ))
        else:
            ranges.append(r)

    # Compute summary
    summary = _compute_summary(ranges, len(lines))

    # Build metadata
    duration = round((time.perf_counter() - start_time) * 1000)
    metadata = _build_metadata(duration)

    file_meta = FileMetadata(
        path=abs_path,
        relative_path=rel_path,
        total_lines=len(lines),
        language=parsed.language,
        parser_used=parser.language,
    )

    return ScanResult(
        file=file_meta,
        ranges=tuple(ranges),
        summary=summary,
        metadata=metadata,
    )


def _compute_summary(ranges: tuple[LineRange, ...] | list[LineRange], total_lines: int) -> ScanSummary:
    """Compute scan summary from line ranges."""
    ai_lines = 0
    human_lines = 0
    unknown_lines = 0
    model_counts: dict[str, int] = {}

    for r in ranges:
        range_lines = r.end_line - r.start_line + 1
        if r.classification == Classification.AI_GENERATED:
            ai_lines += range_lines
        elif r.classification == Classification.HUMAN_WRITTEN:
            human_lines += range_lines
        else:
            unknown_lines += range_lines

        if r.model_attribution:
            model = r.model_attribution.model.value
            model_counts[model] = model_counts.get(model, 0) + range_lines

    total = ai_lines + human_lines + unknown_lines

    # Build range dicts for confidence calculation
    range_dicts = [
        {
            "confidence": r.confidence,
            "classification": r.classification.value,
            "start_line": r.start_line,
            "end_line": r.end_line,
        }
        for r in ranges
    ]

    return ScanSummary(
        ai_percentage=round(ai_lines / total * 100) if total > 0 else 0,
        human_percentage=round(human_lines / total * 100) if total > 0 else 0,
        unknown_percentage=round(unknown_lines / total * 100) if total > 0 else 0,
        overall_confidence=overall_confidence_level(range_dicts, total_lines),
        model_breakdown=model_counts,
    )


def _build_metadata(duration: int) -> AnalysisMetadata:
    """Build analysis metadata."""
    return AnalysisMetadata(
        tool_version=__version__,
        analyzed_at=datetime.now(timezone.utc).isoformat(),
        algorithm_versions={d.name: d.version for d in _detectors},
        thresholds={
            "entropyAiCeiling": 4.0,
            "entropyHumanFloor": 4.5,
            "aiScoreThreshold": 0.60,
            "humanScoreThreshold": 0.40,
            "sigmoidK": 10,
            "sigmoidMidpoint": 0.5,
        },
        duration=duration,
    )


def _empty_result(abs_path: str, rel_path: str, start_time: float) -> ScanResult:
    """Return result for empty files."""
    duration = round((time.perf_counter() - start_time) * 1000)
    return ScanResult(
        file=FileMetadata(
            path=abs_path,
            relative_path=rel_path,
            total_lines=0,
            language="unknown",
            parser_used="none",
        ),
        ranges=(),
        summary=ScanSummary(
            ai_percentage=0,
            human_percentage=0,
            unknown_percentage=0,
            overall_confidence=ConfidenceLevel.LOW,
            model_breakdown={},
        ),
        metadata=_build_metadata(duration),
    )
