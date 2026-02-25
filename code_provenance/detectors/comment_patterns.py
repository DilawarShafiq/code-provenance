"""Comment pattern detector for AI-generated code."""

from __future__ import annotations

import re

from code_provenance.types import DetectionSignal, Location, ParsedCode

# AI comment pattern indicators
PRE_FUNCTION_COMMENT = re.compile(
    r"^\s*(//|/\*\*?|#)\s*(This|The|A|An)\s+(function|method|class|module|helper|utility|file|component|hook)",
    re.IGNORECASE,
)
STEP_COMMENT = re.compile(
    r"^\s*(//|#)\s*(Step\s+\d|First,?\s|Second,?\s|Third,?\s|Then,?\s|Next,?\s|Finally,?\s)",
    re.IGNORECASE,
)
OBVIOUS_COMMENT = re.compile(
    r"^\s*(//|#)\s*(Import|Export|Return|Check|Get|Set|Create|Initialize|Define|Declare|Calculate|Convert|Validate|Loop|Split|Join|Pad|Store|Attempt|Extract|Truncate|Clear|Divide|Add)\s+(the|a|an|all|each|and|random|through|single|back|digit)\s+",
    re.IGNORECASE,
)
EXPLANATORY_COMMENT = re.compile(
    r"^\s*(//|#)\s*(It |We |If |This |These |The result|The .+ (is|are|will|should|can|must))",
    re.IGNORECASE,
)

AI_DENSITY_THRESHOLD = 0.30  # AI over-comments: > 30% comment density
AI_PRE_FUNC_THRESHOLD = 0.60  # AI comments before > 60% of functions


def _comment_density(lines: tuple[str, ...], start: int, end: int) -> float:
    """Count lines that are comments vs code in a range."""
    comment_lines = 0
    code_lines = 0

    for i in range(start, min(end, len(lines))):
        trimmed = lines[i].strip()
        if not trimmed:
            continue
        if (
            trimmed.startswith("//")
            or trimmed.startswith("/*")
            or trimmed.startswith("*")
            or trimmed.startswith("#")
        ):
            comment_lines += 1
        else:
            code_lines += 1

    total = comment_lines + code_lines
    return comment_lines / total if total > 0 else 0.0


class CommentPatternsDetector:
    """Detects AI-generated code through comment pattern analysis."""

    @property
    def name(self) -> str:
        return "comment-patterns"

    @property
    def version(self) -> str:
        return "1.0.0"

    def detect(self, code: ParsedCode) -> list[DetectionSignal]:
        signals: list[DetectionSignal] = []
        lines = code.lines
        comments = code.comments
        functions = code.functions

        if len(lines) < 5:
            return signals

        # 1. Overall comment density
        density = _comment_density(lines, 0, len(lines))
        density_strength = (
            min(1.0, (density - AI_DENSITY_THRESHOLD) / 0.20)
            if density > AI_DENSITY_THRESHOLD
            else 0.0
        )

        if density > 0:
            ai_note = " (AI typically > 30%)" if density > AI_DENSITY_THRESHOLD else ""
            signals.append(DetectionSignal(
                detector="comment-patterns",
                signal_type="comment-density",
                strength=density_strength,
                location=Location(start_line=1, end_line=len(lines)),
                description=f"Comment density {density * 100:.0f}%{ai_note}",
            ))

        # 2. Pre-function comment pattern (AI puts doc comment before every function)
        if functions:
            pre_func_comments = 0
            for fn in functions:
                has_pre_comment = any(
                    c.end_line >= fn.start_line - 2 and c.end_line <= fn.start_line
                    for c in comments
                )
                if has_pre_comment:
                    pre_func_comments += 1

            pre_func_ratio = pre_func_comments / len(functions)
            pre_func_strength = (
                min(1.0, (pre_func_ratio - AI_PRE_FUNC_THRESHOLD) / 0.30)
                if pre_func_ratio > AI_PRE_FUNC_THRESHOLD
                else 0.0
            )

            ai_note = " (AI pattern)" if pre_func_ratio > AI_PRE_FUNC_THRESHOLD else ""
            signals.append(DetectionSignal(
                detector="comment-patterns",
                signal_type="pre-function-comments",
                strength=pre_func_strength,
                location=Location(start_line=1, end_line=len(lines)),
                description=(
                    f"{pre_func_ratio * 100:.0f}% of functions have preceding comments{ai_note}"
                ),
            ))

        # 3. Verbose/obvious comment patterns (GPT hallmark)
        verbose_count = 0
        for comment in comments:
            if (
                PRE_FUNCTION_COMMENT.search(comment.text)
                or STEP_COMMENT.search(comment.text)
                or OBVIOUS_COMMENT.search(comment.text)
                or EXPLANATORY_COMMENT.search(comment.text)
            ):
                verbose_count += 1

        if comments:
            verbose_ratio = verbose_count / len(comments)
            signals.append(DetectionSignal(
                detector="comment-patterns",
                signal_type="verbose-comments",
                strength=min(1.0, verbose_ratio * 2),  # Scale: 50% verbose -> strength 1.0
                location=Location(start_line=1, end_line=len(lines)),
                description=f"{verbose_count}/{len(comments)} comments use verbose/obvious patterns",
            ))

        return signals


comment_patterns_detector = CommentPatternsDetector()
