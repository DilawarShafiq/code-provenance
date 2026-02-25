import ts from 'typescript';
import type {
  Parser,
  ParsedCode,
  FunctionInfo,
  ImportInfo,
  CommentInfo,
  IdentifierInfo,
} from '../types.js';

function extractFunctions(sourceFile: ts.SourceFile): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const lineCount = endLine - startLine + 1;

      let name = '<anonymous>';
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        name = node.name?.getText(sourceFile) ?? '<anonymous>';
      } else if (ts.isVariableDeclaration(node.parent)) {
        name = node.parent.name.getText(sourceFile);
      }

      let hasErrorHandling = false;
      function checkTryCatch(n: ts.Node): void {
        if (ts.isTryStatement(n)) {
          hasErrorHandling = true;
          return;
        }
        ts.forEachChild(n, checkTryCatch);
      }
      if (node.body) {
        checkTryCatch(node.body);
      }

      const paramCount = node.parameters?.length ?? 0;

      functions.push({ name, startLine, endLine, lineCount, hasErrorHandling, paramCount });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

function extractImports(sourceFile: ts.SourceFile): ImportInfo[] {
  const imports: ImportInfo[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const source = statement.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
      const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
      const isTypeOnly = statement.importClause?.isTypeOnly ?? false;

      imports.push({ source, line, isTypeOnly });
    }
  }

  return imports;
}

function extractComments(sourceFile: ts.SourceFile, text: string): CommentInfo[] {
  const comments: CommentInfo[] = [];

  function visit(node: ts.Node): void {
    const leadingRanges = ts.getLeadingCommentRanges(text, node.getFullStart());
    if (leadingRanges) {
      for (const range of leadingRanges) {
        const commentText = text.slice(range.pos, range.end);
        const startLine = sourceFile.getLineAndCharacterOfPosition(range.pos).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(range.end).line + 1;

        let kind: 'line' | 'block' | 'jsdoc' = 'line';
        if (range.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
          kind = commentText.startsWith('/**') ? 'jsdoc' : 'block';
        }

        comments.push({ text: commentText, startLine, endLine, kind });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Deduplicate comments (same position may be visited multiple times)
  const seen = new Set<string>();
  return comments.filter((c) => {
    const key = `${c.startLine}:${c.endLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractIdentifiers(sourceFile: ts.SourceFile): IdentifierInfo[] {
  const identifiers: IdentifierInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      identifiers.push({
        name: node.name.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.name.getStart()).line + 1,
        kind: 'variable',
      });
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      identifiers.push({
        name: node.name.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.name.getStart()).line + 1,
        kind: 'function',
      });
    } else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      identifiers.push({
        name: node.name.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.name.getStart()).line + 1,
        kind: 'parameter',
      });
    } else if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
      identifiers.push({
        name: node.name.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.name.getStart()).line + 1,
        kind: 'property',
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return identifiers;
}

export const typescriptParser: Parser = {
  language: 'typescript',

  canParse(filePath: string): boolean {
    return /\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/.test(filePath);
  },

  parse(content: string, filePath: string): ParsedCode {
    const isTypeScript = /\.tsx?$/.test(filePath);
    const scriptKind = /\.tsx$/.test(filePath)
      ? ts.ScriptKind.TSX
      : /\.jsx$/.test(filePath)
        ? ts.ScriptKind.JSX
        : isTypeScript
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true, // setParentNodes
      scriptKind,
    );

    const lines = content.split('\n');

    return {
      lines,
      language: isTypeScript ? 'typescript' : 'javascript',
      functions: extractFunctions(sourceFile),
      imports: extractImports(sourceFile),
      comments: extractComments(sourceFile, content),
      identifiers: extractIdentifiers(sourceFile),
    };
  },
};
