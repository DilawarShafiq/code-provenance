"""Parser selection and utilities."""

from __future__ import annotations

from code_provenance.parsers.typescript_parser import typescript_parser
from code_provenance.parsers.generic_parser import generic_parser

# Parser registry, ordered by specificity (most specific first)
_parsers = [typescript_parser, generic_parser]


def select_parser(file_path: str):
    """Select the best available parser for a file.

    Tries language-specific parsers first, falls back to generic.
    """
    for parser in _parsers:
        if parser.can_parse(file_path):
            return parser
    return generic_parser


def is_binary_content(content: str) -> bool:
    """Detect if a file is likely binary by checking for null bytes in the first 8KB."""
    sample = content[:8192]
    return "\0" in sample
