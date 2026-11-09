import { basename, dirname, sep } from "node:path";
import type { DirEntryInfo, RuntimeFs } from "../core/io.ts";

export interface FakeDir {
  readonly path: string;
  readonly mtimeMs: number;
}

export interface FakeFsInit {
  readonly dirs?: readonly (string | FakeDir)[];
  readonly files?: Readonly<Record<string, string>>;
  readonly executables?: readonly string[];
  readonly createdAtMs?: number;
}

/** An in-memory RuntimeFs that exposes its directories and the paths removed. */
export type FakeFs = RuntimeFs & {
  readonly dirs: ReadonlySet<string>;
  readonly removed: readonly string[];
};

const FAKE = {
  Separator: sep,
  Counter: 1,
} as const;

function isUnder(path: string, parent: string): boolean {
  return path.startsWith(`${parent}${FAKE.Separator}`);
}

/** An in-memory RuntimeFs for tests, seeded from `initial`. */
export function fakeFs(initial: FakeFsInit = {}): FakeFs {
  const createdAt = initial.createdAtMs ?? 0;
  const dirs = new Set<string>();
  const mtimes = new Map<string, number>();
  const files = new Map(Object.entries(initial.files ?? {}));
  const executables = new Set(initial.executables ?? []);
  const removed: string[] = [];
  let counter = FAKE.Counter;

  const addDir = (path: string, mtimeMs: number): void => {
    dirs.add(path);
    mtimes.set(path, mtimeMs);
  };

  for (const entry of initial.dirs ?? []) {
    if (typeof entry === "string") {
      addDir(entry, createdAt);
    } else {
      addDir(entry.path, entry.mtimeMs);
    }
  }

  return {
    dirs,
    removed,
    async makeTempDir(prefix, parent) {
      const path = `${parent}${FAKE.Separator}${prefix}${counter}`;
      counter += 1;
      addDir(path, createdAt);
      return path;
    },
    async removeTree(path) {
      if (!dirs.has(path)) {
        return false;
      }
      for (const dir of [...dirs]) {
        if (dir === path || isUnder(dir, path)) {
          dirs.delete(dir);
          mtimes.delete(dir);
        }
      }
      for (const file of [...files.keys()]) {
        if (isUnder(file, path)) {
          files.delete(file);
        }
      }
      removed.push(path);
      return true;
    },
    async listDir(path) {
      if (!dirs.has(path)) {
        return null;
      }
      const entries: DirEntryInfo[] = [];
      for (const dir of dirs) {
        if (dir !== path && dirname(dir) === path) {
          entries.push({ name: basename(dir), mtimeMs: mtimes.get(dir) ?? createdAt, isDirectory: true });
        }
      }
      for (const file of files.keys()) {
        if (dirname(file) === path) {
          entries.push({ name: basename(file), mtimeMs: createdAt, isDirectory: false });
        }
      }
      return entries;
    },
    async exists(path) {
      return dirs.has(path) || files.has(path);
    },
    async isExecutable(path) {
      return executables.has(path);
    },
    async readText(path, maxBytes) {
      const text = files.get(path);
      return text === undefined ? null : text.slice(0, maxBytes);
    },
  };
}
