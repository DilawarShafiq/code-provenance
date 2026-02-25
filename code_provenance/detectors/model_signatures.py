"""Model signature detector for attributing AI-generated code to specific models."""

from __future__ import annotations

import re
from dataclasses import dataclass

from code_provenance.types import (
    DetectionSignal,
    Location,
    ModelAttribution,
    ModelName,
    ParsedCode,
)


@dataclass
class ModelScore:
    model: ModelName
    score: float
    matched_patterns: list[str]


def score_claude_patterns(code: ParsedCode) -> ModelScore:
    """Score code for Claude-style patterns."""
    matched_patterns: list[str] = []
    score = 0.0
    full_text = "\n".join(code.lines)

    # const-ratio: Claude prefers const over let/var
    const_count = len(re.findall(r"\bconst\s", full_text))
    let_count = len(re.findall(r"\blet\s", full_text))
    var_count = len(re.findall(r"\bvar\s", full_text))
    total_decl = const_count + let_count + var_count
    if total_decl > 3 and const_count / total_decl > 0.80:
        score += 0.25
        matched_patterns.append("const-preference")

    # import type usage
    type_imports = sum(1 for i in code.imports if i.is_type_only)
    if code.imports and type_imports / len(code.imports) > 0.25:
        score += 0.20
        matched_patterns.append("import-type-usage")

    # Functional methods (.map, .filter, .reduce, etc.)
    func_methods = [r"\.map\(", r"\.filter\(", r"\.reduce\(", r"\.flatMap\(",
                    r"\.some\(", r"\.every\(", r"\.find\("]
    func_method_count = 0
    for method in func_methods:
        func_method_count += len(re.findall(method, full_text))
    if func_method_count >= 3:
        score += 0.20
        matched_patterns.append("functional-style")

    # Arrow functions vs function declarations
    arrow_fns = sum(1 for _ in code.functions if "=>" in full_text)
    if len(code.functions) > 2 and arrow_fns / len(code.functions) > 0.60:
        score += 0.15
        matched_patterns.append("arrow-functions")

    # Readonly/immutability patterns
    if re.search(r"\bReadonly\b", full_text) or re.search(r"\breadonly\s", full_text) or re.search(r"Object\.freeze", full_text):
        score += 0.10
        matched_patterns.append("immutability-patterns")

    return ModelScore(model=ModelName.CLAUDE, score=min(1.0, score), matched_patterns=matched_patterns)


def score_gpt_patterns(code: ParsedCode) -> ModelScore:
    """Score code for GPT-style patterns."""
    matched_patterns: list[str] = []
    score = 0.0

    # Pre-function comments: "This function does X"
    pre_func_count = 0
    for comment in code.comments:
        if re.search(r"\b(This|The)\s+(function|method|class|module|utility|helper)\b", comment.text, re.IGNORECASE):
            pre_func_count += 1
    if pre_func_count >= 2:
        score += 0.30
        matched_patterns.append("pre-function-comments")

    # Step-by-step comments
    step_count = 0
    for comment in code.comments:
        if re.search(r"\b(Step\s+\d|First,?\s|Then,?\s|Next,?\s|Finally,?\s)", comment.text, re.IGNORECASE):
            step_count += 1
    if step_count >= 2:
        score += 0.25
        matched_patterns.append("step-by-step-comments")

    # Obvious/explanatory comments
    obvious_count = 0
    for comment in code.comments:
        if re.search(
            r"\b(Get|Set|Check|Return|Create|Initialize|Define|Calculate|Convert|Validate|Loop|Split|Join|Pad)\s+(the|a|an|all)",
            comment.text,
            re.IGNORECASE,
        ):
            obvious_count += 1
    if obvious_count >= 3:
        score += 0.25
        matched_patterns.append("obvious-comments")

    # High comment density
    comment_lines = sum(c.end_line - c.start_line + 1 for c in code.comments)
    if len(code.lines) > 10 and comment_lines / len(code.lines) > 0.35:
        score += 0.10
        matched_patterns.append("high-comment-density")

    return ModelScore(model=ModelName.GPT, score=min(1.0, score), matched_patterns=matched_patterns)


def score_copilot_patterns(code: ParsedCode) -> ModelScore:
    """Score code for Copilot-style patterns."""
    matched_patterns: list[str] = []
    score = 0.0

    # Short functions (5-18 lines, completion-sized)
    if len(code.functions) >= 3:
        short_fns = [f for f in code.functions if 3 <= f.line_count <= 18]
        if len(short_fns) / len(code.functions) > 0.70:
            score += 0.35
            matched_patterns.append("short-completions")

    # Minimal comments
    comment_lines = sum(c.end_line - c.start_line + 1 for c in code.comments)
    if len(code.lines) > 20 and comment_lines / len(code.lines) < 0.05:
        score += 0.25
        matched_patterns.append("no-comments")

    # Direct exports (export function / export const on most functions)
    full_text = "\n".join(code.lines)
    exported_fns = len(re.findall(r"export\s+(function|const|async\s+function)\s", full_text))
    if len(code.functions) >= 3 and exported_fns / len(code.functions) > 0.60:
        score += 0.20
        matched_patterns.append("direct-exports")

    # Utility/helper pattern (many small standalone functions, no class)
    has_class = bool(re.search(r"\bclass\s+\w+", full_text))
    if not has_class and len(code.functions) >= 5:
        score += 0.20
        matched_patterns.append("utility-pattern")

    return ModelScore(model=ModelName.COPILOT, score=min(1.0, score), matched_patterns=matched_patterns)


def attribute_model(scores: list[ModelScore]) -> ModelAttribution | None:
    """Determine model attribution from scores.

    Top model must exceed 0.4 and have gap > 0.15 to second.
    """
    sorted_scores = sorted(scores, key=lambda s: s.score, reverse=True)
    top = sorted_scores[0] if sorted_scores else None
    second = sorted_scores[1] if len(sorted_scores) > 1 else None

    if not top or top.score < 0.4:
        return None
    if second and top.score - second.score < 0.15:
        return ModelAttribution(
            model=ModelName.UNKNOWN,
            confidence=round(top.score * 50),
            matched_patterns=tuple(top.matched_patterns),
        )

    return ModelAttribution(
        model=top.model,
        confidence=round(top.score * 100),
        matched_patterns=tuple(top.matched_patterns),
    )


class ModelSignaturesDetector:
    """Detects and attributes AI model signatures in code."""

    @property
    def name(self) -> str:
        return "model-signatures"

    @property
    def version(self) -> str:
        return "1.0.0"

    def detect(self, code: ParsedCode) -> list[DetectionSignal]:
        signals: list[DetectionSignal] = []

        claude_score = score_claude_patterns(code)
        gpt_score = score_gpt_patterns(code)
        copilot_score = score_copilot_patterns(code)

        all_scores = [claude_score, gpt_score, copilot_score]

        # Emit a signal for the winning model
        top_score_val = max(s.score for s in all_scores)

        if top_score_val > 0.2:
            top_model = next(s for s in all_scores if s.score == top_score_val)
            signals.append(DetectionSignal(
                detector="model-signatures",
                signal_type=f"model-{top_model.model.value}",
                strength=top_score_val,
                location=Location(start_line=1, end_line=len(code.lines)),
                description=(
                    f"{top_model.model.value} patterns: "
                    f"{', '.join(top_model.matched_patterns)} "
                    f"(score: {top_score_val * 100:.0f}%)"
                ),
            ))

        return signals


model_signatures_detector = ModelSignaturesDetector()
