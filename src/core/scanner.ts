import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { analyze } from './analyzer.js';
import type { ScanResult } from '../types.js';

/** Extensions we know how to analyze */
const SUPPORTED_EXTENSIONS = new Set([
  // TypeScript parser
  '.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs',
  // Generic parser — popular languages
  '.py', '.rb', '.rs', '.go', '.java', '.cs', '.kt', '.c', '.cpp',
  '.h', '.hpp', '.swift', '.lua', '.sh', '.bash', '.zsh', '.php',
  '.r', '.scala', '.zig', '.vue', '.svelte',
]);

/** Directories to always skip */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  'coverage', '.nyc_output', '__pycache__', '.venv', 'venv',
  'vendor', 'target', '.gradle', '.idea', '.vscode',
  '.specify', '.claude',
]);

/** Files to always skip */
const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'Thumbs.db',
]);

export interface DirectoryScanResult {
  readonly root: string;
  readonly files: readonly ScanResult[];
  readonly skipped: readonly string[];
  readonly totalFiles: number;
  readonly totalLines: number;
  readonly aiLines: number;
  readonly humanLines: number;
  readonly unknownLines: number;
  readonly aiPercentage: number;
  readonly humanPercentage: number;
  readonly duration: number;
}

function collectFiles(dir: string, rootDir: string): { files: string[]; skipped: string[] } {
  const files: string[] = [];
  const skipped: string[] = [];

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(entry)) continue;
        walk(fullPath);
      } else if (stat.isFile()) {
        if (SKIP_FILES.has(entry)) continue;
        const ext = extname(entry).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          skipped.push(relative(rootDir, fullPath));
          continue;
        }
        // Skip files > 500KB (likely generated/minified)
        if (stat.size > 512_000) {
          skipped.push(relative(rootDir, fullPath));
          continue;
        }
        // Quick binary check
        try {
          const head = Buffer.alloc(512);
          const fd = readFileSync(fullPath);
          if (fd.slice(0, 512).includes(0)) {
            skipped.push(relative(rootDir, fullPath));
            continue;
          }
        } catch {
          continue;
        }
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return { files, skipped };
}

/**
 * Scan all supported files in a directory tree.
 */
export function scanDirectory(dirPath: string): DirectoryScanResult {
  const startTime = performance.now();
  const absDir = resolve(dirPath);
  const { files: filePaths, skipped } = collectFiles(absDir, absDir);

  const results: ScanResult[] = [];
  const errors: string[] = [];

  for (const filePath of filePaths) {
    try {
      const result = analyze(filePath);
      results.push(result);
    } catch {
      errors.push(relative(absDir, filePath));
    }
  }

  // Aggregate stats
  let totalLines = 0;
  let aiLines = 0;
  let humanLines = 0;
  let unknownLines = 0;

  for (const r of results) {
    totalLines += r.file.totalLines;
    const fileLines = r.file.totalLines;
    aiLines += Math.round(fileLines * r.summary.aiPercentage / 100);
    humanLines += Math.round(fileLines * r.summary.humanPercentage / 100);
    unknownLines += Math.round(fileLines * r.summary.unknownPercentage / 100);
  }

  const total = aiLines + humanLines + unknownLines;

  return {
    root: absDir,
    files: results,
    skipped: [...skipped, ...errors],
    totalFiles: results.length,
    totalLines,
    aiLines,
    humanLines,
    unknownLines,
    aiPercentage: total > 0 ? Math.round((aiLines / total) * 100) : 0,
    humanPercentage: total > 0 ? Math.round((humanLines / total) * 100) : 0,
    duration: Math.round(performance.now() - startTime),
  };
}
