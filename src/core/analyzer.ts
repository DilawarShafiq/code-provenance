import type {
  Detector,
  DetectionSignal,
  LineRange,
  ScanResult,
  ScanSummary,
  AnalysisMetadata,
  FileMetadata,
  ParsedCode,
} from '../types.js';
import { selectParser, isBinaryContent } from '../parsers/parser.js';
import { classifyWindows, mergeWindows } from './segmenter.js';
import { overallConfidenceLevel } from './confidence.js';
import { entropyDetector } from '../detectors/entropy.js';
import { commentPatternsDetector } from '../detectors/comment-patterns.js';
import { namingPatternsDetector } from '../detectors/naming-patterns.js';
import { structuralDetector } from '../detectors/structural.js';
import {
  modelSignaturesDetector,
  scoreClaudePatterns,
  scoreGptPatterns,
  scoreCopilotPatterns,
  attributeModel,
} from '../detectors/model-signatures.js';
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

// Package version — read once at startup
let toolVersion = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
  toolVersion = pkg.version ?? '0.1.0';
} catch {
  // fallback
}

/**
 * All registered detectors. New detectors are added here.
 */
const detectors: Detector[] = [
  entropyDetector,
  commentPatternsDetector,
  namingPatternsDetector,
  structuralDetector,
  modelSignaturesDetector,
];

/**
 * Register an additional detector (e.g., model-signatures, ngram).
 */
export function registerDetector(detector: Detector): void {
  detectors.push(detector);
}

/**
 * Analyze a single file for AI-generated code.
 */
export function analyze(filePath: string): ScanResult {
  const startTime = performance.now();
  const absPath = resolve(filePath);
  const relPath = relative(process.cwd(), absPath);

  // Read file
  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read file: ${absPath} — ${(err as Error).message}`);
  }

  // Binary check
  if (isBinaryContent(content)) {
    throw new Error(`Binary file not supported: ${relPath}`);
  }

  // Empty file
  const lines = content.split('\n');
  if (lines.length === 0 || content.trim() === '') {
    return emptyResult(absPath, relPath, startTime);
  }

  // Parse
  const parser = selectParser(filePath);
  const parsed: ParsedCode = parser.parse(content, filePath);

  // Run all detectors
  const allSignals: DetectionSignal[] = [];
  for (const detector of detectors) {
    const signals = detector.detect(parsed);
    allSignals.push(...signals);
  }

  // Segment into windows and merge into line ranges
  const windows = classifyWindows(parsed.lines, allSignals);
  const rawRanges = mergeWindows(windows, lines.length);

  // Attach model attribution to AI-generated ranges
  const modelScores = [
    scoreClaudePatterns(parsed),
    scoreGptPatterns(parsed),
    scoreCopilotPatterns(parsed),
  ];
  const attribution = attributeModel(modelScores);

  const ranges = rawRanges.map((range) => {
    if (range.classification === 'ai-generated' && attribution) {
      return { ...range, modelAttribution: attribution };
    }
    return range;
  });

  // Compute summary
  const summary = computeSummary(ranges, lines.length);

  // Build metadata
  const duration = Math.round(performance.now() - startTime);
  const metadata = buildMetadata(duration);

  const file: FileMetadata = {
    path: absPath,
    relativePath: relPath,
    totalLines: lines.length,
    language: parsed.language,
    parserUsed: parser.language,
  };

  return { file, ranges, summary, metadata };
}

function computeSummary(ranges: readonly LineRange[], totalLines: number): ScanSummary {
  let aiLines = 0;
  let humanLines = 0;
  let unknownLines = 0;
  const modelCounts: Record<string, number> = {};

  for (const range of ranges) {
    const rangeLines = range.endLine - range.startLine + 1;
    switch (range.classification) {
      case 'ai-generated':
        aiLines += rangeLines;
        break;
      case 'human-written':
        humanLines += rangeLines;
        break;
      default:
        unknownLines += rangeLines;
    }

    if (range.modelAttribution) {
      const model = range.modelAttribution.model;
      modelCounts[model] = (modelCounts[model] ?? 0) + rangeLines;
    }
  }

  const total = aiLines + humanLines + unknownLines;
  return {
    aiPercentage: total > 0 ? Math.round((aiLines / total) * 100) : 0,
    humanPercentage: total > 0 ? Math.round((humanLines / total) * 100) : 0,
    unknownPercentage: total > 0 ? Math.round((unknownLines / total) * 100) : 0,
    overallConfidence: overallConfidenceLevel(ranges, totalLines),
    modelBreakdown: modelCounts,
  };
}

function buildMetadata(duration: number): AnalysisMetadata {
  return {
    toolVersion,
    analyzedAt: new Date().toISOString(),
    algorithmVersions: Object.fromEntries(
      detectors.map((d) => [d.name, d.version]),
    ),
    thresholds: {
      entropyAiCeiling: 4.0,
      entropyHumanFloor: 4.5,
      aiScoreThreshold: 0.60,
      humanScoreThreshold: 0.40,
      sigmoidK: 10,
      sigmoidMidpoint: 0.5,
    },
    duration,
  };
}

function emptyResult(absPath: string, relPath: string, startTime: number): ScanResult {
  return {
    file: {
      path: absPath,
      relativePath: relPath,
      totalLines: 0,
      language: 'unknown',
      parserUsed: 'none',
    },
    ranges: [],
    summary: {
      aiPercentage: 0,
      humanPercentage: 0,
      unknownPercentage: 0,
      overallConfidence: 'LOW',
      modelBreakdown: {},
    },
    metadata: buildMetadata(Math.round(performance.now() - startTime)),
  };
}
