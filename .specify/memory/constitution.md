<!--
Sync Impact Report
==================
Version: 1.0.0
Ratified: 2026-02-24
Status: ACTIVE
Changes: Initial ratification of 6 core principles.
Impact: All agents, specs, and plans MUST comply with these principles.
-->

# Project Constitution: Code Provenance

**Version:** 1.0.0
**Ratified:** 2026-02-24
**Status:** Active

## Project Identity

- **Name:** Code Provenance
- **Purpose:** A code fingerprinting engine that detects AI-generated vs human-written code, identifies code theft, catches license violations, and traces code lineage across the open-source ecosystem.
- **Tagline:** "Every line of code has a story. We tell it."

## Core Principles

### 1. Accuracy-First

Zero tolerance for false positives on provenance claims. Confidence scores MUST be calibrated and honest. "Unknown" is an acceptable answer; false certainty is not.

- Every detection claim MUST include a calibrated confidence score (0–100%).
- Confidence thresholds MUST be tunable per use case (e.g., legal review vs. quick scan).
- False positive rate MUST be measured and tracked in CI against known benchmarks.
- When evidence is insufficient, the system MUST report "unknown" rather than guess.

### 2. Language-Agnostic

MUST analyze code in any programming language. Detection heuristics MUST NOT be hardcoded to a single language's patterns.

- Core fingerprinting algorithms MUST operate on abstract representations, not raw syntax.
- Language-specific parsers MUST be pluggable via a defined adapter interface.
- Adding a new language MUST NOT require changes to the core analysis engine.
- Tests MUST cover at least 3 language families (C-like, functional, scripting) at all times.

### 3. Privacy-Respecting

Code MUST never be uploaded to external services. All analysis runs locally. No telemetry, no cloud dependencies.

- Zero network calls during analysis. All fingerprinting, comparison, and reporting run offline.
- No telemetry, analytics, or usage tracking of any kind.
- No cloud dependencies — the tool MUST work fully air-gapped.
- Reference datasets (if any) MUST be distributed as local artifacts, never fetched at runtime.

### 4. Forensic-Grade

Results MUST be defensible and reproducible. Every claim MUST cite specific evidence (line ranges, pattern matches, similarity scores).

- Every provenance claim MUST cite specific evidence: line ranges, pattern matches, similarity scores.
- Reports MUST be deterministic — same input MUST produce identical output across runs.
- Output MUST include methodology metadata (algorithm versions, thresholds, reference data versions).
- Results MUST be structured for use in audits, compliance reviews, and legal proceedings.

### 5. CLI-First

Terminal is the primary interface. Output MUST be beautiful, informative, and machine-parseable.

- The CLI is the primary and canonical interface. All features MUST be accessible via CLI.
- Human-readable output by default with color, icons, and clear hierarchy.
- Machine-parseable output via `--json` flag on every command.
- Exit codes MUST be meaningful: 0 = clean, 1 = violations found, 2 = error.
- No interactive prompts in default mode — fully scriptable for CI/CD pipelines.

### 6. Incremental Analysis

MUST support scanning single files, directories, or entire projects. Large codebases MUST NOT require full re-analysis on every run.

- Support scanning a single file, a directory, or an entire project.
- Cache fingerprints so unchanged files are not re-analyzed.
- Cache invalidation MUST be correct — stale results are worse than slow results.
- Full project scan of 100k LOC MUST complete in under 60 seconds on commodity hardware.

## Tech Stack

| Layer         | Choice        | Rationale                                        |
|---------------|---------------|--------------------------------------------------|
| Language      | TypeScript    | Type safety, ecosystem, developer familiarity    |
| Runtime       | Node.js       | Cross-platform, async I/O for file scanning      |
| Module System | ESM           | Modern standard, tree-shakeable                  |
| Testing       | Vitest        | Fast, TypeScript-native, compatible with ESM     |
| Distribution  | npm           | Standard Node.js package distribution            |
| Code Quality  | Strict TS     | `strict: true`, no `any` without justification   |

## Quality Standards

### Code Quality
- Strict TypeScript (`strict: true` in tsconfig).
- No use of `any` without an inline justification comment.
- ESM modules only — no CommonJS require().
- All public APIs MUST have JSDoc documentation.

### Testing
- All detection heuristics MUST have unit tests with known-positive and known-negative samples.
- Integration tests MUST cover the full scan-to-report pipeline.
- Benchmark tests MUST guard against performance regressions.
- Test coverage target: 90%+ on core analysis modules.

### Performance
- Single-file scan: < 200ms.
- Full project (100k LOC): < 60 seconds.
- Memory usage: < 512MB for projects up to 500k LOC.
- Incremental re-scan: < 5 seconds for a 100k LOC project with 10 changed files.

### Security
- No network access during analysis.
- No secrets or tokens in source code.
- No eval() or dynamic code execution.
- Dependencies MUST be audited — zero known critical vulnerabilities.

## Architecture Principles

- **Separation of concerns:** Parsing, fingerprinting, comparison, and reporting are distinct layers.
- **Plugin architecture:** Language parsers and detection heuristics are pluggable.
- **Immutable analysis:** Input code is never modified. Analysis produces new artifacts.
- **Fail-safe defaults:** When uncertain, report "unknown" rather than a false claim.

## Non-Goals

- This is NOT a code formatter or linter.
- This is NOT a plagiarism detector for academic submissions (though it could be adapted).
- This is NOT a real-time IDE plugin (CLI-first; IDE integration is a future consideration).
- This does NOT replace legal counsel — it provides evidence, not legal opinions.

## Glossary

| Term              | Definition                                                                 |
|-------------------|----------------------------------------------------------------------------|
| Fingerprint       | A structural hash of a code fragment, resistant to superficial edits       |
| Provenance        | The origin and history of a piece of code                                  |
| Confidence Score  | A calibrated probability (0–100%) that a detection claim is correct        |
| Lineage           | The chain of derivation from original source to current form               |
| Detection Pattern | A heuristic rule that identifies characteristics of a code origin          |

## Amendment Process

1. Propose a change via PR with rationale.
2. All active contributors review.
3. Unanimous consent required for principle changes.
4. Version bump required for any constitution change.
