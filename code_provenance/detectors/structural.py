"""Structural pattern detector for AI-generated code."""

from __future__ import annotations

import math
import re

from code_provenance.types import DetectionSignal, Location, ParsedCode

AI_IMPORT_SORT_THRESHOLD = 0.95  # AI alphabetizes > 95% (stricter)
AI_FUNC_CV_THRESHOLD = 0.25  # AI functions have CV < 0.25 (stricter)
AI_TRY_CATCH_THRESHOLD = 0.70  # AI wraps > 70% in try/catch

# Human-written code markers -- reduce AI signal when present
HUMAN_MARKERS = [
    re.compile(r"\bHACK\b"),
    re.compile(r"\bFIXME\b"),
    re.compile(r"\bXXX\b"),
    re.compile(r"\bTODO\b.*:"),  # TODO with description (not just "TODO")
    re.compile(r"@ts-expect-error"),
    re.compile(r"@ts-ignore"),
    re.compile(r"\bworkaround\b", re.IGNORECASE),
    re.compile(r"\bkludge\b", re.IGNORECASE),
    re.compile(r"\bnot production\b", re.IGNORECASE),
    re.compile(r"\bquick & dirty\b", re.IGNORECASE),
    re.compile(r"\bdead simple\b", re.IGNORECASE),
    re.compile(r"\bat \$\w+"),  # "at $DAYJOB" type references
    re.compile(r"\bgrabbed this\b", re.IGNORECASE),
    re.compile(r"\bfound by ear\b", re.IGNORECASE),
]


def _whitespace_consistency(lines: tuple[str, ...]) -> float:
    """Measure whitespace consistency. AI is perfectly consistent."""
    spaces = 0
    tabs = 0
    mixed = 0

    for line in lines:
        if not line or not line.strip():
            continue
        match = re.match(r"^(\s+)", line)
        if not match:
            continue
        ws = match.group(1)
        if "\t" in ws and " " in ws:
            mixed += 1
        elif "\t" in ws:
            tabs += 1
        else:
            spaces += 1

    total = spaces + tabs + mixed
    if total < 5:
        return 0.5
    # Perfect consistency = high AI signal
    return max(spaces, tabs) / total


def _import_sort_percentage(imports: tuple) -> float:
    """Check what percentage of imports are alphabetically sorted."""
    if len(imports) < 3:
        return 0.5  # Need at least 3 imports to judge
    sorted_count = 0
    for i in range(1, len(imports)):
        if imports[i].source >= imports[i - 1].source:
            sorted_count += 1
    return sorted_count / (len(imports) - 1)


def _function_length_cv(functions: tuple) -> float:
    """Calculate coefficient of variation for function lengths."""
    if len(functions) < 3:
        return 0.5  # Need 3+ functions
    lengths = [f.line_count for f in functions]
    mean = sum(lengths) / len(lengths)
    if mean == 0:
        return 0.5
    variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
    return math.sqrt(variance) / mean


def _try_catch_ratio(functions: tuple) -> float:
    """Calculate ratio of functions with error handling."""
    if not functions:
        return 0.0
    return sum(1 for f in functions if f.has_error_handling) / len(functions)


class StructuralDetector:
    """Detects AI-generated code through structural pattern analysis."""

    @property
    def name(self) -> str:
        return "structural"

    @property
    def version(self) -> str:
        return "1.0.0"

    def detect(self, code: ParsedCode) -> list[DetectionSignal]:
        signals: list[DetectionSignal] = []
        lines = code.lines
        imports = code.imports
        functions = code.functions
        comments = code.comments

        # 0. Human markers -- if found, emit a strong NEGATIVE signal
        full_text = "\n".join(lines)
        human_marker_count = 0
        for marker in HUMAN_MARKERS:
            if marker.search(full_text):
                human_marker_count += 1

        if human_marker_count > 0:
            # Negative signal: strength 0 = strong human indicator
            signals.append(DetectionSignal(
                detector="structural",
                signal_type="human-markers",
                strength=0.0,  # Zero = human
                location=Location(start_line=1, end_line=len(lines)),
                description=(
                    f"{human_marker_count} human code markers "
                    f"(HACK, FIXME, workarounds, informal comments)"
                ),
            ))

        # 1. Import organization
        if len(imports) >= 3:
            sort_pct = _import_sort_percentage(imports)
            sort_strength = (
                min(1.0, (sort_pct - AI_IMPORT_SORT_THRESHOLD) / 0.05)
                if sort_pct > AI_IMPORT_SORT_THRESHOLD
                else 0.0
            )

            ai_note = " (AI-typical perfect ordering)" if sort_pct > AI_IMPORT_SORT_THRESHOLD else ""
            signals.append(DetectionSignal(
                detector="structural",
                signal_type="import-organization",
                strength=sort_strength,
                location=Location(
                    start_line=imports[0].line,
                    end_line=imports[-1].line,
                ),
                description=f"Imports {sort_pct * 100:.0f}% alphabetically sorted{ai_note}",
            ))

        # 2. Function length uniformity
        if len(functions) >= 3:
            cv = _function_length_cv(functions)
            cv_strength = (
                min(1.0, (AI_FUNC_CV_THRESHOLD - cv) / AI_FUNC_CV_THRESHOLD)
                if cv < AI_FUNC_CV_THRESHOLD
                else 0.0
            )

            lengths = [f.line_count for f in functions]
            avg_len = sum(lengths) / len(lengths)

            ai_note = " -- AI generates uniform-length functions" if cv < AI_FUNC_CV_THRESHOLD else ""
            signals.append(DetectionSignal(
                detector="structural",
                signal_type="function-length-uniformity",
                strength=cv_strength,
                location=Location(start_line=1, end_line=len(lines)),
                description=f"Function length CV={cv:.2f} (avg {avg_len:.0f} lines){ai_note}",
            ))

        # 3. Error handling patterns
        if len(functions) >= 3:
            tc_ratio = _try_catch_ratio(functions)
            tc_strength = (
                min(1.0, (tc_ratio - AI_TRY_CATCH_THRESHOLD) / 0.30)
                if tc_ratio > AI_TRY_CATCH_THRESHOLD
                else 0.0
            )

            ai_note = " (AI wraps everything in error handling)" if tc_ratio > AI_TRY_CATCH_THRESHOLD else ""
            signals.append(DetectionSignal(
                detector="structural",
                signal_type="error-handling-style",
                strength=tc_strength,
                location=Location(start_line=1, end_line=len(lines)),
                description=f"{tc_ratio * 100:.0f}% of functions use try/catch{ai_note}",
            ))

        # 4. Whitespace consistency
        ws_consistency = _whitespace_consistency(lines)
        if ws_consistency > 0.98 and len(lines) > 20:
            signals.append(DetectionSignal(
                detector="structural",
                signal_type="whitespace-consistency",
                strength=0.6,
                location=Location(start_line=1, end_line=len(lines)),
                description=f"{ws_consistency * 100:.0f}% whitespace consistency -- AI is unnaturally uniform",
            ))

        return signals


structural_detector = StructuralDetector()
