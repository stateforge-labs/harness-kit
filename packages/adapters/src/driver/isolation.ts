import { join } from "node:path";
import type { RuntimeFs } from "../core/io.ts";
import { type EnvSource, EnvVar } from "../env.ts";
import { CWD_PREFIX, ISOLATION_PREFIX, SCRATCH_PREFIX, TMP_FALLBACK } from "./constants.ts";

export function tmpRoot(env: EnvSource): string {
  const value = env[EnvVar.Tmpdir];
  return value === undefined || value === "" ? TMP_FALLBACK : value;
}

export function createDir(fs: RuntimeFs, env: EnvSource, prefix: string): Promise<string | null> {
  return fs.makeTempDir(prefix, tmpRoot(env));
}

function owned(name: string): boolean {
  return name.startsWith(ISOLATION_PREFIX) || name.startsWith(SCRATCH_PREFIX) || name.startsWith(CWD_PREFIX);
}

export async function sweepDirs(
  fs: RuntimeFs,
  env: EnvSource,
  nowMs: number,
  olderThanMs: number,
  keep: ReadonlySet<string>,
): Promise<number> {
  const root = tmpRoot(env);
  const entries = await fs.listDir(root);
  if (entries === null) {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory || !owned(entry.name)) {
      continue;
    }
    const path = join(root, entry.name);
    if (keep.has(path) || nowMs - entry.mtimeMs < olderThanMs) {
      continue;
    }
    if (await fs.removeTree(path)) {
      removed += 1;
    }
  }
  return removed;
}
