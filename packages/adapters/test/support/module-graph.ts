import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const SRC = join(import.meta.dir, "..", "..", "src");

export interface Edge {
  readonly from: string;
  readonly spec: string;
  readonly typeOnly: boolean;
  readonly to: string | null;
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

interface ImportRecord {
  readonly spec: string;
  readonly typeOnly: boolean;
}

function importRecords(src: string): ImportRecord[] {
  const out: ImportRecord[] = [];
  for (const m of src.matchAll(/(?:^|\n)\s*((?:import|export)\s[^;]*?)from\s*["']([^"']+)["']/g)) {
    out.push({ spec: m[2]!, typeOnly: /^(?:import|export)\s+type\s/.test(m[1]!) });
  }
  for (const m of src.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push({ spec: m[1]!, typeOnly: false });
  for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push({ spec: m[1]!, typeOnly: false });
  return out;
}

export function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return entry.endsWith(".ts") ? [posix(relative(SRC, path))] : [];
  });
}

export function edgesOf(rel: string): Edge[] {
  const file = join(SRC, rel);
  return importRecords(readFileSync(file, "utf8")).map(({ spec, typeOnly }) => ({
    from: rel,
    spec,
    typeOnly,
    to: spec.startsWith(".") ? posix(relative(SRC, resolve(dirname(file), spec))) : null,
  }));
}

export function reachable(entries: readonly string[]): { readonly files: Set<string>; readonly bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const rel = queue.shift()!;
    if (files.has(rel)) continue;
    files.add(rel);
    for (const edge of edgesOf(rel)) {
      if (edge.to === null) bare.add(edge.spec);
      else queue.push(edge.to);
    }
  }
  return { files, bare };
}
