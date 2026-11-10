import { describe, expect, test } from "bun:test";
import { createRuntime, secret, TOOLS_OFF, type AgentOptions } from "../../../src/runtime/index.ts";

const options: AgentOptions = {
  credential: { mode: "api-key", key: secret("k-test"), baseUrl: "http://127.0.0.1:1" },
  dirs: { cwd: "/w", home: "/w/h", configDir: "/w/c", tmpDir: "/w/t" },
  tools: TOOLS_OFF,
  env: { kind: "closed", set: {} },
};

describe("Runtime.agent before any engine is registered", () => {
  for (const id of ["claude", "codex", "opencode"] as const) {
    test(`${id} is refused as unsupported on the engine`, () => {
      const result = createRuntime().agent(id, options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.kind).toBe("unsupported");
        if (result.failure.kind === "unsupported") {
          expect(result.failure.capability).toBe("engine");
          expect(result.failure.engine).toBe("sdk");
        }
      }
    });
  }
});
