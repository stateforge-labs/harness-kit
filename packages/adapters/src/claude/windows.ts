import { ClaudeWindow, ClaudeWindowBasis } from "./constants.ts";

export interface ClaudeContextWindow {
  readonly window: number;
  readonly basis: ClaudeWindowBasis;
}

export function stripClaudeContextSuffix(model: string): string {
  return model.toLowerCase().endsWith(ClaudeWindow.LongSuffix) ? model.slice(0, -ClaudeWindow.LongSuffix.length) : model;
}

const isLongFamily = (major: number, minor: number): boolean =>
  major > ClaudeWindow.LongMajor || (major === ClaudeWindow.LongMajor && minor >= ClaudeWindow.LongMinor);

export function claudeContextWindow(model: string): ClaudeContextWindow {
  const id = model.toLowerCase();
  if (id.includes(ClaudeWindow.LongSuffix)) {
    return { window: ClaudeWindow.Long, basis: ClaudeWindowBasis.Suffix };
  }
  const version = ClaudeWindow.Family.exec(id);
  if (version === null) {
    return { window: ClaudeWindow.Default, basis: ClaudeWindowBasis.Default };
  }
  const long = isLongFamily(Number(version[1]), Number(version[2] ?? 0));
  return { window: long ? ClaudeWindow.Long : ClaudeWindow.Default, basis: ClaudeWindowBasis.Family };
}
