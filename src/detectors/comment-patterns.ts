import type { Detector, DetectionSignal, ParsedCode } from '../types.js';

// AI comment pattern indicators
const PRE_FUNCTION_COMMENT = /^\s*(\/\/|\/\*\*?|#)\s*(This|The|A|An)\s+(function|method|class|module|helper|utility|file|component|hook)/i;
const STEP_COMMENT = /^\s*(\/\/|#)\s*(Step\s+\d|First,?\s|Second,?\s|Third,?\s|Then,?\s|Next,?\s|Finally,?\s)/i;
const OBVIOUS_COMMENT = /^\s*(\/\/|#)\s*(Import|Export|Return|Check|Get|Set|Create|Initialize|Define|Declare|Calculate|Convert|Validate|Loop|Split|Join|Pad|Store|Attempt|Extract|Truncate|Clear|Divide|Add)\s+(the|a|an|all|each|and|random|through|single|back|digit)\s+/i;
const EXPLANATORY_COMMENT = /^\s*(\/\/|#)\s*(It |We |If |This |These |The result|The .+ (is|are|will|should|can|must))/i;

const AI_DENSITY_THRESHOLD = 0.30;  // AI over-comments: > 30% comment density
const AI_PRE_FUNC_THRESHOLD = 0.60; // AI comments before > 60% of functions

/**
 * Count lines that are comments vs code in a range.
 */
function commentDensity(
  lines: readonly string[],
  start: number,
  end: number,
): number {
  let commentLines = 0;
  let codeLines = 0;

  for (let i = start; i < end && i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      commentLines++;
    } else {
      codeLines++;
    }
  }

  const total = commentLines + codeLines;
  return total > 0 ? commentLines / total : 0;
}

export const commentPatternsDetector: Detector = {
  name: 'comment-patterns',
  version: '1.0.0',

  detect(code: ParsedCode): DetectionSignal[] {
    const signals: DetectionSignal[] = [];
    const { lines, comments, functions } = code;

    if (lines.length < 5) return signals;

    // 1. Overall comment density
    const density = commentDensity(lines, 0, lines.length);
    const densityStrength = density > AI_DENSITY_THRESHOLD
      ? Math.min(1.0, (density - AI_DENSITY_THRESHOLD) / 0.20)
      : 0;

    if (density > 0) {
      signals.push({
        detector: 'comment-patterns',
        signalType: 'comment-density',
        strength: densityStrength,
        location: { startLine: 1, endLine: lines.length },
        description: `Comment density ${(density * 100).toFixed(0)}%${density > AI_DENSITY_THRESHOLD ? ' (AI typically > 30%)' : ''}`,
      });
    }

    // 2. Pre-function comment pattern (AI puts doc comment before every function)
    if (functions.length > 0) {
      let preFuncComments = 0;
      for (const fn of functions) {
        // Check if there's a comment on the line(s) just before the function
        const hasPreComment = comments.some(
          (c) => c.endLine >= fn.startLine - 2 && c.endLine <= fn.startLine,
        );
        if (hasPreComment) preFuncComments++;
      }
      const preFuncRatio = preFuncComments / functions.length;
      const preFuncStrength = preFuncRatio > AI_PRE_FUNC_THRESHOLD
        ? Math.min(1.0, (preFuncRatio - AI_PRE_FUNC_THRESHOLD) / 0.30)
        : 0;

      signals.push({
        detector: 'comment-patterns',
        signalType: 'pre-function-comments',
        strength: preFuncStrength,
        location: { startLine: 1, endLine: lines.length },
        description: `${(preFuncRatio * 100).toFixed(0)}% of functions have preceding comments${preFuncRatio > AI_PRE_FUNC_THRESHOLD ? ' (AI pattern)' : ''}`,
      });
    }

    // 3. Verbose/obvious comment patterns (GPT hallmark)
    let verboseCount = 0;
    for (const comment of comments) {
      if (
        PRE_FUNCTION_COMMENT.test(comment.text) ||
        STEP_COMMENT.test(comment.text) ||
        OBVIOUS_COMMENT.test(comment.text) ||
        EXPLANATORY_COMMENT.test(comment.text)
      ) {
        verboseCount++;
      }
    }

    if (comments.length > 0) {
      const verboseRatio = verboseCount / comments.length;
      signals.push({
        detector: 'comment-patterns',
        signalType: 'verbose-comments',
        strength: Math.min(1.0, verboseRatio * 2), // Scale: 50% verbose → strength 1.0
        location: { startLine: 1, endLine: lines.length },
        description: `${verboseCount}/${comments.length} comments use verbose/obvious patterns`,
      });
    }

    return signals;
  },
};
