---
id: 003
title: AI Detection Research Findings
stage: plan
date: 2026-02-25
surface: agent
model: claude-opus-4-6
feature: 001-ai-code-detection
branch: 001-ai-code-detection
user: Dilawar Gopang
command: research
labels: ["research", "entropy", "n-gram", "structural-heuristics", "model-fingerprints", "confidence-calibration", "segmentation", "ast-parsing", "cli-framework"]
links:
  spec: specs/001-ai-code-detection/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-ai-code-detection/research.md
tests:
  - null
---

## Prompt

Research the following topics for building an offline AI code detection CLI tool (TypeScript/Node.js) that detects AI-generated vs human-written code using pure heuristics — no LLMs, no cloud APIs.

Research these specific areas and provide concrete, actionable findings:

1. **Lexical entropy analysis for code**: How to calculate Shannon entropy on token sequences in source code. What entropy ranges distinguish AI-generated code (lower entropy, more predictable) from human code (higher entropy, more varied). Provide the math and typical threshold values.

2. **N-gram frequency analysis for code**: How to build character/token n-gram models that distinguish AI patterns. What n-gram sizes work best (bigrams, trigrams?). How to score a code segment against baseline distributions.

3. **Structural heuristics that distinguish AI from human code**:
   - Comment density patterns (AI over-comments; humans under-comment)
   - Variable naming (AI uses generic names like `data`, `result`, `response`; humans use domain-specific names)
   - Error handling (AI always wraps in try/catch with generic messages)
   - Import organization (AI alphabetizes perfectly)
   - Function length uniformity (AI generates same-sized functions; humans vary)

4. **Model-specific fingerprints** — observable pattern differences between:
   - Claude: functional patterns, avoids mutation, verbose type annotations
   - GPT/ChatGPT: verbose comments before every function, `// This function does X` pattern
   - GitHub Copilot: autocomplete artifacts, training data pattern matches

5. **Confidence score calibration** — how to combine multiple weak signals into a calibrated 0-100% confidence score. Weighted scoring vs Bayesian combination vs logistic regression on signal features. What works well for heuristic-based classification without training data.

6. **Line-range segmentation** — how to segment a file into contiguous blocks that share a classification. Sliding window approaches, change-point detection, or threshold-based merging. What window sizes work for code analysis.

7. **TypeScript AST parsing** — best Node.js libraries for parsing TypeScript into an AST for structural analysis. Compare: typescript compiler API, @typescript-eslint/parser, tree-sitter, babel. Which gives the best balance of speed, accuracy, and structural detail for this use case.

8. **CLI framework** — best lightweight CLI framework for Node.js ESM that supports subcommands, flags (--json, --format), and colored output. Compare: commander, yargs, citty, clipanion. Which is best for a tool like this.

For each topic, provide:
- Decision: what approach/library to use
- Rationale: why this choice
- Alternatives considered: what was rejected and why
- Concrete implementation notes: specific algorithms, threshold values, or code patterns to use

This is for research.md — be thorough, specific, and actionable.

## Response snapshot

Created comprehensive research document at `specs/001-ai-code-detection/research.md` covering all 8 topics with decisions, rationale, alternatives, and concrete implementation details:

1. **Entropy**: Character-level Shannon entropy with 20-line windows. AI code: 3.8-4.3 bits/char; human: 4.5-5.2 bits/char.
2. **N-grams**: Character trigrams + token bigrams scored via KL divergence against pre-computed baselines.
3. **Structural**: 6 independent detectors — comment density, variable naming genericity, error handling patterns, import organization, function length uniformity (CV metric), AST fingerprinting for structural duplication.
4. **Model fingerprints**: Weighted pattern rules for Claude (functional, high conditionals, const preference), GPT (verbose pre-function comments, step-by-step), Copilot (short completions, no comments, context mimicry). Based on arXiv:2601.17406 research.
5. **Confidence**: Weighted scoring with sigmoid calibration (k=10, midpoint=0.5). Wide "unknown" band (20-60%) per accuracy-first constitution.
6. **Segmentation**: 20-line sliding window, 10-line stride (50% overlap), change-point detection, merge pass.
7. **AST parsing**: TypeScript Compiler API primary (fastest in Node.js benchmarks), tree-sitter fallback for multi-language.
8. **CLI**: Commander.js v14 + kleur for coloring. ESM-native, built-in types, subcommand support.

## Outcome

- Impact: Research document provides all algorithmic decisions, threshold values, and implementation patterns needed for planning and task decomposition.
- Tests: null
- Files: specs/001-ai-code-detection/research.md
- Next prompts: /sp.plan to create full architectural plan using research findings
- Reflection: Web research confirmed entropy and n-gram approaches are well-established for AI text detection; the arXiv fingerprinting paper (2601.17406) provided empirical backing for model-specific signatures with 41 features achieving 97.2% F1.

## Evaluation notes (flywheel)

- Failure modes observed: Entropy thresholds for source code specifically are less well-documented than for natural language; thresholds provided are estimates that must be calibrated.
- Graders run and results (PASS/FAIL): N/A (research task, no code to test)
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Validate entropy thresholds empirically by computing entropy on 10 known AI-generated and 10 known human-written TypeScript files.
