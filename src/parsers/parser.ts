import type { Parser } from '../types.js';
import { typescriptParser } from './typescript-parser.js';
import { genericParser } from './generic-parser.js';

const parsers: readonly Parser[] = [typescriptParser, genericParser];

/**
 * Select the best available parser for a file.
 * Tries language-specific parsers first, falls back to generic.
 */
export function selectParser(filePath: string): Parser {
  for (const parser of parsers) {
    if (parser.canParse(filePath)) {
      return parser;
    }
  }
  return genericParser;
}

/**
 * Detect if a file is likely binary by checking for null bytes
 * in the first 8KB.
 */
export function isBinaryContent(content: string): boolean {
  const sample = content.slice(0, 8192);
  return sample.includes('\0');
}
