import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SPEC = "@anthropic-ai/claude-agent-sdk";
const SCRIPT = join(import.meta.dir, "..", "..", "..", "..", "..", "tools", "check-boundaries.ts");
const ENTRY = "src/claude/engines/sdk.ts";
const IMPORT_CALL = `export const load = () => import("${SPEC}");\n`;
const made: string[] = [];

function tree(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "boundaries-"));
  made.push(root);
  const pkg = join(root, "packages", "adapters");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@stateforge-labs/harness-adapters", exports: {} }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(pkg, rel)), { recursive: true });
    writeFileSync(join(pkg, rel), text);
  }
  return root;
}

async function check(files: Readonly<Record<string, string>>): Promise<{ readonly code: number; readonly text: string }> {
  const child = Bun.spawn(["bun", SCRIPT, "--root", tree(files)], { stdout: "pipe", stderr: "pipe", env: { PATH: process.env["PATH"] ?? "" } });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code: await child.exited, text: stdout + stderr };
}

afterAll(() => {
  for (const root of made) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("the SDK package name rule of check-boundaries", () => {
  test("the dynamic import specifier is clean in the engine file", async () => {
    const result = await check({ [ENTRY]: IMPORT_CALL });
    expect(result.text).toContain("boundaries clean");
    expect(result.code).toBe(0);
  }, 30_000);

  test("the same import in any other file is a violation", async () => {
    const result = await check({ "src/claude/engines/other.ts": IMPORT_CALL });
    expect(result.code).not.toBe(0);
    expect(result.text).toContain("SDK package name in library src");
    expect(result.text).toContain("third-party import not allowed");
  }, 30_000);

  test("any other mention of the package name in the engine file is a violation", async () => {
    const result = await check({ [ENTRY]: `${IMPORT_CALL}export const NAME = "${SPEC}";\n` });
    expect(result.code).not.toBe(0);
    expect(result.text).toContain("SDK package name in library src");
  }, 30_000);

  test("a static import of the SDK is a violation even in the engine file", async () => {
    const result = await check({ [ENTRY]: `import { query } from "${SPEC}";\nexport { query };\n` });
    expect(result.code).not.toBe(0);
    expect(result.text).toContain("SDK package name in library src");
  }, 30_000);

  test("a built declaration may never name the SDK package", async () => {
    const result = await check({ [ENTRY]: IMPORT_CALL, "dist/src/claude/engines/sdk.d.ts": `export declare const load: () => Promise<typeof import("${SPEC}")>;\n` });
    expect(result.code).not.toBe(0);
    expect(result.text).toContain("SDK package name in built declarations");
  }, 30_000);
});
