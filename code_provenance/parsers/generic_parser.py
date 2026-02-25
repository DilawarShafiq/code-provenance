"""Generic source code parser using regex-based extraction."""

from __future__ import annotations

import re
from pathlib import Path

from code_provenance.types import (
    CommentInfo,
    CommentKind,
    FunctionInfo,
    IdentifierInfo,
    IdentifierKind,
    ParsedCode,
)

# Common comment patterns across languages
LINE_COMMENT = re.compile(r"^\s*(//|#|--|%)\s*(.*)")
BLOCK_COMMENT_START = re.compile(r'^\s*(/\*|"""|\'\'\'|=begin|--\[\[)')
BLOCK_COMMENT_END = re.compile(r'(\*/|"""|\'\'\'|=end|]])')

# Common function/method patterns
FUNCTION_PATTERNS = [
    re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)"),  # JS/TS
    re.compile(r"^\s*def\s+(\w+)"),  # Python/Ruby
    re.compile(r"^\s*(?:pub\s+)?fn\s+(\w+)"),  # Rust
    re.compile(r"^\s*func\s+(\w+)"),  # Go
    re.compile(r"^\s*(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\("),  # Java/C#
]

# Identifier extraction (variable assignments)
IDENTIFIER_PATTERNS = [
    re.compile(r"(?:const|let|var|val|mut)\s+(\w+)"),  # JS/TS/Rust/Kotlin
    re.compile(r"(\w+)\s*=\s*[^=]"),  # Python/Ruby assignment
    re.compile(r"(\w+)\s*:=\s*"),  # Go short assignment
]

EXTENSION_LANGUAGES: dict[str, str] = {
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".cs": "csharp",
    ".kt": "kotlin",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".swift": "swift",
    ".lua": "lua",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".php": "php",
    ".r": "r",
    ".R": "r",
    ".scala": "scala",
    ".zig": "zig",
}


def _detect_language(file_path: str) -> str:
    """Detect programming language from file extension."""
    ext = Path(file_path).suffix
    return EXTENSION_LANGUAGES.get(ext, "generic")


def _extract_comments(lines: tuple[str, ...]) -> list[CommentInfo]:
    """Extract comments from source code lines."""
    comments: list[CommentInfo] = []
    in_block = False
    block_start = 0
    block_text = ""

    for i, line in enumerate(lines):
        line_num = i + 1

        if in_block:
            block_text += "\n" + line
            if BLOCK_COMMENT_END.search(line):
                in_block = False
                text = block_text.strip()
                kind = CommentKind.JSDOC if text.startswith("/**") else CommentKind.BLOCK
                comments.append(CommentInfo(
                    text=text,
                    start_line=block_start,
                    end_line=line_num,
                    kind=kind,
                ))
                block_text = ""
            continue

        if BLOCK_COMMENT_START.search(line):
            # Check if block comment closes on same line
            after_open = BLOCK_COMMENT_START.sub("", line)
            if BLOCK_COMMENT_END.search(after_open):
                text = line.strip()
                kind = CommentKind.JSDOC if text.startswith("/**") else CommentKind.BLOCK
                comments.append(CommentInfo(
                    text=text,
                    start_line=line_num,
                    end_line=line_num,
                    kind=kind,
                ))
            else:
                in_block = True
                block_start = line_num
                block_text = line
            continue

        line_match = LINE_COMMENT.match(line)
        if line_match:
            comments.append(CommentInfo(
                text=line.strip(),
                start_line=line_num,
                end_line=line_num,
                kind=CommentKind.LINE,
            ))

    return comments


def _extract_functions(lines: tuple[str, ...]) -> list[FunctionInfo]:
    """Extract function definitions from source code lines."""
    functions: list[FunctionInfo] = []

    for i, line in enumerate(lines):
        for pattern in FUNCTION_PATTERNS:
            match = pattern.match(line)
            if match:
                name = match.group(1)
                start_line = i + 1

                # Estimate function end by tracking indentation/braces
                depth = 0
                end_line = start_line
                found_open = False

                for j in range(i, len(lines)):
                    f_line = lines[j]
                    for ch in f_line:
                        if ch in ("{", ":"):
                            if ch == "{":
                                depth += 1
                                found_open = True
                            elif ch == ":" and not found_open and j == i:
                                # Python-style colon -- use indentation tracking
                                found_open = True
                        if ch == "}" and found_open:
                            depth -= 1
                            if depth <= 0:
                                end_line = j + 1
                                break
                    if found_open and depth <= 0 and j > i:
                        end_line = j + 1
                        break
                    # For indentation-based languages, detect function end
                    if found_open and j > i and f_line.strip() and not re.match(r"^\s", f_line) and depth == 0:
                        end_line = j  # Previous line was the end
                        break
                    end_line = j + 1

                line_count = end_line - start_line + 1
                has_error_handling = any(
                    re.search(r"\b(try|catch|except|rescue|recover)\b", l)
                    for l in lines[i:end_line]
                )

                # Count parameters (rough heuristic)
                param_match = re.search(r"\(([^)]*)\)", line)
                param_count = (
                    len(param_match.group(1).split(","))
                    if param_match and param_match.group(1).strip()
                    else 0
                )

                functions.append(FunctionInfo(
                    name=name,
                    start_line=start_line,
                    end_line=end_line,
                    line_count=line_count,
                    has_error_handling=has_error_handling,
                    param_count=param_count,
                ))
                break  # Only match first pattern per line

    return functions


def _extract_identifiers(lines: tuple[str, ...]) -> list[IdentifierInfo]:
    """Extract identifier declarations from source code lines."""
    identifiers: list[IdentifierInfo] = []
    seen: set[str] = set()

    for i, line in enumerate(lines):
        for pattern in IDENTIFIER_PATTERNS:
            for match in pattern.finditer(line):
                name = match.group(1)
                key = f"{name}:{i + 1}"
                if key not in seen and len(name) > 1:
                    seen.add(key)
                    identifiers.append(IdentifierInfo(
                        name=name,
                        line=i + 1,
                        kind=IdentifierKind.VARIABLE,
                    ))

    return identifiers


class GenericParser:
    """Generic source code parser -- works for any language using regex heuristics."""

    @property
    def language(self) -> str:
        return "generic"

    def can_parse(self, file_path: str) -> bool:
        return True  # Fallback -- accepts everything

    def parse(self, content: str, file_path: str) -> ParsedCode:
        lines = tuple(content.split("\n"))

        return ParsedCode(
            lines=lines,
            language=_detect_language(file_path),
            functions=tuple(_extract_functions(lines)),
            imports=(),  # Generic parser doesn't extract imports
            comments=tuple(_extract_comments(lines)),
            identifiers=tuple(_extract_identifiers(lines)),
        )


generic_parser = GenericParser()
