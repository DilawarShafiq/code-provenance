"""Terminal report formatter using rich for colored output."""

from __future__ import annotations

from code_provenance.types import LineRange, ScanResult

# Color codes for terminal output (ANSI)
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

ICONS = {
    "ai-generated": "\U0001f916",  # robot
    "human-written": "\U0001f464",  # bust in silhouette
    "unknown": "\u2753",  # question mark
}


def _classification_color(classification: str) -> str:
    """Get ANSI color code for a classification."""
    if classification == "ai-generated":
        return RED
    if classification == "human-written":
        return GREEN
    return YELLOW


def _confidence_color(level: str) -> str:
    """Get ANSI color code for a confidence level."""
    if level == "HIGH":
        return GREEN
    if level == "MEDIUM":
        return YELLOW
    return RED


def _range_detail(line_range: LineRange) -> str:
    """Generate descriptive detail for a line range."""
    if line_range.classification.value == "ai-generated":
        if line_range.model_attribution:
            model = line_range.model_attribution.model.value
            name = "AI" if model == "unknown" else model.capitalize()
            return f"{name}-style patterns"
        return "AI patterns detected"
    if line_range.classification.value == "human-written":
        # Pick the most descriptive signal
        naming = next((s for s in line_range.signals if s.detector == "naming-patterns"), None)
        if naming and naming.strength < 0.3:
            return "Domain-specific naming"
        entropy = next((s for s in line_range.signals if s.detector == "entropy"), None)
        if entropy and entropy.strength < 0.3:
            return "Irregular style, high entropy"
        return "Human patterns detected"
    return "Insufficient signals"


def _format_label(classification: str) -> str:
    """Format classification label for display."""
    if classification == "ai-generated":
        return "AI-generated"
    if classification == "human-written":
        return "Human-written"
    return "Unknown"


class TerminalFormatter:
    """Format scan results for terminal display with colors."""

    def format(self, result: ScanResult) -> str:
        file = result.file
        ranges = result.ranges
        summary = result.summary
        lines: list[str] = []

        # Header
        lines.append(f"{BOLD}Code Provenance v{result.metadata.tool_version}{RESET}")
        lines.append(f"{DIM}{chr(0x2500) * 30}{RESET}")
        lines.append("")

        # Empty file
        if file.total_lines == 0:
            lines.append(f"{YELLOW}No code to analyze (empty file){RESET}")
            return "\n".join(lines)

        # File info
        parser_note = f"{DIM} (generic parser){RESET}" if file.parser_used == "generic" else ""
        lines.append(
            f"\U0001f4ca {BOLD}{file.relative_path}{RESET} "
            f"({file.total_lines} lines){parser_note}"
        )
        lines.append("")

        # Line ranges
        for r in ranges:
            icon = ICONS.get(r.classification.value, "\u2753")
            label = _format_label(r.classification.value)
            color = _classification_color(r.classification.value)
            detail = _range_detail(r)

            line_range_str = f"Lines {r.start_line}-{r.end_line}:"
            padded = line_range_str.ljust(18)

            lines.append(
                f"{padded}{icon} {color}{label}{RESET}  ({r.confidence}%)  {DIM}{detail}{RESET}"
            )

        # Summary
        lines.append("")
        ai_pct = summary.ai_percentage
        human_pct = summary.human_percentage
        ai_part = (
            f"{RED}{ai_pct}% AI-generated{RESET}"
            if ai_pct > 0
            else f"{ai_pct}% AI-generated"
        )
        human_part = (
            f"{GREEN}{human_pct}% Human-written{RESET}"
            if human_pct > 0
            else f"{human_pct}% Human-written"
        )
        lines.append(f"Summary: {ai_part} | {human_part}")

        conf_color = _confidence_color(summary.overall_confidence.value)
        lines.append(f"Confidence: {conf_color}{summary.overall_confidence.value}{RESET}")

        return "\n".join(lines)


terminal_formatter = TerminalFormatter()
