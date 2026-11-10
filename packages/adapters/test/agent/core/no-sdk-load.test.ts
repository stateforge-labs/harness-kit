import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = join(import.meta.dir, "..", "..", "..");
const SDK_SPECIFIER = "@anthropic-ai/claude-agent-sdk";
const SPY_MARK = "sdk-module-requested";
const ENTRIES = ["src/index.ts", "src/runtime/index.ts", "src/testing/index.ts"].map((rel) => pathToFileURL(join(pkg, rel)).href);

const BUN_SCRIPT = `
Bun.plugin({
  name: "sdk-spy",
  setup(build) {
    build.onLoad({ filter: /claude-agent-sdk/ }, () => { throw new Error("${SPY_MARK}"); });
  },
});
for (const entry of ${JSON.stringify(ENTRIES)}) await import(entry);
const sdk = "${SDK_SPECIFIER}";
if (process.env.SPY_CONTROL === "1") await import(sdk);
console.log("loaded");
`;

const NODE_HOOKS = `
export async function resolve(specifier, context, next) {
  if (specifier.includes("claude-agent-sdk")) throw new Error("${SPY_MARK}");
  return next(specifier, context);
}
`;

const NODE_SCRIPT = `
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(${JSON.stringify(NODE_HOOKS)}));
for (const entry of ${JSON.stringify(ENTRIES)}) await import(entry);
if (process.env.SPY_CONTROL === "1") await import("${SDK_SPECIFIER}");
console.log("loaded");
`;

interface Child {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function childEnv(control: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "BUN_OPTIONS") out[key] = value;
  }
  return { ...out, SPY_CONTROL: control ? "1" : "0" };
}

async function run(argv: string[], control: boolean): Promise<Child> {
  const child = Bun.spawn(argv, { cwd: pkg, stdout: "pipe", stderr: "pipe", env: childEnv(control) });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code: await child.exited, stdout, stderr };
}

const BUN_ARGV = ["bun", "--conditions=stateforge-source", "-e", BUN_SCRIPT];
const NODE_ARGV = ["node", "--conditions=stateforge-source", "--input-type=module", "-e", NODE_SCRIPT];

describe("the agent SDK is loaded lazily", () => {
  test("under Bun, importing the root, ./runtime and ./testing does not load the SDK module", async () => {
    const result = await run(BUN_ARGV, false);
    expect(result.stderr).not.toContain(SPY_MARK);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("loaded");
  }, 60_000);

  test("under Node, importing the root, ./runtime and ./testing does not load the SDK module", async () => {
    const result = await run(NODE_ARGV, false);
    expect(result.stderr).not.toContain(SPY_MARK);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("loaded");
  }, 60_000);

  test("the Bun spy trips when the SDK module is requested", async () => {
    const result = await run(BUN_ARGV, true);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(SPY_MARK);
  }, 60_000);

  test("the Node spy trips when the SDK module is requested", async () => {
    const result = await run(NODE_ARGV, true);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(SPY_MARK);
  }, 60_000);
});
