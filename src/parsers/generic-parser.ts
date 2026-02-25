import type {
  Parser,
  ParsedCode,
  FunctionInfo,
  CommentInfo,
  IdentifierInfo,
} from '../types.js';

// Common comment patterns across languages
const LINE_COMMENT = /^\s*(\/\/|#|--|%)\s*(.*)/;
const BLOCK_COMMENT_START = /^\s*(\/\*|"""|'''|=begin|--\[\[)/;
const BLOCK_COMMENT_END = /(\*\/|"""|'''|=end|]])/;

// Common function/method patterns
const FUNCTION_PATTERNS = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,          // JS/TS
  /^\s*def\s+(\w+)/,                                           // Python/Ruby
  /^\s*(?:pub\s+)?fn\s+(\w+)/,                                // Rust
  /^\s*func\s+(\w+)/,                                          // Go
  /^\s*(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/, // Java/C#
];

// Identifier extraction (variable assignments)
const IDENTIFIER_PATTERNS = [
  /(?:const|let|var|val|mut)\s+(\w+)/g,     // JS/TS/Rust/Kotlin
  /(\w+)\s*=\s*[^=]/g,                       // Python/Ruby assignment
  /(\w+)\s*:=\s*/g,                           // Go short assignment
];

function extractComments(lines: readonly string[]): CommentInfo[] {
  const comments: CommentInfo[] = [];
  let inBlock = false;
  let blockStart = 0;
  let blockText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (inBlock) {
      blockText += '\n' + line;
      if (BLOCK_COMMENT_END.test(line)) {
        inBlock = false;
        const text = blockText.trim();
        comments.push({
          text,
          startLine: blockStart,
          endLine: lineNum,
          kind: text.startsWith('/**') ? 'jsdoc' : 'block',
        });
        blockText = '';
      }
      continue;
    }

    if (BLOCK_COMMENT_START.test(line)) {
      // Check if block comment closes on same line
      const afterOpen = line.replace(BLOCK_COMMENT_START, '');
      if (BLOCK_COMMENT_END.test(afterOpen)) {
        const text = line.trim();
        comments.push({
          text,
          startLine: lineNum,
          endLine: lineNum,
          kind: text.startsWith('/**') ? 'jsdoc' : 'block',
        });
      } else {
        inBlock = true;
        blockStart = lineNum;
        blockText = line;
      }
      continue;
    }

    const lineMatch = line.match(LINE_COMMENT);
    if (lineMatch) {
      comments.push({
        text: line.trim(),
        startLine: lineNum,
        endLine: lineNum,
        kind: 'line',
      });
    }
  }

  return comments;
}

function extractFunctions(lines: readonly string[]): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FUNCTION_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1];
        const startLine = i + 1;

        // Estimate function end by tracking indentation/braces
        let depth = 0;
        let endLine = startLine;
        let foundOpen = false;

        for (let j = i; j < lines.length; j++) {
          const fLine = lines[j];
          for (const ch of fLine) {
            if (ch === '{' || ch === ':') {
              if (ch === '{') {
                depth++;
                foundOpen = true;
              } else if (ch === ':' && !foundOpen && j === i) {
                // Python-style colon — use indentation tracking
                foundOpen = true;
              }
            }
            if (ch === '}' && foundOpen) {
              depth--;
              if (depth <= 0) {
                endLine = j + 1;
                break;
              }
            }
          }
          if (foundOpen && depth <= 0 && j > i) {
            endLine = j + 1;
            break;
          }
          // For indentation-based languages, detect function end
          if (foundOpen && j > i && fLine.trim() !== '' && !fLine.match(/^\s/) && depth === 0) {
            endLine = j; // Previous line was the end
            break;
          }
          endLine = j + 1;
        }

        const lineCount = endLine - startLine + 1;
        const hasErrorHandling = lines
          .slice(i, endLine)
          .some((l) => /\b(try|catch|except|rescue|recover)\b/.test(l));

        // Count parameters (rough heuristic)
        const paramMatch = line.match(/\(([^)]*)\)/);
        const paramCount = paramMatch && paramMatch[1].trim()
          ? paramMatch[1].split(',').length
          : 0;

        functions.push({ name, startLine, endLine, lineCount, hasErrorHandling, paramCount });
        break; // Only match first pattern per line
      }
    }
  }

  return functions;
}

function extractIdentifiers(lines: readonly string[]): IdentifierInfo[] {
  const identifiers: IdentifierInfo[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of IDENTIFIER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const name = match[1];
        const key = `${name}:${i + 1}`;
        if (!seen.has(key) && name.length > 1) {
          seen.add(key);
          identifiers.push({ name, line: i + 1, kind: 'variable' });
        }
      }
    }
  }

  return identifiers;
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cs': 'csharp',
  '.kt': 'kotlin',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.swift': 'swift',
  '.lua': 'lua',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.php': 'php',
  '.r': 'r',
  '.R': 'r',
  '.scala': 'scala',
  '.zig': 'zig',
};

function detectLanguage(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return EXTENSION_LANGUAGES[ext] ?? 'generic';
}

export const genericParser: Parser = {
  language: 'generic',

  canParse(_filePath: string): boolean {
    return true; // Fallback — accepts everything
  },

  parse(content: string, filePath: string): ParsedCode {
    const lines = content.split('\n');

    return {
      lines,
      language: detectLanguage(filePath),
      functions: extractFunctions(lines),
      imports: [], // Generic parser doesn't extract imports
      comments: extractComments(lines),
      identifiers: extractIdentifiers(lines),
    };
  },
};
