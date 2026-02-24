---
id: 002
title: AI Code Detection Spec
stage: spec
date: 2026-02-25
surface: agent
model: claude-opus-4-6
feature: 001-ai-code-detection
branch: 001-ai-code-detection
user: TechTiesIbrahim
command: /sp.specify
labels: ["ai-detection", "spec", "mvp", "cli", "heuristics"]
links:
  spec: specs/001-ai-code-detection/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-ai-code-detection/spec.md
  - specs/001-ai-code-detection/checklists/requirements.md
  - history/prompts/001-ai-code-detection/002-ai-code-detection-spec.spec.prompt.md
tests:
  - none (specification phase — no code or tests yet)
---

## Prompt

Feature #1: AI Code Detection

"Is this code AI-generated?" — that's the question everyone is asking right now. Start there. It's the hook.

code-provenance scan ./src/auth.ts

    Code Provenance v0.1.0
    ──────────────────────────

    📊 src/auth.ts (220 lines)

    Lines 1-45:    🤖 AI-generated  (92%)  Claude-style patterns
    Lines 46-120:  👤 Human-written  (88%)  Irregular style, domain-specific naming
    Lines 121-180: 🤖 AI-generated  (76%)  GPT-style patterns — verbose comments, generic naming
    Lines 181-220: 👤 Human-written  (94%)  Strong personal style signature

    Summary: 47% AI-generated | 53% Human-written
    Confidence: HIGH

How AI Detection Actually Works (No LLM Needed)

This is pure heuristics + statistical analysis — zero API calls, zero cloud, fully offline per the constitution. The detection signals:

Structural signals:
- Comment density and placement (AI over-comments, humans under-comment)
- Variable naming patterns (AI uses generic data, result, response; humans use domain-specific names)
- Error handling style (AI always uses try/catch with generic messages)
- Import organization (AI alphabetizes perfectly; humans don't)
- Function length distribution (AI generates uniform-length functions)

Statistical signals:
- Entropy analysis — AI code has lower lexical entropy (more predictable token sequences)
- N-gram frequency — AI models have distinctive token patterns
- Whitespace/formatting consistency — AI is unnaturally consistent; human code drifts

Model-specific fingerprints:
- Claude: tends toward functional patterns, avoids mutation, verbose type annotations
- GPT: verbose comments explaining obvious code, // This function does X before every function
- Copilot: matches patterns from training data, often includes telltale autocomplete artifacts

Architecture:

src/
  cli.ts                    — scan, report commands
  core/
    analyzer.ts             — Orchestrates all detectors on a file
    confidence.ts           — Calibrated confidence scoring
    fingerprint.ts          — Structural code hashing
  detectors/
    detector.ts             — Detector interface
    comment-patterns.ts     — Comment density, placement, style
    naming-patterns.ts      — Variable/function naming analysis
    entropy.ts              — Lexical entropy calculator
    structural.ts           — Function length, import order, error handling
    model-signatures.ts     — Claude vs GPT vs Copilot fingerprints
  parsers/
    parser.ts               — Language parser interface
    typescript-parser.ts    — First parser (TypeScript/JavaScript)
    generic-parser.ts       — Fallback line-based parser for any language
  reports/
    terminal-report.ts      — Color-coded CLI output
    json-report.ts          — Machine-parseable JSON
    markdown-report.ts      — Audit-ready markdown
  types.ts                  — Core types

MVP Scope:
1. Scan a single file → AI vs human classification per line range
2. Confidence scores → Calibrated 0-100% per the constitution
3. Model detection → Claude / GPT / Copilot / Unknown
4. Terminal + JSON output → Beautiful CLI + --json for CI/CD
5. TypeScript/JavaScript parser first → Generic fallback for other languages

Not in MVP: License violation detection, code theft matching, lineage tracing. Those are v2/v3.

Why This Will Get Stars:
"Is my code AI-generated?" is the hottest question in tech right now. Companies are banning AI code, universities are failing students, open-source projects are rejecting AI PRs. Nobody has a good local CLI tool for this. The existing tools are all cloud-based, paid, or academic papers without implementations.

## Response snapshot

Created the full feature specification for AI Code Detection (Feature #001) including:
- 5 user stories (P1: single-file scan, P2: JSON/CI output + model attribution, P3: generic fallback + markdown reports)
- 16 functional requirements covering detection signals, output formats, offline operation, and determinism
- 5 key entities (ScanResult, LineRange, DetectionSignal, ModelSignature, ScanReport)
- 10 measurable success criteria aligned with constitution performance/accuracy budgets
- 7 edge cases (empty files, comments-only, large files, mixed languages, encoding, minified, permissions)
- Clear scope boundaries (in-scope MVP vs. out-of-scope v2/v3)
- Quality checklist: all items passed on first validation pass

Branch: 001-ai-code-detection created and checked out.
Spec file: specs/001-ai-code-detection/spec.md
Checklist: specs/001-ai-code-detection/checklists/requirements.md

Zero [NEEDS CLARIFICATION] markers — user's vision was comprehensive enough to resolve all ambiguities with informed defaults documented in Assumptions section.

## Outcome

- ✅ Impact: First feature spec created — defines the core product capability and MVP scope
- 🧪 Tests: none (specification phase)
- 📁 Files: 3 files created (spec.md, requirements checklist, this PHR)
- 🔁 Next prompts: `/sp.clarify` to review for gaps, or `/sp.plan` to begin architecture
- 🧠 Reflection: User's vision was exceptionally detailed — included architecture, heuristics, detection signals, and exact CLI output mockup. This allowed a zero-clarification spec with strong coverage.

## Evaluation notes (flywheel)

- Failure modes observed: PowerShell create-new-feature.ps1 script failed on parameter binding (positional parameter error with long description), but branch was created. Manual directory creation required as fallback.
- Graders run and results (PASS/FAIL): Quality checklist — all 16 items PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Debug the PowerShell script parameter issue for smoother feature scaffolding next time
