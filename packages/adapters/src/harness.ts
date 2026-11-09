import { basename } from "node:path";
import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { CLAUDE_BINARY } from "./claude/launch.ts";
import { ClaudeFile } from "./claude/constants.ts";
import { CODEX_BINARY } from "./codex/exec.ts";
import { sessionIdOfRolloutPath } from "./codex/rollout.ts";
import { OPENCODE_BINARY } from "./opencode/launch.ts";
import { LocatorKey, SlashCommand, TranscriptPath } from "./constants.ts";

export const HARNESS_BINARY: Readonly<Record<HarnessId, string>> = {
  [Harness.Claude]: CLAUDE_BINARY,
  [Harness.Codex]: CODEX_BINARY,
  [Harness.OpenCode]: OPENCODE_BINARY,
};

export function harnessBinary(id: HarnessId): string {
  return HARNESS_BINARY[id];
}

export function transcriptLocatorKey(id: HarnessId): LocatorKey {
  switch (id) {
    case Harness.Claude:
      return LocatorKey.Session;
    case Harness.Codex:
    case Harness.OpenCode:
      return LocatorKey.Cwd;
  }
}

export function harnessOfTranscriptPath(path: string): HarnessId | null {
  if (path.includes(TranscriptPath.ClaudeProjects)) {
    return Harness.Claude;
  }
  const isRollout = basename(path).startsWith(TranscriptPath.CodexRolloutPrefix);
  if (isRollout && (path.includes(TranscriptPath.CodexSessionsDir) || path.includes(TranscriptPath.CodexHomeMarker))) {
    return Harness.Codex;
  }
  if (path.endsWith(TranscriptPath.OpenCodeDb) || path.includes(`${TranscriptPath.OpenCodeDb}${TranscriptPath.OpenCodeSeparator}`)) {
    return Harness.OpenCode;
  }
  return null;
}

export function sessionIdOfTranscriptPath(harness: HarnessId, path: string): string | null {
  switch (harness) {
    case Harness.Claude: {
      const name = basename(path);
      if (!name.endsWith(ClaudeFile.Transcript)) {
        return null;
      }
      const id = name.slice(0, -ClaudeFile.Transcript.length);
      return id === "" ? null : id;
    }
    case Harness.Codex:
      return sessionIdOfRolloutPath(path);
    case Harness.OpenCode: {
      const at = path.lastIndexOf(TranscriptPath.OpenCodeSeparator);
      if (at < 0) {
        return null;
      }
      const id = path.slice(at + TranscriptPath.OpenCodeSeparator.length);
      return id === "" ? null : id;
    }
  }
}

export function compactCommand(harness: HarnessId, guidance?: string): string {
  const note = guidance?.trim() ?? "";
  if (harness === Harness.Claude && note !== "") {
    return `${SlashCommand.Compact} ${note}`;
  }
  return SlashCommand.Compact;
}
