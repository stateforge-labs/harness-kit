export interface CommentSpan {
  readonly line: number;
  readonly endLine: number;
  readonly text: string;
  readonly block: boolean;
  readonly ownLine: boolean;
}

export interface CommentViolation {
  readonly line: number;
  readonly text: string;
}

const KEYWORDS_BEFORE_EXPRESSION = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
const WORD = /[\w$]+/y;
const QUOTES = new Set(["'", '"']);

function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return starts;
}

function lineOf(starts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function skipQuoted(src: string, start: number): number {
  const quote = src[start];
  let j = start + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") j += 2;
    else if (ch === quote) return j + 1;
    else if (ch === "\n") return j;
    else j++;
  }
  return src.length;
}

function skipRegex(src: string, start: number): number {
  let j = start + 1;
  let inClass = false;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") j += 2;
    else if (ch === "\n") return j;
    else {
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) {
        j++;
        break;
      }
      j++;
    }
  }
  while (j < src.length && /[a-z]/i.test(src[j]!)) j++;
  return j;
}

function skipTemplateText(src: string, start: number): { next: number; opensSubstitution: boolean } {
  let j = start;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") j += 2;
    else if (ch === "`") return { next: j + 1, opensSubstitution: false };
    else if (ch === "$" && src[j + 1] === "{") return { next: j + 2, opensSubstitution: true };
    else j++;
  }
  return { next: src.length, opensSubstitution: false };
}

function isOwnLine(src: string, start: number): boolean {
  const lineStart = src.lastIndexOf("\n", start - 1) + 1;
  return src.slice(lineStart, start).trim() === "";
}

export function scanComments(src: string): CommentSpan[] {
  const starts = lineStarts(src);
  const comments: CommentSpan[] = [];
  const substitutionDepths: number[] = [];
  let depth = 0;
  let inTemplate = false;
  let regexAllowed = true;
  let i = 0;

  const pushComment = (from: number, to: number, block: boolean): void => {
    const text = src.slice(from, to);
    const line = lineOf(starts, from);
    comments.push({ line, endLine: lineOf(starts, to - 1), text, block, ownLine: isOwnLine(src, from) });
  };

  while (i < src.length) {
    if (inTemplate) {
      const scanned = skipTemplateText(src, i);
      i = scanned.next;
      if (scanned.opensSubstitution) {
        substitutionDepths.push(depth);
        inTemplate = false;
        regexAllowed = true;
      } else {
        inTemplate = false;
        regexAllowed = false;
      }
      continue;
    }
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const to = end < 0 ? src.length : end;
      pushComment(i, to, false);
      i = to;
    } else if (ch === "/" && next === "*") {
      const close = src.indexOf("*/", i + 2);
      const to = close < 0 ? src.length : close + 2;
      pushComment(i, to, true);
      i = to;
    } else if (QUOTES.has(ch)) {
      i = skipQuoted(src, i);
      regexAllowed = false;
    } else if (ch === "`") {
      inTemplate = true;
      i++;
    } else if (ch === "/" && regexAllowed) {
      i = skipRegex(src, i);
      regexAllowed = false;
    } else if (ch === "{") {
      depth++;
      regexAllowed = true;
      i++;
    } else if (ch === "}") {
      if (substitutionDepths.length > 0 && substitutionDepths[substitutionDepths.length - 1] === depth) {
        substitutionDepths.pop();
        inTemplate = true;
      } else {
        depth--;
        regexAllowed = true;
      }
      i++;
    } else if (ch === ")" || ch === "]") {
      regexAllowed = false;
      i++;
    } else if (/[\w$]/.test(ch)) {
      WORD.lastIndex = i;
      const word = WORD.exec(src)?.[0] ?? ch;
      regexAllowed = KEYWORDS_BEFORE_EXPRESSION.has(word);
      i += word.length;
    } else {
      if (!/\s/.test(ch)) regexAllowed = true;
      i++;
    }
  }
  return comments;
}

function isAllowedTsdoc(comment: CommentSpan, lines: readonly string[]): boolean {
  if (!comment.block || !comment.ownLine || comment.line !== comment.endLine) return false;
  if (!comment.text.startsWith("/**") || comment.text.length <= "/**/".length || !comment.text.endsWith("*/")) return false;
  return /^export\s/.test(lines[comment.line]?.trim() ?? "");
}

export function stripNonComments(src: string): { readonly violations: readonly CommentViolation[] } {
  const lines = src.split("\n");
  const violations = scanComments(src)
    .filter((comment) => !isAllowedTsdoc(comment, lines))
    .map((comment) => ({ line: comment.line, text: comment.text.trim() }));
  return { violations };
}
