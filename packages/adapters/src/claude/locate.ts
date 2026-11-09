import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { Dir } from "../constants.ts";
import { listFiles, newestFirst, statFiles } from "../core/fs.ts";
import { adapterEnv, type AdapterEnv } from "../env.ts";
import { ClaudeDir, ClaudeFile, ClaudeScan } from "./constants.ts";

export function claudeHome(env: AdapterEnv = adapterEnv()): string {
  return join(env.home, Dir.Claude);
}

export function claudeProjectsRoot(env: AdapterEnv = adapterEnv()): string {
  return join(claudeHome(env), ClaudeDir.Projects);
}

export interface LocatedTranscript {
  readonly path: string;
  readonly mtimeMs: number;
}

export function locateClaudeTranscript(sessionId: string, root: string = claudeProjectsRoot()): LocatedTranscript | null {
  let dirs: string[];
  try {
    dirs = readdirSync(root);
  } catch {
    return null;
  }
  let best: LocatedTranscript | null = null;
  for (const dir of dirs) {
    const path = join(root, dir, `${sessionId}${ClaudeFile.Transcript}`);
    try {
      const mtimeMs = statSync(path).mtimeMs;
      if (best === null || mtimeMs > best.mtimeMs) {
        best = { path, mtimeMs };
      }
    } catch {
      continue;
    }
  }
  return best;
}

export function listClaudeTranscripts(root: string, options: { readonly sinceMs?: number } = {}): string[] {
  const floor = options.sinceMs ?? Number.NEGATIVE_INFINITY;
  const found = listFiles(
    root,
    (name) => name.endsWith(ClaudeFile.Transcript),
    (path) => basename(path) === ClaudeDir.Subagents,
  );
  return newestFirst(statFiles(found))
    .filter((file) => file.mtimeMs >= floor)
    .map((file) => file.path);
}

export function transcriptHasCompactBoundary(path: string): boolean {
  const needle = Buffer.from(ClaudeScan.BoundaryWord);
  const buffer = Buffer.allocUnsafe(ClaudeScan.ChunkBytes + needle.length - 1);
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return false;
  }
  try {
    let carry = 0;
    for (;;) {
      const read = readSync(fd, buffer, carry, ClaudeScan.ChunkBytes, null);
      if (read <= 0) {
        return false;
      }
      const end = carry + read;
      if (buffer.subarray(0, end).includes(needle)) {
        return true;
      }
      carry = Math.min(needle.length - 1, end);
      Buffer.from(buffer.subarray(end - carry, end)).copy(buffer, 0);
    }
  } catch {
    return false;
  } finally {
    closeSync(fd);
  }
}
