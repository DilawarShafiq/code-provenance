"""CLI entry point for Code Provenance."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click

from code_provenance import __version__
from code_provenance.core.analyzer import analyze
from code_provenance.core.scanner import scan_directory, DirectoryScanResult
from code_provenance.reports.terminal_report import terminal_formatter
from code_provenance.reports.json_report import json_formatter
from code_provenance.reports.markdown_report import markdown_formatter
from code_provenance.types import ScanResult

# ANSI color codes
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RESET = "\033[0m"


def _select_formatter(fmt: str, use_json: bool):
    """Select the appropriate report formatter."""
    if use_json:
        fmt = "json"

    formatters = {
        "terminal": terminal_formatter,
        "json": json_formatter,
        "markdown": markdown_formatter,
    }

    formatter = formatters.get(fmt)
    if not formatter:
        click.echo(f'Error: Unknown format "{fmt}". Use: terminal, json, markdown', err=True)
        sys.exit(2)
    return formatter


def _format_directory_terminal(dir_result: DirectoryScanResult) -> str:
    """Format directory scan results for terminal output."""
    lines: list[str] = []

    lines.append(f"{BOLD}Code Provenance v{__version__}{RESET}")
    lines.append(f"{DIM}{chr(0x2500) * 30}{RESET}")
    lines.append("")

    try:
        rel_root = str(Path(dir_result.root).relative_to(Path.cwd())) or "."
    except ValueError:
        rel_root = dir_result.root
    if not rel_root:
        rel_root = "."

    lines.append(
        f"\U0001f4c2 {BOLD}{rel_root}{RESET} "
        f"({dir_result.total_files} files, {dir_result.total_lines} lines)"
    )
    lines.append("")

    # Per-file summary table
    sorted_files = sorted(dir_result.files, key=lambda f: f.summary.ai_percentage, reverse=True)

    for file_result in sorted_files:
        rel_path = file_result.file.relative_path
        ai = file_result.summary.ai_percentage
        icon = "\U0001f916" if ai > 50 else "\u26a0\ufe0f" if ai > 0 else "\U0001f464"
        color = RED if ai > 50 else YELLOW if ai > 0 else GREEN

        model = ""
        if ai > 0:
            ai_range = next(
                (r for r in file_result.ranges
                 if r.classification.value == "ai-generated" and r.model_attribution),
                None,
            )
            if ai_range and ai_range.model_attribution:
                m = ai_range.model_attribution.model.value
                if m != "unknown":
                    model = f"{DIM} ({m}){RESET}"

        pct_str = f"{ai}%".rjust(4)
        lines.append(f"  {icon} {color}{pct_str} AI{RESET}  {DIM}{rel_path}{RESET}{model}")

    # Aggregate summary
    lines.append("")
    lines.append(f"{DIM}{chr(0x2500) * 30}{RESET}")

    ai_part = (
        f"{RED}{dir_result.ai_percentage}% AI-generated{RESET}"
        if dir_result.ai_percentage > 0
        else f"{dir_result.ai_percentage}% AI-generated"
    )
    human_part = (
        f"{GREEN}{dir_result.human_percentage}% Human-written{RESET}"
        if dir_result.human_percentage > 0
        else f"{dir_result.human_percentage}% Human-written"
    )

    lines.append(
        f"Summary: {ai_part} | {human_part} "
        f"({dir_result.total_files} files, {dir_result.total_lines} lines)"
    )
    lines.append(f"{DIM}Scanned in {dir_result.duration}ms{RESET}")

    if dir_result.skipped:
        lines.append(f"{DIM}Skipped {len(dir_result.skipped)} unsupported files{RESET}")

    return "\n".join(lines)


def _format_directory_json(dir_result: DirectoryScanResult) -> str:
    """Format directory scan results as JSON."""
    output = {
        "version": __version__,
        "root": dir_result.root,
        "summary": {
            "totalFiles": dir_result.total_files,
            "totalLines": dir_result.total_lines,
            "aiPercentage": dir_result.ai_percentage,
            "humanPercentage": dir_result.human_percentage,
            "aiLines": dir_result.ai_lines,
            "humanLines": dir_result.human_lines,
            "unknownLines": dir_result.unknown_lines,
        },
        "files": [
            {
                "file": {
                    "path": r.file.path,
                    "relativePath": r.file.relative_path,
                    "totalLines": r.file.total_lines,
                    "language": r.file.language,
                    "parserUsed": r.file.parser_used,
                },
                "summary": {
                    "aiPercentage": r.summary.ai_percentage,
                    "humanPercentage": r.summary.human_percentage,
                    "unknownPercentage": r.summary.unknown_percentage,
                    "overallConfidence": r.summary.overall_confidence.value,
                },
            }
            for r in dir_result.files
        ],
        "skipped": list(dir_result.skipped),
        "duration": dir_result.duration,
    }
    return json.dumps(output, indent=2)


@click.group()
@click.version_option(__version__, prog_name="code-provenance")
def cli():
    """Detect AI-generated code. Every line of code has a story."""
    pass


@cli.command()
@click.argument("path", type=click.Path(exists=True))
@click.option("-j", "--json", "use_json", is_flag=True, help="Output results as JSON")
@click.option(
    "-f", "--format", "fmt", default="terminal",
    type=click.Choice(["terminal", "json", "markdown"]),
    help="Output format",
)
@click.option("--no-color", is_flag=True, help="Disable colored output")
def scan(path: str, use_json: bool, fmt: str, no_color: bool):
    """Scan a file or directory for AI-generated code."""
    try:
        target = Path(path)

        if target.is_dir():
            # Directory scan
            dir_result = scan_directory(str(target))

            effective_format = "json" if use_json else fmt
            if effective_format == "json":
                click.echo(_format_directory_json(dir_result))
            else:
                click.echo(_format_directory_terminal(dir_result))

            sys.exit(1 if dir_result.ai_percentage > 0 else 0)
        else:
            # Single file scan
            formatter = _select_formatter(fmt, use_json)
            result = analyze(str(target))
            output = formatter.format(result)
            click.echo(output)

            sys.exit(1 if result.summary.ai_percentage > 0 else 0)

    except Exception as err:
        message = str(err)

        if use_json or fmt == "json":
            click.echo(
                json.dumps({"error": True, "message": message, "code": 2}),
                err=True,
            )
        else:
            click.echo(f"Error: {message}", err=True)

        sys.exit(2)


def main():
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
