import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { claudeToolClass, claudeToolTarget } from "./claude/tools.ts";
import { codexToolClass, codexToolTarget } from "./codex/tools.ts";
import { opencodeToolClass, opencodeToolTarget } from "./opencode/tools.ts";
import { ToolClass } from "./constants.ts";
import type { Row } from "./core/rows.ts";

export function toolClass(harness: HarnessId, name: string): ToolClass {
  switch (harness) {
    case Harness.Claude:
      return claudeToolClass(name);
    case Harness.Codex:
      return codexToolClass(name);
    case Harness.OpenCode:
      return opencodeToolClass(name);
  }
}

export function toolTarget(harness: HarnessId, name: string, input: Row): string | null {
  switch (harness) {
    case Harness.Claude:
      return claudeToolTarget(input);
    case Harness.Codex:
      return codexToolTarget();
    case Harness.OpenCode:
      return opencodeToolTarget(input);
  }
}
