import { Harness } from "@stateforge-labs/harness-hooks";
import { CLAUDE_CREDENTIAL_VARS } from "../claude/credentials.ts";
import { CODEX_CREDENTIAL_VARS } from "../codex/credentials.ts";
import { OPENCODE_CREDENTIAL_VARS } from "../opencode/credentials.ts";

const AMBIENT: Readonly<Record<string, readonly string[]>> = {
  [Harness.Claude]: CLAUDE_CREDENTIAL_VARS,
  [Harness.Codex]: CODEX_CREDENTIAL_VARS,
  [Harness.OpenCode]: OPENCODE_CREDENTIAL_VARS,
};

export function ambientOf(id: string): readonly string[] {
  return Object.hasOwn(AMBIENT, id) ? (AMBIENT[id] ?? []) : [];
}
