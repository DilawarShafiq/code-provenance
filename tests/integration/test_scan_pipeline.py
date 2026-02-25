"""Integration tests for the scan pipeline."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from code_provenance.core.analyzer import analyze
from code_provenance.reports.json_report import json_formatter
from code_provenance.reports.terminal_report import terminal_formatter
from code_provenance.reports.markdown_report import markdown_formatter

FIXTURES = Path(__file__).parent.parent / "fixtures"


# ---- AI Detection Tests ----

class TestAIDetection:
    """Tests for AI-generated code detection."""

    def test_detects_gpt_style_ai_code_with_high_confidence(self):
        result = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        assert result.summary.ai_percentage > 50
        assert result.summary.overall_confidence.value == "HIGH"
        assert any(r.classification.value == "ai-generated" for r in result.ranges)

    def test_detects_claude_style_ai_code(self):
        result = analyze(str(FIXTURES / "ai-generated" / "claude-auth.ts"))
        assert result.summary.ai_percentage > 50
        assert any(r.classification.value == "ai-generated" for r in result.ranges)

    def test_detects_copilot_style_ai_code(self):
        result = analyze(str(FIXTURES / "ai-generated" / "copilot-helpers.ts"))
        assert result.summary.ai_percentage > 30

    def test_does_not_falsely_flag_human_written_code(self):
        result = analyze(str(FIXTURES / "human-written" / "domain-specific.ts"))
        # Constitution: zero false positives
        assert all(
            r.classification.value != "ai-generated" for r in result.ranges
        )

    def test_classifies_human_written_code_with_markers(self):
        result = analyze(str(FIXTURES / "human-written" / "irregular-style.ts"))
        assert all(
            r.classification.value != "ai-generated" for r in result.ranges
        )

    def test_produces_deterministic_results(self):
        result1 = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        result2 = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        # Compare everything except timing-dependent fields
        assert result1.summary == result2.summary
        assert len(result1.ranges) == len(result2.ranges)
        for r1, r2 in zip(result1.ranges, result2.ranges):
            assert r1.classification == r2.classification
            assert r1.confidence == r2.confidence
            assert r1.start_line == r2.start_line
            assert r1.end_line == r2.end_line


# ---- Model Attribution Tests ----

class TestModelAttribution:
    """Tests for model attribution accuracy."""

    def test_attributes_claude_patterns(self):
        result = analyze(str(FIXTURES / "ai-generated" / "claude-auth.ts"))
        ai_ranges = [r for r in result.ranges if r.classification.value == "ai-generated"]
        claude_ranges = [
            r for r in ai_ranges
            if r.model_attribution and r.model_attribution.model.value == "claude"
        ]
        assert len(claude_ranges) > 0

    def test_attributes_gpt_patterns(self):
        result = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        ai_ranges = [r for r in result.ranges if r.classification.value == "ai-generated"]
        gpt_ranges = [
            r for r in ai_ranges
            if r.model_attribution and r.model_attribution.model.value == "gpt"
        ]
        assert len(gpt_ranges) > 0

    def test_attributes_copilot_patterns(self):
        result = analyze(str(FIXTURES / "ai-generated" / "copilot-helpers.ts"))
        ai_ranges = [r for r in result.ranges if r.classification.value == "ai-generated"]
        copilot_ranges = [
            r for r in ai_ranges
            if r.model_attribution and r.model_attribution.model.value == "copilot"
        ]
        assert len(copilot_ranges) > 0


# ---- Output Format Tests ----

class TestOutputFormats:
    """Tests for output format correctness."""

    def test_produces_valid_json_output(self):
        result = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        json_output = json_formatter.format(result)
        parsed = json.loads(json_output)
        assert "version" in parsed
        assert "file" in parsed
        assert isinstance(parsed["ranges"], list)
        assert "summary" in parsed
        assert "metadata" in parsed

    def test_produces_terminal_output_with_indicators(self):
        result = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        output = terminal_formatter.format(result)
        assert "Code Provenance" in output
        assert "gpt-utils.ts" in output
        assert "Summary:" in output

    def test_produces_markdown_output_with_required_sections(self):
        result = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        md = markdown_formatter.format(result)
        assert "# Code Provenance Report" in md
        assert "## Summary" in md
        assert "## Findings" in md
        assert "## Methodology" in md


# ---- Generic Parser Tests ----

class TestGenericParser:
    """Tests for generic parser (non-TypeScript files)."""

    def test_scans_python_ai_generated_file(self):
        result = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.py"))
        assert result.file.parser_used == "generic"
        assert result.file.language == "python"
        assert len(result.ranges) > 0
        assert result.summary.ai_percentage > 30

    def test_scans_python_human_written_without_false_positives(self):
        result = analyze(str(FIXTURES / "human-written" / "domain-logic.py"))
        assert result.file.parser_used == "generic"
        assert all(
            r.classification.value != "ai-generated" for r in result.ranges
        )


# ---- Edge Case Tests ----

class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_handles_file_not_found(self):
        with pytest.raises(RuntimeError, match="Cannot read file"):
            analyze("/nonexistent/file.ts")

    def test_completes_scan_within_performance_budget(self):
        start = time.perf_counter()
        analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        duration_ms = (time.perf_counter() - start) * 1000
        assert duration_ms < 500  # More generous budget for Python

    def test_includes_metadata_with_algorithm_versions(self):
        result = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        assert result.metadata.tool_version is not None
        assert result.metadata.algorithm_versions is not None
        assert result.metadata.thresholds is not None
        assert result.metadata.duration > 0

    def test_file_metadata_includes_correct_parser_info(self):
        result = analyze(str(FIXTURES / "ai-generated" / "gpt-utils.ts"))
        assert result.file.language == "typescript"
        assert result.file.parser_used == "typescript"
        assert result.file.total_lines > 0
