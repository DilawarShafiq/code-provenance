"""Code Provenance - Code fingerprinting engine.

Detect AI-generated code, find stolen code, catch license violations,
trace code lineage.
"""

__version__ = "0.1.0"

from code_provenance.core.analyzer import analyze, register_detector
from code_provenance.core.scanner import scan_directory
from code_provenance.reports.json_report import json_formatter
from code_provenance.reports.terminal_report import terminal_formatter
from code_provenance.reports.markdown_report import markdown_formatter

__all__ = [
    "analyze",
    "register_detector",
    "scan_directory",
    "json_formatter",
    "terminal_formatter",
    "markdown_formatter",
]
