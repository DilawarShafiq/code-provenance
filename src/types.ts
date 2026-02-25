// ─── Classification Enums ──────────────────────────────────────────────────

export type Classification = 'ai-generated' | 'human-written' | 'unknown';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type ModelName = 'claude' | 'gpt' | 'copilot' | 'unknown';

// ─── Core Analysis Types ───────────────────────────────────────────────────

export interface DetectionSignal {
  readonly detector: string;
  readonly signalType: string;
  readonly strength: number; // 0.0 - 1.0
  readonly location: { readonly startLine: number; readonly endLine: number };
  readonly description: string;
}

export interface ModelAttribution {
  readonly model: ModelName;
  readonly confidence: number; // 0-100
  readonly matchedPatterns: readonly string[];
}

export interface LineRange {
  readonly startLine: number; // 1-indexed, inclusive
  readonly endLine: number; // 1-indexed, inclusive
  readonly classification: Classification;
  readonly confidence: number; // 0-100
  readonly modelAttribution: ModelAttribution | null;
  readonly signals: readonly DetectionSignal[];
}

export interface FileMetadata {
  readonly path: string;
  readonly relativePath: string;
  readonly totalLines: number;
  readonly language: string;
  readonly parserUsed: string;
}

export interface ScanSummary {
  readonly aiPercentage: number;
  readonly humanPercentage: number;
  readonly unknownPercentage: number;
  readonly overallConfidence: ConfidenceLevel;
  readonly modelBreakdown: Readonly<Record<string, number>>;
}

export interface AnalysisMetadata {
  readonly toolVersion: string;
  readonly analyzedAt: string; // ISO 8601
  readonly algorithmVersions: Readonly<Record<string, string>>;
  readonly thresholds: Readonly<Record<string, number>>;
  readonly duration: number; // milliseconds
}

export interface ScanResult {
  readonly file: FileMetadata;
  readonly ranges: readonly LineRange[];
  readonly summary: ScanSummary;
  readonly metadata: AnalysisMetadata;
}

// ─── Parser Types ──────────────────────────────────────────────────────────

export interface FunctionInfo {
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly lineCount: number;
  readonly hasErrorHandling: boolean;
  readonly paramCount: number;
}

export interface ImportInfo {
  readonly source: string;
  readonly line: number;
  readonly isTypeOnly: boolean;
}

export interface CommentInfo {
  readonly text: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly kind: 'line' | 'block' | 'jsdoc';
}

export interface IdentifierInfo {
  readonly name: string;
  readonly line: number;
  readonly kind: 'variable' | 'function' | 'parameter' | 'property';
}

export interface ParsedCode {
  readonly lines: readonly string[];
  readonly language: string;
  readonly functions: readonly FunctionInfo[];
  readonly imports: readonly ImportInfo[];
  readonly comments: readonly CommentInfo[];
  readonly identifiers: readonly IdentifierInfo[];
}

// ─── Contracts ─────────────────────────────────────────────────────────────

export interface Detector {
  readonly name: string;
  readonly version: string;
  detect(code: ParsedCode): DetectionSignal[];
}

export interface Parser {
  readonly language: string;
  canParse(filePath: string): boolean;
  parse(content: string, filePath: string): ParsedCode;
}

export interface ReportFormatter {
  format(result: ScanResult): string;
}

// ─── Window Types (internal) ───────────────────────────────────────────────

export interface WindowClassification {
  readonly startLine: number;
  readonly endLine: number;
  readonly classification: Classification;
  readonly confidence: number;
  readonly signals: readonly DetectionSignal[];
}
