import { describe, expect, test } from "bun:test";
import * as runtime from "../src/runtime/index.ts";

describe("the ./runtime value surface", () => {
  test("exports only the constants and the result helpers so far", () => {
    expect(Object.keys(runtime).sort()).toEqual([
      "CapabilityName",
      "CredentialReason",
      "CredentialUnsupportedReason",
      "Engine",
      "EvidenceKind",
      "Harness",
      "Hermetic",
      "Isolation",
      "RUN_FAILURE_KINDS",
      "SpawnPurpose",
      "UnavailableReason",
      "UnsupportedReason",
      "fail",
      "ok",
    ]);
  });

  test("Harness is the hooks harness list", () => {
    expect(runtime.Harness).toEqual({ Claude: "claude", Codex: "codex", OpenCode: "opencode" });
  });
});
