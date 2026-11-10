import { describe, expect, test } from "bun:test";
import { Harness } from "@stateforge-labs/harness-hooks";
import { hooksOf } from "../../../src/agent/prepare.ts";
import { HookPoint } from "../../../src/agent/constants.ts";

const POINTS = Object.values(HookPoint);

describe("the hook support table", () => {
  test("Claude is supported at the measured points and emulated at session start", () => {
    const hooks = hooksOf(Harness.Claude);
    for (const point of POINTS.filter((candidate) => candidate !== HookPoint.SessionStart)) {
      expect(hooks[point].state).toBe("supported");
    }
    expect(hooks[HookPoint.SessionStart].state).toBe("emulated");
  });

  for (const id of [Harness.Codex, Harness.OpenCode, "an-unknown-harness"]) {
    test(`${id} has no measured hook point`, () => {
      const hooks = hooksOf(id);
      for (const point of POINTS) {
        expect(hooks[point].state).toBe("unmeasured");
      }
    });
  }
});
