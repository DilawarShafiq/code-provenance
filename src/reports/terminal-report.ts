import kleur from 'kleur';
import type { ReportFormatter, ScanResult, LineRange } from '../types.js';

const ICONS = {
  'ai-generated': '🤖',
  'human-written': '👤',
  'unknown': '❓',
} as const;

function classificationColor(classification: string): (text: string) => string {
  switch (classification) {
    case 'ai-generated': return kleur.red;
    case 'human-written': return kleur.green;
    default: return kleur.yellow;
  }
}

function confidenceColor(level: string): (text: string) => string {
  switch (level) {
    case 'HIGH': return kleur.green;
    case 'MEDIUM': return kleur.yellow;
    default: return kleur.red;
  }
}

function rangeDetail(range: LineRange): string {
  if (range.classification === 'ai-generated') {
    if (range.modelAttribution) {
      const model = range.modelAttribution.model;
      const name = model === 'unknown' ? 'AI' : model.charAt(0).toUpperCase() + model.slice(1);
      return `${name}-style patterns`;
    }
    return 'AI patterns detected';
  }
  if (range.classification === 'human-written') {
    // Pick the most descriptive signal
    const naming = range.signals.find((s) => s.detector === 'naming-patterns');
    if (naming && naming.strength < 0.3) return 'Domain-specific naming';
    const entropy = range.signals.find((s) => s.detector === 'entropy');
    if (entropy && entropy.strength < 0.3) return 'Irregular style, high entropy';
    return 'Human patterns detected';
  }
  return 'Insufficient signals';
}

function formatLabel(classification: string): string {
  switch (classification) {
    case 'ai-generated': return 'AI-generated';
    case 'human-written': return 'Human-written';
    default: return 'Unknown';
  }
}

export const terminalFormatter: ReportFormatter = {
  format(result: ScanResult): string {
    const { file, ranges, summary } = result;
    const lines: string[] = [];

    // Header
    lines.push(kleur.bold(`Code Provenance v${result.metadata.toolVersion}`));
    lines.push(kleur.dim('─'.repeat(30)));
    lines.push('');

    // Empty file
    if (file.totalLines === 0) {
      lines.push(kleur.yellow('No code to analyze (empty file)'));
      return lines.join('\n');
    }

    // File info
    const parserNote = file.parserUsed === 'generic'
      ? kleur.dim(' (generic parser)')
      : '';
    lines.push(`📊 ${kleur.bold(file.relativePath)} (${file.totalLines} lines)${parserNote}`);
    lines.push('');

    // Line ranges
    for (const range of ranges) {
      const icon = ICONS[range.classification];
      const label = formatLabel(range.classification);
      const colorFn = classificationColor(range.classification);
      const detail = rangeDetail(range);

      const lineRange = `Lines ${range.startLine}-${range.endLine}:`;
      const padded = lineRange.padEnd(18);

      lines.push(
        `${padded}${icon} ${colorFn(label)}  (${range.confidence}%)  ${kleur.dim(detail)}`,
      );
    }

    // Summary
    lines.push('');
    const aiPart = summary.aiPercentage > 0
      ? kleur.red(`${summary.aiPercentage}% AI-generated`)
      : `${summary.aiPercentage}% AI-generated`;
    const humanPart = summary.humanPercentage > 0
      ? kleur.green(`${summary.humanPercentage}% Human-written`)
      : `${summary.humanPercentage}% Human-written`;
    lines.push(`Summary: ${aiPart} | ${humanPart}`);

    const confColor = confidenceColor(summary.overallConfidence);
    lines.push(`Confidence: ${confColor(summary.overallConfidence)}`);

    return lines.join('\n');
  },
};
