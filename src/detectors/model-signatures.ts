import type { Detector, DetectionSignal, ParsedCode, ModelAttribution, ModelName } from '../types.js';

interface ModelScore {
  model: ModelName;
  score: number;
  matchedPatterns: string[];
}

function scoreClaudePatterns(code: ParsedCode): ModelScore {
  const matchedPatterns: string[] = [];
  let score = 0;
  const fullText = code.lines.join('\n');

  // const-ratio: Claude prefers const over let/var
  const constCount = (fullText.match(/\bconst\s/g) || []).length;
  const letCount = (fullText.match(/\blet\s/g) || []).length;
  const varCount = (fullText.match(/\bvar\s/g) || []).length;
  const totalDecl = constCount + letCount + varCount;
  if (totalDecl > 3 && constCount / totalDecl > 0.80) {
    score += 0.25;
    matchedPatterns.push('const-preference');
  }

  // import type usage
  const typeImports = code.imports.filter((i) => i.isTypeOnly).length;
  if (code.imports.length > 0 && typeImports / code.imports.length > 0.25) {
    score += 0.20;
    matchedPatterns.push('import-type-usage');
  }

  // Functional methods (.map, .filter, .reduce, etc.)
  const funcMethods = ['\\.map\\(', '\\.filter\\(', '\\.reduce\\(', '\\.flatMap\\(', '\\.some\\(', '\\.every\\(', '\\.find\\('];
  let funcMethodCount = 0;
  for (const method of funcMethods) {
    funcMethodCount += (fullText.match(new RegExp(method, 'g')) || []).length;
  }
  if (funcMethodCount >= 3) {
    score += 0.20;
    matchedPatterns.push('functional-style');
  }

  // Arrow functions vs function declarations
  const arrowFns = code.functions.filter(() => fullText.includes('=>')).length;
  if (code.functions.length > 2 && arrowFns / code.functions.length > 0.60) {
    score += 0.15;
    matchedPatterns.push('arrow-functions');
  }

  // Readonly/immutability patterns
  if (/\bReadonly\b/.test(fullText) || /\breadonly\s/.test(fullText) || /Object\.freeze/.test(fullText)) {
    score += 0.10;
    matchedPatterns.push('immutability-patterns');
  }

  return { model: 'claude', score: Math.min(1, score), matchedPatterns };
}

function scoreGptPatterns(code: ParsedCode): ModelScore {
  const matchedPatterns: string[] = [];
  let score = 0;

  // Pre-function comments: "This function does X"
  let preFuncCount = 0;
  for (const comment of code.comments) {
    if (/\b(This|The)\s+(function|method|class|module|utility|helper)\b/i.test(comment.text)) {
      preFuncCount++;
    }
  }
  if (preFuncCount >= 2) {
    score += 0.30;
    matchedPatterns.push('pre-function-comments');
  }

  // Step-by-step comments
  let stepCount = 0;
  for (const comment of code.comments) {
    if (/\b(Step\s+\d|First,?\s|Then,?\s|Next,?\s|Finally,?\s)/i.test(comment.text)) {
      stepCount++;
    }
  }
  if (stepCount >= 2) {
    score += 0.25;
    matchedPatterns.push('step-by-step-comments');
  }

  // Obvious/explanatory comments
  let obviousCount = 0;
  for (const comment of code.comments) {
    if (/\b(Get|Set|Check|Return|Create|Initialize|Define|Calculate|Convert|Validate|Loop|Split|Join|Pad)\s+(the|a|an|all)/i.test(comment.text)) {
      obviousCount++;
    }
  }
  if (obviousCount >= 3) {
    score += 0.25;
    matchedPatterns.push('obvious-comments');
  }

  // High comment density
  const commentLines = code.comments.reduce((sum, c) => sum + (c.endLine - c.startLine + 1), 0);
  if (code.lines.length > 10 && commentLines / code.lines.length > 0.35) {
    score += 0.10;
    matchedPatterns.push('high-comment-density');
  }

  return { model: 'gpt', score: Math.min(1, score), matchedPatterns };
}

function scoreCopilotPatterns(code: ParsedCode): ModelScore {
  const matchedPatterns: string[] = [];
  let score = 0;

  // Short functions (5-18 lines, completion-sized)
  if (code.functions.length >= 3) {
    const shortFns = code.functions.filter((f) => f.lineCount >= 3 && f.lineCount <= 18);
    if (shortFns.length / code.functions.length > 0.70) {
      score += 0.35;
      matchedPatterns.push('short-completions');
    }
  }

  // Minimal comments
  const commentLines = code.comments.reduce((sum, c) => sum + (c.endLine - c.startLine + 1), 0);
  if (code.lines.length > 20 && commentLines / code.lines.length < 0.05) {
    score += 0.25;
    matchedPatterns.push('no-comments');
  }

  // Direct exports (export function / export const on most functions)
  const fullText = code.lines.join('\n');
  const exportedFns = (fullText.match(/export\s+(function|const|async\s+function)\s/g) || []).length;
  if (code.functions.length >= 3 && exportedFns / code.functions.length > 0.60) {
    score += 0.20;
    matchedPatterns.push('direct-exports');
  }

  // Utility/helper pattern (many small standalone functions, no class)
  const hasClass = /\bclass\s+\w+/.test(fullText);
  if (!hasClass && code.functions.length >= 5) {
    score += 0.20;
    matchedPatterns.push('utility-pattern');
  }

  return { model: 'copilot', score: Math.min(1, score), matchedPatterns };
}

/**
 * Determine model attribution from scores.
 * Top model must exceed 0.4 and have gap > 0.15 to second.
 */
function attributeModel(scores: ModelScore[]): ModelAttribution | null {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];

  if (!top || top.score < 0.4) return null;
  if (second && top.score - second.score < 0.15) {
    return { model: 'unknown', confidence: Math.round(top.score * 50), matchedPatterns: top.matchedPatterns };
  }

  return {
    model: top.model,
    confidence: Math.round(top.score * 100),
    matchedPatterns: top.matchedPatterns,
  };
}

export const modelSignaturesDetector: Detector = {
  name: 'model-signatures',
  version: '1.0.0',

  detect(code: ParsedCode): DetectionSignal[] {
    const signals: DetectionSignal[] = [];

    const claudeScore = scoreClaudePatterns(code);
    const gptScore = scoreGptPatterns(code);
    const copilotScore = scoreCopilotPatterns(code);

    const allScores = [claudeScore, gptScore, copilotScore];
    const attribution = attributeModel(allScores);

    // Emit a signal for the winning model
    const topScore = Math.max(claudeScore.score, gptScore.score, copilotScore.score);

    if (topScore > 0.2) {
      const topModel = allScores.find((s) => s.score === topScore)!;
      signals.push({
        detector: 'model-signatures',
        signalType: `model-${topModel.model}`,
        strength: topScore,
        location: { startLine: 1, endLine: code.lines.length },
        description: `${topModel.model} patterns: ${topModel.matchedPatterns.join(', ')} (score: ${(topScore * 100).toFixed(0)}%)`,
      });
    }

    return signals;
  },
};

// Export for use by analyzer when attaching model attribution to ranges
export { attributeModel, scoreClaudePatterns, scoreGptPatterns, scoreCopilotPatterns };
export type { ModelScore };
