"""Markdown report formatter."""

from __future__ import annotations

from code_provenance.types import LineRange, ScanResult


def _classification_label(c: str) -> str:
    if c == "ai-generated":
        return "AI-Generated"
    if c == "human-written":
        return "Human-Written"
    return "Unknown"


def _range_section(line_range: LineRange) -> str:
    """Generate markdown section for a single line range."""
    lines: list[str] = []
    label = _classification_label(line_range.classification.value)

    lines.append(
        f"### Lines {line_range.start_line}-{line_range.end_line}: "
        f"{label} ({line_range.confidence}%)"
    )
    lines.append("")
    lines.append(f"**Classification**: {label}")
    lines.append(f"**Confidence**: {line_range.confidence}%")

    if line_range.model_attribution:
        model = line_range.model_attribution.model.value
        name = "Unknown" if model == "unknown" else model.capitalize()
        lines.append(
            f"**Model Attribution**: {name} ({line_range.model_attribution.confidence}%)"
        )

    if line_range.signals:
        lines.append("")
        lines.append("**Evidence**:")
        for signal in line_range.signals:
            lines.append(f"- {signal.description}")

    lines.append("")
    lines.append("---")

    return "\n".join(lines)


class MarkdownFormatter:
    """Format scan results as markdown."""

    def format(self, result: ScanResult) -> str:
        file = result.file
        ranges = result.ranges
        summary = result.summary
        metadata = result.metadata
        lines: list[str] = []

        lines.append("# Code Provenance Report")
        lines.append("")
        lines.append(f"**File**: {file.relative_path}")
        lines.append(f"**Scanned**: {metadata.analyzed_at}")
        lines.append(f"**Tool Version**: {metadata.tool_version}")
        lines.append(f"**Parser**: {file.parser_used}")
        lines.append("")

        # Summary table
        lines.append("## Summary")
        lines.append("")
        lines.append("| Metric | Value |")
        lines.append("|--------|-------|")
        lines.append(f"| Total Lines | {file.total_lines} |")
        lines.append(f"| AI-Generated | {summary.ai_percentage}% |")
        lines.append(f"| Human-Written | {summary.human_percentage}% |")
        lines.append(f"| Unknown | {summary.unknown_percentage}% |")
        lines.append(f"| Overall Confidence | {summary.overall_confidence.value} |")
        lines.append("")

        # Findings
        lines.append("## Findings")
        lines.append("")
        for r in ranges:
            lines.append(_range_section(r))
            lines.append("")

        # Methodology
        lines.append("## Methodology")
        lines.append("")
        lines.append("| Algorithm | Version |")
        lines.append("|-----------|---------|")
        for name, version in metadata.algorithm_versions.items():
            lines.append(f"| {name} | {version} |")
        lines.append("")

        lines.append("| Threshold | Value |")
        lines.append("|-----------|-------|")
        for name, value in metadata.thresholds.items():
            lines.append(f"| {name} | {value} |")
        lines.append("")

        lines.append(f"*Analysis completed in {metadata.duration}ms*")

        return "\n".join(lines)


markdown_formatter = MarkdownFormatter()
