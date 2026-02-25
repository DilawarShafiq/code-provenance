"""TypeScript/JavaScript parser using regex-based extraction.

Note: The original TypeScript version used the TypeScript compiler API for
AST-based parsing. This Python version uses regex-based heuristics instead,
since we don't have the TS compiler available in Python. The regex approach
provides good-enough accuracy for the detection algorithms.
"""

from __future__ import annotations

import re

from code_provenance.types import (
    CommentInfo,
    CommentKind,
    FunctionInfo,
    IdentifierInfo,
    IdentifierKind,
    ImportInfo,
    ParsedCode,
)

# TypeScript/JavaScript extensions
TS_EXTENSIONS = re.compile(r"\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$")

# Import patterns
IMPORT_PATTERN = re.compile(
    r"""^\s*import\s+(?:type\s+)?(?:"""
    r"""\{[^}]*\}\s+from\s+|"""
    r"""(?:\w+|\*\s+as\s+\w+)\s+from\s+|"""
    r""")['"]([^'"]+)['"]""",
)
TYPE_IMPORT_PATTERN = re.compile(r"^\s*import\s+type\s+")

# Function patterns for TS/JS
FUNC_DECLARATION = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)")
METHOD_DECLARATION = re.compile(r"^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\(")
ARROW_CONST = re.compile(r"^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(")
ARROW_ASSIGNMENT = re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w+)?\s*=>")

# Variable declarations
VAR_DECLARATION = re.compile(r"(?:const|let|var)\s+(\w+)")

# Comment patterns
LINE_COMMENT = re.compile(r"^\s*//\s*(.*)")
BLOCK_COMMENT_START = re.compile(r"^\s*/\*")
BLOCK_COMMENT_END = re.compile(r"\*/")


def _extract_imports(lines: tuple[str, ...]) -> list[ImportInfo]:
    """Extract import statements from TypeScript/JavaScript code."""
    imports: list[ImportInfo] = []

    for i, line in enumerate(lines):
        match = IMPORT_PATTERN.match(line)
        if match:
            source = match.group(1)
            is_type_only = bool(TYPE_IMPORT_PATTERN.match(line))
            imports.append(ImportInfo(
                source=source,
                line=i + 1,
                is_type_only=is_type_only,
            ))

    return imports


def _extract_functions(lines: tuple[str, ...]) -> list[FunctionInfo]:
    """Extract function definitions from TypeScript/JavaScript code."""
    functions: list[FunctionInfo] = []

    for i, line in enumerate(lines):
        name = None

        # Try each function pattern
        match = FUNC_DECLARATION.match(line)
        if match:
            name = match.group(1)
        else:
            match = ARROW_ASSIGNMENT.match(line)
            if match:
                name = match.group(1)
            else:
                match = ARROW_CONST.match(line)
                if match:
                    name = match.group(1)

        if not name:
            continue

        start_line = i + 1

        # Find function end by tracking braces
        depth = 0
        end_line = start_line
        found_open = False

        for j in range(i, len(lines)):
            for ch in lines[j]:
                if ch == "{":
                    depth += 1
                    found_open = True
                elif ch == "}" and found_open:
                    depth -= 1
                    if depth <= 0:
                        end_line = j + 1
                        break
            if found_open and depth <= 0 and j > i:
                end_line = j + 1
                break
            end_line = j + 1

        line_count = end_line - start_line + 1
        has_error_handling = any(
            re.search(r"\b(try|catch)\b", l) for l in lines[i:end_line]
        )

        # Count parameters
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

    return functions


def _extract_comments(lines: tuple[str, ...]) -> list[CommentInfo]:
    """Extract comments from TypeScript/JavaScript code."""
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

        if BLOCK_COMMENT_START.match(line):
            # Check if block comment closes on same line
            if BLOCK_COMMENT_END.search(line.replace("/*", "", 1)):
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

        if LINE_COMMENT.match(line):
            comments.append(CommentInfo(
                text=line.strip(),
                start_line=line_num,
                end_line=line_num,
                kind=CommentKind.LINE,
            ))

    # Deduplicate comments (same position may be matched multiple times)
    seen: set[str] = set()
    unique_comments: list[CommentInfo] = []
    for c in comments:
        key = f"{c.start_line}:{c.end_line}"
        if key not in seen:
            seen.add(key)
            unique_comments.append(c)

    return unique_comments


def _extract_identifiers(lines: tuple[str, ...]) -> list[IdentifierInfo]:
    """Extract identifier declarations from TypeScript/JavaScript code."""
    identifiers: list[IdentifierInfo] = []
    seen: set[str] = set()

    for i, line in enumerate(lines):
        # Variable declarations
        for match in VAR_DECLARATION.finditer(line):
            name = match.group(1)
            key = f"{name}:{i + 1}"
            if key not in seen:
                seen.add(key)
                identifiers.append(IdentifierInfo(
                    name=name,
                    line=i + 1,
                    kind=IdentifierKind.VARIABLE,
                ))

        # Function names
        func_match = FUNC_DECLARATION.match(line)
        if func_match:
            name = func_match.group(1)
            key = f"{name}:{i + 1}"
            if key not in seen:
                seen.add(key)
                identifiers.append(IdentifierInfo(
                    name=name,
                    line=i + 1,
                    kind=IdentifierKind.FUNCTION,
                ))

        # Parameters (rough extraction)
        param_match = re.search(r"\(([^)]+)\)", line)
        if param_match:
            params_str = param_match.group(1)
            for param in params_str.split(","):
                param = param.strip()
                # Remove type annotations
                param_name_match = re.match(r"(\w+)", param)
                if param_name_match:
                    name = param_name_match.group(1)
                    # Skip type keywords
                    if name not in ("string", "number", "boolean", "any", "void", "never",
                                    "readonly", "public", "private", "protected", "static",
                                    "async", "const", "let", "var"):
                        key = f"{name}:{i + 1}"
                        if key not in seen:
                            seen.add(key)
                            identifiers.append(IdentifierInfo(
                                name=name,
                                line=i + 1,
                                kind=IdentifierKind.PARAMETER,
                            ))

    return identifiers


class TypeScriptParser:
    """TypeScript/JavaScript parser using regex-based extraction."""

    @property
    def language(self) -> str:
        return "typescript"

    def can_parse(self, file_path: str) -> bool:
        return bool(TS_EXTENSIONS.search(file_path))

    def parse(self, content: str, file_path: str) -> ParsedCode:
        is_typescript = re.search(r"\.tsx?$", file_path) is not None
        lines = tuple(content.split("\n"))

        return ParsedCode(
            lines=lines,
            language="typescript" if is_typescript else "javascript",
            functions=tuple(_extract_functions(lines)),
            imports=tuple(_extract_imports(lines)),
            comments=tuple(_extract_comments(lines)),
            identifiers=tuple(_extract_identifiers(lines)),
        )


typescript_parser = TypeScriptParser()
