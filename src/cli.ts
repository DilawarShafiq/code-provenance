#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { analyze } from './core/analyzer.js';
import { scanDirectory } from './core/scanner.js';
import { terminalFormatter } from './reports/terminal-report.js';
import { jsonFormatter } from './reports/json-report.js';
import { markdownFormatter } from './reports/markdown-report.js';
import type { ReportFormatter, ScanResult } from './types.js';
import type { DirectoryScanResult } from './core/scanner.js';
import kleur from 'kleur';

// Read version from package.json
let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  version = pkg.version ?? '0.1.0';
} catch {
  // fallback
}

const program = new Command();

program
  .name('code-provenance')
  .description('Detect AI-generated code. Every line of code has a story.')
  .version(version);

function selectFormatter(options: { json?: boolean; format: string }): ReportFormatter {
  let format = options.format;
  if (options.json) format = 'json';

  const formatters: Record<string, ReportFormatter> = {
    terminal: terminalFormatter,
    json: jsonFormatter,
    markdown: markdownFormatter,
  };

  const formatter = formatters[format];
  if (!formatter) {
    process.stderr.write(`Error: Unknown format "${format}". Use: terminal, json, markdown\n`);
    process.exit(2);
  }
  return formatter;
}

function formatDirectoryTerminal(dirResult: DirectoryScanResult): string {
  const lines: string[] = [];

  lines.push(kleur.bold(`Code Provenance v${version}`));
  lines.push(kleur.dim('─'.repeat(30)));
  lines.push('');
  lines.push(`📂 ${kleur.bold(relative(process.cwd(), dirResult.root) || '.')} (${dirResult.totalFiles} files, ${dirResult.totalLines} lines)`);
  lines.push('');

  // Per-file summary table
  const sorted = [...dirResult.files].sort((a, b) => b.summary.aiPercentage - a.summary.aiPercentage);

  for (const file of sorted) {
    const relPath = file.file.relativePath;
    const ai = file.summary.aiPercentage;
    const icon = ai > 50 ? '🤖' : ai > 0 ? '⚠️' : '👤';
    const colorFn = ai > 50 ? kleur.red : ai > 0 ? kleur.yellow : kleur.green;

    let model = '';
    if (ai > 0) {
      const aiRange = file.ranges.find((r) => r.classification === 'ai-generated' && r.modelAttribution);
      if (aiRange?.modelAttribution) {
        const m = aiRange.modelAttribution.model;
        model = m !== 'unknown' ? kleur.dim(` (${m})`) : '';
      }
    }

    const pctStr = `${ai}%`.padStart(4);
    lines.push(`  ${icon} ${colorFn(pctStr)} AI  ${kleur.dim(relPath)}${model}`);
  }

  // Aggregate summary
  lines.push('');
  lines.push(kleur.dim('─'.repeat(30)));

  const aiPart = dirResult.aiPercentage > 0
    ? kleur.red(`${dirResult.aiPercentage}% AI-generated`)
    : `${dirResult.aiPercentage}% AI-generated`;
  const humanPart = dirResult.humanPercentage > 0
    ? kleur.green(`${dirResult.humanPercentage}% Human-written`)
    : `${dirResult.humanPercentage}% Human-written`;

  lines.push(`Summary: ${aiPart} | ${humanPart} (${dirResult.totalFiles} files, ${dirResult.totalLines} lines)`);
  lines.push(kleur.dim(`Scanned in ${dirResult.duration}ms`));

  if (dirResult.skipped.length > 0) {
    lines.push(kleur.dim(`Skipped ${dirResult.skipped.length} unsupported files`));
  }

  return lines.join('\n');
}

function formatDirectoryJson(dirResult: DirectoryScanResult): string {
  return JSON.stringify({
    version,
    root: dirResult.root,
    summary: {
      totalFiles: dirResult.totalFiles,
      totalLines: dirResult.totalLines,
      aiPercentage: dirResult.aiPercentage,
      humanPercentage: dirResult.humanPercentage,
      aiLines: dirResult.aiLines,
      humanLines: dirResult.humanLines,
      unknownLines: dirResult.unknownLines,
    },
    files: dirResult.files,
    skipped: dirResult.skipped,
    duration: dirResult.duration,
  }, null, 2);
}

program
  .command('scan')
  .description('Scan a file or directory for AI-generated code')
  .argument('<path>', 'Path to a source file or directory to scan')
  .option('-j, --json', 'Output results as JSON')
  .option('-f, --format <type>', 'Output format: terminal, json, markdown', 'terminal')
  .option('--no-color', 'Disable colored output')
  .action((targetPath: string, options: { json?: boolean; format: string; color?: boolean }) => {
    try {
      let stat;
      try {
        stat = statSync(targetPath);
      } catch {
        throw new Error(`Path not found: ${targetPath}`);
      }

      if (stat.isDirectory()) {
        // Directory scan
        const dirResult = scanDirectory(targetPath);

        const format = options.json ? 'json' : options.format;
        if (format === 'json') {
          process.stdout.write(formatDirectoryJson(dirResult) + '\n');
        } else {
          process.stdout.write(formatDirectoryTerminal(dirResult) + '\n');
        }

        process.exitCode = dirResult.aiPercentage > 0 ? 1 : 0;
      } else {
        // Single file scan
        const formatter = selectFormatter(options);
        const result = analyze(targetPath);
        const output = formatter.format(result);
        process.stdout.write(output + '\n');
        process.exitCode = result.summary.aiPercentage > 0 ? 1 : 0;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (options.json || options.format === 'json') {
        process.stderr.write(JSON.stringify({ error: true, message, code: 2 }) + '\n');
      } else {
        process.stderr.write(`Error: ${message}\n`);
      }

      process.exitCode = 2;
    }
  });

program.parse();
