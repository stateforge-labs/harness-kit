import { execFile } from "node:child_process";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Kind, type WorktreeRef } from "./event.ts";
import type { Middleware } from "./pipeline.ts";

export const WORKTREE_TIMEOUT_MS = 60_000;
export const WORKTREE_DIR = join(".claude", "worktrees");
export const WORKTREE_BRANCH_PREFIX = "worktree-";

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GIT_DIR = ".git";
const BASE_REFS = ["refs/remotes/origin/HEAD", "refs/remotes/origin/main", "refs/remotes/origin/master"];

const run = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["-C", cwd, ...args], { timeout: WORKTREE_TIMEOUT_MS });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function repoRoot(cwd: string): Promise<string | null> {
  const common = await git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return common && basename(common) === GIT_DIR ? dirname(common) : null;
}

async function isWorktree(root: string, path: string): Promise<boolean> {
  const list = await git(root, "worktree", "list", "--porcelain");
  return list !== null && list.split("\n").includes(`worktree ${path}`);
}

async function baseRef(root: string): Promise<string> {
  for (const ref of BASE_REFS) if (await git(root, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`)) return ref;
  return "HEAD";
}

export async function createWorktree(ref: WorktreeRef): Promise<string | null> {
  if (!ref.cwd || !isAbsolute(ref.cwd) || !ref.name || !NAME.test(ref.name)) return null;
  const root = await repoRoot(ref.cwd);
  if (!root) return null;
  const path = join(root, WORKTREE_DIR, ref.name);
  if (await isWorktree(root, path)) return path;
  const branch = `${WORKTREE_BRANCH_PREFIX}${ref.name}`;
  const exists = await git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`);
  const added = exists
    ? await git(root, "worktree", "add", path, branch)
    : await git(root, "worktree", "add", "--no-track", "-b", branch, path, await baseRef(root));
  return added !== null && (await isWorktree(root, path)) ? path : null;
}

export async function removeWorktree(ref: WorktreeRef): Promise<boolean> {
  if (!ref.path || !isAbsolute(ref.path)) return false;
  const path = resolve(ref.path);
  const name = basename(path);
  if (!NAME.test(name)) return false;
  const root = await repoRoot(path);
  if (!root || path !== join(root, WORKTREE_DIR, name) || !(await isWorktree(root, path))) return false;
  if ((await git(root, "worktree", "remove", "--force", "--force", path)) === null) return false;
  await git(root, "branch", "-d", `${WORKTREE_BRANCH_PREFIX}${name}`);
  return true;
}

export const worktreeLayer: Middleware = async (ctx, next) => {
  const { kind, worktree } = ctx.event;
  if (!worktree || (kind !== Kind.WorktreeCreate && kind !== Kind.WorktreeRemove)) return next();
  const below = await next();
  if (kind === Kind.WorktreeRemove) {
    await removeWorktree(worktree);
    return below;
  }
  if (below.worktree) return below;
  const path = await createWorktree(worktree);
  return path ? { ...below, worktree: { path } } : below;
};
