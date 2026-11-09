import { Harness } from "@stateforge-labs/harness-hooks";
import { EvidenceKind, measured, unmeasured, type EvidenceRef } from "../core/evidence.ts";
import { deepFreeze, type Profile } from "../core/profile.ts";
import { LINUX_ARGV_EVIDENCE, LINUX_MAX_ARG_BYTES, LINUX_MAX_ARGV_BYTES } from "../core/limits.ts";
import { CLAUDE_BINARY, CLAUDE_NESTED_ENV } from "./launch.ts";
import { ClaudeCli, ClaudeQuietEnv } from "./constants.ts";

const CAPTURED_AT = "2026-11-08";
const DOC_CAPTURED_AT = "2026-11-09";
const CLAUDE_VERSION = "2.1.319";

const ENV_VARS_DOC = "https://code.claude.com/docs/en/env-vars";

const HELP: EvidenceRef = { kind: EvidenceKind.Capture, ref: "fixtures/claude/headless/help.txt", harnessVersion: CLAUDE_VERSION, capturedAt: CAPTURED_AT };

export const CLAUDE_PROFILE: Profile = deepFreeze({
  id: Harness.Claude,
  binary: CLAUDE_BINARY,
  nestedEnv: measured([...CLAUDE_NESTED_ENV], { kind: EvidenceKind.Shipped, ref: "src/claude/launch.ts", harnessVersion: null, capturedAt: CAPTURED_AT }),
  model: { syntax: measured("alias or full model id", HELP) },
  effort: { accepted: measured(["low", "medium", "high", "xhigh", "max"], HELP) },
  suggested: {
    headlessModel: {
      value: "haiku",
      evidence: { kind: EvidenceKind.Capture, ref: "fixtures/claude/headless/claude-result.json", harnessVersion: CLAUDE_VERSION, capturedAt: CAPTURED_AT },
      applied: false,
    },
  },
  limits: { maxArgvBytes: measured(LINUX_MAX_ARGV_BYTES, LINUX_ARGV_EVIDENCE), maxArgBytes: measured(LINUX_MAX_ARG_BYTES, LINUX_ARGV_EVIDENCE) },
  isolation: {
    homeVar: measured("CLAUDE_CONFIG_DIR", { kind: EvidenceKind.Doc, ref: "https://code.claude.com/docs/en/authentication#log-in-with-multiple-accounts", harnessVersion: null, capturedAt: DOC_CAPTURED_AT }),
    worksHeadless: unmeasured("does a headless run work with an empty CLAUDE_CONFIG_DIR and an injected key?"),
  },
  quiet: measured(ClaudeQuietEnv, { kind: EvidenceKind.Doc, ref: ENV_VARS_DOC, harnessVersion: null, capturedAt: DOC_CAPTURED_AT }),
  cli: {
    flags: measured(
      [ClaudeCli.Print, ClaudeCli.Model, ClaudeCli.NoSessionPersistence, ClaudeCli.Tools, ClaudeCli.SettingSources, ClaudeCli.StrictMcpConfig, ClaudeCli.OutputFormat, ClaudeCli.SystemPrompt, ClaudeCli.Effort],
      HELP,
    ),
    versionArgs: measured([ClaudeCli.Version], { kind: EvidenceKind.Capture, ref: "fixtures/claude/headless/version.txt", harnessVersion: CLAUDE_VERSION, capturedAt: CAPTURED_AT }),
    credentialInjection: measured(true, { kind: EvidenceKind.Doc, ref: "https://code.claude.com/docs/en/authentication", harnessVersion: null, capturedAt: DOC_CAPTURED_AT }),
  },
});
