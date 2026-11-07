import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
let copy: string;

/** Runs a generator script as a real process and returns what it did. */
async function run(script: string, args: string[]) {
  const proc = Bun.spawn(["bun", join(repo, "scripts", script), ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

// A throwaway copy of the generated files and their sources, so the stale cases never touch the real tree.
beforeAll(async () => {
  copy = await mkdtemp(join(tmpdir(), "harness-hooks-gen-"));
  for (const h of ["claude", "codex", "opencode"]) {
    for (const d of [`src/adapters/${h}/handlers`, `src/adapters/${h}/events`, `schemas/${h}`]) await cp(join(repo, d), join(copy, d), { recursive: true });
    await cp(join(repo, `src/adapters/${h}/schemas.ts`), join(copy, `src/adapters/${h}/schemas.ts`));
  }
});
afterAll(() => rm(copy, { recursive: true, force: true }));

describe("e2e: generated files are current", () => {
  test("the registry and the schema documentation match their sources in the repository", async () => {
    for (const script of ["gen-registry.ts", "gen-json-schema.ts"]) {
      const r = await run(script, ["--check"]);
      expect(r.stderr).toBe("");
      expect(r.code).toBe(0);
    }
  });

  test("the checks pass on a clean copy", async () => {
    for (const script of ["gen-registry.ts", "gen-json-schema.ts"]) {
      expect((await run(script, ["--check", "--root", copy])).code).toBe(0);
    }
  });

  test("a hand-edited registry is reported as stale and left alone", async () => {
    const file = join(copy, "src/adapters/claude/handlers/index.ts");
    const original = await readFile(file, "utf8");
    await writeFile(file, original + "// edited by hand\n");
    try {
      const r = await run("gen-registry.ts", ["--check", "--root", copy]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("src/adapters/claude/handlers/index.ts (differs)");
      expect(await readFile(file, "utf8")).toBe(original + "// edited by hand\n");
    } finally {
      await writeFile(file, original);
    }
  });

  test("a handler without a schema file makes the generator fail", async () => {
    const extra = join(copy, "src/adapters/claude/handlers/Extra.ts");
    await writeFile(extra, "export const event = 'Extra';\n");
    try {
      const r = await run("gen-registry.ts", ["--check", "--root", copy]);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("no payload schema for: Extra");
    } finally {
      await rm(extra);
    }
  });

  test("a stale, a missing and a leftover schema document are each reported, and nothing is deleted by --check", async () => {
    const dir = join(copy, "schemas/claude");
    const stale = join(dir, "Stop.json");
    const original = await readFile(stale, "utf8");
    await writeFile(stale, original.replace("{", '{ "stale": true,'));
    await rm(join(dir, "SessionEnd.json"));
    await writeFile(join(dir, "Removed.json"), "{}\n");
    try {
      const r = await run("gen-json-schema.ts", ["--check", "--root", copy]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("Stop.json (differs)");
      expect(r.stderr).toContain("SessionEnd.json (missing)");
      expect(r.stderr).toContain("Removed.json (not generated any more)");
      expect(await Bun.file(join(dir, "Removed.json")).exists()).toBe(true);
    } finally {
      await writeFile(stale, original);
      await rm(join(dir, "Removed.json"));
      await cp(join(repo, "schemas/claude/SessionEnd.json"), join(dir, "SessionEnd.json"));
    }
  });

  test("--root=<dir> works like --root <dir>, and a flag the script does not know is an error that writes nothing", async () => {
    const file = join(copy, "src/adapters/claude/handlers/index.ts");
    const original = await readFile(file, "utf8");
    await writeFile(file, original + "// stale\n");
    try {
      // If the form were ignored, the check would run against the real tree and pass.
      const r = await run("gen-registry.ts", ["--check", `--root=${copy}`]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("src/adapters/claude/handlers/index.ts (differs)");
      for (const args of [["--rot", copy], ["--root"], ["--root="], ["--chek"]]) {
        const bad = await run("gen-registry.ts", args);
        expect(bad.code).not.toBe(0);
        expect(bad.stderr).toMatch(/unknown argument|--root needs a directory/);
      }
      // A bad flag next to a root that is stale must not have rewritten it.
      expect(await readFile(file, "utf8")).toBe(original + "// stale\n");
    } finally {
      await writeFile(file, original);
    }
  });

  test("without --check the generator rewrites the copy and the check passes again", async () => {
    const dir = join(copy, "schemas/claude");
    await writeFile(join(dir, "Removed.json"), "{}\n");
    const w = await run("gen-json-schema.ts", ["--root", copy]);
    expect(w.code).toBe(0);
    expect(await Bun.file(join(dir, "Removed.json")).exists()).toBe(false);
    expect((await run("gen-json-schema.ts", ["--check", "--root", copy])).code).toBe(0);
  });
});
