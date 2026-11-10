import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = join(import.meta.dir, "..", "..", "..");
const HOOKS = pathToFileURL(join(pkg, "src", "agent", "hooks", "index.ts")).href;
const HARNESS_HOOKS = "@stateforge-labs/harness-hooks";
const DENY_REASON = "not on the list";
const CONTEXT = "session context";

const SCRIPT = `
import { Kind, Pipeline, once, toolAllowlist } from "${HARNESS_HOOKS}";
import { claudeHookCallbacks, socketWiring } from "${HOOKS}";
const pipeline = new Pipeline().use(
  toolAllowlist({ allow: ["Read"], deny: { reason: "${DENY_REASON}" } }),
  once(() => "${CONTEXT}", { kinds: [Kind.SessionStart] }),
);
const refused = [];
const option = claudeHookCallbacks({ pipeline, socket: null }, { refused: (r) => refused.push(r), context: () => {} });
const signal = new AbortController().signal;
const base = { session_id: "s", transcript_path: "/t.jsonl", cwd: "/w" };
const pre = await option.PreToolUse[0].hooks[0]({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {}, tool_use_id: "u1" }, "u1", { signal });
const prompt = await option.UserPromptSubmit[0].hooks[0]({ ...base, hook_event_name: "UserPromptSubmit", prompt: "hi" }, undefined, { signal });
const wiring = socketWiring("codex", { pipeline, socket: { path: "/s.sock", shimDir: "/shims" } }, { cwd: "/w", home: "/h", configDir: "/c", tmpDir: "/t" });
console.log(JSON.stringify({ pre, prompt, refused: refused.length, wired: wiring.ok && wiring.value.files.length }));
`;

async function run(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && key !== "BUN_OPTIONS") env[key] = value;
  const child = Bun.spawn(argv, { cwd: pkg, stdout: "pipe", stderr: "pipe", env });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code: await child.exited, stdout, stderr };
}

const EXPECTED = {
  pre: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: DENY_REASON } },
  prompt: { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: CONTEXT } },
  refused: 1,
  wired: 2,
};

describe("the hooks wiring runs the same on both runtimes", () => {
  test("under Bun", async () => {
    const result = await run(["bun", "--conditions=stateforge-source", "-e", SCRIPT]);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(EXPECTED);
  }, 60_000);

  test("under Node", async () => {
    const result = await run(["node", "--conditions=stateforge-source", "--input-type=module", "-e", SCRIPT]);
    expect(result.stderr).not.toContain("Error");
    expect(JSON.parse(result.stdout)).toEqual(EXPECTED);
  }, 60_000);
});
