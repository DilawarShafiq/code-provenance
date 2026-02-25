"""JSON report formatter."""

from __future__ import annotations

import json
from dataclasses import asdict

from code_provenance.types import ScanResult


class JsonFormatter:
    """Format scan results as deterministic JSON."""

    def format(self, result: ScanResult) -> str:
        """Produce deterministic JSON output."""
        output = {
            "version": result.metadata.tool_version,
            "file": {
                "path": result.file.path,
                "relativePath": result.file.relative_path,
                "totalLines": result.file.total_lines,
                "language": result.file.language,
                "parserUsed": result.file.parser_used,
            },
            "ranges": [
                {
                    "startLine": r.start_line,
                    "endLine": r.end_line,
                    "classification": r.classification.value,
                    "confidence": r.confidence,
                    "modelAttribution": (
                        {
                            "model": r.model_attribution.model.value,
                            "confidence": r.model_attribution.confidence,
                            "matchedPatterns": list(r.model_attribution.matched_patterns),
                        }
                        if r.model_attribution
                        else None
                    ),
                    "signals": [
                        {
                            "detector": s.detector,
                            "signalType": s.signal_type,
                            "strength": s.strength,
                            "location": {
                                "startLine": s.location.start_line,
                                "endLine": s.location.end_line,
                            },
                            "description": s.description,
                        }
                        for s in r.signals
                    ],
                }
                for r in result.ranges
            ],
            "summary": {
                "aiPercentage": result.summary.ai_percentage,
                "humanPercentage": result.summary.human_percentage,
                "unknownPercentage": result.summary.unknown_percentage,
                "overallConfidence": result.summary.overall_confidence.value,
                "modelBreakdown": result.summary.model_breakdown,
            },
            "metadata": {
                "toolVersion": result.metadata.tool_version,
                "analyzedAt": result.metadata.analyzed_at,
                "algorithmVersions": result.metadata.algorithm_versions,
                "thresholds": result.metadata.thresholds,
                "duration": result.metadata.duration,
            },
        }
        return json.dumps(output, indent=2)


json_formatter = JsonFormatter()
