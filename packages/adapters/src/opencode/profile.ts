import { Harness } from "@stateforge-labs/harness-hooks";
import { EvidenceKind, measured, unmeasured, type EvidenceRef } from "../core/evidence.ts";
import { deepFreeze, type Profile } from "../core/profile.ts";
import { LINUX_ARGV_EVIDENCE, LINUX_MAX_ARG_BYTES, LINUX_MAX_ARGV_BYTES } from "../core/limits.ts";
import { OPENCODE_BINARY } from "./launch.ts";
import { OpenCodeCli } from "./constants.ts";

const CAPTURED_AT = "2026-11-08";
const DOC_CAPTURED_AT = "2026-11-09";
const OPENCODE_VERSION = "2.2.6";

const HELP: EvidenceRef = { kind: EvidenceKind.Capture, ref: "fixtures/opencode/headless/help.txt", harnessVersion: OPENCODE_VERSION, capturedAt: CAPTURED_AT };

export const OPENCODE_PROFILE: Profile = deepFreeze({
  id: Harness.OpenCode,
  binary: OPENCODE_BINARY,
  nestedEnv: measured([], { kind: EvidenceKind.Shipped, ref: "src/opencode/launch.ts", harnessVersion: null, capturedAt: CAPTURED_AT }),
  model: { syntax: measured("provider/model#variant", HELP) },
  effort: { accepted: unmeasured("does OpenCode 2.2.6 have an effort flag or config key for a headless run?") },
  suggested: { headlessModel: null },
  limits: { maxArgvBytes: measured(LINUX_MAX_ARGV_BYTES, LINUX_ARGV_EVIDENCE), maxArgBytes: measured(LINUX_MAX_ARG_BYTES, LINUX_ARGV_EVIDENCE) },
  isolation: {
    homeVar: measured("XDG_DATA_HOME", { kind: EvidenceKind.Probe, ref: "probe: XDG_DATA_HOME relocates the OpenCode data directory", harnessVersion: OPENCODE_VERSION, capturedAt: DOC_CAPTURED_AT }),
    worksHeadless: unmeasured("does a --standalone run work with an empty XDG_DATA_HOME and an injected key?"),
  },
  cli: {
    flags: measured([OpenCodeCli.Standalone, OpenCodeCli.Format, OpenCodeCli.Title, OpenCodeCli.Model], HELP),
    versionArgs: measured([OpenCodeCli.Version], { kind: EvidenceKind.Capture, ref: "fixtures/opencode/headless/version.txt", harnessVersion: OPENCODE_VERSION, capturedAt: CAPTURED_AT }),
    credentialInjection: unmeasured("does --standalone pass an injected provider key and a private XDG_DATA_HOME to its private server?"),
  },
});
