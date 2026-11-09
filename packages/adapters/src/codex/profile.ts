import { Harness } from "@stateforge-labs/harness-hooks";
import { EvidenceKind, measured, unmeasured, type EvidenceRef } from "../core/evidence.ts";
import { deepFreeze, type Profile } from "../core/profile.ts";
import { LINUX_ARGV_EVIDENCE, LINUX_MAX_ARG_BYTES, LINUX_MAX_ARGV_BYTES } from "../core/limits.ts";
import { CODEX_BINARY } from "./exec.ts";
import { CodexCli } from "./constants.ts";

const CAPTURED_AT = "2026-11-08";
const DOC_CAPTURED_AT = "2026-11-09";
const CODEX_VERSION = "0.167.0";

const HELP: EvidenceRef = { kind: EvidenceKind.Capture, ref: "fixtures/codex/headless/help.txt", harnessVersion: CODEX_VERSION, capturedAt: CAPTURED_AT };

export const CODEX_PROFILE: Profile = deepFreeze({
  id: Harness.Codex,
  binary: CODEX_BINARY,
  nestedEnv: measured([], { kind: EvidenceKind.Shipped, ref: "src/codex/exec.ts", harnessVersion: null, capturedAt: CAPTURED_AT }),
  model: { syntax: measured("plain model id", HELP) },
  effort: { accepted: unmeasured("which values does model_reasoning_effort accept?") },
  suggested: { headlessModel: null },
  limits: { maxArgvBytes: measured(LINUX_MAX_ARGV_BYTES, LINUX_ARGV_EVIDENCE), maxArgBytes: measured(LINUX_MAX_ARG_BYTES, LINUX_ARGV_EVIDENCE) },
  isolation: {
    homeVar: measured("CODEX_HOME", HELP),
    worksHeadless: unmeasured("does a headless run work with an empty CODEX_HOME and an injected key?"),
  },
  cli: {
    flags: measured(
      [
        CodexCli.Exec,
        CodexCli.Ephemeral,
        CodexCli.SkipGitRepoCheck,
        CodexCli.IgnoreUserConfig,
        CodexCli.Sandbox,
        CodexCli.Color,
        CodexCli.Model,
        CodexCli.Config,
        CodexCli.Disable,
        CodexCli.Output,
      ],
      HELP,
    ),
    versionArgs: measured([CodexCli.Version], { kind: EvidenceKind.Capture, ref: "fixtures/codex/headless/version.txt", harnessVersion: CODEX_VERSION, capturedAt: CAPTURED_AT }),
    credentialInjection: measured(true, { kind: EvidenceKind.Doc, ref: "https://learn.chatgpt.com/docs/non-interactive-mode", harnessVersion: null, capturedAt: DOC_CAPTURED_AT }),
  },
});
