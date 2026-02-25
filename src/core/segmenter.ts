import type {
  Classification,
  DetectionSignal,
  LineRange,
  WindowClassification,
} from '../types.js';
import { calibrateConfidence, classifyFromScore } from './confidence.js';

const WINDOW_SIZE = 20;
const WINDOW_STRIDE = 10;
const MIN_RANGE_LINES = 5;

/**
 * Aggregate signal strengths for a window into a raw AI score (0-1).
 * Higher = more likely AI.
 *
 * Strategy: Take the MAX signal strength per detector (not average),
 * then compute weighted sum across detectors. This prevents multiple
 * weak signals from the same detector from diluting the score.
 */
function aggregateSignals(
  signals: readonly DetectionSignal[],
  startLine: number,
  endLine: number,
): { score: number; relevantSignals: DetectionSignal[] } {
  const relevant = signals.filter(
    (s) => s.location.startLine <= endLine && s.location.endLine >= startLine,
  );

  if (relevant.length === 0) return { score: 0.5, relevantSignals: [] };

  // Detector weights
  const weights: Record<string, number> = {
    'entropy': 0.30,
    'comment-patterns': 0.25,
    'naming-patterns': 0.20,
    'structural': 0.15,
    'model-signatures': 0.10,
  };

  // Group signals by detector, take max strength per detector
  // BUT track human-marker signals separately as a penalty
  const detectorMax = new Map<string, number>();
  let humanMarkerPenalty = 0;

  for (const signal of relevant) {
    // Human markers (strength 0) act as penalties, not contributors
    if (signal.signalType === 'human-markers') {
      // Each human marker detected reduces the AI score
      humanMarkerPenalty = 0.5; // Strong penalty
      continue;
    }
    const current = detectorMax.get(signal.detector) ?? 0;
    detectorMax.set(signal.detector, Math.max(current, signal.strength));
  }

  // Weighted sum using max-per-detector
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [detector, maxStrength] of detectorMax) {
    const w = weights[detector] ?? 0.10;
    weightedSum += maxStrength * w;
    totalWeight += w;
  }

  let score = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

  // Apply human marker penalty — reduces AI score significantly
  if (humanMarkerPenalty > 0) {
    score = score * (1 - humanMarkerPenalty);
  }

  return { score, relevantSignals: relevant };
}

/**
 * Classify code into overlapping windows.
 */
export function classifyWindows(
  lines: readonly string[],
  signals: readonly DetectionSignal[],
): WindowClassification[] {
  const windows: WindowClassification[] = [];

  for (let start = 0; start < lines.length; start += WINDOW_STRIDE) {
    const end = Math.min(start + WINDOW_SIZE, lines.length);
    const startLine = start + 1; // 1-indexed
    const endLine = end;

    const { score, relevantSignals } = aggregateSignals(signals, startLine, endLine);
    const confidence = calibrateConfidence(score);
    const classification = classifyFromScore(score);

    windows.push({
      startLine,
      endLine,
      classification,
      confidence,
      signals: relevantSignals,
    });
  }

  return windows;
}

/**
 * Merge adjacent windows with the same classification into line ranges.
 * Discard ranges smaller than MIN_RANGE_LINES.
 */
export function mergeWindows(
  windows: readonly WindowClassification[],
  totalLines: number,
): LineRange[] {
  if (windows.length === 0) {
    return [{
      startLine: 1,
      endLine: totalLines,
      classification: 'unknown',
      confidence: 0,
      modelAttribution: null,
      signals: [],
    }];
  }

  const merged: LineRange[] = [];
  let current: {
    startLine: number;
    endLine: number;
    classification: Classification;
    confidences: number[];
    signals: DetectionSignal[];
  } = {
    startLine: windows[0].startLine,
    endLine: windows[0].endLine,
    classification: windows[0].classification,
    confidences: [windows[0].confidence],
    signals: [...windows[0].signals],
  };

  for (let i = 1; i < windows.length; i++) {
    const w = windows[i];
    if (w.classification === current.classification) {
      // Extend current range
      current.endLine = w.endLine;
      current.confidences.push(w.confidence);
      current.signals.push(...w.signals);
    } else {
      // Flush current range
      merged.push(finalizeRange(current));
      current = {
        startLine: w.startLine,
        endLine: w.endLine,
        classification: w.classification,
        confidences: [w.confidence],
        signals: [...w.signals],
      };
    }
  }

  // Flush last range
  merged.push(finalizeRange(current));

  // Post-process: absorb tiny ranges into neighbors
  return absorbTinyRanges(merged, totalLines);
}

function finalizeRange(range: {
  startLine: number;
  endLine: number;
  classification: Classification;
  confidences: number[];
  signals: DetectionSignal[];
}): LineRange {
  // Average confidence across merged windows
  const avgConfidence = Math.round(
    range.confidences.reduce((a, b) => a + b, 0) / range.confidences.length,
  );

  // Deduplicate signals
  const seen = new Set<string>();
  const uniqueSignals = range.signals.filter((s) => {
    const key = `${s.detector}:${s.signalType}:${s.location.startLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    startLine: range.startLine,
    endLine: range.endLine,
    classification: range.classification,
    confidence: avgConfidence,
    modelAttribution: null, // Set later by model-signatures detector
    signals: uniqueSignals,
  };
}

function absorbTinyRanges(ranges: LineRange[], totalLines: number): LineRange[] {
  if (ranges.length <= 1) return ranges;

  const result: LineRange[] = [];
  for (const range of ranges) {
    const size = range.endLine - range.startLine + 1;
    if (size < MIN_RANGE_LINES && result.length > 0) {
      // Absorb into previous range
      const prev = result[result.length - 1];
      result[result.length - 1] = {
        ...prev,
        endLine: range.endLine,
      };
    } else {
      result.push(range);
    }
  }

  // Ensure ranges cover the full file
  if (result.length > 0) {
    result[0] = { ...result[0], startLine: 1 };
    result[result.length - 1] = { ...result[result.length - 1], endLine: totalLines };
  }

  return result;
}
