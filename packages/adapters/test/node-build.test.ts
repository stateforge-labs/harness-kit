import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bunImportScript, importProbeScript, processGroupScript, TRAPPED_MODULES } from "./support/node-probes.ts";

const pkg = join(import.meta.dir, "..");
const NAME = "@stateforge-labs/harness-adapters";
const SUBPATHS = ["", "/claude", "/codex", "/opencode", "/opencode/store", "/tui", "/runtime", "/engine", "/testing"];
const SDK_PACKAGES = ["@anthropic-ai", "@openai/codex", "@opencode-ai"];
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
let packedSize: number;
let packedUnpackedSize: number;

function consumerEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "BUN_OPTIONS") out[key] = value;
  }
  return out;
}

async function runNode(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const run = Bun.spawn(["node", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: consumerEnv() });
  const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
  return { code: await run.exited, stdout, stderr };
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])));
  return nested.flat();
}

function relativeSpecifiers(text: string): string[] {
  return [...text.matchAll(/from\s*["'](\.[^"']+)["']/g)].map((m) => m[1]!);
}

async function concatenatedDeclarations(entry: string): Promise<string> {
  const dir = join(pkg, "dist", "src", entry.split("/").slice(0, -1).join("/"));
  const base = join(pkg, "dist", "src", entry);
  const text = await readFile(base, "utf8");
  const parts = [`// ${entry}\n${text}`];
  for (const spec of relativeSpecifiers(text)) {
    const target = join(dir, spec.replace(/\.(js|ts)$/, ".d.ts"));
    const rel = target.slice(join(pkg, "dist", "src").length + 1);
    parts.push(`// ${rel}\n${await readFile(target, "utf8")}`);
  }
  return parts.join("\n");
}

beforeAll(async () => {
  const build = Bun.spawn(["bun", "run", "build"], { cwd: pkg, stdout: "pipe", stderr: "pipe", env: consumerEnv() });
  const buildErr = await new Response(build.stderr).text();
  if ((await build.exited) !== 0) throw new Error(`build failed:\n${buildErr}`);

  consumer = await mkdtemp(join(tmpdir(), "harness-adapters-consumer-"));
  await mkdir(join(consumer, "node_modules", "@stateforge-labs"), { recursive: true });
  await symlink(pkg, join(consumer, "node_modules", "@stateforge-labs", "harness-adapters"));
  await writeFile(join(consumer, "resolve.mjs"), SCRIPT);
  const run = await runNode(["resolve.mjs"], consumer);
  if (run.code !== 0) throw new Error(`node failed:\n${run.stderr}`);
  const parsed = JSON.parse(run.stdout) as { resolved: Record<string, string>; loaded: Record<string, boolean>; env: typeof env };
  resolved = parsed.resolved;
  loaded = parsed.loaded;
  env = parsed.env;

  const pack = Bun.spawn(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: pkg, stdout: "pipe", stderr: "pipe", env: consumerEnv() });
  const packOut = await new Response(pack.stdout).text();
  if ((await pack.exited) !== 0) throw new Error("npm pack failed");
  const packInfo = (JSON.parse(packOut) as { files: { path: string }[]; size: number; unpackedSize: number }[])[0]!;
  packedFiles = packInfo.files.map((f) => f.path);
  packedSize = packInfo.size;
  packedUnpackedSize = packInfo.unpackedSize;
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

describe("Step 11c: the built package", () => {
  test("importing every subpath under Node calls no fs, child_process, net, dns or os function", async () => {
    const probe = join(consumer, "probe.mjs");
    await writeFile(probe, importProbeScript(SUBPATHS.map((sub) => NAME + sub)));
    const run = await runNode(["probe.mjs"], consumer);
    expect(run.code).toBe(0);
    const report = JSON.parse(run.stdout) as Record<string, { io: string[]; env: string[]; cwd: number }>;
    expect(Object.keys(report).length).toBe(SUBPATHS.length);
    for (const [url, entry] of Object.entries(report)) {
      expect({ url, io: entry.io }).toEqual({ url, io: [] });
    }
    expect(TRAPPED_MODULES.length).toBe(6);
  }, 60_000);

  test("an fs call made more than ten frames below package code is still detected", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-adapters-deep-"));
    try {
      await mkdir(join(root, "dist", "src"), { recursive: true });
      await writeFile(join(root, "deep-effect-recurse.mjs"), await readFile(join(import.meta.dir, "support", "deep-effect-recurse.mjs")));
      const moduleFile = join(root, "dist", "src", "deep-effect-module.mjs");
      await writeFile(moduleFile, await readFile(join(import.meta.dir, "support", "deep-effect-module.mjs")));
      const probe = join(root, "probe-deep.mjs");
      await writeFile(probe, importProbeScript([`file://${moduleFile}`]));
      const run = await runNode(["probe-deep.mjs"], root);
      expect(run.code).toBe(0);
      const report = JSON.parse(run.stdout) as Record<string, { io: string[] }>;
      expect(Object.values(report)[0]?.io).toContain("fs.readdirSync");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  test("importing every subpath from package code reads no environment variable and never calls process.cwd", async () => {
    const probe = join(consumer, "probe-env.mjs");
    await writeFile(probe, importProbeScript(SUBPATHS.map((sub) => NAME + sub)));
    const run = await runNode(["probe-env.mjs"], consumer);
    expect(run.code).toBe(0);
    const report = JSON.parse(run.stdout) as Record<string, { env: string[]; cwd: number }>;
    for (const [url, entry] of Object.entries(report)) {
      expect({ url, env: entry.env }).toEqual({ url, env: [] });
      expect({ url, cwd: entry.cwd }).toEqual({ url, cwd: 0 });
    }
  }, 60_000);

  test("every subpath imports under Bun", async () => {
    const script = join(consumer, "bun-import.mjs");
    await writeFile(script, bunImportScript(SUBPATHS.map((sub) => NAME + sub)));
    const run = Bun.spawn([process.execPath, "run", script], { cwd: consumer, stdout: "pipe", stderr: "pipe", env: consumerEnv() });
    const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
    expect({ code: await run.exited, stderr }).toEqual({ code: 0, stderr: "" });
    expect(JSON.parse(stdout)).toEqual(SUBPATHS.map((sub) => NAME + sub));
  }, 60_000);

  test("the process-group kill and pipe-close checks pass when run from dist under Node", async () => {
    const nodeDefaults = join(pkg, "dist", "src", "driver", "node-defaults.js");
    const script = join(consumer, "process-group.mjs");
    await writeFile(script, processGroupScript(`file://${nodeDefaults}`));
    const run = await runNode(["process-group.mjs"], consumer);
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect(run.stdout.trim()).toBe("ok");
  }, 60_000);

  test("no dist declaration file references the SDK packages", async () => {
    const files = (await walk(join(pkg, "dist"))).filter((f) => f.endsWith(".d.ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const sdk of SDK_PACKAGES) expect({ file, sdk, found: text.includes(sdk) }).toEqual({ file, sdk, found: false });
    }
  });

  test("the packed tarball has runtime and testing entries and no fixtures, tests or examples", () => {
    expect(packedFiles).toContain("dist/src/runtime/index.js");
    expect(packedFiles).toContain("dist/src/testing/index.js");
    expect(packedFiles.filter((f) => /^(fixtures|test|examples)\//.test(f))).toEqual([]);
    expect(packedSize).toBeGreaterThan(0);
    expect(packedUnpackedSize).toBeGreaterThan(packedSize);
  });

  test("package.json declares sideEffects false", async () => {
    const manifest = JSON.parse(await readFile(join(pkg, "package.json"), "utf8")) as { sideEffects: unknown };
    expect(manifest.sideEffects).toBe(false);
  });

  test("the runtime declaration surface matches its snapshot", async () => {
    expect(await concatenatedDeclarations("runtime/index.d.ts")).toMatchSnapshot();
  });

  test("the experimental declaration surface matches its snapshot", async () => {
    expect(await concatenatedDeclarations("runtime/experimental.d.ts")).toMatchSnapshot();
  });

  test("the engine declaration surface matches its snapshot", async () => {
    expect(await concatenatedDeclarations("engine/index.d.ts")).toMatchSnapshot();
  });

  test("the testing declaration surface matches its snapshot", async () => {
    expect(await concatenatedDeclarations("testing/index.d.ts")).toMatchSnapshot();
  });
});
