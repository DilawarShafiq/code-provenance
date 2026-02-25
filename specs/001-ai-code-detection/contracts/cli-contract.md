# CLI Contract: AI Code Detection

**Feature**: `001-ai-code-detection`
**Date**: 2026-02-25

---

## Commands

### `code-provenance scan <file>`

Scan a single source file for AI-generated code.

**Arguments**:

| Argument | Required | Description |
|----------|----------|-------------|
| `<file>` | Yes | Path to the source file to scan |

**Options**:

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--json` | `-j` | false | Output results as JSON instead of terminal format |
| `--format <type>` | `-f` | "terminal" | Output format: "terminal", "json", "markdown" |
| `--no-color` | | false | Disable colored output (also respects NO_COLOR env) |
| `--version` | `-V` | | Print version and exit |
| `--help` | `-h` | | Print help and exit |

**Note**: `--json` is a convenience alias for `--format json`.

**Exit Codes**:

| Code | Meaning |
|------|---------|
| 0 | No AI-generated code detected (clean) |
| 1 | AI-generated code detected (violations found) |
| 2 | Error (file not found, unreadable, binary file, etc.) |

---

## Terminal Output Contract

```
Code Provenance v{version}
──────────────────────────

📊 {relativePath} ({totalLines} lines)

Lines {start}-{end}:  {icon} {classification}  ({confidence}%)  {detail}
Lines {start}-{end}:  {icon} {classification}  ({confidence}%)  {detail}
...

Summary: {aiPercentage}% AI-generated | {humanPercentage}% Human-written
Confidence: {overallConfidence}
```

**Icons**:
- 🤖 = AI-generated
- 👤 = Human-written
- ❓ = Unknown

**Detail** (after confidence):
- For AI-generated: Model attribution if detected (e.g., "Claude-style patterns")
- For human-written: Key signal (e.g., "Irregular style, domain-specific naming")
- For unknown: Reason (e.g., "Insufficient signals")

---

## JSON Output Contract

```json
{
  "version": "0.1.0",
  "file": {
    "path": "/absolute/path/to/file.ts",
    "relativePath": "src/file.ts",
    "totalLines": 220,
    "language": "typescript",
    "parserUsed": "typescript"
  },
  "ranges": [
    {
      "startLine": 1,
      "endLine": 45,
      "classification": "ai-generated",
      "confidence": 92,
      "modelAttribution": {
        "model": "claude",
        "confidence": 85,
        "matchedPatterns": ["functional-style", "const-preference", "import-type-usage"]
      },
      "signals": [
        {
          "detector": "entropy",
          "signalType": "low-lexical-entropy",
          "strength": 0.82,
          "location": { "startLine": 1, "endLine": 45 },
          "description": "Character entropy 3.9 bits/char (AI threshold: < 4.0)"
        }
      ]
    }
  ],
  "summary": {
    "aiPercentage": 47,
    "humanPercentage": 53,
    "unknownPercentage": 0,
    "overallConfidence": "HIGH",
    "modelBreakdown": {
      "claude": 45,
      "gpt": 60,
      "unknown": 0
    }
  },
  "metadata": {
    "toolVersion": "0.1.0",
    "analyzedAt": "2026-02-25T10:30:00.000Z",
    "algorithmVersions": {
      "entropy": "1.0.0",
      "ngram": "1.0.0",
      "comment-patterns": "1.0.0",
      "naming-patterns": "1.0.0",
      "structural": "1.0.0",
      "model-signatures": "1.0.0"
    },
    "thresholds": {
      "entropyAiCeiling": 4.0,
      "entropyHumanFloor": 4.5,
      "unknownBandLow": 0.2,
      "unknownBandHigh": 0.6
    },
    "duration": 87
  }
}
```

---

## Markdown Output Contract

```markdown
# Code Provenance Report

**File**: {relativePath}
**Scanned**: {analyzedAt}
**Tool Version**: {toolVersion}

## Summary

| Metric | Value |
|--------|-------|
| Total Lines | {totalLines} |
| AI-Generated | {aiPercentage}% |
| Human-Written | {humanPercentage}% |
| Unknown | {unknownPercentage}% |
| Overall Confidence | {overallConfidence} |

## Findings

### Lines {start}-{end}: {classification} ({confidence}%)

**Classification**: {classification}
**Confidence**: {confidence}%
**Model Attribution**: {model} ({modelConfidence}%)

**Evidence**:
- {signal.description}
- {signal.description}

---

[Repeat for each range]

## Methodology

| Algorithm | Version |
|-----------|---------|
| {name} | {version} |

| Threshold | Value |
|-----------|-------|
| {name} | {value} |
```

---

## Error Output Contract

Errors go to stderr. Format varies by output mode:

**Terminal**:
```
Error: {message}
```

**JSON**:
```json
{
  "error": true,
  "message": "{message}",
  "code": 2
}
```
