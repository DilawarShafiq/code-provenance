# Code Provenance

> **"Is this code AI-generated?"** — Finally, a tool that answers that.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-18%2F18-brightgreen.svg)](#testing)

A local, offline CLI that detects AI-generated code and identifies which model wrote it. No API keys. No cloud. No telemetry. Just heuristics and math.

```
$ code-provenance scan ./src/auth.ts

Code Provenance v0.1.0
──────────────────────────────

📊 src/auth.ts (146 lines)

Lines 1-146:      🤖 AI-generated  (87%)  Claude-style patterns

Summary: 100% AI-generated | 0% Human-written
Confidence: HIGH
```

## Why?

Companies are banning AI code. Universities are failing students. Open-source projects are rejecting AI PRs. Everyone asks *"was this written by AI?"* — nobody has a good answer.

**Code Provenance** answers it. Locally. In milliseconds.

## Install

```bash
npm install -g code-provenance
```

Or run without installing:

```bash
npx code-provenance scan ./src/
```

## Usage

### Scan a single file

```bash
code-provenance scan ./src/auth.ts
```

### Scan an entire directory

```bash
code-provenance scan ./src/
```

```
Code Provenance v0.1.0
──────────────────────────────

📂 src (18 files, 2307 lines)

  🤖 100% AI  src/core/analyzer.ts (claude)
  🤖 100% AI  src/core/confidence.ts (claude)
  🤖 100% AI  src/core/scanner.ts
  🤖  87% AI  src/core/segmenter.ts (claude)
  🤖  85% AI  src/detectors/comment-patterns.ts (claude)
  🤖  75% AI  src/detectors/entropy.ts (claude)
  🤖  65% AI  src/cli.ts
  ⚠️  34% AI  src/detectors/model-signatures.ts (claude)
  👤   0% AI  src/reports/terminal-report.ts
  👤   0% AI  src/reports/markdown-report.ts
  ...

──────────────────────────────
Summary: 67% AI-generated | 6% Human-written (18 files, 2307 lines)
Scanned in 178ms
```

*Yes — we scanned our own source code. It detected that Claude wrote most of it. That's the kind of honesty you're getting.*

### Output formats

```bash
# Machine-readable JSON (for CI/CD pipelines)
code-provenance scan ./src/ --json

# Audit-ready markdown report
code-provenance scan ./src/auth.ts --format markdown

# Colored terminal output (default)
code-provenance scan ./src/auth.ts --format terminal
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | No AI-generated code detected |
| `1` | AI-generated code detected |
| `2` | Error (file not found, binary file, etc.) |

Use in CI/CD:

```bash
code-provenance scan ./src/ --json || echo "AI code detected!"
```

## How It Works

Zero LLMs. Zero API calls. Pure offline heuristics + statistical analysis.

### 5 Detection Engines

| Engine | What it detects | Signal |
|--------|----------------|--------|
| **Entropy** | Shannon entropy per code window | AI code is more predictable (lower entropy) |
| **Comment Patterns** | Pre-function comments, step-by-step, obvious explanations | AI over-explains; humans under-comment |
| **Naming Patterns** | Generic vs domain-specific identifiers | AI uses `data`, `result`, `value`; humans use domain terms |
| **Structural** | Import ordering, function length uniformity, human markers | AI is unnaturally consistent; humans leave TODOs and HACKs |
| **Model Signatures** | Claude/GPT/Copilot-specific coding patterns | Each model has a fingerprint |

### Model Attribution

Code Provenance doesn't just detect AI — it tells you *which* AI:

| Model | Key Patterns |
|-------|-------------|
| **Claude** | Functional style, `const` over `let`, `import type`, immutability patterns |
| **GPT** | Verbose pre-function comments ("This function does X"), step-by-step explanations |
| **Copilot** | Short completions (5-15 lines), no surrounding comments, utility functions |

### Architecture

```
┌─────────────┐    ┌──────────────┐    ┌────────────────┐
│   Parsers    │───>│  5 Detectors  │───>│   Segmenter    │
│  TS / Generic│    │  (parallel)   │    │  (20-line      │
│  20+ langs   │    │              │    │   windows)     │
└─────────────┘    └──────────────┘    └───────┬────────┘
                                               │
                   ┌──────────────┐    ┌───────▼────────┐
                   │  Model        │───>│  Confidence    │
                   │  Attribution  │    │  Calibration   │
                   └──────────────┘    └───────┬────────┘
                                               │
                                       ┌───────▼────────┐
                                       │  Report         │
                                       │  Terminal/JSON/  │
                                       │  Markdown       │
                                       └────────────────┘
```

## Supported Languages

| Full AST Parsing | Generic Heuristics |
|------------------|--------------------|
| TypeScript, JavaScript, JSX, TSX | Python, Ruby, Rust, Go, Java, C#, Kotlin, C, C++, Swift, Lua, Shell, PHP, R, Scala, Zig, Vue, Svelte |

The TypeScript parser uses the real TypeScript compiler API for accurate function/import/comment extraction. All other languages use a regex-based generic parser that still provides solid detection.

## Performance

- Single file scan: **< 200ms** (typically 10-50ms)
- Directory scan (18 files, 2300 lines): **< 200ms**
- No network calls. No disk cache. No startup penalty.

## Zero False Positives Philosophy

From our [constitution](.specify/memory/constitution.md):

> *"Better to report 'unknown' than to falsely accuse human code of being AI-generated."*

The tool uses conservative thresholds. It will say "unknown" before it risks a false positive. When it says "AI-generated" — it means it.

## Testing

```bash
npm test
```

18 integration tests covering:
- AI detection (Claude, GPT, Copilot styles)
- Zero false positives on human-written code
- Model attribution accuracy
- All 3 output formats
- Generic parser (Python fixtures)
- Deterministic results
- Performance budgets
- Edge cases

## Development

```bash
git clone https://github.com/DilawarShafiq/code-provenance.git
cd code-provenance
npm install
npm run build
npm test

# Try it
node dist/cli.js scan src/
```

## Roadmap

- [x] AI detection (5 engines)
- [x] Model attribution (Claude/GPT/Copilot)
- [x] Directory scanning
- [x] JSON/Markdown/Terminal output
- [x] 20+ language support
- [ ] N-gram frequency detector
- [ ] `.codeprovenance` config file
- [ ] GitHub Action
- [ ] VS Code extension
- [ ] Code theft detection
- [ ] License violation scanning
- [ ] Git blame integration

## License

MIT

## Author

**Muhammad Dilawar Shafiq** (Dilawar Gopang)
[GitHub](https://github.com/DilawarShafiq) | [Email](mailto:dilawar.gopang@gmail.com)

---

*Every line of code has a story. We tell it.*
