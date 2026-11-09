import { describe, expect, test } from "bun:test";
import * as runtime from "../src/runtime/index.ts";

describe("the ./runtime value surface", () => {
  test("exports the constants, the result helpers, the secret helpers and createRuntime", () => {
    expect(Object.keys(runtime).sort()).toEqual([
      "CapabilityName",
      "ConfinementAxis",
      "CredentialReason",
      "CredentialUnsupportedReason",
      "Engine",
      "EnvKind",
      "EvidenceKind",
      "Harness",
      "McpWhy",
      "RUN_FAILURE_KINDS",
      "SpawnPurpose",
      "TOOLS_DEFAULT",
      "TOOLS_OFF",
      "ToolSetting",
      "UnavailableReason",
      "UnsupportedReason",
      "createRuntime",
      "fail",
      "isSecret",
      "isUsable",
      "ok",
      "secret",
      "supportWhy",
    ]);
  });

  test("Harness is the hooks harness list", () => {
    expect(runtime.Harness).toEqual({ Claude: "claude", Codex: "codex", OpenCode: "opencode" });
  });
});
