import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/core/analyzer.js';
import { jsonFormatter } from '../../src/reports/json-report.js';
import { terminalFormatter } from '../../src/reports/terminal-report.js';
import { markdownFormatter } from '../../src/reports/markdown-report.js';
import { resolve } from 'node:path';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('scan pipeline — AI detection', () => {
  it('detects GPT-style AI code with high confidence', () => {
    const result = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    expect(result.summary.aiPercentage).toBeGreaterThan(50);
    expect(result.summary.overallConfidence).toBe('HIGH');
    expect(result.ranges.some((r) => r.classification === 'ai-generated')).toBe(true);
  });

  it('detects Claude-style AI code', () => {
    const result = analyze(`${FIXTURES}/ai-generated/claude-auth.ts`);
    expect(result.summary.aiPercentage).toBeGreaterThan(50);
    expect(result.ranges.some((r) => r.classification === 'ai-generated')).toBe(true);
  });

  it('detects Copilot-style AI code', () => {
    const result = analyze(`${FIXTURES}/ai-generated/copilot-helpers.ts`);
    expect(result.summary.aiPercentage).toBeGreaterThan(30);
  });

  it('does NOT falsely flag human-written code as AI', () => {
    const result = analyze(`${FIXTURES}/human-written/domain-specific.ts`);
    // Constitution: zero false positives
    expect(result.ranges.every(
      (r) => r.classification !== 'ai-generated',
    )).toBe(true);
  });

  it('classifies human-written code with markers as non-AI', () => {
    const result = analyze(`${FIXTURES}/human-written/irregular-style.ts`);
    expect(result.ranges.every(
      (r) => r.classification !== 'ai-generated',
    )).toBe(true);
  });

  it('produces deterministic results on repeated scans', () => {
    const result1 = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    const result2 = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    // Remove timing-dependent fields
    const strip = (r: typeof result1) => ({
      ...r,
      metadata: { ...r.metadata, analyzedAt: '', duration: 0 },
    });
    expect(strip(result1)).toEqual(strip(result2));
  });
});

describe('scan pipeline — model attribution', () => {
  it('attributes Claude patterns to Claude model', () => {
    const result = analyze(`${FIXTURES}/ai-generated/claude-auth.ts`);
    const aiRanges = result.ranges.filter((r) => r.classification === 'ai-generated');
    const claudeRanges = aiRanges.filter(
      (r) => r.modelAttribution?.model === 'claude',
    );
    expect(claudeRanges.length).toBeGreaterThan(0);
  });

  it('attributes GPT patterns to GPT model', () => {
    const result = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    const aiRanges = result.ranges.filter((r) => r.classification === 'ai-generated');
    const gptRanges = aiRanges.filter(
      (r) => r.modelAttribution?.model === 'gpt',
    );
    expect(gptRanges.length).toBeGreaterThan(0);
  });

  it('attributes Copilot patterns to Copilot model', () => {
    const result = analyze(`${FIXTURES}/ai-generated/copilot-helpers.ts`);
    const aiRanges = result.ranges.filter((r) => r.classification === 'ai-generated');
    const copilotRanges = aiRanges.filter(
      (r) => r.modelAttribution?.model === 'copilot',
    );
    expect(copilotRanges.length).toBeGreaterThan(0);
  });
});

describe('scan pipeline — output formats', () => {
  it('produces valid JSON output', () => {
    const result = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    const json = jsonFormatter.format(result);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBeDefined();
    expect(parsed.file).toBeDefined();
    expect(parsed.ranges).toBeInstanceOf(Array);
    expect(parsed.summary).toBeDefined();
    expect(parsed.metadata).toBeDefined();
  });

  it('produces terminal output with classification indicators', () => {
    const result = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    const output = terminalFormatter.format(result);
    expect(output).toContain('Code Provenance');
    expect(output).toContain('gpt-utils.ts');
    expect(output).toContain('Summary:');
  });

  it('produces markdown output with required sections', () => {
    const result = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    const md = markdownFormatter.format(result);
    expect(md).toContain('# Code Provenance Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Findings');
    expect(md).toContain('## Methodology');
  });
});

describe('scan pipeline — generic parser (non-TypeScript)', () => {
  it('scans Python AI-generated file with generic parser', () => {
    const result = analyze(`${FIXTURES}/ai-generated/gpt-utils.py`);
    expect(result.file.parserUsed).toBe('generic');
    expect(result.file.language).toBe('python');
    expect(result.ranges.length).toBeGreaterThan(0);
    expect(result.summary.aiPercentage).toBeGreaterThan(30);
  });

  it('scans Python human-written file without false positives', () => {
    const result = analyze(`${FIXTURES}/human-written/domain-logic.py`);
    expect(result.file.parserUsed).toBe('generic');
    expect(result.ranges.every(
      (r) => r.classification !== 'ai-generated',
    )).toBe(true);
  });
});

describe('scan pipeline — edge cases', () => {
  it('handles file not found gracefully', () => {
    expect(() => analyze('/nonexistent/file.ts')).toThrow('Cannot read file');
  });

  it('completes scan within 200ms performance budget', () => {
    const start = performance.now();
    analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(200);
  });

  it('includes metadata with algorithm versions', () => {
    const result = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    expect(result.metadata.toolVersion).toBeDefined();
    expect(result.metadata.algorithmVersions).toBeDefined();
    expect(result.metadata.thresholds).toBeDefined();
    expect(result.metadata.duration).toBeGreaterThan(0);
  });

  it('file metadata includes correct parser info', () => {
    const result = analyze(`${FIXTURES}/ai-generated/gpt-utils.ts`);
    expect(result.file.language).toBe('typescript');
    expect(result.file.parserUsed).toBe('typescript');
    expect(result.file.totalLines).toBeGreaterThan(0);
  });
});
