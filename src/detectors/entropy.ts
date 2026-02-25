import type { Detector, DetectionSignal, ParsedCode } from '../types.js';

const WINDOW_SIZE = 20;
const WINDOW_STRIDE = 10;

// Code-specific entropy thresholds (higher than prose — code has more syntax chars)
const AI_CEILING = 4.5;     // Below this = strong AI signal
const HUMAN_FLOOR = 5.0;    // Above this = strong human signal

/**
 * Calculate Shannon entropy (bits per character) for a text string.
 */
export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const ch of text) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }

  let entropy = 0;
  const len = text.length;
  for (const count of freq.values()) {
    const p = count / len;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Measure identifier diversity — how varied are the names?
 * AI tends to reuse the same small set of generic names.
 * Returns 0-1 where lower = less diverse = more AI-like.
 */
function identifierDiversity(identifiers: readonly { name: string }[]): number {
  if (identifiers.length < 3) return 0.5;
  const unique = new Set(identifiers.map((id) => id.name.toLowerCase()));
  return unique.size / identifiers.length;
}

function entropyToSignal(entropy: number): number {
  if (entropy <= AI_CEILING) return 1.0;
  if (entropy >= HUMAN_FLOOR) return 0.0;
  return 1.0 - (entropy - AI_CEILING) / (HUMAN_FLOOR - AI_CEILING);
}

export const entropyDetector: Detector = {
  name: 'entropy',
  version: '1.0.0',

  detect(code: ParsedCode): DetectionSignal[] {
    const signals: DetectionSignal[] = [];
    const { lines, identifiers } = code;

    if (lines.length < 5) return signals;

    // Per-window character entropy
    for (let start = 0; start < lines.length; start += WINDOW_STRIDE) {
      const end = Math.min(start + WINDOW_SIZE, lines.length);
      const windowText = lines.slice(start, end).join('\n');

      if (windowText.trim().length < 50) continue;

      const entropy = shannonEntropy(windowText);
      const strength = entropyToSignal(entropy);

      signals.push({
        detector: 'entropy',
        signalType: entropy < AI_CEILING ? 'low-lexical-entropy' : 'normal-entropy',
        strength,
        location: { startLine: start + 1, endLine: end },
        description: `Character entropy ${entropy.toFixed(2)} bits/char${entropy < AI_CEILING ? ` (AI threshold: < ${AI_CEILING})` : ''}`,
      });
    }

    // Identifier diversity (file-wide signal)
    const diversity = identifierDiversity(identifiers);
    const diversityStrength = diversity < 0.5
      ? Math.min(1.0, (0.5 - diversity) / 0.3)
      : 0;

    if (identifiers.length >= 3) {
      signals.push({
        detector: 'entropy',
        signalType: 'identifier-diversity',
        strength: diversityStrength,
        location: { startLine: 1, endLine: lines.length },
        description: `Identifier diversity ${(diversity * 100).toFixed(0)}% (${identifiers.length} identifiers, ${new Set(identifiers.map(i => i.name)).size} unique)`,
      });
    }

    return signals;
  },
};
