import { describe, expect, test } from "bun:test";
import { CapabilityName, Engine, UnsupportedReason } from "../../src/core/capability.ts";
import { EvidenceKind, measured, unmeasured } from "../../src/core/evidence.ts";
import { CredentialReason, CredentialUnsupportedReason, RUN_FAILURE_KINDS, UnavailableReason } from "../../src/core/failure.ts";
import { fail, ok } from "../../src/core/result.ts";
import { Hermetic, Isolation, SpawnPurpose } from "../../src/core/run.ts";

describe("constant objects", () => {
  test("the engine and capability names", () => {
    expect(Engine).toEqual({ Cli: "cli" });
    expect(UnsupportedReason).toEqual({ HarnessLimit: "harness-limit", EngineLimit: "engine-limit", NotImplemented: "not-implemented" });
    expect(CapabilityName).toEqual({
      Effort: "effort",
      StructuredOutput: "structured-output",
      SessionsDelete: "sessions-delete",
      Ephemeral: "ephemeral",
      Cost: "cost",
      SettingsSources: "settings-sources",
    });
  });

  test("the run options and purposes", () => {
    expect(Hermetic).toEqual({ None: "none", Full: "full" });
    expect(Isolation).toEqual({ None: "none", PrivateHome: "private-home" });
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
      PrivateHomeMovesLogin: "private-home-moves-login",
      PrivateHomeNoAuthCopy: "private-home-no-auth-copy",
    });
    expect(UnavailableReason).toEqual({
      BinaryMissing: "binary-missing",
      SpawnFailed: "spawn-failed",
      VersionNotAccepted: "version-not-accepted",
      RuntimeClosed: "runtime-closed",
      InternalError: "internal-error",
      ScratchFailed: "scratch-failed",
      ScriptExhausted: "script-exhausted",
    });
  });

  test("RUN_FAILURE_KINDS lists the fifteen kinds in order", () => {
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
