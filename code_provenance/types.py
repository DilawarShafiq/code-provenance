"""Core types for Code Provenance analysis engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol


# ---- Classification Enums ----

class Classification(str, Enum):
    AI_GENERATED = "ai-generated"
    HUMAN_WRITTEN = "human-written"
    UNKNOWN = "unknown"


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ModelName(str, Enum):
    CLAUDE = "claude"
    GPT = "gpt"
    COPILOT = "copilot"
    UNKNOWN = "unknown"


# ---- Core Analysis Types ----

@dataclass(frozen=True)
class Location:
    start_line: int
    end_line: int


@dataclass(frozen=True)
class DetectionSignal:
    detector: str
    signal_type: str
    strength: float  # 0.0 - 1.0
    location: Location
    description: str


@dataclass(frozen=True)
class ModelAttribution:
    model: ModelName
    confidence: int  # 0-100
    matched_patterns: tuple[str, ...]


@dataclass(frozen=True)
class LineRange:
    start_line: int  # 1-indexed, inclusive
    end_line: int  # 1-indexed, inclusive
    classification: Classification
    confidence: int  # 0-100
    model_attribution: ModelAttribution | None
    signals: tuple[DetectionSignal, ...]


@dataclass(frozen=True)
class FileMetadata:
    path: str
    relative_path: str
    total_lines: int
    language: str
    parser_used: str


@dataclass(frozen=True)
class ScanSummary:
    ai_percentage: int
    human_percentage: int
    unknown_percentage: int
    overall_confidence: ConfidenceLevel
    model_breakdown: dict[str, int]


@dataclass(frozen=True)
class AnalysisMetadata:
    tool_version: str
    analyzed_at: str  # ISO 8601
    algorithm_versions: dict[str, str]
    thresholds: dict[str, float]
    duration: int  # milliseconds


@dataclass(frozen=True)
class ScanResult:
    file: FileMetadata
    ranges: tuple[LineRange, ...]
    summary: ScanSummary
    metadata: AnalysisMetadata


# ---- Parser Types ----

@dataclass(frozen=True)
class FunctionInfo:
    name: str
    start_line: int
    end_line: int
    line_count: int
    has_error_handling: bool
    param_count: int


@dataclass(frozen=True)
class ImportInfo:
    source: str
    line: int
    is_type_only: bool


class CommentKind(str, Enum):
    LINE = "line"
    BLOCK = "block"
    JSDOC = "jsdoc"


@dataclass(frozen=True)
class CommentInfo:
    text: str
    start_line: int
    end_line: int
    kind: CommentKind


class IdentifierKind(str, Enum):
    VARIABLE = "variable"
    FUNCTION = "function"
    PARAMETER = "parameter"
    PROPERTY = "property"


@dataclass(frozen=True)
class IdentifierInfo:
    name: str
    line: int
    kind: IdentifierKind


@dataclass(frozen=True)
class ParsedCode:
    lines: tuple[str, ...]
    language: str
    functions: tuple[FunctionInfo, ...]
    imports: tuple[ImportInfo, ...]
    comments: tuple[CommentInfo, ...]
    identifiers: tuple[IdentifierInfo, ...]


# ---- Contracts (Protocols) ----

class Detector(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def version(self) -> str: ...

    def detect(self, code: ParsedCode) -> list[DetectionSignal]: ...


class Parser(Protocol):
    @property
    def language(self) -> str: ...

    def can_parse(self, file_path: str) -> bool: ...

    def parse(self, content: str, file_path: str) -> ParsedCode: ...


class ReportFormatter(Protocol):
    def format(self, result: ScanResult) -> str: ...


# ---- Window Types (internal) ----

@dataclass(frozen=True)
class WindowClassification:
    start_line: int
    end_line: int
    classification: Classification
    confidence: int
    signals: tuple[DetectionSignal, ...]
