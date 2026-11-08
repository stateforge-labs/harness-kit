import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

export function parseArgs(argv = process.argv.slice(2)): { check: boolean; root: string } {
  let check = false;
  let root: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--check") check = true;
    else if (a === "--root") {
      root = argv[++i];
      if (!root) throw new Error("--root needs a directory");
    } else if (a.startsWith("--root=")) {
      root = a.slice("--root=".length);
      if (!root) throw new Error("--root needs a directory");
    } else throw new Error(`unknown argument: ${a}`);
  }
  return { check, root: root ?? repoRoot };
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

export function emit(files: Map<string, string>, check: boolean, owned: string[] = [], base = repoRoot): number {
  const rel = (p: string) => relative(base, p) || p;
  if (check) {
    const stale: string[] = [];
    for (const [path, content] of files) {
      if (!existsSync(path)) stale.push(`${rel(path)} (missing)`);
      else if (readFileSync(path, "utf8") !== content) stale.push(`${rel(path)} (differs)`);
    }
    for (const dir of owned) for (const f of filesUnder(dir)) if (!files.has(f)) stale.push(`${rel(f)} (not generated any more)`);
    if (stale.length) {
      console.error(`generated files are out of date:\n${stale.map((s) => `  ${s}`).join("\n")}\nre-run the generator without --check`);
      return 1;
    }
    console.log(`${files.size} generated files are current`);
    return 0;
  }
  for (const dir of owned) rmSync(dir, { recursive: true, force: true });
  for (const [path, content] of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return 0;
}
