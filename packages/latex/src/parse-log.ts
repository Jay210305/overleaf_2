import type { Diagnostic } from "@latex-collab/contracts";

const SENSITIVE_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s'"]+/gi,
  /redis:\/\/[^\s'"]+/gi,
  /s3:\/\/[^\s'"]+/gi,
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /eyJ[a-zA-Z0-9_\-]{8,}\.[a-zA-Z0-9_\-]{8,}\.[a-zA-Z0-9_\-]+/gi,
  /(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)\s*[:=]\s*['"]?[^\s'";,]+/gi,
];

/**
 * Strips secrets, tokens, credentials, and connection strings from compiler output (NFR-10).
 */
export function redactSecrets(text: string): string {
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[REDACTED_SECRET]");
  }
  return cleaned;
}

/**
 * Normalizes host paths (e.g. /tmp/mkdtemp..., /work/input/main.tex) to relative project paths (CMP-02).
 */
export function sanitizeFilePath(filePath: string, workDir?: string): string {
  let cleaned = filePath.trim();

  // If workDir is provided, strip it
  if (workDir && cleaned.startsWith(workDir)) {
    cleaned = cleaned.slice(workDir.length);
  }

  // Common container workdirs or host prefixes
  cleaned = cleaned.replace(/^(\/work\/input\/|\/work\/out\/|\/work\/|\/tmp\/[^\/]+\/)/, "");
  cleaned = cleaned.replace(/^(\/home\/[^\/]+\/|\/var\/[^\/]+\/)/, "");

  // Strip leading ./
  cleaned = cleaned.replace(/^\.\//, "");

  return cleaned;
}

/**
 * Redacts absolute host filesystem paths from arbitrary log text.
 */
export function redactHostPaths(text: string, workDir?: string): string {
  let cleaned = text;
  if (workDir) {
    cleaned = cleaned.replaceAll(workDir, ".");
  }
  cleaned = cleaned.replace(/\/tmp\/[a-zA-Z0-9_\-\.]+\//g, "./");
  cleaned = cleaned.replace(/\/home\/[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.\/]+/g, (match) => {
    const parts = match.split("/");
    return `./${parts[parts.length - 1]}`;
  });
  cleaned = cleaned.replace(/\/work\/input\//g, "./");
  cleaned = cleaned.replace(/\/work\/out\//g, "./out/");
  return cleaned;
}

export type ParseLogResult = {
  diagnostics: Diagnostic[];
  cleanLog: string;
};

/**
 * Parses LaTeX compiler log and standard output into typed Diagnostics (CMP-02, EDT-07, NFR-10).
 * Extracts error lines, warnings, undefined references, bad boxes, and redacts host paths and credentials.
 */
export function parseLatexLog(rawLog: string, options: { workDir?: string } = {}): ParseLogResult {
  const safeLog = redactSecrets(rawLog);
  const cleanLog = redactHostPaths(safeLog, options.workDir);
  const diagnostics: Diagnostic[] = [];

  const lines = cleanLog.split(/\r?\n/);
  let currentFile: string | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // 1. File-line-error format: "path/file.tex:14: Error message"
    const fileLineMatch = line.match(/^([^\s:]+\.(?:tex|sty|cls|bib|dtx|ins)):(\d+):\s*(.+)$/i);
    if (fileLineMatch) {
      const rawPath = fileLineMatch[1]!;
      const lineNum = parseInt(fileLineMatch[2]!, 10);
      const rawMsg = fileLineMatch[3]!;

      diagnostics.push({
        severity: "error",
        filePath: sanitizeFilePath(rawPath, options.workDir),
        line: lineNum,
        message: rawMsg.trim(),
      });
      continue;
    }

    // 2. Standard TeX errors: "! Message"
    if (line.startsWith("! ")) {
      const errorMsg = line.slice(2).trim();
      let errorLineNum: number | undefined = undefined;

      // Scan subsequent lines for "l.<number> ..."
      for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
        const nextLine = lines[j]!;
        const lMatch = nextLine.match(/^l\.(\d+)\s*(.*)$/);
        if (lMatch) {
          errorLineNum = parseInt(lMatch[1]!, 10);
          break;
        }
        if (nextLine.startsWith("! ")) break;
      }

      diagnostics.push({
        severity: "error",
        filePath: currentFile ? sanitizeFilePath(currentFile, options.workDir) : undefined,
        line: errorLineNum,
        message: errorMsg,
      });
      continue;
    }

    // 3. LaTeX Warning with input line: "LaTeX Warning: ... on input line 23."
    const warningLineMatch = line.match(/^LaTeX Warning:\s*(.+?)(?:\s+on input line\s+(\d+))?\.?$/i);
    if (warningLineMatch) {
      const msg = warningLineMatch[1]!.trim();
      const lineNum = warningLineMatch[2] ? parseInt(warningLineMatch[2], 10) : undefined;

      diagnostics.push({
        severity: "warning",
        filePath: currentFile ? sanitizeFilePath(currentFile, options.workDir) : undefined,
        line: lineNum,
        message: msg,
      });
      continue;
    }

    // 4. Package/Class Warning: "Package hyperref Warning: ... on input line 42."
    const pkgWarnMatch = line.match(/^(Package|Class)\s+([^\s]+)\s+Warning:\s*(.+?)(?:\s+on input line\s+(\d+))?\.?$/i);
    if (pkgWarnMatch) {
      const pkg = pkgWarnMatch[2]!;
      const rawMsg = pkgWarnMatch[3]!.trim();
      const lineNum = pkgWarnMatch[4] ? parseInt(pkgWarnMatch[4], 10) : undefined;

      diagnostics.push({
        severity: "warning",
        filePath: currentFile ? sanitizeFilePath(currentFile, options.workDir) : undefined,
        line: lineNum,
        message: `[${pkg}] ${rawMsg}`,
      });
      continue;
    }

    // 5. Bad boxes (Overfull / Underfull \hbox or \vbox)
    const badBoxMatch = line.match(/^(Overfull|Underfull)\s+\\[hv]box\s+\((.+?)\)\s+in paragraph at lines\s+(\d+)--(\d+)/i);
    if (badBoxMatch) {
      const kind = badBoxMatch[1]!;
      const details = badBoxMatch[2]!;
      const startLine = parseInt(badBoxMatch[3]!, 10);

      diagnostics.push({
        severity: "warning",
        filePath: currentFile ? sanitizeFilePath(currentFile, options.workDir) : undefined,
        line: startLine,
        message: `${kind} \\hbox (${details}) at line ${startLine}`,
      });
      continue;
    }

    // Track active file from parens if opening (e.g., "(./main.tex" or "(main.tex")
    const parenFileMatch = line.match(/\((?:[\.\/]*)([^\s\(\)]+\.(?:tex|sty|cls|bib))\b/);
    if (parenFileMatch) {
      currentFile = sanitizeFilePath(parenFileMatch[1]!, options.workDir);
    }
  }

  // Cap diagnostics at 2000 per schema
  return {
    diagnostics: diagnostics.slice(0, 2000),
    cleanLog,
  };
}
