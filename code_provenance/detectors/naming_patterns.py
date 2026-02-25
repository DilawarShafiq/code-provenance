"""Naming pattern detector for AI-generated code."""

from __future__ import annotations

import re

from code_provenance.types import DetectionSignal, Location, ParsedCode

# Generic identifier names commonly used by AI models.
GENERIC_NAMES = frozenset([
    "data", "result", "response", "value", "item", "element",
    "temp", "info", "output", "input", "config", "options",
    "params", "handler", "callback",
    "accumulator", "current", "previous",
    "text", "content", "payload", "source", "target",
    "numbers", "items", "results", "values", "entries",
    "words", "tokens", "chunks",
    "pattern", "flag", "mode",
])

# Single-letter names (common in human code, not penalized)
SINGLE_LETTER = re.compile(r"^[a-z_]$", re.IGNORECASE)

# Common language built-ins to exclude
BUILTINS = frozenset([
    "console", "process", "window", "document", "module", "exports",
    "require", "import", "export", "default", "undefined", "null",
    "true", "false", "this", "self", "super",
])

AI_GENERIC_THRESHOLD = 0.25  # > 25% generic names = AI signal


def _analyze_naming_style(names: list[str]) -> dict:
    """Analyze naming convention consistency."""
    camel_count = 0
    snake_count = 0
    pascal_count = 0

    for name in names:
        if re.match(r"^[a-z][a-zA-Z0-9]*$", name) and re.search(r"[A-Z]", name):
            camel_count += 1
        elif re.match(r"^[a-z][a-z0-9_]*$", name) and "_" in name:
            snake_count += 1
        elif re.match(r"^[A-Z][a-zA-Z0-9]*$", name):
            pascal_count += 1

    max_count = max(camel_count, snake_count, pascal_count)
    total = camel_count + snake_count + pascal_count

    if max_count == camel_count:
        dominant = "camelCase"
    elif max_count == snake_count:
        dominant = "snake_case"
    else:
        dominant = "PascalCase"

    return {
        "consistency": max_count / total if total > 0 else 0,
        "dominant": dominant,
    }


class NamingPatternsDetector:
    """Detects AI-generated code through naming pattern analysis."""

    @property
    def name(self) -> str:
        return "naming-patterns"

    @property
    def version(self) -> str:
        return "1.0.0"

    def detect(self, code: ParsedCode) -> list[DetectionSignal]:
        signals: list[DetectionSignal] = []
        identifiers = code.identifiers
        lines = code.lines

        if len(identifiers) < 3:
            return signals

        # Filter out builtins and single-letter variables
        meaningful = [
            ident for ident in identifiers
            if ident.name not in BUILTINS and not SINGLE_LETTER.match(ident.name)
        ]

        if len(meaningful) < 3:
            return signals

        # Count generic vs domain-specific names
        generic_count = 0
        generic_names: list[str] = []
        for ident in meaningful:
            lower = ident.name.lower()
            if lower in GENERIC_NAMES:
                generic_count += 1
                if lower not in generic_names:
                    generic_names.append(lower)

        generic_ratio = generic_count / len(meaningful)
        strength = (
            min(1.0, (generic_ratio - AI_GENERIC_THRESHOLD) / 0.25)
            if generic_ratio > AI_GENERIC_THRESHOLD
            else 0.0
        )

        ai_note = " -- AI tends toward generic naming" if generic_ratio > AI_GENERIC_THRESHOLD else ""
        signals.append(DetectionSignal(
            detector="naming-patterns",
            signal_type="generic-naming",
            strength=strength,
            location=Location(start_line=1, end_line=len(lines)),
            description=(
                f"{generic_ratio * 100:.0f}% generic identifiers "
                f"({', '.join(generic_names[:5])}){ai_note}"
            ),
        ))

        # Check for naming consistency (AI is very consistent, humans vary)
        naming_styles = _analyze_naming_style([ident.name for ident in meaningful])
        if naming_styles["consistency"] > 0.95 and len(meaningful) > 10:
            signals.append(DetectionSignal(
                detector="naming-patterns",
                signal_type="naming-consistency",
                strength=0.5,
                location=Location(start_line=1, end_line=len(lines)),
                description=(
                    f"Naming style is {naming_styles['consistency'] * 100:.0f}% consistent "
                    f"({naming_styles['dominant']} case) -- AI-typical uniformity"
                ),
            ))

        return signals


naming_patterns_detector = NamingPatternsDetector()
