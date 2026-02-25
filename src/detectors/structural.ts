import type { Detector, DetectionSignal, ParsedCode } from '../types.js';

const AI_IMPORT_SORT_THRESHOLD = 0.95;   // AI alphabetizes > 95% (stricter)
const AI_FUNC_CV_THRESHOLD = 0.25;       // AI functions have CV < 0.25 (stricter)
const AI_TRY_CATCH_THRESHOLD = 0.70;     // AI wraps > 70% in try/catch

// Human-written code markers — reduce AI signal when present
const HUMAN_MARKERS = [
  /\bHACK\b/,
  /\bFIXME\b/,
  /\bXXX\b/,
  /\bTODO\b.*:/,  // TODO with description (not just "TODO")
  /@ts-expect-error/,
  /@ts-ignore/,
  /\bworkaround\b/i,
  /\bkludge\b/i,
  /\bnot production\b/i,
  /\bquick & dirty\b/i,
  /\bdead simple\b/i,
  /\bat \$\w+/,       // "at $DAYJOB" type references
  /\bgrabbed this\b/i,
  /\bfound by ear\b/i,
];

// Whitespace inconsistency — AI is perfectly consistent
function whitespaceConsistency(lines: readonly string[]): number {
  let spaces = 0;
  let tabs = 0;
  let mixed = 0;

  for (const line of lines) {
    if (line.length === 0 || line.trim() === '') continue;
    const indent = line.match(/^(\s+)/);
    if (!indent) continue;
    const ws = indent[1];
    if (ws.includes('\t') && ws.includes(' ')) mixed++;
    else if (ws.includes('\t')) tabs++;
    else spaces++;
  }

  const total = spaces + tabs + mixed;
  if (total < 5) return 0.5;
  // Perfect consistency = high AI signal
  return Math.max(spaces, tabs) / total;
}

function importSortPercentage(imports: readonly { source: string; line: number }[]): number {
  if (imports.length < 3) return 0.5; // Need at least 3 imports to judge
  let sorted = 0;
  for (let i = 1; i < imports.length; i++) {
    if (imports[i].source.localeCompare(imports[i - 1].source) >= 0) sorted++;
  }
  return sorted / (imports.length - 1);
}

function functionLengthCV(functions: readonly { lineCount: number }[]): number {
  if (functions.length < 3) return 0.5; // Need 3+ functions
  const lengths = functions.map((f) => f.lineCount);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 0.5;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

function tryCatchRatio(functions: readonly { hasErrorHandling: boolean }[]): number {
  if (functions.length === 0) return 0;
  return functions.filter((f) => f.hasErrorHandling).length / functions.length;
}

export const structuralDetector: Detector = {
  name: 'structural',
  version: '1.0.0',

  detect(code: ParsedCode): DetectionSignal[] {
    const signals: DetectionSignal[] = [];
    const { lines, imports, functions, comments } = code;

    // 0. Human markers — if found, emit a strong NEGATIVE signal
    const fullText = lines.join('\n');
    let humanMarkerCount = 0;
    for (const marker of HUMAN_MARKERS) {
      if (marker.test(fullText)) humanMarkerCount++;
    }

    if (humanMarkerCount > 0) {
      // Negative signal: strength 0 = strong human indicator
      signals.push({
        detector: 'structural',
        signalType: 'human-markers',
        strength: 0, // Zero = human
        location: { startLine: 1, endLine: lines.length },
        description: `${humanMarkerCount} human code markers (HACK, FIXME, workarounds, informal comments)`,
      });
    }

    // 1. Import organization
    if (imports.length >= 3) {
      const sortPct = importSortPercentage(imports);
      const sortStrength = sortPct > AI_IMPORT_SORT_THRESHOLD
        ? Math.min(1.0, (sortPct - AI_IMPORT_SORT_THRESHOLD) / 0.05)
        : 0;

      signals.push({
        detector: 'structural',
        signalType: 'import-organization',
        strength: sortStrength,
        location: { startLine: imports[0].line, endLine: imports[imports.length - 1].line },
        description: `Imports ${(sortPct * 100).toFixed(0)}% alphabetically sorted${sortPct > AI_IMPORT_SORT_THRESHOLD ? ' (AI-typical perfect ordering)' : ''}`,
      });
    }

    // 2. Function length uniformity
    if (functions.length >= 3) {
      const cv = functionLengthCV(functions);
      const cvStrength = cv < AI_FUNC_CV_THRESHOLD
        ? Math.min(1.0, (AI_FUNC_CV_THRESHOLD - cv) / AI_FUNC_CV_THRESHOLD)
        : 0;

      const lengths = functions.map((f) => f.lineCount);
      const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;

      signals.push({
        detector: 'structural',
        signalType: 'function-length-uniformity',
        strength: cvStrength,
        location: { startLine: 1, endLine: lines.length },
        description: `Function length CV=${cv.toFixed(2)} (avg ${avgLen.toFixed(0)} lines)${cv < AI_FUNC_CV_THRESHOLD ? ' — AI generates uniform-length functions' : ''}`,
      });
    }

    // 3. Error handling patterns
    if (functions.length >= 3) {
      const tcRatio = tryCatchRatio(functions);
      const tcStrength = tcRatio > AI_TRY_CATCH_THRESHOLD
        ? Math.min(1.0, (tcRatio - AI_TRY_CATCH_THRESHOLD) / 0.30)
        : 0;

      signals.push({
        detector: 'structural',
        signalType: 'error-handling-style',
        strength: tcStrength,
        location: { startLine: 1, endLine: lines.length },
        description: `${(tcRatio * 100).toFixed(0)}% of functions use try/catch${tcRatio > AI_TRY_CATCH_THRESHOLD ? ' (AI wraps everything in error handling)' : ''}`,
      });
    }

    // 4. Whitespace consistency
    const wsConsistency = whitespaceConsistency(lines);
    if (wsConsistency > 0.98 && lines.length > 20) {
      signals.push({
        detector: 'structural',
        signalType: 'whitespace-consistency',
        strength: 0.6,
        location: { startLine: 1, endLine: lines.length },
        description: `${(wsConsistency * 100).toFixed(0)}% whitespace consistency — AI is unnaturally uniform`,
      });
    }

    return signals;
  },
};
