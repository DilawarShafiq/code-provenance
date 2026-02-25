import type { ReportFormatter, ScanResult, LineRange } from '../types.js';

function classificationLabel(c: string): string {
  switch (c) {
    case 'ai-generated': return 'AI-Generated';
    case 'human-written': return 'Human-Written';
    default: return 'Unknown';
  }
}

function rangeSection(range: LineRange): string {
  const lines: string[] = [];

  lines.push(`### Lines ${range.startLine}-${range.endLine}: ${classificationLabel(range.classification)} (${range.confidence}%)`);
  lines.push('');
  lines.push(`**Classification**: ${classificationLabel(range.classification)}`);
  lines.push(`**Confidence**: ${range.confidence}%`);

  if (range.modelAttribution) {
    const model = range.modelAttribution.model;
    const name = model === 'unknown' ? 'Unknown' : model.charAt(0).toUpperCase() + model.slice(1);
    lines.push(`**Model Attribution**: ${name} (${range.modelAttribution.confidence}%)`);
  }

  if (range.signals.length > 0) {
    lines.push('');
    lines.push('**Evidence**:');
    for (const signal of range.signals) {
      lines.push(`- ${signal.description}`);
    }
  }

  lines.push('');
  lines.push('---');

  return lines.join('\n');
}

export const markdownFormatter: ReportFormatter = {
  format(result: ScanResult): string {
    const { file, ranges, summary, metadata } = result;
    const lines: string[] = [];

    lines.push('# Code Provenance Report');
    lines.push('');
    lines.push(`**File**: ${file.relativePath}`);
    lines.push(`**Scanned**: ${metadata.analyzedAt}`);
    lines.push(`**Tool Version**: ${metadata.toolVersion}`);
    lines.push(`**Parser**: ${file.parserUsed}`);
    lines.push('');

    // Summary table
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Lines | ${file.totalLines} |`);
    lines.push(`| AI-Generated | ${summary.aiPercentage}% |`);
    lines.push(`| Human-Written | ${summary.humanPercentage}% |`);
    lines.push(`| Unknown | ${summary.unknownPercentage}% |`);
    lines.push(`| Overall Confidence | ${summary.overallConfidence} |`);
    lines.push('');

    // Findings
    lines.push('## Findings');
    lines.push('');
    for (const range of ranges) {
      lines.push(rangeSection(range));
      lines.push('');
    }

    // Methodology
    lines.push('## Methodology');
    lines.push('');
    lines.push('| Algorithm | Version |');
    lines.push('|-----------|---------|');
    for (const [name, version] of Object.entries(metadata.algorithmVersions)) {
      lines.push(`| ${name} | ${version} |`);
    }
    lines.push('');

    lines.push('| Threshold | Value |');
    lines.push('|-----------|-------|');
    for (const [name, value] of Object.entries(metadata.thresholds)) {
      lines.push(`| ${name} | ${value} |`);
    }
    lines.push('');

    lines.push(`*Analysis completed in ${metadata.duration}ms*`);

    return lines.join('\n');
  },
};
