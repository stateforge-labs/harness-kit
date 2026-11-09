import { beforeAll, describe, expect, test } from "bun:test";
import { EnvVar, processEnv } from "../src/env.ts";
import { join } from "node:path";

const pkg = join(import.meta.dir, "..");
const consumer = join(pkg, "..", "hooks-server");

const NAME = "@stateforge-labs/harness-hooks";
const SCRIPT = `
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { adapters, defaultPipeline, handle, schemasDir, shimPath, opencodePluginPath, claudeSchemas, codexSchemas, opencodeSchemas, claudeEnums, codexEnums, opencodeEnums, claudeToolInputs, anyToolInput, checkToolInput } from "${NAME}";

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const out = { resolved: import.meta.resolve("${NAME}"), paths: {}, checked: 0, mismatches: [], exports: { claudeSchemas: claudeSchemas.size, codexSchemas: codexSchemas.size, opencodeSchemas: opencodeSchemas.size, claudePermissionModes: claudeEnums.PermissionMode.options.length, codexPermissionModes: codexEnums.PermissionMode.options.length, opencodeToolStatus: opencodeEnums.ToolStatus.options.length, claudeToolInputs: Object.keys(claudeToolInputs).length, anyToolInput: typeof anyToolInput.safeParse, checkToolInput: typeof checkToolInput } };
const fixturesDir = ${JSON.stringify(join(pkg, "fixtures"))};
for (const [k, p] of Object.entries({ schemasDir, shimPath, opencodePluginPath })) out.paths[k] = { p, exists: existsSync(p) };
for (const harness of readdirSync(fixturesDir)) {
  const adapter = adapters.get(harness);
  for (const event of readdirSync(join(fixturesDir, harness), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const dir = join(fixturesDir, harness, event);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".expected.json") && !f.endsWith(".log.json"))) {
      const name = f.slice(0, -5);
      const { body } = await handle(adapter, read(join(dir, f)), defaultPipeline());
      const expected = read(join(dir, name + ".expected.json")).body;
      out.checked++;
      if (JSON.stringify(body) !== JSON.stringify(expected)) out.mismatches.push(harness + "/" + event + "/" + name);
    }
  }
}
console.log(JSON.stringify(out));
`;

let result: { resolved: string; paths: Record<string, { p: string; exists: boolean }>; checked: number; mismatches: string[]; exports: Record<string, number | string> };

beforeAll(async () => {
  const build = Bun.spawn(["bun", "run", "build"], { cwd: pkg, stdout: "pipe", stderr: "pipe" });
  const buildErr = await new Response(build.stderr).text();
  if ((await build.exited) !== 0) throw new Error(`build failed:\n${buildErr}`);
  const run = Bun.spawn(["node", "--input-type=module", "-e", SCRIPT], { cwd: consumer, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
  if ((await run.exited) !== 0) throw new Error(`node failed:\n${stderr}`);
  result = JSON.parse(stdout);
}, 60_000);

describe("the Node build", () => {
  test("node resolves the package to dist/, not src/", () => {
    expect(result.resolved).toEndWith("/packages/hooks/dist/src/index.js");
  });

  test("built paths point at files that exist (clients built, schemas at the package root)", () => {
    expect(result.paths.shimPath!.p).toEndWith("/dist/clients/shim/hook-shim.js");
    expect(result.paths.opencodePluginPath!.p).toEndWith("/dist/clients/opencode/plugin.js");
    expect(result.paths.schemasDir!.p).toEndWith("/packages/hooks/schemas");
    for (const { exists } of Object.values(result.paths)) expect(exists).toBe(true);
  });

  test("the built shim runs under node and fails open with {} when nothing listens", async () => {
    const proc = Bun.spawn(["node", result.paths.shimPath!.p, "--harness", "codex"], {
      env: { [EnvVar.Path]: processEnv()[EnvVar.Path] ?? "", [EnvVar.HookUrl]: "http://127.0.0.1:9", [EnvVar.ShimTimeoutMs]: "1500" },
      stdin: new Blob(["{}"]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout.trim()).toBe("{}");
  });

  test("the schemas, enums and tool inputs resolve under Node", () => {
    expect(result.exports).toEqual({
      claudeSchemas: 33,
      codexSchemas: 14,
      opencodeSchemas: 15,
      claudePermissionModes: 6,
      codexPermissionModes: 5,
      opencodeToolStatus: 1,
      claudeToolInputs: 10,
      anyToolInput: "function",
      checkToolInput: "function",
    });
  });

  test("every fixture answers its snapshot under Node", () => {
    expect(result.checked).toBeGreaterThan(80);
    expect(result.mismatches).toEqual([]);
  });
});
