import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { TuiBox, TuiLine } from "./constants.ts";

export interface TuiChrome {
  readonly boxOnly: RegExp;
  readonly lines: readonly RegExp[];
}

export const CLAUDE_TUI_CHROME: TuiChrome = {
  boxOnly: TuiBox.Claude,
  lines: [TuiLine.Interrupt, TuiLine.CycleMode, TuiLine.Shortcuts, TuiLine.Status, TuiLine.Permissions, TuiLine.CtrlHint, TuiLine.Spinner, TuiLine.EmptyPrompt],
};

export const CODEX_TUI_CHROME: TuiChrome = {
  boxOnly: TuiBox.Claude,
  lines: [TuiLine.CodexHeader, TuiLine.CodexWelcome, TuiLine.CodexPlaceholder, TuiLine.CodexAgents, TuiLine.Shortcuts, TuiLine.CodexModelFooter, TuiLine.CodexWarnings],
};

export const OPENCODE_TUI_CHROME: TuiChrome = {
  boxOnly: TuiBox.OpenCode,
  lines: [TuiLine.OpenCodePlaceholder, TuiLine.OpenCodeMode, TuiLine.OpenCodeKeys, TuiLine.OpenCodeVersion],
};

const CHROME: Readonly<Record<HarnessId, TuiChrome>> = {
  [Harness.Claude]: CLAUDE_TUI_CHROME,
  [Harness.Codex]: CODEX_TUI_CHROME,
  [Harness.OpenCode]: OPENCODE_TUI_CHROME,
};

export function tuiChrome(harness: HarnessId): TuiChrome {
  return CHROME[harness];
}

export function isChromeLine(harness: HarnessId, line: string): boolean {
  const { boxOnly, lines } = tuiChrome(harness);
  return boxOnly.test(line) || lines.some((pattern) => pattern.test(line));
}
