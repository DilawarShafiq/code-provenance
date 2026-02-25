# Data Model: AI Code Detection

**Feature**: `001-ai-code-detection`
**Date**: 2026-02-25
**Source**: [spec.md](./spec.md) Key Entities + [research.md](./research.md)

---

## Core Entities

### ScanResult

The complete output of analyzing a single file. Immutable after creation.

| Field | Type | Description |
|-------|------|-------------|
| file | FileMetadata | Source file information |
| ranges | LineRange[] | Ordered, non-overlapping classified line ranges |
| summary | ScanSummary | Aggregate statistics |
| metadata | AnalysisMetadata | Reproducibility information |

### FileMetadata

| Field | Type | Description |
|-------|------|-------------|
| path | string | Absolute path to the scanned file |
| relativePath | string | Path relative to CWD (used in display) |
| totalLines | number | Total line count |
| language | string | Detected language ("typescript", "javascript", "unknown") |
| parserUsed | string | Which parser analyzed this file ("typescript" \| "generic") |

### LineRange

A contiguous block of lines sharing a single classification.

| Field | Type | Description |
|-------|------|-------------|
| startLine | number | First line (1-indexed, inclusive) |
| endLine | number | Last line (1-indexed, inclusive) |
| classification | Classification | "ai-generated" \| "human-written" \| "unknown" |
| confidence | number | 0-100 calibrated confidence score |
| modelAttribution | ModelAttribution \| null | Which AI model, if detected. null for human/unknown. |
| signals | DetectionSignal[] | Evidence supporting this classification |

### Classification (enum)

| Value | Meaning |
|-------|---------|
| "ai-generated" | Line range identified as AI-produced code |
| "human-written" | Line range identified as human-authored code |
| "unknown" | Insufficient or contradictory signals |

### ModelAttribution

| Field | Type | Description |
|-------|------|-------------|
| model | string | "claude" \| "gpt" \| "copilot" \| "unknown" |
| confidence | number | 0-100 confidence in model identification |
| matchedPatterns | string[] | Which patterns triggered (for forensic evidence) |

### DetectionSignal

An individual observation from a detector.

| Field | Type | Description |
|-------|------|-------------|
| detector | string | Detector name (e.g., "entropy", "comment-patterns") |
| signalType | string | Specific signal within the detector |
| strength | number | 0.0 - 1.0 signal strength |
| location | { startLine: number, endLine: number } | Where in the file |
| description | string | Human-readable explanation of the finding |

### ScanSummary

| Field | Type | Description |
|-------|------|-------------|
| aiPercentage | number | Percentage of lines classified as AI-generated |
| humanPercentage | number | Percentage of lines classified as human-written |
| unknownPercentage | number | Percentage of lines classified as unknown |
| overallConfidence | ConfidenceLevel | Aggregate confidence assessment |
| modelBreakdown | Record<string, number> | Lines per attributed model |

### ConfidenceLevel (enum)

| Value | Criteria |
|-------|----------|
| "HIGH" | Average confidence across ranges > 75% and no unknown ranges > 20% of file |
| "MEDIUM" | Average confidence 50-75% or unknown ranges 20-40% of file |
| "LOW" | Average confidence < 50% or unknown ranges > 40% of file |

### AnalysisMetadata

| Field | Type | Description |
|-------|------|-------------|
| toolVersion | string | Code Provenance version (from package.json) |
| analyzedAt | string | ISO 8601 timestamp |
| algorithmVersions | Record<string, string> | Version per detector/algorithm |
| thresholds | Record<string, number> | Active threshold values |
| duration | number | Analysis time in milliseconds |

---

## Parser Entities

### ParsedCode

Output of a parser. Provides structured access to code for detectors.

| Field | Type | Description |
|-------|------|-------------|
| lines | string[] | Raw lines of code |
| language | string | Detected language |
| functions | FunctionInfo[] | Extracted functions (AST parsers) or empty (generic) |
| imports | ImportInfo[] | Extracted imports or empty |
| comments | CommentInfo[] | Extracted comments with positions |
| identifiers | IdentifierInfo[] | Variable/function names with positions |

### FunctionInfo

| Field | Type | Description |
|-------|------|-------------|
| name | string | Function/method name |
| startLine | number | First line |
| endLine | number | Last line |
| lineCount | number | Length in lines |
| hasErrorHandling | boolean | Contains try/catch |
| paramCount | number | Number of parameters |

### ImportInfo

| Field | Type | Description |
|-------|------|-------------|
| source | string | Module specifier |
| line | number | Line number |
| isTypeOnly | boolean | `import type` (TypeScript) |

### CommentInfo

| Field | Type | Description |
|-------|------|-------------|
| text | string | Comment content |
| startLine | number | First line |
| endLine | number | Last line |
| kind | string | "line" \| "block" \| "jsdoc" |

### IdentifierInfo

| Field | Type | Description |
|-------|------|-------------|
| name | string | Identifier text |
| line | number | Line number |
| kind | string | "variable" \| "function" \| "parameter" \| "property" |

---

## Relationships

```
ScanResult
├── FileMetadata (1:1)
├── LineRange[] (1:N, ordered by startLine)
│   ├── Classification (enum)
│   ├── ModelAttribution? (0:1)
│   └── DetectionSignal[] (1:N, evidence)
├── ScanSummary (1:1)
│   └── ConfidenceLevel (enum)
└── AnalysisMetadata (1:1)

ParsedCode (intermediate, not persisted)
├── FunctionInfo[] (0:N)
├── ImportInfo[] (0:N)
├── CommentInfo[] (0:N)
└── IdentifierInfo[] (0:N)
```

## Validation Rules

- LineRange: `startLine >= 1`, `endLine >= startLine`, `confidence` in [0, 100]
- Ranges in ScanResult must be non-overlapping and ordered by startLine
- Ranges must cover all lines in the file (no gaps)
- Summary percentages must sum to 100% (within floating-point tolerance)
- ModelAttribution only present when classification is "ai-generated"
- AnalysisMetadata.duration must be > 0
