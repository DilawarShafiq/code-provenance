---
id: 001
title: Initial Constitution Ratification
stage: constitution
date: 2026-02-24
surface: agent
model: claude-opus-4-6
feature: none
branch: main
user: Dilawar Gopang
command: /sp.constitution
labels: ["constitution", "principles", "ratification", "project-setup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - .specify/memory/constitution.md
tests:
  - none
---

## Prompt

Write the constitution for the code-provenance project.

1. Read the existing template at C:\Users\TechTiesIbrahim\code-provenance\.specify\memory\constitution.md
2. Read the README at C:\Users\TechTiesIbrahim\code-provenance\README.md for project context
3. Fill in all placeholders with concrete values. The project is:

**Code Provenance** — Code fingerprinting engine. Detect AI-generated code, find stolen code, catch license violations, trace code lineage.

Core principles:
1. **Accuracy-First** — Zero tolerance for false positives on provenance claims. Confidence scores MUST be calibrated and honest. "Unknown" is an acceptable answer; false certainty is not.
2. **Language-Agnostic** — MUST analyze code in any programming language. Detection heuristics MUST NOT be hardcoded to a single language's patterns.
3. **Privacy-Respecting** — Code MUST never be uploaded to external services. All analysis runs locally. No telemetry, no cloud dependencies.
4. **Forensic-Grade** — Results MUST be defensible and reproducible. Every claim MUST cite specific evidence (line ranges, pattern matches, similarity scores).
5. **CLI-First** — Terminal is the primary interface. Output MUST be beautiful, informative, and machine-parseable (JSON flag).
6. **Incremental Analysis** — MUST support scanning single files, directories, or entire projects. Large codebases MUST NOT require full re-analysis on every run.

Tech stack: TypeScript, Node.js, npm distribution. Testing: vitest. Code quality: strict TypeScript, ESM modules.

4. Write the completed constitution to C:\Users\TechTiesIbrahim\code-provenance\.specify\memory\constitution.md

Include the Sync Impact Report as HTML comment at top. Version 1.0.0, ratified 2026-02-24.

5. Create the PHR directory and file.
6. Stage and commit everything, then push.

## Response snapshot

Ratified constitution v1.0.0 for Code Provenance with 6 core principles: Accuracy-First, Language-Agnostic, Privacy-Respecting, Forensic-Grade, CLI-First, Incremental Analysis. Defined tech stack (TypeScript, Node.js, ESM, Vitest, npm), quality standards (90%+ coverage, strict TS, performance budgets), architecture principles (separation of concerns, plugin architecture, immutable analysis, fail-safe defaults), glossary, and amendment process. Created PHR record and committed to main branch.

## Outcome

- Impact: Foundation document ratified — all future specs, plans, and code MUST comply with these 6 principles.
- Tests: none (documentation only)
- Files: .specify/memory/constitution.md (created), history/prompts/constitution/001-initial-constitution-ratification.constitution.prompt.md (created)
- Next prompts: Define first feature spec (e.g., single-file AI detection scan), set up project scaffolding (tsconfig, vitest config, package.json)
- Reflection: Constitution expanded the 5-principle template to 6 principles per user requirements, added detailed enforcement criteria for each, and included performance budgets and architecture constraints.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual review PASS — all placeholders filled, principles match user input
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): validate constitution compliance in first feature spec
