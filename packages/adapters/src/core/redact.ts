import { isSecret } from "./secret.ts";

export const REDACTED = "[redacted]";

const Depth = { Cap: 8 } as const;
const Pattern = { Escape: /[.*+?^${}()|[\]\\]/g } as const;

export function redactor(values: readonly string[]): (text: string) => string {
  const sorted = [...new Set(values.filter((value) => value !== ""))].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) {
    return (text) => text;
  }
  const pattern = new RegExp(sorted.map((value) => value.replace(Pattern.Escape, "\\$&")).join("|"), "g");
  return (text) => text.replace(pattern, REDACTED);
}

export function redactValue(value: unknown, redact: (text: string) => string): unknown {
  return walk(value, redact, 0);
}

function walk(value: unknown, redact: (text: string) => string, depth: number): unknown {
  if (typeof value === "string") {
    return redact(value);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (isSecret(value) || depth > Depth.Cap) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => walk(item, redact, depth + 1));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return REDACTED;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[redact(key)] = walk(child, redact, depth + 1);
  }
  return out;
}
