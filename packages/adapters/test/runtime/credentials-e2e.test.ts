import { describe, expect, test } from "bun:test";
import { basename } from "node:path";
import { inspect } from "node:util";
import { CODEX_MESSAGE, HOMES, OPENCODE_STREAM, SCRATCH_OUT, SENTINEL, fixture, mentions, routedRig, sourceOf } from "./support.ts";
import { type LibraryEvent } from "../../src/core/run.ts";
import { secret } from "../../src/core/secret.ts";
import { CLAUDE_CREDENTIAL_VARS } from "../../src/claude/credentials.ts";
import { CODEX_CREDENTIAL_VARS } from "../../src/codex/credentials.ts";
import { OPENCODE_CREDENTIAL_VARS } from "../../src/opencode/credentials.ts";
import { EnvVar } from "../../src/env.ts";

type HarnessName = "claude" | "codex" | "opencode";

const OWN: Readonly<Record<string, readonly string[]>> = {
  claude: CLAUDE_CREDENTIAL_VARS,
  codex: CODEX_CREDENTIAL_VARS,
  opencode: OPENCODE_CREDENTIAL_VARS,
};
const AMBIENT_NAMES = [...new Set([...CLAUDE_CREDENTIAL_VARS, ...CODEX_CREDENTIAL_VARS, ...OPENCODE_CREDENTIAL_VARS])];
const RUN: Readonly<Record<HarnessName, { readonly stdout: string; readonly files: Readonly<Record<string, string>> }>> = {
  claude: { stdout: fixture("claude", "claude-result.json"), files: {} },
  codex: { stdout: "", files: { [SCRATCH_OUT]: CODEX_MESSAGE } },
  opencode: { stdout: OPENCODE_STREAM, files: {} },
};

interface Case {
  readonly harness: HarnessName;
  readonly label: string;
  readonly credential: Readonly<Record<string, unknown>>;
  readonly variable: string | null;
  readonly value: string | null;
  readonly billing: "per-token" | "unverified";
  readonly gated: boolean;
}

const CASES: readonly Case[] = [
  { harness: "claude", label: "api-key", credential: { mode: "api-key", key: secret(SENTINEL) }, variable: EnvVar.AnthropicApiKey, value: SENTINEL, billing: "per-token", gated: false },
  { harness: "claude", label: "token with ack", credential: { mode: "token", token: secret(SENTINEL), acknowledgePolicy: true }, variable: EnvVar.ClaudeCodeOauthToken, value: SENTINEL, billing: "unverified", gated: true },
  { harness: "claude", label: "login-store with ack", credential: { mode: "login-store", acknowledgePolicy: true }, variable: null, value: null, billing: "unverified", gated: true },
  { harness: "claude", label: "cloud bedrock", credential: { mode: "cloud", selector: "bedrock" }, variable: EnvVar.ClaudeCodeUseBedrock, value: "1", billing: "unverified", gated: false },
  { harness: "claude", label: "cloud vertex", credential: { mode: "cloud", selector: "vertex" }, variable: EnvVar.ClaudeCodeUseVertex, value: "1", billing: "unverified", gated: false },
  { harness: "claude", label: "cloud foundry", credential: { mode: "cloud", selector: "foundry" }, variable: EnvVar.ClaudeCodeUseFoundry, value: "1", billing: "unverified", gated: false },
  { harness: "codex", label: "api-key", credential: { mode: "api-key", key: secret(SENTINEL) }, variable: EnvVar.CodexApiKey, value: SENTINEL, billing: "per-token", gated: false },
  { harness: "codex", label: "login-store", credential: { mode: "login-store" }, variable: null, value: null, billing: "unverified", gated: false },
  { harness: "opencode", label: "api-key openai", credential: { mode: "api-key", key: secret(SENTINEL), provider: "openai" }, variable: EnvVar.OpenAiApiKey, value: SENTINEL, billing: "per-token", gated: false },
  { harness: "opencode", label: "api-key anthropic", credential: { mode: "api-key", key: secret(SENTINEL), provider: "anthropic" }, variable: EnvVar.AnthropicApiKey, value: SENTINEL, billing: "per-token", gated: false },
  { harness: "opencode", label: "login-store", credential: { mode: "login-store" }, variable: null, value: null, billing: "unverified", gated: false },
];

function ownOf(harness: string): readonly string[] {
  return OWN[harness] ?? [];
}

function ambient(home: string): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const name of AMBIENT_NAMES) {
    extra[name] = `AMBIENT-${name}`;
  }
  return { ...extra, PATH: "/bin", HOME: home };
}

function leaks(value: unknown): boolean {
  return mentions(value, SENTINEL) || inspect(value, { depth: null }).includes(SENTINEL);
}

describe("every credential mode reaches the child only under its chosen variable", () => {
  for (const home of HOMES) {
    for (const item of CASES) {
      test(`${item.harness} ${item.label} with HOME ${home}`, async () => {
        const events: LibraryEvent[] = [];
        const run = RUN[item.harness];
        const { runtime, specs } = routedRig({ stdout: run.stdout }, { source: ambient(home), onEvent: (event) => events.push(event) }, { files: run.files });
        const options = { credential: item.credential };
        const handle = runtime.headless(item.harness, options as never);
        const request = { instructions: "be brief", input: "hello" };
        const planned = handle.plan(request);
        const result = await handle.run(request);
        const runSpec = specs.find((spec) => !spec.args.includes("--version") && !spec.args.includes("--help"));
        expect(runSpec).toBeDefined();
        if (runSpec === undefined) {
          return;
        }
        const probes = specs.filter((spec) => spec !== runSpec);
        expect(probes.length).toBeGreaterThan(0);
        if (item.variable !== null) {
          expect(runSpec.env[item.variable]).toBe(item.value ?? undefined);
        }
        for (const name of ownOf(item.harness).filter((name) => name !== item.variable)) {
          expect(runSpec.env[name]).toBeUndefined();
        }
        expect(mentions(runSpec.args, SENTINEL)).toBe(false);
        expect(runSpec.stdin === null || !runSpec.stdin.includes(SENTINEL)).toBe(true);
        expect(leaks(planned)).toBe(false);
        expect(leaks(options)).toBe(false);
        expect(leaks(events)).toBe(false);
        expect(leaks(result)).toBe(false);
        expect(leaks(probes)).toBe(false);
        expect(result.ok).toBe(true);
        if (result.ok) {
          const credential = result.value.credential;
          expect(credential.requested).toBe(String(item.credential.mode));
          expect(credential.scrubbed).toEqual([...ownOf(item.harness)]);
          expect(credential.billing).toBe(item.billing);
          expect(credential.verified).toBe(false);
          expect(credential.acknowledgement === null).toBe(!item.gated);
        }
      });
    }
  }
});

describe("claude login-store and token need an acknowledged policy", () => {
  test("login-store without acknowledgement spawns nothing", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const result = await runtime.headless("claude", { credential: { mode: "login-store" } } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("policy-not-acknowledged");
    }
    expect(specs.length).toBe(0);
  });

  test("token without acknowledgement spawns nothing and never shows the token", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const result = await runtime.headless("claude", { credential: { mode: "token", token: secret(SENTINEL) } } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("policy-not-acknowledged");
    }
    expect(specs.length).toBe(0);
    expect(leaks(result)).toBe(false);
  });
});

describe("probes strip their own harness ambient credentials", () => {
  test("no probe spec carries an ambient credential of its own harness", async () => {
    const source = sourceOf({ ANTHROPIC_API_KEY: SENTINEL, CODEX_API_KEY: SENTINEL, OPENCODE_API_KEY: SENTINEL, OPENAI_API_KEY: SENTINEL });
    const { runtime, specs } = routedRig({ stdout: "" }, { source });
    await runtime.available(["claude", "codex", "opencode"], { timeoutMs: 5000 });
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      for (const name of ownOf(basename(spec.program))) {
        expect(spec.env[name]).toBeUndefined();
      }
    }
  });
});
