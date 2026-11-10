import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const src = (rel: string): string => join(import.meta.dir, "..", "src", rel);

describe("public export keys", () => {
  test("the root entry exports exactly the stable root names", async () => {
    const keys = Object.keys(await import(src("index.ts"))).sort();
    expect(keys).toEqual(["EnvVar", "HARNESS_BINARY", "LocatorKey", "SlashCommand", "ToolClass", "TranscriptPath", "adapterEnv", "compactCommand", "harnessBinary", "harnessOfTranscriptPath", "sessionIdOfTranscriptPath", "toolClass", "toolTarget", "transcriptLocatorKey"]);
  });

  test("the runtime entry exports exactly the stable runtime names", async () => {
    const keys = Object.keys(await import(src("runtime/index.ts"))).sort();
    expect(keys).toEqual(["AgentEventKind", "AgentTree", "AgentWhy", "CapabilityName", "ConfinementAxis", "CredentialReason", "CredentialUnsupportedReason", "Engine", "EnvKind", "EvidenceKind", "Harness", "HookPoint", "McpWhy", "RUN_FAILURE_KINDS", "SpawnPurpose", "TOOLS_DEFAULT", "TOOLS_OFF", "ToolSetting", "UnavailableReason", "UnsupportedReason", "createRuntime", "fail", "isSecret", "isUsable", "ok", "secret", "supportWhy"]);
  });

  test("the engine entry exports exactly the cli engine factory", async () => {
    const keys = Object.keys(await import(src("engine/index.ts"))).sort();
    expect(keys).toEqual(["cliEngine"]);
  });

  test("the testing entry exports exactly the fake helpers", async () => {
    const keys = Object.keys(await import(src("testing/index.ts"))).sort();
    expect(keys).toEqual([
      "AgentContractCheck",
      "agentContract",
      "claudeMessages",
      "driverContract",
      "fakeAgentEngine",
      "fakeClaudeQuery",
      "fakeClock",
      "fakeFs",
      "fakeOutput",
      "fakeProcessRunner",
      "fakeRuntime",
      "fakeTranscriptStore",
      "messagesTextStream",
      "messagesToolUseStream",
      "scriptedMessagesApi",
    ]);
  });
});
