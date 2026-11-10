import { describe, expect, test } from "bun:test";
import { Pipeline, toolAllowlist } from "@stateforge-labs/harness-hooks";
import type { AgentRunInput } from "../../../src/agent/engine.ts";
import type { AgentEngineImpl } from "../../../src/agent/engine.ts";
import type { AgentOptions } from "../../../src/agent/types.ts";
import { claudeHookCallbacks } from "../../../src/agent/hooks/index.ts";
import { claudeSdkEngine } from "../../../src/claude/engines/sdk.ts";
import { TOOLS_OFF } from "../../../src/core/policy.ts";
import { secret } from "../../../src/core/secret.ts";
import { createRuntime } from "../../../src/runtime/index.ts";
import { agentContract, AgentContractCheck, claudeMessages, fakeAgentEngine, fakeClaudeQuery, fakeFs, type AgentContractSubject, type AgentRuntime, type FakeClaudeMessages, type FakeClaudeQueryBehaviour, type FakeClaudeQueryCall } from "../../../src/testing/index.ts";
import { fixture } from "../hooks/support.ts";
import { DENIED_TOOL, denyEvents, normalEvents } from "../../testing/agent/support/subjects.ts";
import { fail } from "../../../src/core/result.ts";
import type { EnvSource } from "../../../src/env.ts";

const OPTIONS: AgentOptions = {
  credential: { mode: "api-key", key: secret("sk-placeholder"), baseUrl: "http://127.0.0.1:1" },
  dirs: { cwd: "/w", home: "/w/h", configDir: "/w/c", tmpDir: "/w/t" },
  tools: TOOLS_OFF,
  env: { kind: "closed", set: { PATH: "/usr/bin", CONTRACT_PLAIN: "plain-value" } },
};

const ALL = Object.values(AgentContractCheck);

function recording(engine: AgentEngineImpl<"claude">): AgentEngineImpl<"claude"> & { readonly starts: AgentRunInput[] } {
  const starts: AgentRunInput[] = [];
  return {
    starts,
    harness: engine.harness,
    describe: (input) => engine.describe(input),
    start: (input) => {
      starts.push(input);
      return engine.start(input);
    },
  };
}

function runtimeOf(engine: AgentEngineImpl<"claude">, source?: EnvSource, withDeny = false): AgentRuntime {
  const runtime = createRuntime({ source: source ?? {}, fs: fakeFs({ dirs: Object.values(OPTIONS.dirs) }), agentEngines: { claude: engine } });
  if (!withDeny) {
    return runtime;
  }
  const pipeline = new Pipeline().use(toolAllowlist({ allow: ["Read"], deny: { reason: "tool not allowed", hint: "use Read" } }));
  return {
    agent(id, options) {
      const built = runtime.agent(id as "claude", options);
      if (!built.ok) {
        return built;
      }
      const agent = built.value;
      return { ok: true, value: { ...agent, start: (start) => agent.start({ ...start, hooks: { pipeline, socket: null } }) } };
    },
  };
}

function withId(row: Record<string, unknown>, id: string, uuid: string): Record<string, unknown> {
  return { ...row, uuid, message: { ...(row["message"] as Record<string, unknown>), id } };
}

function baseMessages(): readonly unknown[] {
  return [
    claudeMessages.init(),
    withId(claudeMessages.assistantText("ok", { input: 2, output: 4 }), "msg-1", "00000000-0000-4000-8000-0000000000a1"),
    withId(claudeMessages.assistantText("done", { input: 3, output: 5 }), "msg-2", "00000000-0000-4000-8000-0000000000a2"),
    claudeMessages.resultSuccess("done"),
  ];
}

function denyMessages(): readonly unknown[] {
  return [claudeMessages.init(), claudeMessages.hookCall("PreToolUse", { ...fixture("p5-PreToolUse-3.json"), tool_name: DENIED_TOOL }, "toolu-1"), ...baseMessages().slice(1)];
}

function resumeMessages(call: FakeClaudeQueryCall): readonly unknown[] {
  return call.index === 0 ? [claudeMessages.throwError("No conversation found with session ID: contract-resume-session")] : baseMessages();
}

function seam(messages: FakeClaudeMessages, behaviour: FakeClaudeQueryBehaviour = {}): ReturnType<typeof recording> {
  return recording(claudeSdkEngine({ query: fakeClaudeQuery(messages, behaviour), hooks: claudeHookCallbacks }));
}

function claudeSubject(): AgentContractSubject {
  let base = seam(baseMessages());
  let cancel = seam(baseMessages(), { holdOpen: true });
  let deny = seam(denyMessages());
  let resume = seam(resumeMessages);
  return {
    runtime: (source) => {
      base = seam(baseMessages());
      return runtimeOf(base, source);
    },
    options: OPTIONS,
    id: "claude",
    inputs: () => base.starts,
    engine: base,
    cancel: {
      runtime: () => {
        cancel = seam(baseMessages(), { holdOpen: true });
        return runtimeOf(cancel);
      },
      inputs: () => cancel.starts,
    },
    deny: {
      runtime: () => {
        deny = seam(denyMessages());
        return runtimeOf(deny, undefined, true);
      },
      inputs: () => deny.starts,
      tool: DENIED_TOOL,
    },
    resumeMiss: {
      runtime: () => {
        resume = seam(resumeMessages);
        return runtimeOf(resume);
      },
      inputs: () => resume.starts,
    },
  };
}

describe("the exported contract suite against the real facet", () => {
  test("the fake engine passes every check", async () => {
    let latest = fakeAgentEngine("claude", []);
    const through = (scripts: () => Parameters<typeof fakeAgentEngine>[1]) => (source?: EnvSource) => {
      latest = fakeAgentEngine("claude", scripts());
      return runtimeOf(latest, source);
    };
    const resumeScripts = () => [
      { events: [], result: fail({ kind: "session-not-found" as const, message: "no such session", sessionId: "contract-resume-session" }) },
      { events: normalEvents() },
    ];
    let denyEngine = fakeAgentEngine("claude", []);
    let cancelEngine = fakeAgentEngine("claude", []);
    let resumeEngine = fakeAgentEngine("claude", []);
    const subject: AgentContractSubject = {
      runtime: through(() => [{ events: normalEvents() }]),
      options: OPTIONS,
      id: "claude",
      inputs: () => latest.starts,
      engine: fakeAgentEngine("claude", []),
      cancel: {
        runtime: () => {
          cancelEngine = fakeAgentEngine("claude", [{ events: normalEvents(), delayMs: 40 }]);
          return runtimeOf(cancelEngine);
        },
        inputs: () => cancelEngine.starts,
      },
      deny: {
        runtime: () => {
          denyEngine = fakeAgentEngine("claude", [{ events: denyEvents() }]);
          return runtimeOf(denyEngine);
        },
        inputs: () => denyEngine.starts,
        tool: DENIED_TOOL,
      },
      resumeMiss: {
        runtime: () => {
          resumeEngine = fakeAgentEngine("claude", resumeScripts());
          return runtimeOf(resumeEngine);
        },
        inputs: () => resumeEngine.starts,
      },
    };
    const checks = await agentContract(subject);
    expect(checks.filter((check) => !check.ok)).toEqual([]);
    expect(checks.map((check) => check.name)).toEqual(ALL);
  });

  test("the Claude engine over the injected query passes every check", async () => {
    const checks = await agentContract(claudeSubject());
    expect(checks.filter((check) => !check.ok)).toEqual([]);
    expect(checks.map((check) => check.name)).toEqual(ALL);
  });
});

describe("the facet and the Claude engine agree on the bearer slot", () => {
  const options: AgentOptions = {
    ...OPTIONS,
    tools: { ...TOOLS_OFF, mcp: [{ name: "alpha", url: "http://127.0.0.1:1/alpha", bearer: secret("bearer-TOKEN-9b7e"), allow: [] }] },
  };

  test("the bearer reaches the engine input under the slot the engine reads and the header names the slot", async () => {
    const query = fakeClaudeQuery(baseMessages());
    const engine = recording(claudeSdkEngine({ query, hooks: claudeHookCallbacks }));
    const runtime = createRuntime({ source: {}, fs: fakeFs({ dirs: Object.values(OPTIONS.dirs) }), agentEngines: { claude: engine } });
    const built = runtime.agent("claude", options);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const run = built.value.start({ instructions: "i", prompt: "p", maxTurns: 1 });
    const events = [];
    for await (const event of run.events) {
      events.push(event);
    }
    expect(engine.starts[0]?.env["AGENT_MCP_BEARER_0"]).toBe("bearer-TOKEN-9b7e");
    const called = query.calls[0];
    expect(called?.mcpServers["alpha"]?.headers).toEqual({ authorization: "Bearer ${AGENT_MCP_BEARER_0}" });
    expect(called?.env["AGENT_MCP_BEARER_0"]).toBe("bearer-TOKEN-9b7e");
    expect(JSON.stringify(events)).not.toContain("bearer-TOKEN-9b7e");
    expect(events.at(-1)?.kind).toBe("finished");
    expect(JSON.stringify(called?.mcpServers)).not.toContain("bearer-TOKEN-9b7e");
  });
});
