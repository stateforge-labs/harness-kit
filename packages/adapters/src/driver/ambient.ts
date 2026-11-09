import { Harness } from "@stateforge-labs/harness-hooks";
import { CLAUDE_CREDENTIAL_VARS, CODEX_CREDENTIAL_VARS, OPENCODE_CREDENTIAL_VARS } from "../core/credential-vars.ts";

const AMBIENT: Readonly<Record<string, readonly string[]>> = {
  [Harness.Claude]: CLAUDE_CREDENTIAL_VARS,
  [Harness.Codex]: CODEX_CREDENTIAL_VARS,
  [Harness.OpenCode]: OPENCODE_CREDENTIAL_VARS,
};

export function ambientOf(id: string): readonly string[] {
  return Object.hasOwn(AMBIENT, id) ? (AMBIENT[id] ?? []) : [];
}
