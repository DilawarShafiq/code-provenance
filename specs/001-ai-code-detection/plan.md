# Implementation Plan: AI Code Detection

**Branch**: `001-ai-code-detection` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-ai-code-detection/spec.md`

## Summary

Build a CLI tool that scans source files and classifies line ranges as AI-generated or human-written using pure offline heuristics — entropy analysis, n-gram frequency, structural pattern detection, and model-specific fingerprints. Produces terminal, JSON, and markdown output with calibrated confidence scores and model attribution (Claude/GPT/Copilot).

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, ESM only)
**Primary Dependencies**: Commander.js (CLI), kleur (terminal colors), TypeScript Compiler API (AST parsing)
**Storage**: N/A — stateless single-file analysis, no persistence in MVP
**Testing**: Vitest with benchmark fixtures
**Target Platform**: Node.js >= 18, cross-platform (macOS, Linux, Windows)
**Project Type**: Single CLI application
**Performance Goals**: Single-file scan < 200ms, 10k-line file within budget
**Constraints**: Zero network calls, < 512MB memory, fully offline, deterministic output
**Scale/Scope**: Single-file analysis MVP; directory scanning deferred to v2

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| 1. Accuracy-First | PASS | Confidence scores 0-100% per line range (FR-002). Unknown over false certainty (FR-015). Sigmoid calibration creates wide "unknown" band. Zero false positive target (SC-003). |
| 2. Language-Agnostic | PASS | Generic fallback parser for any text file (FR-007). TypeScript parser uses pluggable interface (FR-006). Adding a language = implementing the Parser interface only. |
| 3. Privacy-Respecting | PASS | Zero network calls enforced (FR-012, SC-006). No telemetry. All heuristic baselines shipped as local JSON. Fully air-gapped. |
| 4. Forensic-Grade | PASS | Deterministic output (FR-013, SC-007). Evidence citations per line range. Methodology metadata in all outputs (FR-014). Structured for audit (FR-010). |
| 5. CLI-First | PASS | Commander.js CLI with scan subcommand. Human-readable default + --json flag (FR-008, FR-009). Meaningful exit codes 0/1/2 (FR-011). No interactive prompts. |
| 6. Incremental Analysis | PARTIAL | Single-file only in MVP. Caching and directory scanning deferred to v2. Constitution allows single-file scanning. |

**Gate result**: PASS — All 6 principles satisfied for MVP scope. Principle 6 partially addressed (single-file in scope; caching is v2).

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-code-detection/
├── plan.md              # This file
├── research.md          # Phase 0 output — 8 research decisions
├── data-model.md        # Phase 1 output — entity schemas
├── quickstart.md        # Phase 1 output — developer setup guide
├── contracts/           # Phase 1 output — API/CLI contracts
│   └── cli-contract.md  # CLI interface contract
└── tasks.md             # Phase 2 output (/sp.tasks)
```

### Source Code (repository root)

```text
src/
├── cli.ts                        # CLI entry point — Commander.js setup, scan command
├── types.ts                      # Core type definitions — all shared interfaces
├── core/
│   ├── analyzer.ts               # Orchestrator — runs all detectors, aggregates signals
│   ├── confidence.ts             # Weighted scoring + sigmoid calibration
│   └── segmenter.ts              # Sliding window + change-point + merge pass
├── detectors/
│   ├── detector.ts               # Detector interface contract
│   ├── comment-patterns.ts       # Comment density, placement, JSDoc patterns
│   ├── naming-patterns.ts        # Generic vs domain-specific identifier analysis
│   ├── entropy.ts                # Character + token Shannon entropy
│   ├── structural.ts             # Import order, function length, error handling
│   └── model-signatures.ts       # Claude/GPT/Copilot pattern matching
├── parsers/
│   ├── parser.ts                 # Parser interface contract
│   ├── typescript-parser.ts      # TypeScript Compiler API — AST-based parsing
│   └── generic-parser.ts         # Line-based fallback — regex tokenization
├── reports/
│   ├── terminal-report.ts        # kleur-based colored CLI output
│   ├── json-report.ts            # Structured JSON serialization
│   └── markdown-report.ts        # Audit-ready markdown generation
└── data/
    ├── ai-ngrams.json            # Pre-computed AI code n-gram baselines
    ├── human-ngrams.json         # Pre-computed human code n-gram baselines
    └── model-signatures.json     # Model-specific pattern definitions

tests/
├── unit/
│   ├── detectors/
│   │   ├── comment-patterns.test.ts
│   │   ├── naming-patterns.test.ts
│   │   ├── entropy.test.ts
│   │   ├── structural.test.ts
│   │   └── model-signatures.test.ts
│   ├── core/
│   │   ├── analyzer.test.ts
│   │   ├── confidence.test.ts
│   │   └── segmenter.test.ts
│   ├── parsers/
│   │   ├── typescript-parser.test.ts
│   │   └── generic-parser.test.ts
│   └── reports/
│       ├── terminal-report.test.ts
│       ├── json-report.test.ts
│       └── markdown-report.test.ts
├── integration/
│   └── scan-pipeline.test.ts     # End-to-end: file → scan → report
├── fixtures/
│   ├── ai-generated/             # Known AI-generated code samples
│   │   ├── claude-auth.ts
│   │   ├── gpt-utils.ts
│   │   └── copilot-helpers.ts
│   ├── human-written/            # Known human-written code samples
│   │   ├── irregular-style.ts
│   │   └── domain-specific.ts
│   └── mixed/                    # Files with both AI and human sections
│       └── mixed-auth.ts
└── benchmarks/
    └── scan-performance.bench.ts # Performance regression tests
```

**Structure Decision**: Single project layout. The tool is a CLI application — no frontend, no backend, no microservices. The `src/` tree mirrors the architecture from the user's vision with clear separation: parsers → detectors → core orchestration → reports.

## Architecture Decisions

### AD-1: Detection Pipeline — Linear Pipeline with Parallel Detectors

**Flow**: File → Parser → [Detectors in parallel] → Signal Aggregation → Segmentation → Confidence Calibration → Report

Each detector runs independently on parsed code and emits `DetectionSignal[]`. The analyzer collects all signals, the segmenter groups them into line ranges, and the confidence module calibrates scores. This is embarrassingly parallel — detectors share no state.

**Why**: Simplest architecture that allows adding/removing detectors without touching orchestration. Each detector is testable in isolation. Matches the constitution's "pluggable heuristics" principle.

### AD-2: Sliding Window Segmentation — 20-line windows, 10-line stride

**Approach**: Analyze code in overlapping 20-line windows (50% overlap). Each window gets classified independently. Then merge adjacent windows with the same classification. Discard segments < 5 lines.

**Why**: 20 lines provides enough statistical mass for entropy/n-gram analysis (~500-1500 characters). Aligns with typical function sizes. 50% overlap prevents missing transitions at window boundaries. The merge pass produces clean, human-readable line ranges.

### AD-3: Confidence Calibration — Weighted Signals + Sigmoid Mapping

**Approach**: Each detector contributes a 0-1 signal strength. Weighted sum produces raw score. Sigmoid function `1 / (1 + exp(-k * (raw - midpoint)))` maps to calibrated 0-100%. The "unknown" band (20-60% raw) maps to low confidence, triggering "unknown" classification per constitution.

**Weights** (from research):
- Entropy analysis: 0.25
- N-gram frequency: 0.20
- Comment patterns: 0.15
- Naming patterns: 0.15
- Structural patterns: 0.15
- Model signatures: 0.10

**Why**: No ML dependencies, no training data. Sigmoid creates natural conservative behavior at extremes. Weights can be tuned against benchmark fixtures without retraining.

### AD-4: Parser Interface — Strategy Pattern

```
interface Parser {
  readonly language: string;
  canParse(filePath: string): boolean;
  parse(content: string): ParsedCode;
}
```

TypeScript parser uses `ts.createSourceFile()` (no type-checking, ~50ms for 10k lines). Generic parser uses regex-based tokenization. Parser selection: try TypeScript first for .ts/.tsx/.js/.jsx files, fall back to generic for everything else.

**Why**: Constitution mandates language-agnostic design. New languages = new Parser implementation, zero changes to core.

### AD-5: Output Strategy — Formatter Interface

```
interface ReportFormatter {
  format(result: ScanResult): string;
}
```

Three implementations: TerminalFormatter (default, kleur colors), JsonFormatter (--json), MarkdownFormatter (--format markdown). Selected at CLI parse time.

**Why**: Clean separation of analysis from presentation. Same ScanResult feeds all formats. Determinism is guaranteed because formatting is pure function of ScanResult.

## Complexity Tracking

No constitution violations to justify. All decisions use the simplest viable approach.

## Post-Design Constitution Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| 1. Accuracy-First | PASS | Sigmoid calibration + wide unknown band + zero-false-positive benchmark target |
| 2. Language-Agnostic | PASS | Parser interface, generic fallback, core detectors operate on ParsedCode not raw syntax |
| 3. Privacy-Respecting | PASS | Zero dependencies with network access. All data local. No telemetry. |
| 4. Forensic-Grade | PASS | DetectionSignal evidence trail, methodology metadata, deterministic pipeline |
| 5. CLI-First | PASS | Commander.js, subcommands, --json/--format flags, exit codes 0/1/2 |
| 6. Incremental Analysis | PARTIAL (acceptable) | Single-file MVP. Interface designed for future caching layer. |

**Final gate**: PASS
