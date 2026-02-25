# Developer Quickstart: AI Code Detection

**Feature**: `001-ai-code-detection`
**Branch**: `001-ai-code-detection`

---

## Prerequisites

- Node.js >= 18.0.0
- npm or pnpm
- Git

## Setup

```bash
# Clone and checkout feature branch
git clone https://github.com/DilawarShafiq/code-provenance.git
cd code-provenance
git checkout 001-ai-code-detection

# Install dependencies
npm install

# Build
npm run build

# Verify
npx code-provenance --version
```

## Development

```bash
# Run in dev mode (ts-node)
npm run dev -- scan ./path/to/file.ts

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run benchmarks
npm run bench

# Type-check without emitting
npm run typecheck

# Lint
npm run lint
```

## Key Commands

```bash
# Scan a TypeScript file (terminal output)
code-provenance scan ./src/auth.ts

# Scan with JSON output
code-provenance scan ./src/auth.ts --json

# Scan with markdown report
code-provenance scan ./src/auth.ts --format markdown

# Scan a non-TS file (uses generic parser)
code-provenance scan ./main.py
```

## Project Layout

```
src/
├── cli.ts              # Entry point — start here
├── types.ts            # All type definitions — read this first
├── core/               # Orchestration layer
├── detectors/          # Detection heuristics (one per file)
├── parsers/            # Language parsers
├── reports/            # Output formatters
└── data/               # Pre-computed baselines (JSON)

tests/
├── unit/               # Per-module tests
├── integration/        # End-to-end pipeline tests
├── fixtures/           # Known AI/human code samples
└── benchmarks/         # Performance regression tests
```

## Architecture at a Glance

```
File → Parser → [Detectors] → Aggregation → Segmentation → Calibration → Report
                  ↑ parallel     ↑ combine      ↑ windows      ↑ sigmoid     ↑ format
```

1. **Parser** reads file, extracts structure (AST for TS, regex for generic)
2. **Detectors** (5) run in parallel, each emits `DetectionSignal[]`
3. **Analyzer** aggregates signals per window
4. **Segmenter** groups windows into line ranges
5. **Confidence** module calibrates scores via sigmoid
6. **Reporter** formats ScanResult into terminal/JSON/markdown

## Adding a New Detector

```typescript
// src/detectors/my-detector.ts
import type { Detector, DetectionSignal, ParsedCode } from '../types.js';

export const myDetector: Detector = {
  name: 'my-detector',
  version: '1.0.0',
  detect(code: ParsedCode): DetectionSignal[] {
    // Analyze code, return signals
    return [];
  }
};
```

Then register in `src/core/analyzer.ts`.

## Adding a New Language Parser

```typescript
// src/parsers/python-parser.ts
import type { Parser, ParsedCode } from '../types.js';

export const pythonParser: Parser = {
  language: 'python',
  canParse(filePath: string): boolean {
    return filePath.endsWith('.py');
  },
  parse(content: string): ParsedCode {
    // Parse Python source, extract structure
  }
};
```

Then register in parser resolution logic.

## Running the Test Suite

```bash
# All tests
npm test

# Specific detector
npm test -- --filter "entropy"

# Integration only
npm test -- --filter "scan-pipeline"

# With coverage
npm run test:coverage
```

## Benchmark Fixtures

Test fixtures live in `tests/fixtures/`:
- `ai-generated/` — Files known to be AI-generated (labeled by model)
- `human-written/` — Files known to be human-written
- `mixed/` — Files with both AI and human sections (labeled by line range)

Each fixture has a companion `.meta.json` with ground truth labels for validation.
