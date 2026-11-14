import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CLAUDE_SDK_VERSION } from "../../../src/claude/engines/sdk.ts";

const pkg = join(import.meta.dir, "..", "..", "..");
const SDK = "@anthropic-ai/claude-agent-sdk";
const LOAD_MARK = "sdk-load-refused";
const ENGINE = pathToFileURL(join(pkg, "src", "claude", "engines", "sdk.ts")).href;
const SUPPORT = pathToFileURL(join(import.meta.dir, "support.ts")).href;

interface Manifest {
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>;
  readonly devDependencies?: Record<string, string>;
}

const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")) as Manifest;

const ABSENT_SCRIPT = `
const seen = { requested: false };
Bun.plugin({
  name: "sdk-absent",
  setup(build) {
    build.onLoad({ filter: /claude-agent-sdk/ }, () => {
      seen.requested = true;
      throw new Error("${LOAD_MARK}");
    });
  },
});
const { claudeSdkEngine } = await import(${JSON.stringify(ENGINE)});
const { collect, runInput } = await import(${JSON.stringify(SUPPORT)});
const { events, end } = await collect(claudeSdkEngine().start(runInput()));
console.log(JSON.stringify({ requested: seen.requested, kinds: events.map((event) => event.kind), end }));
`;

function childEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "BUN_OPTIONS") out[key] = value;
  }
  return out;
}

describe("the agent SDK is an optional peer", () => {
  test("package.json lists the SDK as an optional peer and a dev dependency at the engine's version, never as a runtime dependency", () => {
    expect(manifest.dependencies?.[SDK]).toBeUndefined();
    expect(manifest.optionalDependencies?.[SDK]).toBeUndefined();
    expect(manifest.peerDependencies?.[SDK]).toBe(CLAUDE_SDK_VERSION);
    expect(manifest.peerDependenciesMeta?.[SDK]).toEqual({ optional: true });
    expect(manifest.devDependencies?.[SDK]).toBe(CLAUDE_SDK_VERSION);
  });

  test("a start with no SDK installed ends unavailable and names the package and version to add", async () => {
    const child = Bun.spawn(["bun", "--conditions=stateforge-source", "-e", ABSENT_SCRIPT], { cwd: pkg, stdout: "pipe", stderr: "pipe", env: childEnv() });
    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ code: await child.exited, stderr }).toEqual({ code: 0, stderr: "" });
    const out = JSON.parse(stdout) as { requested: boolean; kinds: string[]; end: { ok: boolean; failure?: { kind: string; reason?: string; message: string } } };
    expect(out.requested).toBe(true);
    expect(out.kinds).toEqual(["started"]);
    expect(out.end.ok).toBe(false);
    expect(out.end.failure?.kind).toBe("unavailable");
    expect(out.end.failure?.reason).toBe("spawn-failed");
    expect(out.end.failure?.message).toStartWith("the agent SDK could not be loaded");
    expect(out.end.failure?.message).toContain(`${SDK}@${CLAUDE_SDK_VERSION}`);
    expect(out.end.failure?.message).toContain("optional peer dependency");
    expect(out.end.failure?.message).not.toContain(LOAD_MARK);
  }, 60_000);
});
