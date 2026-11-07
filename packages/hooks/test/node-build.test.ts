// StateForge imports this library from Node, not Bun. This builds dist/ with the real build script, then has `node` import
// `@homelab/harness-hooks` BY NAME (so Node's own resolution walks the exports map and must pick dist/, not src/) and run every
// fixture of every harness through handle() + defaultPipeline(). Each answer must equal the body in its `.expected.json`, the
// same snapshot the server's contract suite checks over HTTP. It also checks the built paths point at files that exist.
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

const pkg = join(import.meta.dir, "..");
// A package that depends on @homelab/harness-hooks, so `node_modules/@homelab/harness-hooks` resolves from its folder.
const consumer = join(pkg, "..", "hooks-server");

// The name is interpolated so tools/check-boundaries.ts does not read this child-process script as an import of this file.
const NAME = "@homelab/harness-hooks";
const SCRIPT = `
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { adapters, defaultPipeline, handle, fixturesDir, schemasDir, shimPath, opencodePluginPath } from "${NAME}";

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const out = { resolved: import.meta.resolve("${NAME}"), paths: {}, checked: 0, mismatches: [] };
for (const [k, p] of Object.entries({ fixturesDir, schemasDir, shimPath, opencodePluginPath })) out.paths[k] = { p, exists: existsSync(p) };
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

let result: { resolved: string; paths: Record<string, { p: string; exists: boolean }>; checked: number; mismatches: string[] };

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

  test("built paths point at files that exist (clients built, fixtures and schemas at the package root)", () => {
    expect(result.paths.shimPath!.p).toEndWith("/dist/clients/shim/hook-shim.js");
    expect(result.paths.opencodePluginPath!.p).toEndWith("/dist/clients/opencode/plugin.js");
    expect(result.paths.fixturesDir!.p).toEndWith("/packages/hooks/fixtures");
    expect(result.paths.schemasDir!.p).toEndWith("/packages/hooks/schemas");
    for (const { exists } of Object.values(result.paths)) expect(exists).toBe(true);
  });

  test("every fixture answers its snapshot under Node", () => {
    expect(result.checked).toBeGreaterThan(80);
    expect(result.mismatches).toEqual([]);
  });
});
