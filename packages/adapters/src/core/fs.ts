import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Stamped {
  readonly path: string;
  readonly mtimeMs: number;
  readonly size: number;
}

export function listFiles(dir: string, accept: (name: string) => boolean, skip?: (path: string) => boolean): string[] {
  const found: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skip?.(path)) {
        found.push(...listFiles(path, accept, skip));
      }
    } else if (entry.isFile() && accept(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

export function statFiles(paths: readonly string[]): Stamped[] {
  const stamped: Stamped[] = [];
  for (const path of paths) {
    try {
      const info = statSync(path);
      stamped.push({ path, mtimeMs: info.mtimeMs, size: info.size });
    } catch {
      continue;
    }
  }
  return stamped;
}

export function newestFirst(files: readonly Stamped[]): Stamped[] {
  return [...files].sort((a, b) => b.mtimeMs - a.mtimeMs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
