import { describe, expect, test } from "bun:test";
import { CapabilityName, Engine, UnsupportedReason } from "../../src/core/capability.ts";
import { EvidenceKind, measured, unmeasured } from "../../src/core/evidence.ts";
import { CredentialReason, CredentialUnsupportedReason, RUN_FAILURE_KINDS, UnavailableReason } from "../../src/core/failure.ts";
import { fail, ok } from "../../src/core/result.ts";
import { SpawnPurpose } from "../../src/core/run.ts";

describe("constant objects", () => {
  test("the engine and capability names", () => {
    expect(Engine).toEqual({ Cli: "cli", Sdk: "sdk" });
    expect(UnsupportedReason).toEqual({ HarnessLimit: "harness-limit", EngineLimit: "engine-limit", NotImplemented: "not-implemented" });
    expect(CapabilityName).toEqual({
      Effort: "effort",
      StructuredOutput: "structured-output",
      SessionsDelete: "sessions-delete",
      Ephemeral: "ephemeral",
      Cost: "cost",
      SettingsSources: "settings-sources",
      BuiltinToolsOff: "builtin-tools-off",
      McpNone: "mcp-none",
      McpAllowlist: "mcp-allowlist",
      ClosedEnv: "closed-env",
      BaseUrl: "base-url",
      Resume: "resume",
      ResumeCheckpoint: "resume-checkpoint",
      PerTurnUsage: "per-turn-usage",
      UnknownToolDetection: "unknown-tool-detection",
      SessionStore: "session-store",
    });
  });

  test("the spawn purposes", () => {
    expect(SpawnPurpose).toEqual({ Run: "run", Version: "version", Help: "help" });
  });

  test("the evidence kinds and the credential and unavailable reasons", () => {
    expect(EvidenceKind).toEqual({ Capture: "capture", Doc: "doc", Probe: "probe", Shipped: "shipped" });
    expect(CredentialReason).toEqual({
      NotASecret: "not-a-secret",
      HomeUnset: "home-unset",
      MissingField: "missing-field",
      EmptySecret: "empty-secret",
      UnknownSelector: "unknown-selector",
      ProviderUnmeasured: "provider-unmeasured",
    });
    expect(CredentialUnsupportedReason).toEqual({
      UnknownMode: "unknown-mode",
      ModeNotOffered: "mode-not-offered",
      ModeNotAllowed: "mode-not-allowed",
    });
    expect(UnavailableReason).toEqual({
      BinaryMissing: "binary-missing",
      SpawnFailed: "spawn-failed",
      RuntimeClosed: "runtime-closed",
      InternalError: "internal-error",
      ScratchFailed: "scratch-failed",
    });
  });

  test("RUN_FAILURE_KINDS lists the twenty kinds in order", () => {
    expect([...RUN_FAILURE_KINDS]).toEqual([
      "invalid-config",
      "unknown-harness",
      "credential",
      "credential-unsupported",
      "policy-not-acknowledged",
      "credential-mismatch",
      "auth-rejected",
      "timeout",
      "aborted",
      "exit",
      "unparsable",
      "unavailable",
      "too-large",
      "output-too-large",
      "unsupported",
      "cancelled",
      "max-turns",
      "no-output",
      "store-failed",
      "session-not-found",
    ]);
  });
});

describe("value helpers", () => {
  test("ok and fail build the two result shapes", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(fail("bad")).toEqual({ ok: false, failure: "bad" });
  });

  test("measured and unmeasured keep the evidence or the question", () => {
    const evidence = { kind: "capture", ref: "fixtures/x.txt", harnessVersion: "1.0.0", capturedAt: "2026-11-09" } as const;
    expect(measured(true, evidence)).toEqual({ state: "measured", value: true, evidence });
    expect(unmeasured("open?")).toEqual({ state: "unmeasured", question: "open?" });
  });
});
