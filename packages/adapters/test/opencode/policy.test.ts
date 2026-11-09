import { describe, expect, test } from "bun:test";
import { secret } from "../../src/core/secret.ts";
import { resolveTools, TOOLS_DEFAULT, TOOLS_OFF, type ToolPolicy } from "../../src/core/policy.ts";
import type { OpenCodeCredential } from "../../src/core/credential.ts";
import type { EngineEvent } from "../../src/driver/port.ts";
import type { ProcessRunner, ProcessSpec } from "../../src/driver/ports.ts";
import { OPENCODE_CONFIG_DIR_PLACEHOLDER, OpenCodeBuiltinActions, OpenCodeMcpActions } from "../../src/opencode/constants.ts";
import { OPENCODE_TOOLLESS_CONFIG, opencodeDenyConfig } from "../../src/opencode/launch.ts";
import { opencodeCli } from "../../src/opencode/engines/cli.ts";
import { opencodePolicy } from "../../src/opencode/policy.ts";
import { EnvVar } from "../../src/env.ts";
import { chunkedRunner } from "../support/chunked-runner.ts";
import { ioWith, runInput, stubHost } from "../support/interpret.ts";
import { opencodeOptions } from "./options.ts";

const CREDENTIAL: OpenCodeCredential = { mode: "api-key", key: secret("sk-test"), provider: "anthropic" };

function applied(tools: ToolPolicy) {
  const result = opencodePolicy({ tools: resolveTools(tools, undefined), credentialMode: "api-key" });
  if (!result.ok) {
    throw new Error("expected ok");
  }
  return result.value;
}

describe("opencodePolicy", () => {
  test("TOOLS_OFF sets the deny config, an empty config directory and the two disable switches, and adds no args", () => {
    const { args, env } = applied(TOOLS_OFF);
    expect(args).toEqual([]);
    expect(env).toEqual({
      [EnvVar.OpenCodeConfigContent]: OPENCODE_TOOLLESS_CONFIG,
      OPENCODE_CONFIG_DIR: OPENCODE_CONFIG_DIR_PLACEHOLDER,
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_DISABLE_CLAUDE_CODE: "1",
    });
  });

  test("TOOLS_DEFAULT adds nothing", () => {
    expect(applied(TOOLS_DEFAULT)).toEqual({ args: [], env: {} });
  });

  test("the deny config is a V2 permissions list that denies every documented builtin action by name", () => {
    const config = JSON.parse(OPENCODE_TOOLLESS_CONFIG) as { permissions: { action: string; resource: string; effect: string }[] };
    expect(config.permissions.every((rule) => rule.resource === "*" && rule.effect === "deny")).toBe(true);
    expect(config.permissions.map((rule) => rule.action)).toEqual([...OpenCodeBuiltinActions, ...OpenCodeMcpActions]);
    for (const name of ["read", "edit", "glob", "grep", "shell", "webfetch", "websearch", "execute", "question", "subagent", "skill"]) {
      expect(config.permissions.some((rule) => rule.action === name)).toBe(true);
    }
  });

  test("each axis applies only its own mechanism", () => {
    const builtins = applied({ ...TOOLS_DEFAULT, builtins: "off" }).env;
    expect(builtins).toEqual({ [EnvVar.OpenCodeConfigContent]: opencodeDenyConfig(OpenCodeBuiltinActions) });
    const mcp = applied({ ...TOOLS_DEFAULT, mcp: [] }).env;
    expect(mcp).toEqual({ [EnvVar.OpenCodeConfigContent]: opencodeDenyConfig(OpenCodeMcpActions) });
    const settings = applied({ ...TOOLS_DEFAULT, settings: "none" }).env;
    expect(Object.keys(settings).sort()).toEqual(["OPENCODE_CONFIG_DIR", "OPENCODE_DISABLE_CLAUDE_CODE", "OPENCODE_DISABLE_PROJECT_CONFIG"]);
  });

  test("the policy never adds the pure flag", () => {
    expect(applied(TOOLS_OFF).args).not.toContain("--pure");
  });
});

describe("opencodeCli invocation under a tool policy", () => {
  test("TOOLS_OFF carries the policy env and keeps standalone", () => {
    const result = opencodeCli.invocation({ options: opencodeOptions({}, TOOLS_OFF), credential: CREDENTIAL, instructions: "SYS", input: "go", outFile: "/work/x", runId: "r1" });
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.value.args).toContain("--standalone");
    expect(result.value.args).not.toContain("--pure");
    expect(Object.keys(result.value.env ?? {}).sort()).toEqual(["OPENCODE_CONFIG_CONTENT", "OPENCODE_CONFIG_DIR", "OPENCODE_DISABLE_CLAUDE_CODE", "OPENCODE_DISABLE_PROJECT_CONFIG"]);
  });

  test("TOOLS_DEFAULT has no env", () => {
    const result = opencodeCli.invocation({ options: opencodeOptions(), credential: CREDENTIAL, instructions: "SYS", input: "go", outFile: "/work/x", runId: "r1" });
    expect(result.ok && result.value.env).toBeUndefined();
  });
});

describe("opencodeCli start under TOOLS_OFF", () => {
  async function drain(run: ReturnType<typeof opencodeCli.start>): Promise<EngineEvent[]> {
    const events: EngineEvent[] = [];
    for await (const event of run.events) {
      events.push(event);
    }
    return events;
  }

  test("the config directory placeholder is replaced by the scratch directory", async () => {
    const specs: ProcessSpec[] = [];
    const scripted = chunkedRunner([{ chunks: ['{"type":"text","sessionID":"ses_1","part":{"text":"ok"}}\n'] }, { chunks: [] }]);
    const runner: ProcessRunner = (spec) => {
      specs.push(spec);
      return scripted.runner(spec);
    };
    const host = { ...stubHost(), scratch: () => Promise.resolve("/scratch/empty") };
    const run = opencodeCli.start(runInput<"opencode">({ options: opencodeOptions({}, TOOLS_OFF), credential: CREDENTIAL, host }), ioWith(runner));
    await drain(run);
    expect((await run.done).ok).toBe(true);
    expect(specs[0]?.env["OPENCODE_CONFIG_DIR"]).toBe("/scratch/empty");
    expect(specs[0]?.env["OPENCODE_DISABLE_PROJECT_CONFIG"]).toBe("1");
    expect(specs[0]?.env[EnvVar.OpenCodeConfigContent]).toBe(OPENCODE_TOOLLESS_CONFIG);
    expect(specs[0]?.args).toContain("--standalone");
    expect(specs[1]?.args).toEqual(["session", "delete", "--standalone", "ses_1"]);
    expect(specs[1]?.env["OPENCODE_CONFIG_DIR"]).toBe("/scratch/empty");
  });

  test("a scratch directory that cannot be made fails without a spawn", async () => {
    const specs: ProcessSpec[] = [];
    const runner: ProcessRunner = (spec) => {
      specs.push(spec);
      return Promise.resolve({ ok: true, value: { pid: null, stdout: (async function* () {})(), stderr: (async function* () {})(), exited: Promise.resolve({ code: 0, signal: null }), signalGroup() {} } });
    };
    const host = { ...stubHost(), scratch: () => Promise.resolve(null) };
    const run = opencodeCli.start(runInput<"opencode">({ options: opencodeOptions({}, TOOLS_OFF), credential: CREDENTIAL, host }), ioWith(runner));
    await drain(run);
    const end = await run.done;
    expect(!end.ok && end.failure.kind).toBe("unavailable");
    expect(specs).toEqual([]);
  });

  test("cancel before the first read settles done as aborted", async () => {
    const run = opencodeCli.start(runInput<"opencode">({ options: opencodeOptions({}, TOOLS_OFF), credential: CREDENTIAL }), ioWith(() => Promise.reject(new Error("no spawn"))));
    run.cancel();
    const end = await run.done;
    expect(!end.ok && end.failure.kind).toBe("aborted");
  });

  test("without settings none the scratch directory is never asked for", async () => {
    let asked = 0;
    const host = { ...stubHost(), scratch: () => { asked += 1; return Promise.resolve("/s"); } };
    const scripted = chunkedRunner([{ chunks: ['{"type":"text","sessionID":"ses_1","part":{"text":"ok"}}\n'] }, { chunks: [] }]);
    const run = opencodeCli.start(runInput<"opencode">({ options: opencodeOptions(), credential: CREDENTIAL, host }), ioWith(scripted.runner));
    await drain(run);
    expect(asked).toBe(0);
  });
});
