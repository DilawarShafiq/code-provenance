import type { Detector, DetectionSignal, ParsedCode } from '../types.js';

// Generic identifier names commonly used by AI models.
// Only multi-syllable or clearly "placeholder" names — excludes short/common abbreviations
// that real developers use frequently (err, res, req, buf, ctx, etc.)
const GENERIC_NAMES = new Set([
  'data', 'result', 'response', 'value', 'item', 'element',
  'temp', 'info', 'output', 'input', 'config', 'options',
  'params', 'handler', 'callback',
  'accumulator', 'current', 'previous',
  'text', 'content', 'payload', 'source', 'target',
  'numbers', 'items', 'results', 'values', 'entries',
  'words', 'tokens', 'chunks',
  'pattern', 'flag', 'mode',
]);

// Single-letter names (common in human code, not penalized)
const SINGLE_LETTER = /^[a-z_]$/i;

// Common language built-ins to exclude
const BUILTINS = new Set([
  'console', 'process', 'window', 'document', 'module', 'exports',
  'require', 'import', 'export', 'default', 'undefined', 'null',
  'true', 'false', 'this', 'self', 'super',
]);

const AI_GENERIC_THRESHOLD = 0.25; // > 25% generic names = AI signal

export const namingPatternsDetector: Detector = {
  name: 'naming-patterns',
  version: '1.0.0',

  detect(code: ParsedCode): DetectionSignal[] {
    const signals: DetectionSignal[] = [];
    const { identifiers, lines } = code;

    if (identifiers.length < 3) return signals;

    // Filter out builtins and single-letter variables
    const meaningful = identifiers.filter(
      (id) => !BUILTINS.has(id.name) && !SINGLE_LETTER.test(id.name),
    );

    if (meaningful.length < 3) return signals;

    // Count generic vs domain-specific names
    let genericCount = 0;
    const genericNames: string[] = [];
    for (const id of meaningful) {
      const lower = id.name.toLowerCase();
      if (GENERIC_NAMES.has(lower)) {
        genericCount++;
        if (!genericNames.includes(lower)) {
          genericNames.push(lower);
        }
      }
    }

    const genericRatio = genericCount / meaningful.length;
    const strength = genericRatio > AI_GENERIC_THRESHOLD
      ? Math.min(1.0, (genericRatio - AI_GENERIC_THRESHOLD) / 0.25)
      : 0;

    signals.push({
      detector: 'naming-patterns',
      signalType: 'generic-naming',
      strength,
      location: { startLine: 1, endLine: lines.length },
      description: `${(genericRatio * 100).toFixed(0)}% generic identifiers (${genericNames.slice(0, 5).join(', ')})${genericRatio > AI_GENERIC_THRESHOLD ? ' — AI tends toward generic naming' : ''}`,
    });

    // Check for naming consistency (AI is very consistent, humans vary)
    const namingStyles = analyzeNamingStyle(meaningful.map((id) => id.name));
    if (namingStyles.consistency > 0.95 && meaningful.length > 10) {
      signals.push({
        detector: 'naming-patterns',
        signalType: 'naming-consistency',
        strength: 0.5,
        location: { startLine: 1, endLine: lines.length },
        description: `Naming style is ${(namingStyles.consistency * 100).toFixed(0)}% consistent (${namingStyles.dominant} case) — AI-typical uniformity`,
      });
    }

    return signals;
  },
};

interface NamingAnalysis {
  consistency: number;
  dominant: string;
}

function analyzeNamingStyle(names: string[]): NamingAnalysis {
  let camelCount = 0;
  let snakeCount = 0;
  let pascalCount = 0;

  for (const name of names) {
    if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) camelCount++;
    else if (/^[a-z][a-z0-9_]*$/.test(name) && name.includes('_')) snakeCount++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) pascalCount++;
  }

  const max = Math.max(camelCount, snakeCount, pascalCount);
  const total = camelCount + snakeCount + pascalCount;
  const dominant = max === camelCount ? 'camelCase'
    : max === snakeCount ? 'snake_case'
    : 'PascalCase';

  return {
    consistency: total > 0 ? max / total : 0,
    dominant,
  };
}
