"""Entropy-based detector for AI-generated code patterns."""

from __future__ import annotations

import math
from collections import Counter

from code_provenance.types import DetectionSignal, Location, ParsedCode

WINDOW_SIZE = 20
WINDOW_STRIDE = 10

# Code-specific entropy thresholds (higher than prose -- code has more syntax chars)
AI_CEILING = 4.5  # Below this = strong AI signal
HUMAN_FLOOR = 5.0  # Above this = strong human signal


def shannon_entropy(text: str) -> float:
    """Calculate Shannon entropy (bits per character) for a text string."""
    if not text:
        return 0.0

    freq = Counter(text)
    length = len(text)
    entropy = 0.0

    for count in freq.values():
        p = count / length
        if p > 0:
            entropy -= p * math.log2(p)

    return entropy


def _identifier_diversity(identifiers: list[dict]) -> float:
    """Measure identifier diversity -- how varied are the names?

    AI tends to reuse the same small set of generic names.
    Returns 0-1 where lower = less diverse = more AI-like.
    """
    if len(identifiers) < 3:
        return 0.5
    unique = set(id_info["name"].lower() for id_info in identifiers)
    return len(unique) / len(identifiers)


def _entropy_to_signal(entropy: float) -> float:
    if entropy <= AI_CEILING:
        return 1.0
    if entropy >= HUMAN_FLOOR:
        return 0.0
    return 1.0 - (entropy - AI_CEILING) / (HUMAN_FLOOR - AI_CEILING)


class EntropyDetector:
    """Detects AI-generated code through entropy analysis."""

    @property
    def name(self) -> str:
        return "entropy"

    @property
    def version(self) -> str:
        return "1.0.0"

    def detect(self, code: ParsedCode) -> list[DetectionSignal]:
        signals: list[DetectionSignal] = []
        lines = code.lines
        identifiers = code.identifiers

        if len(lines) < 5:
            return signals

        # Per-window character entropy
        start = 0
        while start < len(lines):
            end = min(start + WINDOW_SIZE, len(lines))
            window_text = "\n".join(lines[start:end])

            if len(window_text.strip()) < 50:
                start += WINDOW_STRIDE
                continue

            entropy = shannon_entropy(window_text)
            strength = _entropy_to_signal(entropy)

            ai_note = f" (AI threshold: < {AI_CEILING})" if entropy < AI_CEILING else ""
            signals.append(DetectionSignal(
                detector="entropy",
                signal_type="low-lexical-entropy" if entropy < AI_CEILING else "normal-entropy",
                strength=strength,
                location=Location(start_line=start + 1, end_line=end),
                description=f"Character entropy {entropy:.2f} bits/char{ai_note}",
            ))

            start += WINDOW_STRIDE

        # Identifier diversity (file-wide signal)
        id_dicts = [{"name": ident.name} for ident in identifiers]
        diversity = _identifier_diversity(id_dicts)
        diversity_strength = min(1.0, (0.5 - diversity) / 0.3) if diversity < 0.5 else 0.0

        if len(identifiers) >= 3:
            unique_count = len(set(ident.name for ident in identifiers))
            signals.append(DetectionSignal(
                detector="entropy",
                signal_type="identifier-diversity",
                strength=diversity_strength,
                location=Location(start_line=1, end_line=len(lines)),
                description=(
                    f"Identifier diversity {diversity * 100:.0f}% "
                    f"({len(identifiers)} identifiers, {unique_count} unique)"
                ),
            ))

        return signals


entropy_detector = EntropyDetector()
