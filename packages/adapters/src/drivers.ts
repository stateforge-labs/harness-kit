import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { CLAUDE_DRIVER } from "./claude/driver.ts";
import { CODEX_DRIVER } from "./codex/driver.ts";
import type { Drivers } from "./driver/port.ts";
import { OPENCODE_DRIVER } from "./opencode/driver.ts";

export function builtinDrivers(): Drivers<HarnessId> {
  return Object.freeze({
    [Harness.Claude]: CLAUDE_DRIVER,
    [Harness.Codex]: CODEX_DRIVER,
    [Harness.OpenCode]: OPENCODE_DRIVER,
  });
}
