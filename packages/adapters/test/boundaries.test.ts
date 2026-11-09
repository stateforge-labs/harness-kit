import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { edgesOf, reachable, sourceFiles } from "./support/module-graph.ts";

const pkg = join(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")) as {
  exports: Record<string, { "stateforge-source": string; types: string; default: string }>;
};

describe("the exports map", () => {
  const entries = Object.entries(manifest.exports);

  test("every subpath has a source file for the stateforge-source condition", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [, target] of entries) expect(existsSync(join(pkg, target["stateforge-source"]))).toBe(true);
  });

  test("the default condition points into dist/ and mirrors the source file", () => {
    for (const [, target] of entries) {
      expect(target.default.startsWith("./dist/")).toBe(true);
      expect(target.default).toBe(target["stateforge-source"].replace("./src/", "./dist/src/").replace(/\.ts$/, ".js"));
    }
  });

  test("every type condition points into dist/", () => {
    for (const [, target] of entries) expect(target.types.startsWith("./dist/")).toBe(true);
  });
});

const SRC = join(pkg, "src");
const CATCH = /\bcatch\b|\.catch\(/;
const SDK = /@anthropic-ai\/|@openai\/codex|@opencode-ai\//;
const HARNESSES = new Set(["claude", "codex", "opencode", "tui"]);
const ENTRIES = ["index.ts", "claude/index.ts", "codex/index.ts", "opencode/index.ts", "tui/index.ts"];
const CATCH_FILES = [
  "claude/locate.ts",
  "claude/sessions.ts",
  "codex/exec.ts",
  "codex/rollout.ts",
  "codex/tools.ts",
  "core/fs.ts",
  "core/rows.ts",
  "driver/execute.ts",
  "driver/node-defaults.ts",
  "opencode/catalogue.ts",
  "opencode/launch.ts",
  "opencode/store.ts",
];
const FORBIDDEN_BARE = new Set(["node:sqlite", "node:child_process"]);

const sorted = (values: Iterable<string>): string[] => [...values].sort();
const topFolder = (rel: string): string => rel.split("/")[0]!;
const inDriver = (rel: string): boolean => rel.startsWith("driver/");
const isSdk = (spec: string): boolean => SDK.test(spec);

function forbiddenInGraph(entry: string): string[] {
  const { files, bare } = reachable([entry]);
  const out: string[] = [];
  for (const rel of files) {
    if (rel === "drivers.ts" || inDriver(rel) || rel === "core/secret.ts" || rel.startsWith("runtime/") || rel.startsWith("testing/")) out.push(rel);
  }
  for (const spec of bare) if (FORBIDDEN_BARE.has(spec) || isSdk(spec)) out.push(spec);
  return out;
}

describe("module graph from the public entries", () => {
  for (const entry of ENTRIES) {
    test(`${entry} reaches no runtime, driver, secret, testing or sqlite code`, () => {
      expect(forbiddenInGraph(entry)).toEqual([]);
    });
  }

  test("opencode/store.ts is reached only from its own entry", () => {
    for (const entry of ENTRIES) expect(reachable([entry]).files.has("opencode/store.ts")).toBe(false);
    expect(reachable(["opencode/store.ts"]).files.has("opencode/store.ts")).toBe(true);
  });

  test("testing does not reach drivers.ts or driver/node-defaults.ts", () => {
    const testingFiles = sourceFiles().filter((rel) => rel.startsWith("testing/"));
    expect(testingFiles.length).toBeGreaterThan(0);
    for (const rel of testingFiles) {
      const { files } = reachable([rel]);
      expect(files.has("drivers.ts")).toBe(false);
      expect(files.has("driver/node-defaults.ts")).toBe(false);
    }
  });
});

describe("layering", () => {
  const files = sourceFiles();
  const edges = (dirs: readonly string[]) => files.filter((f) => dirs.includes(topFolder(f))).flatMap(edgesOf);

  test("core and driver import no harness folder", () => {
    const bad = edges(["core", "driver"]).filter((e) => e.to !== null && HARNESSES.has(topFolder(e.to)));
    expect(bad.map((e) => `${e.from} -> ${e.spec}`)).toEqual([]);
  });

  test("core imports nothing from driver", () => {
    const bad = edges(["core"]).filter((e) => e.to !== null && inDriver(e.to));
    expect(bad.map((e) => `${e.from} -> ${e.spec}`)).toEqual([]);
  });

  test("harness folders import no other harness folder", () => {
    const bad = files
      .filter((f) => HARNESSES.has(topFolder(f)))
      .flatMap(edgesOf)
      .filter((e) => e.to !== null && HARNESSES.has(topFolder(e.to)) && topFolder(e.to) !== topFolder(e.from));
    expect(bad.map((e) => `${e.from} -> ${e.spec}`)).toEqual([]);
  });

  test("harness folders import driver only through type-only port.ts", () => {
    const bad = files
      .filter((f) => HARNESSES.has(topFolder(f)))
      .flatMap(edgesOf)
      .filter((e) => e.to !== null && inDriver(e.to) && !(e.typeOnly && e.to === "driver/port.ts"));
    expect(bad.map((e) => `${e.from} -> ${e.spec}`)).toEqual([]);
  });

  test("drivers.ts is imported only by runtime/index.ts", () => {
    const importers = files.flatMap(edgesOf).filter((e) => e.to === "drivers.ts").map((e) => e.from);
    expect(sorted(importers)).toEqual(["runtime/index.ts"]);
  });
});

describe("try/catch and reveal allowlists", () => {
  test("only the allowlisted files contain catch", () => {
    const withCatch = sourceFiles().filter((f) => CATCH.test(readFileSync(join(SRC, f), "utf8")));
    expect(sorted(withCatch)).toEqual(sorted(CATCH_FILES));
  });

  test("reveal is called only in driver/env-plan.ts and defined in core/secret.ts", () => {
    const withReveal = sourceFiles().filter((f) => /\breveal\(/.test(readFileSync(join(SRC, f), "utf8")));
    expect(sorted(withReveal)).toEqual(["core/secret.ts", "driver/env-plan.ts"]);
  });
});
