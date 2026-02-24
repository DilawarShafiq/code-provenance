# Research: AI Code Detection Heuristics

**Feature**: `001-ai-code-detection`
**Date**: 2026-02-25
**Status**: Complete
**Purpose**: Concrete, actionable research findings for building an offline AI code detection CLI tool using pure heuristics (no LLMs, no cloud APIs).

---

## Table of Contents

1. [Lexical Entropy Analysis](#1-lexical-entropy-analysis)
2. [N-gram Frequency Analysis](#2-n-gram-frequency-analysis)
3. [Structural Heuristics](#3-structural-heuristics)
4. [Model-Specific Fingerprints](#4-model-specific-fingerprints)
5. [Confidence Score Calibration](#5-confidence-score-calibration)
6. [Line-Range Segmentation](#6-line-range-segmentation)
7. [TypeScript AST Parsing](#7-typescript-ast-parsing)
8. [CLI Framework](#8-cli-framework)

---

## 1. Lexical Entropy Analysis

### Decision

Use **character-level Shannon entropy** as the primary statistical signal, computed per sliding window of code lines. Supplement with **token-level entropy** (on identifier/keyword sequences) for a second signal dimension.

### Rationale

Shannon entropy measures the average information content (in bits per symbol) of a sequence. AI-generated code, drawn from probabilistic language models, tends to be more predictable and formulaic, producing lower entropy values. Human code is more varied, idiosyncratic, and structurally irregular, producing higher entropy.

### The Math

Shannon entropy for a character sequence:

```
H = -SUM(p(c) * log2(p(c))) for each unique character c
```

Where `p(c)` = frequency of character `c` / total characters in the window.

**Implementation in TypeScript:**

```typescript
function shannonEntropy(text: string): number {
  const freq = new Map<string, number>();
  for (const ch of text) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  const len = text.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy; // bits per character
}
```

### Threshold Values

Based on research across natural language and source code analysis:

| Content Type | Entropy Range (bits/char) | Notes |
|---|---|---|
| English prose | 1.0 - 1.5 | Shannon's original estimate |
| AI-generated text | 3.5 - 4.0 | Lower end; formulaic, predictable |
| Human-written text | 4.5 - 5.5 | Higher; varied vocabulary and structure |
| Source code (general) | 4.0 - 5.5 | Keywords + identifiers + symbols |
| AI-generated code | 3.8 - 4.3 | More uniform identifier/structure choices |
| Human-written code | 4.5 - 5.2 | Domain-specific names, varied patterns |

**Recommended thresholds for code (character-level):**
- Below 4.0: Strong AI signal
- 4.0 - 4.3: Moderate AI signal
- 4.3 - 4.6: Ambiguous / neutral
- Above 4.6: Moderate human signal
- Above 5.0: Strong human signal

**Important caveats:**
- These thresholds MUST be calibrated against known samples (constitution principle: Accuracy-First).
- Minified code will have very different entropy characteristics.
- Boilerplate/config files are inherently low-entropy regardless of authorship.
- Entropy should be computed per window (e.g., 20-50 lines), not per-file, to enable line-range classification.

### Token-Level Entropy (Supplementary)

In addition to character-level entropy, compute entropy over tokenized identifier sequences:

```typescript
function tokenEntropy(tokens: string[]): number {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  const len = tokens.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy; // bits per token
}
```

Token-level entropy captures identifier diversity (AI tends to reuse `data`, `result`, `response`; humans use domain-specific names), which character-level entropy may miss if the character distributions happen to be similar.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Perplexity-based analysis | Requires a trained language model; violates "no LLMs" constraint |
| Kolmogorov complexity (compression ratio) | Too coarse for line-range granularity; slow for large files |
| Cross-entropy against a reference corpus | Requires maintaining a reference corpus; adds complexity without proportional accuracy gain for MVP |

### Implementation Notes

- Compute entropy on **sliding windows** of 20-30 lines with 50% overlap.
- Normalize for line length (short lines like `}` or blank lines have artificially low character entropy).
- Exclude comment-only and blank lines from entropy calculation (analyze comments separately under structural heuristics).
- Cache entropy values per window for reuse during scoring.

---

## 2. N-gram Frequency Analysis

### Decision

Use **character trigrams** (n=3) as the primary n-gram model, supplemented by **token bigrams** (identifier/keyword pairs). Score code segments against pre-computed baseline distributions derived from known AI-generated and human-written code samples.

### Rationale

N-gram frequency distributions capture the "texture" of code. AI-generated code tends toward uniform, high-probability n-gram distributions (drawn from training data modes), while human code exhibits more irregular, personal, and domain-specific n-gram patterns. Character trigrams provide the best balance between capturing meaningful patterns and having enough statistical mass in small windows.

### N-gram Size Selection

| N-gram Size | Pros | Cons | Verdict |
|---|---|---|---|
| Unigrams (n=1) | Simple, fast | Too coarse; single characters carry little signal | Reject |
| Bigrams (n=2) | Good for short sequences | Less discriminative for code patterns | Supplementary |
| **Trigrams (n=3)** | Best balance of pattern capture and statistical density | Moderate vocabulary size | **Primary** |
| 4-grams (n=4) | Very specific patterns | Sparse in small windows; large vocabulary | Reject for MVP |

### Scoring Method: Kullback-Leibler (KL) Divergence

Compare the n-gram distribution of a code segment against baseline distributions:

```
D_KL(P || Q) = SUM(P(x) * log2(P(x) / Q(x))) for each n-gram x
```

Where:
- `P` = observed n-gram distribution of the code under analysis
- `Q` = baseline distribution (either AI-generated or human-written reference)

**Implementation approach:**

```typescript
interface NgramProfile {
  frequencies: Map<string, number>; // n-gram -> probability
  totalCount: number;
}

function buildCharTrigramProfile(code: string): NgramProfile {
  const freq = new Map<string, number>();
  let total = 0;
  for (let i = 0; i <= code.length - 3; i++) {
    const trigram = code.substring(i, i + 3);
    freq.set(trigram, (freq.get(trigram) ?? 0) + 1);
    total++;
  }
  // Convert counts to probabilities
  for (const [key, count] of freq) {
    freq.set(key, count / total);
  }
  return { frequencies: freq, totalCount: total };
}

function klDivergence(observed: NgramProfile, baseline: NgramProfile): number {
  const SMOOTHING = 1e-10; // Laplace smoothing to avoid log(0)
  let divergence = 0;
  for (const [ngram, pObs] of observed.frequencies) {
    const pBase = baseline.frequencies.get(ngram) ?? SMOOTHING;
    divergence += pObs * Math.log2(pObs / pBase);
  }
  return divergence;
}
```

**Scoring logic:**
- Compute `D_KL(segment || AI_baseline)` and `D_KL(segment || human_baseline)`.
- If divergence from AI baseline is significantly lower than from human baseline, the segment likely matches AI patterns.
- The ratio `D_KL(segment || human) / (D_KL(segment || AI) + D_KL(segment || human))` gives a 0-1 score where higher = more AI-like.

### Baseline Distribution Construction

For MVP, ship two pre-computed baseline profiles:
1. **AI baseline**: Built from ~500-1000 files of known AI-generated code (various models).
2. **Human baseline**: Built from ~500-1000 files of known human-written open-source code.

Baselines are serialized as JSON and loaded at runtime (offline, per constitution).

### Token Bigram Analysis (Supplementary)

Extract identifier and keyword sequences, then build bigram frequency profiles:

```typescript
// Token sequence: ["const", "result", "=", "await", "fetch", ...]
// Bigrams: ["const_result", "result_=", "=_await", "await_fetch", ...]
```

AI-generated code has highly predictable token bigrams:
- `const result`, `const data`, `const response` (AI favors these)
- `try { ... } catch (error)` (AI always uses `error` as the catch variable)
- `if (!response.ok)` (AI uses this exact pattern frequently)

Human code shows more variety: `const userProfile`, `const orderTotal`, `catch (fetchErr)`, etc.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Word-level n-grams | Code tokens are not "words" in the NLP sense; character n-grams are more universal across languages |
| TF-IDF scoring | More suited for document retrieval than distribution comparison |
| Cosine similarity | Viable alternative to KL divergence but less theoretically grounded for probability distributions |
| Jensen-Shannon divergence | Symmetric variant of KL; consider for v2 as it is bounded [0, 1] and avoids division-by-zero issues more gracefully |

### Implementation Notes

- Pre-compute baselines during development using curated samples; ship as JSON artifacts.
- Use Laplace smoothing (add-one or add-epsilon) to handle unseen n-grams.
- Normalize code before n-gram extraction: collapse whitespace, strip blank lines.
- For token bigrams, use a simple tokenizer that splits on whitespace and common operators.
- Window size: same 20-30 line windows used for entropy analysis.

---

## 3. Structural Heuristics

### Decision

Implement **6 structural detectors**, each producing an independent signal score (0.0 - 1.0, where 1.0 = strongly AI-like). These are the highest-value signals because they capture observable, well-documented behavioral differences between AI and human coding patterns.

### 3.1 Comment Density and Placement

**Signal**: AI over-comments; humans under-comment.

**Metrics to compute:**
- **Comment-to-code ratio**: lines of comments / lines of code. AI typically produces 0.3-0.6 (30-60% comment lines relative to code lines); human code averages 0.05-0.15.
- **Comment placement regularity**: AI places a comment before every function, every block, every significant statement. Measure the standard deviation of gaps between comment lines -- AI has low variance (regular spacing); humans have high variance (clusters and gaps).
- **Comment style**: AI produces JSDoc/docstring on every function; humans often skip or write terse inline comments.
- **Comment verbosity**: AI comments restate the code (`// Loop through the array`); measure semantic overlap between comment text and the code it annotates.

**Thresholds:**
| Metric | AI Signal (>threshold) | Human Signal (<threshold) |
|---|---|---|
| Comment-to-code ratio | > 0.30 | < 0.10 |
| Gap variance (std dev) | < 5.0 lines | > 15.0 lines |
| Avg comment length | > 40 chars | < 20 chars |

### 3.2 Variable Naming Patterns

**Signal**: AI uses generic names; humans use domain-specific names.

**Known AI-favored identifiers** (detect frequency of these in code):
```
data, result, response, output, input, value, item, element,
temp, tmp, arr, obj, str, num, val, res, req, err, error,
callback, handler, config, options, params, args, context,
index, count, total, current, previous, next, list, items
```

**Metric**: Ratio of "generic identifiers" to "total identifiers". AI-generated code typically has a generic ratio of 0.25-0.50; human code is typically 0.05-0.15.

**Additional signals:**
- **Naming convention consistency**: AI is perfectly consistent (always camelCase, always descriptive). Humans occasionally mix styles, use abbreviations, or use domain jargon.
- **Identifier length distribution**: AI tends to use medium-length names (8-15 chars); humans show bimodal distribution (short abbreviations + long descriptive names).

### 3.3 Error Handling Patterns

**Signal**: AI always wraps operations in try/catch with generic error messages.

**Patterns to detect:**
```typescript
// AI pattern: generic try/catch wrapper
try {
  // ... operation ...
} catch (error) {
  console.error("An error occurred:", error);
  // or: throw new Error("Failed to process data");
}

// Human pattern: specific, targeted error handling
try {
  const user = await db.findUser(userId);
} catch (err) {
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: "User not found" });
  }
  logger.error({ userId, err }, "Database query failed");
  throw new ServiceUnavailableError("User lookup failed");
}
```

**Metrics:**
- **Try/catch wrapping ratio**: Proportion of function bodies wrapped in try/catch. AI typically wraps > 70% of async functions; humans are more selective (20-40%).
- **Generic catch variable**: AI always uses `error` or `err`; humans sometimes use specific names like `fetchError`, `parseErr`, `dbException`.
- **Error message genericity**: AI uses phrases like "An error occurred", "Failed to X", "Something went wrong". Count matches against a list of generic phrases.
- **Error differentiation**: Human code differentiates error types; AI uses a single catch-all.

### 3.4 Import Organization

**Signal**: AI alphabetizes imports perfectly; humans organize by usage or logical grouping.

**Metrics:**
- **Alphabetical sort score**: Measure how close the import order is to perfect alphabetical sorting. A sorted percentage > 90% signals AI.
- **Import grouping**: AI groups (stdlib, external, internal) with blank-line separators consistently; humans often mix or skip separators.
- **Import count per file**: AI tends to import more than needed (defensive imports); humans import more precisely.

### 3.5 Function Length Uniformity

**Signal**: AI generates same-sized functions; humans vary widely.

**Metric**: **Coefficient of variation** (CV) of function lengths within a file.

```
CV = standard_deviation(function_lengths) / mean(function_lengths)
```

| CV Range | Signal |
|---|---|
| < 0.3 | Strong AI signal (highly uniform) |
| 0.3 - 0.5 | Moderate AI signal |
| 0.5 - 0.8 | Neutral |
| > 0.8 | Human signal (high variance) |

**Additional metric**: AI tends to generate functions in the 10-30 line range (a "sweet spot" that fits context windows). Measure the percentage of functions falling within this range.

### 3.6 Structural Repetition (AST Fingerprinting)

**Signal**: AI generates structurally identical functions with different variable names.

**Algorithm** (from vibe-check research):
1. Parse code into AST.
2. For each function, normalize the AST by replacing all identifiers with placeholders.
3. Hash the normalized AST structure.
4. If two or more functions produce the same hash, they are structurally identical.

**Metric**: Ratio of structurally duplicated functions to total functions. AI code often has > 20% structural duplication; human code typically < 5%.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Whitespace consistency analysis | Too noisy; formatters (Prettier) normalize this regardless of author |
| Cyclomatic complexity | Measures code quality, not authorship; AI and humans can produce similar complexity |
| Line length analysis | Too easily confounded by team style guides and formatters |
| Dead code detection | Useful but requires full semantic analysis; too expensive for MVP |

### Implementation Notes

- Each detector is an independent module returning a `DetectionSignal` with type, score (0-1), and location.
- Detectors operate on either raw text (comment density, import order) or AST (function length, structural repetition, variable naming).
- All thresholds are configurable and shipped as defaults in a JSON config.
- The generic identifier list should be language-parameterized (different languages have different common generic names).

---

## 4. Model-Specific Fingerprints

### Decision

Implement **model signature profiles** for Claude, GPT/ChatGPT, and GitHub Copilot as collections of weighted pattern rules. Attribution is probabilistic, not deterministic -- assign "most likely model" when patterns exceed a confidence threshold.

### Rationale

Research (Ghaleb et al., arXiv:2601.17406) demonstrates that AI coding agents produce statistically distinguishable fingerprints, achieving 97.2% F1-score across 5 agents using 41 features. While that study uses ML classifiers, the underlying features are observable through heuristics.

### Claude Patterns

Based on observed characteristics and the fingerprinting study:

| Pattern | Detection Method | Weight |
|---|---|---|
| **High conditional density** | Count if/else, ternary, switch per LOC; Claude produces 27.2% more conditionals than average | 0.25 |
| **Elevated comment density** | Comment lines per code line; Claude's comment density is 19.8% higher than baseline | 0.20 |
| **Functional style preference** | Count `.map()`, `.filter()`, `.reduce()` vs for-loops; Claude strongly prefers functional patterns | 0.15 |
| **Avoids mutation** | Track `let` vs `const` ratio; Claude uses `const` > 85% of variable declarations | 0.10 |
| **Verbose type annotations** | In TypeScript, Claude adds explicit return types and parameter types even when inference would suffice | 0.10 |
| **Composition over classes** | Low class-to-function ratio; prefers standalone functions and composition | 0.10 |
| **`import type` usage** | Claude consistently uses `import type { ... }` for type-only imports in TypeScript | 0.10 |

### GPT/ChatGPT Patterns

| Pattern | Detection Method | Weight |
|---|---|---|
| **Verbose pre-function comments** | Detect `// This function...` or `// Function to...` pattern before function declarations | 0.25 |
| **Step-by-step inline comments** | Detect `// Step 1:`, `// Step 2:` or `// First, ...`, `// Then, ...` patterns | 0.20 |
| **Extensive JSDoc blocks** | JSDoc with `@param`, `@returns`, `@throws` on every function, often with example content | 0.15 |
| **Generic variable names** | Higher density of `data`, `result`, `response`, `output` compared to Claude | 0.15 |
| **Try/catch every async** | Nearly every async function wrapped in try/catch with `console.error` | 0.10 |
| **Explicit type assertions** | More `as Type` casts in TypeScript; less precise type narrowing | 0.10 |
| **Section separator comments** | `// ============` or `// --- Helper Functions ---` comment separators | 0.05 |

### GitHub Copilot Patterns

| Pattern | Detection Method | Weight |
|---|---|---|
| **Autocomplete line fragments** | Partial statements that complete previous lines in predictable ways | 0.20 |
| **Training data echoes** | Exact matches against known common code patterns from popular repos (e.g., standard Express middleware, React boilerplate) | 0.20 |
| **Focused code changes** | High change concentration -- modifies few files with precise changes (from the fingerprinting study: 24.9%) | 0.15 |
| **No surrounding comments** | Copilot inserts code without adding comments (unlike Claude/GPT) | 0.15 |
| **Short function completions** | Tends to generate 5-15 line functions that complete a started function signature | 0.15 |
| **Import statement patterns** | Adds imports incrementally as needed (one at a time at the top of file) | 0.10 |
| **Naming follows context** | Variable names are consistent with surrounding human-written code (mimicry) | 0.05 |

### Attribution Algorithm

```typescript
interface ModelScore {
  model: 'claude' | 'gpt' | 'copilot';
  score: number; // 0-1
}

function attributeModel(signals: DetectionSignal[]): ModelScore[] {
  const scores: ModelScore[] = [
    { model: 'claude', score: 0 },
    { model: 'gpt', score: 0 },
    { model: 'copilot', score: 0 },
  ];

  for (const signal of signals) {
    // Each signal maps to one or more model patterns with weights
    // Accumulate weighted scores per model
    for (const score of scores) {
      score.score += getModelWeight(signal, score.model) * signal.strength;
    }
  }

  // Normalize scores to 0-1
  const maxScore = Math.max(...scores.map(s => s.score));
  if (maxScore > 0) {
    for (const score of scores) {
      score.score = score.score / maxScore;
    }
  }

  return scores.sort((a, b) => b.score - a.score);
}
```

**Attribution thresholds:**
- Top model score > 0.6 AND gap to second model > 0.2: attribute with "HIGH" confidence.
- Top model score > 0.4 AND gap to second model > 0.1: attribute with "MEDIUM" confidence.
- Otherwise: report model as "Unknown" (per constitution: "unknown" is acceptable).

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| ML classifier (Random Forest, SVM) | Requires training data and model files; violates simplicity for MVP |
| Neural network fingerprinting | Requires a trained model; too heavy for offline CLI |
| Commit message analysis | Only available in git context, not for standalone file scanning |
| PR structure analysis | Not available for single-file scanning |

### Implementation Notes

- Model signatures are defined as JSON configuration files, making them easy to update as models evolve.
- Attribution should only be attempted for code segments already classified as AI-generated.
- Copilot is hardest to detect because it mimics surrounding code context; expect lower attribution accuracy.
- The 70% accuracy target (SC-004 from spec) is achievable for Claude and GPT; Copilot may be lower.
- These fingerprints will degrade over time as models update; version the signature files and include version in output metadata.

---

## 5. Confidence Score Calibration

### Decision

Use a **weighted geometric mean** approach with **sigmoid calibration** to combine multiple weak signals into a single 0-100% confidence score. No training data required; weights and sigmoid parameters are hand-tuned against known samples.

### Rationale

We need to combine 8+ independent signals (entropy, n-grams, 6 structural heuristics) into a single calibrated confidence score, without access to labeled training data for supervised calibration. The approach must be:
1. Deterministic (same inputs = same output, per constitution).
2. Calibrated such that scores correlate with accuracy (a 90% score should be more reliable than a 60% score).
3. Simple enough to implement without ML dependencies.

### Signal Combination: Weighted Scoring

Each detector produces a raw score `s_i` in [0, 1] where 1 = strongly AI-like. Combine using weighted average:

```
raw_score = SUM(w_i * s_i) / SUM(w_i)
```

**Recommended weights (tunable):**

| Signal | Weight | Rationale |
|---|---|---|
| Structural repetition (AST) | 0.20 | Highest-specificity signal; rare false positives |
| Comment density/style | 0.15 | Well-documented AI characteristic |
| Variable naming genericity | 0.15 | Strong discriminator |
| Error handling patterns | 0.10 | Specific but not always present |
| Function length uniformity | 0.10 | Good file-level signal |
| Import organization | 0.05 | Weak signal; easily confounded by linters |
| Character entropy | 0.10 | Statistical backing but noisy |
| N-gram divergence | 0.10 | Statistical backing but requires good baselines |
| Token entropy | 0.05 | Supplementary to character entropy |

### Sigmoid Calibration

Map the raw weighted score through a sigmoid function to produce a calibrated confidence:

```
confidence = 1 / (1 + exp(-k * (raw_score - midpoint)))
```

Where:
- `k` = steepness parameter (recommended: 10). Controls how sharply the curve transitions.
- `midpoint` = the raw score value where confidence = 50% (recommended: 0.5).

```typescript
function calibrate(rawScore: number, k = 10, midpoint = 0.5): number {
  return 1 / (1 + Math.exp(-k * (rawScore - midpoint)));
}

// Convert to 0-100 percentage
function toConfidencePercent(rawScore: number): number {
  return Math.round(calibrate(rawScore) * 100);
}
```

**Sigmoid behavior with k=10, midpoint=0.5:**
| Raw Score | Confidence |
|---|---|
| 0.1 | 2% |
| 0.2 | 5% |
| 0.3 | 12% |
| 0.4 | 27% |
| 0.5 | 50% |
| 0.6 | 73% |
| 0.7 | 88% |
| 0.8 | 95% |
| 0.9 | 98% |

This shape ensures:
- Low evidence (raw < 0.3) produces low confidence (< 15%), avoiding false claims.
- Moderate evidence (raw 0.4-0.6) produces moderate confidence (27-73%).
- Strong evidence (raw > 0.7) produces high confidence (> 88%).
- The curve is conservative at both extremes, which aligns with the constitution's "accuracy-first" principle.

### Classification Thresholds

| Confidence | Classification | Action |
|---|---|---|
| < 20% | "human-written" | Report with confidence |
| 20% - 40% | "unknown" | Insufficient evidence per constitution |
| 40% - 60% | "unknown" | Ambiguous; report honestly |
| 60% - 80% | "ai-generated" (LOW confidence) | Report with caveats |
| 80% - 95% | "ai-generated" (MEDIUM confidence) | Report with evidence |
| > 95% | "ai-generated" (HIGH confidence) | Strong claim with full evidence |

**Note**: The "unknown" band (20-60%) is intentionally wide. Per the constitution: "When evidence is insufficient, the system MUST report 'unknown' rather than guess."

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Bayesian combination (Dempster-Shafer theory) | Mathematically elegant but complex to implement and debug; assumes independence of signals which may not hold; overkill for MVP |
| Logistic regression on signal features | Requires labeled training data for fitting; we do not have a labeled dataset at MVP |
| Simple arithmetic mean | Does not account for signal reliability differences; no calibration |
| Max-signal approach | Ignores corroborating evidence from other signals |
| Naive Bayes | Requires prior probability estimates and assumes conditional independence |

### Implementation Notes

- All weights and sigmoid parameters (`k`, `midpoint`) are configurable via a JSON config file.
- The "unknown" classification is a first-class output, not a failure mode.
- For file-level summary: aggregate line-range confidences weighted by line count.
- Confidence levels (LOW, MEDIUM, HIGH) map to the percentage ranges above.
- Track signal contributions in the output for forensic transparency (constitution: cite specific evidence).
- To tune parameters post-MVP: build a labeled benchmark set, compute accuracy at each threshold, and adjust weights using grid search or manual tuning.

### Future Enhancement: Bayesian Combination

For v2, consider Dempster-Shafer theory for more principled evidence fusion:

```
Bel(A) = SUM(m(B)) for all B that are subsets of A
Pl(A) = SUM(m(B)) for all B that intersect with A
```

Where `m(B)` is the basic probability assignment from each evidence source. This naturally handles uncertainty and conflicting evidence, which maps well to the "unknown" classification requirement. Implementation is more complex but provides theoretically better calibration.

---

## 6. Line-Range Segmentation

### Decision

Use a **sliding window approach with change-point detection** to segment files into contiguous line ranges that share a classification. Window size of 20 lines with 50% overlap (10-line stride), followed by a merging pass that combines adjacent windows with the same classification.

### Rationale

The goal is to identify contiguous blocks of code that are likely AI-generated vs human-written. This requires:
1. Analyzing code in chunks small enough to capture transitions (human wrote lines 1-50, AI generated lines 51-120).
2. Smoothing out noise (a single anomalous line should not create a tiny separate region).
3. Producing clean, meaningful line ranges (not 500 separate 1-line classifications).

### Algorithm: Sliding Window + Merge

**Phase 1: Window Classification**

```typescript
interface WindowResult {
  startLine: number;
  endLine: number;
  aiScore: number; // 0-1 raw weighted score
  confidence: number; // 0-100% calibrated
  classification: 'ai-generated' | 'human-written' | 'unknown';
  signals: DetectionSignal[];
}

function classifyWindows(lines: string[], windowSize = 20, stride = 10): WindowResult[] {
  const results: WindowResult[] = [];
  for (let start = 0; start < lines.length; start += stride) {
    const end = Math.min(start + windowSize, lines.length);
    const windowLines = lines.slice(start, end);
    // Run all detectors on this window
    const signals = runAllDetectors(windowLines, start);
    const rawScore = computeWeightedScore(signals);
    const confidence = calibrate(rawScore);
    results.push({
      startLine: start + 1, // 1-indexed
      endLine: end,
      aiScore: rawScore,
      confidence: toConfidencePercent(rawScore),
      classification: classifyFromConfidence(confidence),
      signals,
    });
  }
  return results;
}
```

**Phase 2: Change-Point Detection**

After classifying windows, detect transitions between classifications:

```typescript
function detectChangePoints(windows: WindowResult[]): number[] {
  const changePoints: number[] = [];
  for (let i = 1; i < windows.length; i++) {
    if (windows[i].classification !== windows[i - 1].classification) {
      changePoints.push(i);
    }
    // Also detect when confidence changes significantly within the same class
    if (Math.abs(windows[i].aiScore - windows[i - 1].aiScore) > 0.25) {
      changePoints.push(i);
    }
  }
  return [...new Set(changePoints)].sort((a, b) => a - b);
}
```

**Phase 3: Merge Adjacent Windows**

Combine windows between change points into contiguous line ranges:

```typescript
function mergeWindows(windows: WindowResult[], changePoints: number[]): LineRange[] {
  const ranges: LineRange[] = [];
  let rangeStart = 0;

  for (const cp of [...changePoints, windows.length]) {
    const rangeWindows = windows.slice(rangeStart, cp);
    if (rangeWindows.length === 0) continue;

    // Aggregate: average scores, collect all signals
    const avgScore = rangeWindows.reduce((s, w) => s + w.aiScore, 0) / rangeWindows.length;
    const confidence = calibrate(avgScore);
    const allSignals = rangeWindows.flatMap(w => w.signals);

    ranges.push({
      startLine: rangeWindows[0].startLine,
      endLine: rangeWindows[rangeWindows.length - 1].endLine,
      classification: classifyFromConfidence(confidence),
      confidence: toConfidencePercent(avgScore),
      signals: deduplicateSignals(allSignals),
    });

    rangeStart = cp;
  }

  return ranges;
}
```

### Window Size Selection

| Window Size | Pros | Cons |
|---|---|---|
| 5-10 lines | Fine granularity | Too noisy; insufficient statistical mass for entropy/n-gram |
| **20 lines** | Good balance | **Recommended** |
| 30 lines | More stable statistics | May miss small AI-inserted blocks |
| 50+ lines | Very stable | Too coarse; misses transitions |

**20 lines** is the sweet spot because:
- It contains enough characters (typically 500-1500) for meaningful entropy/n-gram analysis.
- It aligns with typical function sizes (AI generates 10-30 line functions).
- It allows detecting transitions within a file at reasonable granularity.

### Post-Merge Minimum Size

After merging, discard ranges smaller than 5 lines (too small to classify meaningfully) by absorbing them into the adjacent range with the closest confidence score.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Per-line classification | Too noisy; most signals need multi-line context |
| Per-function segmentation | Requires AST parsing (not available for generic fallback); misses transitions within functions |
| Binary segmentation (recursive) | More expensive (O(n log n) vs O(n)); harder to implement; marginal accuracy gain |
| Fixed block size (no overlap) | Misses transitions that fall at block boundaries |
| CUSUM change-point detection | More statistically rigorous but adds complexity; consider for v2 |

### Implementation Notes

- The sliding window approach has O(n * w) complexity where n = number of windows, w = per-window detector cost. This is well within the 200ms single-file budget for files up to 10,000 lines.
- Windows at the end of a file may be smaller than `windowSize`; handle gracefully.
- For very short files (< 20 lines), treat the entire file as a single window.
- The stride (50% overlap) ensures no line is ever analyzed in only one window context.
- Change-point sensitivity (the 0.25 threshold) is tunable.

---

## 7. TypeScript AST Parsing

### Decision

Use the **TypeScript Compiler API** (`typescript` package, `ts.createSourceFile()`) as the primary AST parser. Use **tree-sitter** with `tree-sitter-typescript` as the fallback for non-TypeScript languages via the generic adapter interface.

### Rationale

Benchmark data shows that the TypeScript compiler API is the fastest TypeScript parser when used from Node.js, outperforming even Rust-based alternatives (SWC, OXC) due to cross-language serialization overhead. Since our primary target is TypeScript/JavaScript analysis, using the canonical parser maximizes both speed and accuracy.

### Library Comparison

| Library | Speed | TS Accuracy | Language Support | Dependencies | Verdict |
|---|---|---|---|---|---|
| **TypeScript Compiler API** | Fastest for TS (2x Babel) | Perfect (canonical parser) | TS/JS only | `typescript` | **Primary** |
| `@typescript-eslint/typescript-estree` | Good (wraps TS compiler) | Excellent | TS/JS only | `typescript` + wrapper | Consider for ESTree compat |
| **tree-sitter** + `tree-sitter-typescript` | ~50% of TS compiler speed | Very good | 100+ languages | Native bindings (WASM or N-API) | **Fallback/multi-language** |
| Babel (`@babel/parser`) | 50% of TS compiler | Good (some TS edge cases) | JS/TS/JSX/Flow | Babel ecosystem | Rejected |
| SWC (`@swc/core`) | Underperforms TS in Node.js | Good | JS/TS | Rust + N-API | Rejected |
| OXC (`oxc-parser`) | Underperforms TS in Node.js | Good | JS/TS | Rust + N-API | Rejected |

### TypeScript Compiler API Usage

```typescript
import ts from 'typescript';

function parseTypeScript(code: string, fileName = 'file.ts'): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true, // setParentNodes - needed for traversal
    ts.ScriptKind.TS
  );
}

// Traverse the AST
function visitNode(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, child => visitNode(child, visitor));
}

// Example: count functions and their lengths
function analyzeFunctions(sourceFile: ts.SourceFile): { name: string; lineCount: number }[] {
  const functions: { name: string; lineCount: number }[] = [];

  visitNode(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      const name = (node as any).name?.getText(sourceFile) ?? '<anonymous>';
      functions.push({
        name,
        lineCount: end.line - start.line + 1,
      });
    }
  });

  return functions;
}
```

**Key advantages of `ts.createSourceFile()`:**
- No need to create a full `Program` (avoids type-checking overhead).
- Parses in isolation; no file system access needed.
- Returns a complete AST with position information for line mapping.
- Handles all TypeScript syntax including decorators, generics, and JSX.

### Tree-sitter for Multi-Language Fallback

```typescript
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

function parseGeneric(code: string): Parser.Tree {
  return parser.parse(code);
}

// Tree-sitter returns a concrete syntax tree
// Navigate with .rootNode, .children, .type, .text
```

**Tree-sitter advantages for multi-language:**
- Supports 100+ languages with grammar packages.
- Incremental parsing (fast re-parse after edits -- useful for future IDE integration).
- Consistent API across all languages.
- Returns concrete syntax tree (CST) with node types.

**Tree-sitter disadvantages:**
- Requires native bindings (N-API or WASM).
- WASM version (`web-tree-sitter`) is slower but avoids native compilation.
- AST structure varies significantly by language grammar.

### Architecture: Parser Adapter Interface

```typescript
interface LanguageParser {
  readonly language: string;
  parse(code: string): ParseResult;
  getFunctions(): FunctionInfo[];
  getComments(): CommentInfo[];
  getImports(): ImportInfo[];
  getIdentifiers(): IdentifierInfo[];
}

// TypeScript implementation uses ts.createSourceFile()
// Generic implementation uses tree-sitter
// Future language-specific implementations can use tree-sitter + language grammars
```

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| `@typescript-eslint/typescript-estree` | Adds wrapper overhead for ESTree format we do not need; we can use the TS compiler directly |
| Babel parser | 50% slower than TS compiler; occasional TS syntax edge cases; unnecessary for our use case |
| SWC/OXC | Despite Rust speed, JSON serialization overhead makes them slower in Node.js than the TS compiler |
| `ts-morph` | Higher-level wrapper; adds overhead and dependencies we do not need for read-only AST analysis |
| Regex-based parsing | Fragile, error-prone, cannot handle nested structures; only acceptable for quick lexical scans (not structural analysis) |

### Implementation Notes

- Use `ts.createSourceFile()` (not `ts.createProgram()`) to avoid type-checking overhead. We need AST structure, not type information.
- For `.js` files, use `ts.ScriptKind.JS`; for `.tsx`, use `ts.ScriptKind.TSX`.
- `typescript` is already a dependency of most TS projects; adding it does not bloat the dependency tree.
- Tree-sitter grammars are separate packages; only install grammars for supported languages.
- For MVP: ship with TypeScript parser built-in; tree-sitter is optional for non-TS files.
- Consider `web-tree-sitter` (WASM) instead of `tree-sitter` (N-API) if native compilation is problematic for distribution.
- Performance budget: `ts.createSourceFile()` can parse a 10,000-line file in < 50ms on commodity hardware.

---

## 8. CLI Framework

### Decision

Use **Commander.js** (`commander` v14) as the CLI framework.

### Rationale

Commander.js is the most widely adopted CLI framework in the Node.js ecosystem with excellent ESM support, built-in TypeScript types, subcommand support, automatic help generation, and colored output capabilities. It has the lightest learning curve and the largest community, which matters for an open-source tool.

### Framework Comparison

| Framework | ESM Support | TypeScript | Subcommands | Size | Weekly Downloads | Verdict |
|---|---|---|---|---|---|---|
| **Commander.js** | Full (v14+; v15 ESM-only) | Built-in .d.ts | Native | ~50KB | ~200M | **Selected** |
| Yargs | Partial (requires config) | Via @types/yargs | Native | ~150KB | ~100M | Rejected |
| Citty | Native ESM | TypeScript-first | Native | ~15KB | ~1M | Too new/unstable |
| Clipanion | Good | TypeScript-first | Class-based | ~40KB | ~5M | Over-engineered |
| oclif | Good | TypeScript-first | Plugin-based | Heavy | ~2M | Too heavy; enterprise-focused |
| Stricli | Good | Best type safety | Declarative | ~20KB | ~10K | Too niche; tiny ecosystem |

### Why Commander.js

1. **ESM support**: Commander v14 works with ESM out of the box. Commander v15 (May 2026) is ESM-only.
2. **TypeScript types**: Ships with built-in TypeScript declarations; no `@types` package needed.
3. **Subcommands**: Native support for `code-provenance scan`, `code-provenance report`, etc.
4. **Flags/options**: Clean declarative API for `--json`, `--format markdown`, `--threshold 80`, etc.
5. **Colored output**: Built-in style routines (`styleTitle()`) and integration with `chalk` or `kleur` for terminal coloring.
6. **Help generation**: Automatic `--help` generation for all commands and subcommands.
7. **No magic**: Declarative, composable API without decorators, reflection, or class inheritance.
8. **Ecosystem**: Battle-tested in thousands of CLI tools; well-documented; active maintenance.

### CLI Design

```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('code-provenance')
  .description('Detect AI-generated vs human-written code')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan a file for AI-generated code')
  .argument('<file>', 'Path to the file to scan')
  .option('--json', 'Output results as JSON')
  .option('--format <format>', 'Output format: terminal, json, markdown', 'terminal')
  .option('--threshold <number>', 'Minimum confidence threshold (0-100)', '60')
  .option('--no-color', 'Disable colored output')
  .action(async (file, options) => {
    // Scan implementation
  });

program.parse();
```

### Colored Output Strategy

Use **`kleur`** (not `chalk`) for terminal coloring:
- `kleur` is 4KB vs `chalk`'s 40KB+ dependency tree.
- Pure ESM support.
- Same API: `kleur.red('text')`, `kleur.bold().green('text')`.
- Respects `NO_COLOR` environment variable and `--no-color` flag.

Color scheme for terminal output:
- Red: AI-generated (high confidence)
- Yellow: AI-generated (low confidence) or unknown
- Green: Human-written
- Blue: File metadata and headers
- Gray: Line numbers and structural elements

### Exit Codes (per constitution)

```typescript
const EXIT_CODES = {
  CLEAN: 0,        // No AI code detected
  VIOLATIONS: 1,   // AI code detected
  ERROR: 2,        // Runtime error (invalid file, parse error, etc.)
} as const;
```

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Yargs** | Heavier; ESM support requires additional configuration; middleware system is overkill |
| **Citty** | Promising (UnJS ecosystem, ESM-native) but "under heavy development"; sparse documentation; too risky for production CLI |
| **Clipanion** | Class-based approach conflicts with functional code style; all commands must load at runtime (no lazy loading) |
| **oclif** | Enterprise framework; heavy dependency tree; plugin system adds complexity we do not need |
| **Stricli** | Best type safety but tiny ecosystem (~10K weekly downloads); Bloomberg-specific patterns |
| **Raw `node:util.parseArgs`** | Too low-level; no subcommand support, no help generation, no colored output |

### Implementation Notes

- Use Commander v14 (current stable) with ESM imports.
- Pair with `kleur` for colored output (4KB, ESM-native, NO_COLOR support).
- Each subcommand in its own file for lazy loading: `src/cli/commands/scan.ts`, `src/cli/commands/report.ts`.
- The `--json` flag is a global option available on all commands (per constitution requirement).
- Machine-readable JSON output goes to stdout; human messages go to stderr (allows piping).
- Test CLI with `vitest` by importing command handlers directly (no need to spawn processes).

---

## Summary of Decisions

| Topic | Decision | Key Library/Algorithm |
|---|---|---|
| 1. Entropy | Character-level Shannon entropy, 20-line windows | Custom implementation |
| 2. N-grams | Character trigrams + token bigrams, KL divergence scoring | Custom implementation |
| 3. Structural | 6 independent detectors (comments, naming, errors, imports, function length, AST duplication) | TypeScript Compiler API |
| 4. Model fingerprints | Weighted pattern rules per model (Claude, GPT, Copilot) | JSON-configurable signatures |
| 5. Confidence | Weighted scoring + sigmoid calibration | Custom (no ML dependencies) |
| 6. Segmentation | 20-line sliding window, 50% overlap, merge pass | Custom implementation |
| 7. AST parsing | TypeScript Compiler API (primary) + tree-sitter (fallback) | `typescript`, `tree-sitter` |
| 8. CLI framework | Commander.js v14 + kleur | `commander`, `kleur` |

## References

- [Ghaleb et al., "Fingerprinting AI Coding Agents on GitHub" (arXiv:2601.17406)](https://arxiv.org/abs/2601.17406) -- 41 features, 97.2% F1-score agent identification
- [How Text Entropy Reveals AI Content (Hastewire)](https://hastewire.com/blog/how-text-entropy-reveals-ai-content-detection-guide) -- entropy thresholds: AI 3.5-4.0, human 4.5-5.5
- [N-grams in AI Writing Detection (Hastewire)](https://hastewire.com/blog/unlocking-the-role-of-n-grams-in-ai-writing-detection) -- n-gram detection methodology
- [Benchmark TypeScript Parsers (dev.to)](https://dev.to/herrington_darkholme/benchmark-typescript-parsers-demystify-rust-tooling-performance-2go8) -- TS compiler fastest in Node.js
- [vibe-check: CLI AI Code Scorer (dev.to)](https://dev.to/lakshmisravyavedantham/i-built-a-cli-that-scores-how-much-of-your-code-was-written-by-ai-318o) -- 7-detector weighted scoring architecture
- [AI vs Human Code Report (CodeRabbit)](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) -- AI creates 1.7x more issues
- [Commander.js (GitHub)](https://github.com/tj/commander.js) -- CLI framework
- [Citty (UnJS)](https://unjs.io/packages/citty/) -- alternative CLI framework
- [TypeScript Compiler API (Microsoft)](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) -- AST parsing
- [Tree-sitter (GitHub)](https://github.com/tree-sitter/tree-sitter) -- multi-language parsing
- [Dempster-Shafer Theory (Wikipedia)](https://en.wikipedia.org/wiki/Dempster%E2%80%93Shafer_theory) -- evidence fusion theory
- [Shannon Entropy (Wikipedia)](https://en.wikipedia.org/wiki/Entropy_(information_theory)) -- entropy fundamentals
- [Probability Calibration (scikit-learn)](https://scikit-learn.org/stable/modules/calibration.html) -- sigmoid/Platt scaling
- [Window-based Change Point Detection (ruptures)](https://centre-borelli.github.io/ruptures-docs/user-guide/detection/window/) -- segmentation algorithms
