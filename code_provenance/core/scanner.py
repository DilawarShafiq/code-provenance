"""Directory scanner for Code Provenance."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from code_provenance.core.analyzer import analyze
from code_provenance.types import ScanResult

# Extensions we know how to analyze
SUPPORTED_EXTENSIONS = frozenset([
    # TypeScript parser
    ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs",
    # Generic parser -- popular languages
    ".py", ".rb", ".rs", ".go", ".java", ".cs", ".kt", ".c", ".cpp",
    ".h", ".hpp", ".swift", ".lua", ".sh", ".bash", ".zsh", ".php",
    ".r", ".scala", ".zig", ".vue", ".svelte",
])

# Directories to always skip
SKIP_DIRS = frozenset([
    "node_modules", ".git", "dist", "build", "out", ".next",
    "coverage", ".nyc_output", "__pycache__", ".venv", "venv",
    "vendor", "target", ".gradle", ".idea", ".vscode",
    ".specify", ".claude",
])

# Files to always skip
SKIP_FILES = frozenset([
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ".DS_Store", "Thumbs.db",
])

MAX_FILE_SIZE = 512_000  # 500KB


@dataclass(frozen=True)
class DirectoryScanResult:
    root: str
    files: tuple[ScanResult, ...]
    skipped: tuple[str, ...]
    total_files: int
    total_lines: int
    ai_lines: int
    human_lines: int
    unknown_lines: int
    ai_percentage: int
    human_percentage: int
    duration: int


def _collect_files(dir_path: Path, root_dir: Path) -> tuple[list[Path], list[str]]:
    """Recursively collect supported files from a directory tree."""
    files: list[Path] = []
    skipped: list[str] = []

    def walk(current_dir: Path) -> None:
        try:
            entries = sorted(current_dir.iterdir())
        except OSError:
            return

        for entry in entries:
            try:
                if entry.is_dir():
                    if entry.name in SKIP_DIRS:
                        continue
                    walk(entry)
                elif entry.is_file():
                    if entry.name in SKIP_FILES:
                        continue
                    ext = entry.suffix.lower()
                    if ext not in SUPPORTED_EXTENSIONS:
                        skipped.append(str(entry.relative_to(root_dir)))
                        continue
                    # Skip files > 500KB (likely generated/minified)
                    if entry.stat().st_size > MAX_FILE_SIZE:
                        skipped.append(str(entry.relative_to(root_dir)))
                        continue
                    # Quick binary check
                    try:
                        head = entry.read_bytes()[:512]
                        if b"\x00" in head:
                            skipped.append(str(entry.relative_to(root_dir)))
                            continue
                    except OSError:
                        continue
                    files.append(entry)
            except OSError:
                continue

    walk(dir_path)
    return files, skipped


def scan_directory(dir_path: str) -> DirectoryScanResult:
    """Scan all supported files in a directory tree."""
    start_time = time.perf_counter()
    abs_dir = Path(dir_path).resolve()
    file_paths, skipped = _collect_files(abs_dir, abs_dir)

    results: list[ScanResult] = []
    errors: list[str] = []

    for file_path in file_paths:
        try:
            result = analyze(str(file_path))
            results.append(result)
        except Exception:
            errors.append(str(file_path.relative_to(abs_dir)))

    # Aggregate stats
    total_lines = 0
    ai_lines = 0
    human_lines = 0
    unknown_lines = 0

    for r in results:
        total_lines += r.file.total_lines
        file_lines = r.file.total_lines
        ai_lines += round(file_lines * r.summary.ai_percentage / 100)
        human_lines += round(file_lines * r.summary.human_percentage / 100)
        unknown_lines += round(file_lines * r.summary.unknown_percentage / 100)

    total = ai_lines + human_lines + unknown_lines
    duration = round((time.perf_counter() - start_time) * 1000)

    return DirectoryScanResult(
        root=str(abs_dir),
        files=tuple(results),
        skipped=tuple(list(skipped) + errors),
        total_files=len(results),
        total_lines=total_lines,
        ai_lines=ai_lines,
        human_lines=human_lines,
        unknown_lines=unknown_lines,
        ai_percentage=round(ai_lines / total * 100) if total > 0 else 0,
        human_percentage=round(human_lines / total * 100) if total > 0 else 0,
        duration=duration,
    )
