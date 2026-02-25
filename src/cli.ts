#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { analyze } from './core/analyzer.js';
import { terminalFormatter } from './reports/terminal-report.js';
import { jsonFormatter } from './reports/json-report.js';
import { markdownFormatter } from './reports/markdown-report.js';
import type { ReportFormatter } from './types.js';

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

program
  .command('scan')
  .description('Scan a source file for AI-generated code')
  .argument('<file>', 'Path to the source file to scan')
  .option('-j, --json', 'Output results as JSON')
  .option('-f, --format <type>', 'Output format: terminal, json, markdown', 'terminal')
  .option('--no-color', 'Disable colored output')
  .action((file: string, options: { json?: boolean; format: string; color?: boolean }) => {
    try {
      // Determine output format
      let format = options.format;
      if (options.json) format = 'json';

      // Select formatter
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

      // Run analysis
      const result = analyze(file);

      // Output report
      const output = formatter.format(result);
      process.stdout.write(output + '\n');

      // Exit code: 0 = no AI, 1 = AI detected, 2 = error
      process.exitCode = result.summary.aiPercentage > 0 ? 1 : 0;
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
