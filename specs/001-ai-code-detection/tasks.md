# Tasks: AI Code Detection

**Input**: Design documents from `/specs/001-ai-code-detection/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/cli-contract.md

**Tests**: Included — constitution mandates 90%+ coverage on core modules and benchmark tests.

**Organization**: Tasks grouped by user story. Each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, build configuration

- [ ] T001 Initialize TypeScript project with tsconfig.json (strict: true, ESM, target ES2022, moduleResolution bundler, outDir dist/)
- [ ] T002 Install production dependencies: commander@14, kleur@4, typescript@5 — run `npm install commander kleur typescript`
- [ ] T003 Install dev dependencies: vitest, @types/node — run `npm install -D vitest @types/node`
- [ ] T004 [P] Update package.json scripts: build (tsc), dev (node --loader ts-node/esm src/cli.ts), test (vitest run), test:watch (vitest), test:coverage (vitest --coverage), bench (vitest bench), typecheck (tsc --noEmit), lint (tsc --noEmit)
- [ ] T005 [P] Create vitest.config.ts with globals: true, include tests/**/*.test.ts, benchmark include tests/benchmarks/**/*.bench.ts
- [ ] T006 [P] Create src/types.ts with all core type definitions from data-model.md: Classification, ConfidenceLevel, DetectionSignal, LineRange, ModelAttribution, ScanResult, ScanSummary, FileMetadata, AnalysisMetadata, ParsedCode, FunctionInfo, ImportInfo, CommentInfo, IdentifierInfo, Detector interface, Parser interface, ReportFormatter interface
- [ ] T007 Create project directory structure per plan.md: src/core/, src/detectors/, src/parsers/, src/reports/, src/data/, tests/unit/detectors/, tests/unit/core/, tests/unit/parsers/, tests/unit/reports/, tests/integration/, tests/fixtures/ai-generated/, tests/fixtures/human-written/, tests/fixtures/mixed/, tests/benchmarks/

**Checkpoint**: TypeScript project compiles, tests run (empty), types defined

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Parser infrastructure and detector interface that ALL user stories depend on

**CRITICAL**: No user story work can begin until parsers and detector framework are complete

- [ ] T008 Implement Parser interface contract in src/parsers/parser.ts — export the Parser interface and parser resolution function selectParser(filePath: string): Parser
- [ ] T009 Implement TypeScript parser in src/parsers/typescript-parser.ts — use ts.createSourceFile() (NOT createProgram) to extract FunctionInfo[], ImportInfo[], CommentInfo[], IdentifierInfo[] from TypeScript/JavaScript files (.ts, .tsx, .js, .jsx)
- [ ] T010 Implement generic fallback parser in src/parsers/generic-parser.ts — regex-based line tokenizer that extracts comments (// and /* */), identifiers, and basic function boundaries for any text file
- [ ] T011 [P] Implement Detector interface contract in src/detectors/detector.ts — export Detector interface with detect(code: ParsedCode): DetectionSignal[]
- [ ] T012 [P] Create test fixture: tests/fixtures/ai-generated/claude-auth.ts — a TypeScript auth module written in Claude style (functional, const-heavy, import type, verbose type annotations, thorough error handling)
- [ ] T013 [P] Create test fixture: tests/fixtures/ai-generated/gpt-utils.ts — a TypeScript utility module written in GPT style (verbose comments before every function, // This function does X, step-by-step comments, generic naming)
- [ ] T014 [P] Create test fixture: tests/fixtures/ai-generated/copilot-helpers.ts — a TypeScript helper module in Copilot style (short completions 5-15 lines, no surrounding comments, context mimicry)
- [ ] T015 [P] Create test fixture: tests/fixtures/human-written/irregular-style.ts — human-written TypeScript with inconsistent formatting, domain-specific naming, variable comment density, irregular function lengths
- [ ] T016 [P] Create test fixture: tests/fixtures/human-written/domain-specific.ts — human-written TypeScript with strong personal style, domain jargon in identifiers, minimal comments, varied patterns
- [ ] T017 [P] Create test fixture: tests/fixtures/mixed/mixed-auth.ts — TypeScript file with lines 1-45 AI-generated (Claude), lines 46-120 human-written, lines 121-180 AI-generated (GPT), lines 181-220 human-written. Add companion tests/fixtures/mixed/mixed-auth.meta.json with ground truth labels
- [ ] T018 Write unit tests for TypeScript parser in tests/unit/parsers/typescript-parser.test.ts — test extraction of functions, imports, comments, identifiers from fixture files. Verify parse completes in < 50ms for 10k-line fixture
- [ ] T019 [P] Write unit tests for generic parser in tests/unit/parsers/generic-parser.test.ts — test comment extraction, identifier extraction, function boundary detection on Python-style and plain-text fixtures

**Checkpoint**: Foundation ready — parsers extract structured data from files, detector interface defined, all fixtures created. User story implementation can begin.

---

## Phase 3: User Story 1 — Scan a Single File for AI-Generated Code (Priority: P1) MVP

**Goal**: `code-provenance scan ./file.ts` produces line-range classification with confidence scores

**Independent Test**: Scan any TypeScript fixture file → output shows classified line ranges with confidence percentages

### Tests for User Story 1

- [ ] T020 [P] [US1] Write unit tests for entropy detector in tests/unit/detectors/entropy.test.ts — test Shannon entropy calculation on known strings, verify AI-generated fixtures produce entropy < 4.0, human fixtures > 4.5, verify 20-line window calculation
- [ ] T021 [P] [US1] Write unit tests for comment-patterns detector in tests/unit/detectors/comment-patterns.test.ts — test comment density ratio, JSDoc detection, pre-function comment patterns, verify AI fixtures score > 0.30 density
- [ ] T022 [P] [US1] Write unit tests for naming-patterns detector in tests/unit/detectors/naming-patterns.test.ts — test generic identifier detection (data, result, response, value, item, element, temp, info, output, input), verify AI fixtures have > 25% generic ratio
- [ ] T023 [P] [US1] Write unit tests for structural detector in tests/unit/detectors/structural.test.ts — test import alphabetical sort %, function length coefficient of variation, try/catch wrapping ratio
- [ ] T024 [P] [US1] Write unit tests for confidence calibration in tests/unit/core/confidence.test.ts — test weighted signal aggregation, sigmoid mapping (raw 0.3 → ~12%, raw 0.5 → 50%, raw 0.7 → ~88%), unknown band classification
- [ ] T025 [P] [US1] Write unit tests for segmenter in tests/unit/core/segmenter.test.ts — test 20-line window with 10-line stride, change-point detection, merge pass, minimum 5-line segment rule

### Implementation for User Story 1

- [ ] T026 [P] [US1] Implement entropy detector in src/detectors/entropy.ts — Shannon entropy on character frequencies per 20-line window. Thresholds: < 4.0 strong AI signal, 4.0-4.5 weak signal, > 4.5 human signal. Return DetectionSignal[] with strength 0-1
- [ ] T027 [P] [US1] Implement comment-patterns detector in src/detectors/comment-patterns.ts — compute comment-to-code ratio, detect pre-function comment patterns, JSDoc density. AI signal: ratio > 0.30, pre-function comments on > 60% of functions
- [ ] T028 [P] [US1] Implement naming-patterns detector in src/detectors/naming-patterns.ts — count generic identifiers (data, result, response, value, item, element, temp, info, output, input, config, options, params, args, handler, callback, error, err) vs domain-specific. AI signal: generic ratio > 0.25
- [ ] T029 [P] [US1] Implement structural detector in src/detectors/structural.ts — analyze import alphabetical sort % (AI > 90%), function length coefficient of variation (AI < 0.3), try/catch wrapping ratio (AI > 70% of async functions)
- [ ] T030 [US1] Implement segmenter in src/core/segmenter.ts — sliding window (20 lines, 10-line stride), classify each window by aggregating detector signals, detect change points between adjacent windows, merge same-classification runs, discard ranges < 5 lines
- [ ] T031 [US1] Implement confidence calibration in src/core/confidence.ts — weighted signal aggregation (entropy: 0.25, ngram: 0.20, comments: 0.15, naming: 0.15, structural: 0.15, model-sigs: 0.10), sigmoid mapping with k=10 midpoint=0.5, classify: >60% → ai-generated, <40% → human-written, 40-60% → unknown
- [ ] T032 [US1] Implement analyzer orchestrator in src/core/analyzer.ts — accept file path, select parser, run all registered detectors, pass signals to segmenter, calibrate confidence per range, assemble ScanResult with FileMetadata, LineRange[], ScanSummary, AnalysisMetadata
- [ ] T033 [US1] Implement terminal report formatter in src/reports/terminal-report.ts — kleur-based colored output matching the CLI contract: header with version, file info with line count, line ranges with icons (AI/human/unknown), confidence %, summary line, overall confidence level. Respect NO_COLOR env
- [ ] T034 [US1] Implement CLI entry point in src/cli.ts — Commander.js program with `scan <file>` command, --no-color flag, version from package.json. Wire: parse args → read file → analyzer.analyze() → terminal report → stdout. Exit codes: 0 (no AI), 1 (AI detected), 2 (error). Handle file-not-found, binary detection, empty file, read permission errors
- [ ] T035 [US1] Write integration test in tests/integration/scan-pipeline.test.ts — end-to-end: scan claude-auth.ts fixture → verify all ranges classified AI with > 75% confidence. Scan human irregular-style.ts → verify all ranges classified human. Scan mixed-auth.ts → verify correct transitions at labeled boundaries
- [ ] T036 [US1] Write performance benchmark in tests/benchmarks/scan-performance.bench.ts — verify single-file scan of 220-line fixture completes in < 200ms. Generate a synthetic 10k-line fixture and verify scan completes in < 200ms

**Checkpoint**: `code-provenance scan ./file.ts` works end-to-end. Line ranges classified with confidence. Terminal output is beautiful and readable. All US1 tests pass.

---

## Phase 4: User Story 2 — JSON Output for CI/CD (Priority: P2)

**Goal**: `--json` flag produces valid structured JSON matching the contract schema

**Independent Test**: Run scan with --json, validate output with JSON.parse, verify schema matches cli-contract.md

### Tests for User Story 2

- [ ] T037 [P] [US2] Write unit tests for JSON report formatter in tests/unit/reports/json-report.test.ts — verify output is valid JSON, contains all required fields (file, ranges, summary, metadata), verify deterministic (same input → byte-identical output)

### Implementation for User Story 2

- [ ] T038 [US2] Implement JSON report formatter in src/reports/json-report.ts — serialize ScanResult to JSON matching the contract schema. Include all fields: file metadata, ranges with signals, summary with percentages, metadata with algorithm versions and thresholds. Deterministic key ordering
- [ ] T039 [US2] Wire --json and --format flags in src/cli.ts — add --json (-j) shortcut and --format (-f) option accepting "terminal" | "json" | "markdown". Select formatter based on flag. JSON errors go to stderr as JSON objects with error:true
- [ ] T040 [US2] Write integration test for JSON output in tests/integration/scan-pipeline.test.ts — scan fixture with --json, JSON.parse the output, validate all required fields present, verify exit code 0 for clean file, exit code 1 for AI-detected file, exit code 2 for invalid path

**Checkpoint**: `code-provenance scan file.ts --json` produces valid, parseable JSON. Exit codes work. CI/CD integration ready.

---

## Phase 5: User Story 3 — AI Model Attribution (Priority: P2)

**Goal**: Identify which AI model (Claude/GPT/Copilot) generated detected code segments

**Independent Test**: Scan model-specific fixtures, verify correct model attribution in output

### Tests for User Story 3

- [ ] T041 [P] [US3] Write unit tests for model-signatures detector in tests/unit/detectors/model-signatures.test.ts — test Claude patterns (functional, const-heavy, import type), GPT patterns (verbose pre-function comments, step-by-step), Copilot patterns (short completions, no comments). Verify correct model returned for each fixture

### Implementation for User Story 3

- [ ] T042 [US3] Create model signature data in src/data/model-signatures.json — define pattern rules for Claude (const ratio > 85%, import type usage, .map/.filter/.reduce preference, minimal mutation), GPT (pre-function comment ratio > 60%, "This function" pattern, step-by-step comments, extensive JSDoc), Copilot (avg function length 5-15 lines, no surrounding comments, context-mimicking names)
- [ ] T043 [US3] Implement model-signatures detector in src/detectors/model-signatures.ts — load signatures from JSON, score each model against parsed code features, return ModelAttribution with model name, confidence, matched patterns. Attribution threshold: top model score > 0.6 with gap > 0.2 to second = attributed; otherwise "unknown"
- [ ] T044 [US3] Wire model attribution into analyzer in src/core/analyzer.ts — add model-signatures detector to detector registry, include ModelAttribution in LineRange when classification is ai-generated
- [ ] T045 [US3] Update terminal report to show model attribution in src/reports/terminal-report.ts — display model name after confidence % for AI-generated ranges (e.g., "Claude-style patterns", "GPT-style patterns")
- [ ] T046 [US3] Write integration test for model attribution in tests/integration/scan-pipeline.test.ts — scan claude-auth.ts → verify "claude" attribution. Scan gpt-utils.ts → verify "gpt" attribution. Scan copilot-helpers.ts → verify "copilot" attribution

**Checkpoint**: Model attribution works. Claude/GPT/Copilot detected in respective fixtures. Terminal and JSON outputs show model info.

---

## Phase 6: User Story 4 — Generic Fallback for Non-TypeScript Files (Priority: P3)

**Goal**: Scan Python, Go, or any text file using language-agnostic heuristics

**Independent Test**: Scan a .py file, verify line-range classifications produced with reduced confidence

### Tests for User Story 4

- [ ] T047 [P] [US4] Create test fixture: tests/fixtures/ai-generated/gpt-utils.py — Python utility module in GPT style (verbose docstrings, generic naming)
- [ ] T048 [P] [US4] Create test fixture: tests/fixtures/human-written/domain-logic.py — Human-written Python with domain-specific naming, irregular style
- [ ] T049 [P] [US4] Write integration test for generic parser in tests/integration/scan-pipeline.test.ts — scan Python fixtures, verify classifications produced, verify "generic" parser noted in output

### Implementation for User Story 4

- [ ] T050 [US4] Enhance parser selection in src/parsers/parser.ts — detect language from file extension (.ts/.tsx/.js/.jsx → typescript, others → generic), add binary file detection (read first 8KB, check for null bytes), return error for binary files
- [ ] T051 [US4] Add language indication to terminal report in src/reports/terminal-report.ts — show "(generic parser)" note when dedicated parser not available, indicate reduced confidence
- [ ] T052 [US4] Verify generic parser works end-to-end by running integration tests against Python fixtures

**Checkpoint**: Any text file can be scanned. Generic parser provides classifications. Binary files rejected gracefully.

---

## Phase 7: User Story 5 — Audit-Ready Markdown Reports (Priority: P3)

**Goal**: `--format markdown` produces forensic-grade report with methodology metadata and evidence citations

**Independent Test**: Run scan with --format markdown, verify report contains all required sections per contract

### Tests for User Story 5

- [ ] T053 [P] [US5] Write unit tests for markdown report formatter in tests/unit/reports/markdown-report.test.ts — verify output contains: header with version/date, summary table, findings per range with evidence, methodology table with algorithm versions, deterministic output

### Implementation for User Story 5

- [ ] T054 [US5] Implement markdown report formatter in src/reports/markdown-report.ts — generate report matching contracts/cli-contract.md markdown schema: header with file/date/version, summary table, findings per range with classification/confidence/model/evidence, methodology section with algorithm versions and thresholds
- [ ] T055 [US5] Wire --format markdown in src/cli.ts — ensure markdown formatter selected when --format markdown passed
- [ ] T056 [US5] Write integration test for markdown output — scan fixture with --format markdown, verify all required sections present, verify deterministic (two runs produce identical output)

**Checkpoint**: Markdown reports are audit-ready. All three output formats (terminal, JSON, markdown) work.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: N-gram detector (deferred from US1 to reduce MVP complexity), performance validation, final quality

- [ ] T057 [P] Create n-gram baseline data in src/data/ai-ngrams.json and src/data/human-ngrams.json — pre-computed character trigram frequency distributions from fixture files, shipped as static JSON
- [ ] T058 Implement n-gram frequency detector in src/detectors/ngram.ts — compute character trigram distribution per window, score via KL divergence ratio against AI vs human baselines. Return DetectionSignal with strength 0-1
- [ ] T059 [P] Write unit tests for n-gram detector in tests/unit/detectors/ngram.test.ts — test trigram extraction, KL divergence calculation, scoring against baselines
- [ ] T060 Register n-gram detector in src/core/analyzer.ts — add to detector registry, verify weights still sum correctly with ngram at 0.20
- [ ] T061 [P] Add README.md update at project root — update with actual CLI usage matching implemented commands, installation instructions, output examples from real scans
- [ ] T062 Run full test suite and verify all tests pass, coverage > 90% on src/core/ and src/detectors/
- [ ] T063 Run performance benchmarks and verify: single-file < 200ms, 10k-line file < 200ms
- [ ] T064 Validate determinism: run scan twice on same file, diff JSON outputs, verify byte-identical
- [ ] T065 Validate no network calls: run scan with network disabled, verify success
- [ ] T066 Run quickstart.md validation: follow every step in quickstart.md on a clean checkout, verify all commands work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion — BLOCKS all user stories
- **Phase 3 (US1 - Scan)**: Depends on Phase 2 — MVP core
- **Phase 4 (US2 - JSON)**: Depends on Phase 3 (needs working scan + ScanResult)
- **Phase 5 (US3 - Model Attribution)**: Depends on Phase 2 only (can parallel with US1 in theory, but practically benefits from US1's detectors)
- **Phase 6 (US4 - Generic Parser)**: Depends on Phase 2 only (generic parser already in foundational)
- **Phase 7 (US5 - Markdown Report)**: Depends on Phase 3 (needs working ScanResult)
- **Phase 8 (Polish)**: Depends on all prior phases

### User Story Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundation) → Phase 3 (US1: Scan) MVP
                                        → Phase 4 (US2: JSON) ← needs US1
                                        → Phase 5 (US3: Model) ← can start after Phase 2
                                        → Phase 6 (US4: Generic) ← can start after Phase 2
                                        → Phase 7 (US5: Markdown) ← needs US1
                                        → Phase 8 (Polish) ← needs all
```

### Within Each User Story

1. Tests FIRST → verify they FAIL
2. Data/fixtures → needed by tests and implementation
3. Core logic → detectors, services
4. Integration → wiring into analyzer/CLI
5. Integration tests → verify end-to-end

### Parallel Opportunities

**Phase 1**: T004, T005, T006 can all run in parallel
**Phase 2**: T009 + T010 in parallel (different parsers). T011-T017 all in parallel (fixtures + detector interface)
**Phase 3**: All test tasks (T020-T025) in parallel. All detector implementations (T026-T029) in parallel
**Phase 4**: Tests (T037) while planning implementation
**Phase 5**: Tests (T041) while creating signature data (T042)
**Phase 6**: All fixtures (T047-T048) in parallel
**Phase 8**: T057, T059, T061 all in parallel

---

## Parallel Example: User Story 1 (Phase 3)

```bash
# Wave 1: All tests in parallel (should all FAIL initially)
T020: entropy.test.ts
T021: comment-patterns.test.ts
T022: naming-patterns.test.ts
T023: structural.test.ts
T024: confidence.test.ts
T025: segmenter.test.ts

# Wave 2: All detectors in parallel (make tests pass)
T026: entropy.ts
T027: comment-patterns.ts
T028: naming-patterns.ts
T029: structural.ts

# Wave 3: Core orchestration (sequential — depends on detectors)
T030: segmenter.ts
T031: confidence.ts
T032: analyzer.ts

# Wave 4: Output + CLI
T033: terminal-report.ts
T034: cli.ts

# Wave 5: Integration validation
T035: scan-pipeline.test.ts
T036: scan-performance.bench.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup → project compiles
2. Complete Phase 2: Foundational → parsers work, fixtures ready
3. Complete Phase 3: User Story 1 → **`code-provenance scan` works!**
4. STOP and VALIDATE: All tests pass, benchmark meets < 200ms
5. This alone is a usable, demoable, star-worthy tool

### Incremental Delivery

1. Setup + Foundation → project scaffolded
2. US1 (Scan) → core detection works → **MVP!**
3. US2 (JSON) → CI/CD integration ready → **automation unlock**
4. US3 (Model Attribution) → forensic differentiation → **unique differentiator**
5. US4 (Generic Parser) → any language → **broad appeal**
6. US5 (Markdown) → audit reports → **enterprise ready**
7. Polish → n-grams, performance, docs → **production grade**

### Task Count Summary

| Phase | Tasks | Parallel Opportunities |
|-------|-------|----------------------|
| Phase 1: Setup | 7 | 3 parallel |
| Phase 2: Foundational | 12 | 8 parallel |
| Phase 3: US1 (Scan) | 17 | 10 parallel |
| Phase 4: US2 (JSON) | 4 | 1 parallel |
| Phase 5: US3 (Model) | 6 | 1 parallel |
| Phase 6: US4 (Generic) | 6 | 3 parallel |
| Phase 7: US5 (Markdown) | 4 | 1 parallel |
| Phase 8: Polish | 10 | 3 parallel |
| **Total** | **66** | **30 parallel** |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests are written FIRST per TDD — verify they FAIL before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- N-gram detector deferred to Phase 8 to reduce MVP complexity — US1 works with 4 detectors initially
