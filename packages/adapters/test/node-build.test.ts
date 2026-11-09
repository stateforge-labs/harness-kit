import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pkg = join(import.meta.dir, "..");
const NAME = "@stateforge-labs/harness-adapters";
const SUBPATHS = ["", "/claude", "/codex", "/opencode", "/opencode/store", "/tui", "/runtime", "/testing"];
const SCRIPT = `
const out = { resolved: {}, loaded: {}, env: null };
for (const sub of ${JSON.stringify(SUBPATHS)}) {
  const name = "${NAME}" + sub;
  out.resolved[name] = import.meta.resolve(name);
  out.loaded[name] = typeof (await import(name)) === "object";
}
const root = await import("${NAME}");
out.env = root.adapterEnv({ HOME: "/h/u" });
console.log(JSON.stringify(out));
`;

let consumer: string;
let resolved: Record<string, string>;
let loaded: Record<string, boolean>;
let env: { home: string; xdgDataHome: string; xdgCacheHome: string; codexHome: string };
let packedFiles: string[];

beforeAll(async () => {
  const build = Bun.spawn(["bun", "run", "build"], { cwd: pkg, stdout: "pipe", stderr: "pipe" });
  const buildErr = await new Response(build.stderr).text();
  if ((await build.exited) !== 0) throw new Error(`build failed:\n${buildErr}`);

  consumer = await mkdtemp(join(tmpdir(), "harness-adapters-consumer-"));
  await mkdir(join(consumer, "node_modules", "@stateforge-labs"), { recursive: true });
  await symlink(pkg, join(consumer, "node_modules", "@stateforge-labs", "harness-adapters"));
  const run = Bun.spawn(["node", "--input-type=module", "-e", SCRIPT], { cwd: consumer, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
  if ((await run.exited) !== 0) throw new Error(`node failed:\n${stderr}`);
  const parsed = JSON.parse(stdout) as { resolved: Record<string, string>; loaded: Record<string, boolean>; env: typeof env };
  resolved = parsed.resolved;
  loaded = parsed.loaded;
  env = parsed.env;

  const pack = Bun.spawn(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: pkg, stdout: "pipe", stderr: "pipe" });
  const packOut = await new Response(pack.stdout).text();
  if ((await pack.exited) !== 0) throw new Error("npm pack failed");
  packedFiles = (JSON.parse(packOut) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
}, 120_000);

afterAll(async () => {
  if (consumer) await rm(consumer, { recursive: true, force: true });
});

describe("the Node build", () => {
  test("node resolves every subpath to dist/", () => {
    for (const sub of SUBPATHS) {
      const target = resolved[NAME + sub];
      expect(target).toBeDefined();
      expect(target!).toContain("/packages/adapters/dist/src/");
      expect(target!.endsWith(".js")).toBe(true);
    }
  });

  test("every subpath imports under Node", () => {
    for (const sub of SUBPATHS) expect(loaded[NAME + sub]).toBe(true);
  });

  test("the environment helper resolves defaults under Node", () => {
    expect(env).toEqual({ home: "/h/u", xdgDataHome: "/h/u/.local/share", xdgCacheHome: "/h/u/.cache", codexHome: "/h/u/.codex" });
  });

  test("the tarball carries dist, src, the README and the license, and nothing else", () => {
    expect(packedFiles).toContain("dist/src/index.js");
    expect(packedFiles).toContain("package.json");
    expect(packedFiles).toContain("README.md");
    expect(packedFiles).toContain("LICENSE");
    const allowed = /^(dist\/|src\/|package\.json$|README\.md$|LICENSE$)/;
    expect(packedFiles.filter((f) => !allowed.test(f))).toEqual([]);
    expect(packedFiles.some((f) => f.startsWith("fixtures/") || f.startsWith("test/"))).toBe(false);
  });
});
