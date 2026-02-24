---
id: 004
title: Task Generation 66 Executable Tasks
stage: tasks
date: 2026-02-25
surface: agent
model: claude-opus-4-6
feature: 001-ai-code-detection
branch: 001-ai-code-detection
user: Dilawar Gopang
command: /sp.tasks
labels: ["tasks", "tdd", "implementation", "mvp", "parallel-execution"]
links:
  spec: specs/001-ai-code-detection/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-ai-code-detection/tasks.md
  - history/prompts/001-ai-code-detection/004-task-generation-66-tasks.tasks.prompt.md
tests:
  - none (task generation phase — no code yet)
---

## Prompt

/sp.tasks — Generate actionable, dependency-ordered task list for AI Code Detection feature based on spec.md, plan.md, data-model.md, contracts/cli-contract.md, and research.md.

## Response snapshot

Generated 66 tasks across 8 phases organized by user story:
- Phase 1 (Setup): 7 tasks — TypeScript project init, dependencies, types
- Phase 2 (Foundational): 12 tasks — parsers, detector interface, 6 test fixtures
- Phase 3 (US1 - Scan MVP): 17 tasks — 4 detectors, segmenter, confidence, analyzer, terminal report, CLI, tests
- Phase 4 (US2 - JSON): 4 tasks — JSON formatter, CLI flags, integration tests
- Phase 5 (US3 - Model Attribution): 6 tasks — model signatures data, detector, wiring
- Phase 6 (US4 - Generic Parser): 6 tasks — Python fixtures, parser enhancements
- Phase 7 (US5 - Markdown Report): 4 tasks — markdown formatter, integration
- Phase 8 (Polish): 10 tasks — n-gram detector, performance, determinism, docs

30 of 66 tasks (45%) can run in parallel. TDD approach with tests before implementation.
MVP = Phase 1-3 (36 tasks) delivers working `code-provenance scan` command.

## Outcome

- Impact: Complete executable task list — ready for /sp.implement
- Tests: TDD tasks included for all core modules
- Files: 1 file created (tasks.md)
- Next prompts: /sp.implement to begin coding, or /sp.analyze for cross-artifact validation
- Reflection: Tasks map 1:1 to spec requirements and plan architecture. N-gram detector deferred to Phase 8 to keep MVP lean.

## Evaluation notes (flywheel)

- Failure modes observed: None
- Graders run and results (PASS/FAIL): Format validation PASS — all 66 tasks follow checklist format with ID, [P] markers, [Story] labels, and file paths
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Run /sp.analyze for cross-artifact consistency check before implementation
