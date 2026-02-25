import type { Classification, ConfidenceLevel } from '../types.js';

// Sigmoid calibration — tuned so that:
// - Raw score 0.35+ maps to "ai-generated" territory
// - Raw score 0.20-0.35 maps to "unknown"
// - Raw score < 0.20 maps to "human-written"
// This is intentionally generous because individual detectors
// already apply conservative thresholds internally.
const SIGMOID_K = 8;
const SIGMOID_MIDPOINT = 0.40;

// Classification thresholds on RAW score (before sigmoid)
const AI_THRESHOLD = 0.42;      // > 0.42 = ai-generated
const HUMAN_THRESHOLD = 0.25;   // < 0.25 = human-written

/**
 * Map a raw 0-1 score through sigmoid to calibrated 0-100 confidence.
 */
export function calibrateConfidence(rawScore: number): number {
  const sigmoid = 1 / (1 + Math.exp(-SIGMOID_K * (rawScore - SIGMOID_MIDPOINT)));
  return Math.round(sigmoid * 100);
}

/**
 * Classify based on raw score thresholds.
 */
export function classifyFromScore(rawScore: number): Classification {
  if (rawScore >= AI_THRESHOLD) return 'ai-generated';
  if (rawScore <= HUMAN_THRESHOLD) return 'human-written';
  return 'unknown';
}

/**
 * Determine overall confidence level from line ranges.
 */
export function overallConfidenceLevel(
  ranges: readonly { confidence: number; classification: string; startLine: number; endLine: number }[],
  totalLines: number,
): ConfidenceLevel {
  if (ranges.length === 0) return 'LOW';

  let totalConfidence = 0;
  let unknownLines = 0;

  for (const range of ranges) {
    const rangeLines = range.endLine - range.startLine + 1;
    totalConfidence += range.confidence * rangeLines;
    if (range.classification === 'unknown') {
      unknownLines += rangeLines;
    }
  }

  const avgConfidence = totalConfidence / totalLines;
  const unknownPct = unknownLines / totalLines;

  if (avgConfidence > 65 && unknownPct <= 0.20) return 'HIGH';
  if (avgConfidence >= 40 && unknownPct <= 0.40) return 'MEDIUM';
  return 'LOW';
}
