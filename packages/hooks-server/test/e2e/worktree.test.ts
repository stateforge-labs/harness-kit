import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type RunningServer } from "./harness.ts";
import { ClaudeHook, EnvVar, WORKTREE_BRANCH_PREFIX, WORKTREE_DIR, processEnv } from "@stateforge-labs/harness-hooks";
import { OWN_PATH } from "./middleware-modules/worktree-own.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "harness-hooks-worktree-")));
let srv: RunningServer;
let own: RunningServer;
beforeAll(async () => {
  srv = await startServer();
  own = await startServer({ [EnvVar.HookMiddleware]: join(import.meta.dir, "middleware-modules", "worktree-own.ts") });
});
afterAll(async () => {
  await Promise.all([srv.stop(), own.stop()]);
  rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string => {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", env: { ...processEnv(), GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  return r.stdout.toString().trim();
};

function repo(name: string, withOrigin: boolean): { dir: string; originHead: string } {
  const dir = join(root, name);
  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "commit", "-q", "--allow-empty", "-m", "first");
  let originHead = "";
  if (withOrigin) {
    git(root, "init", "-q", "--bare", `${name}-origin.git`);
    git(dir, "remote", "add", "origin", join(root, `${name}-origin.git`));
    git(dir, "push", "-q", "origin", "main");
    originHead = git(dir, "rev-parse", "HEAD");
    git(dir, "commit", "-q", "--allow-empty", "-m", "local only");
  }
  return { dir, originHead };
}

const post = async (s: RunningServer, body: Record<string, unknown>) => {
  const res = await fetch(`${s.base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: `wt-${crypto.randomUUID()}`, transcript_path: "/x", ...body }) });
  return (await res.json()) as { hookSpecificOutput?: { hookEventName?: string; worktreePath?: string } };
};
const create = (s: RunningServer, cwd: string, name: string) => post(s, { hook_event_name: ClaudeHook.WorktreeCreate, cwd, name });
const remove = (s: RunningServer, cwd: string, path: string) => post(s, { hook_event_name: ClaudeHook.WorktreeRemove, cwd, worktree_path: path });

describe("e2e: Claude worktree hooks get Claude's own git behaviour by default", () => {
  test("WorktreeCreate adds <repo>/.claude/worktrees/<name> on branch worktree-<name> from origin's branch, untracked, and answers its path", async () => {
    const { dir, originHead } = repo("with-origin", true);
    const answer = await create(srv, join(dir), "feat-a");
    const path = join(dir, WORKTREE_DIR, "feat-a");
    expect(answer).toEqual({ hookSpecificOutput: { hookEventName: ClaudeHook.WorktreeCreate, worktreePath: path } });
    expect(git(dir, "worktree", "list", "--porcelain")).toContain(`worktree ${path}`);
    expect(git(path, "rev-parse", "--abbrev-ref", "HEAD")).toBe(`${WORKTREE_BRANCH_PREFIX}feat-a`);
    expect(git(path, "rev-parse", "HEAD")).toBe(originHead);
    expect(git(path, "rev-parse", "--abbrev-ref", "@{upstream}")).toBe("");
  });

  test("without a remote it branches from HEAD; from a subfolder it still uses the repository root; a second call answers the same path", async () => {
    const { dir } = repo("no-origin", false);
    mkdirSync(join(dir, "sub"));
    const path = join(dir, WORKTREE_DIR, "feat-b");
    expect((await create(srv, join(dir, "sub"), "feat-b")).hookSpecificOutput?.worktreePath).toBe(path);
    expect(git(path, "rev-parse", "HEAD")).toBe(git(dir, "rev-parse", "HEAD"));
    expect((await create(srv, dir, "feat-b")).hookSpecificOutput?.worktreePath).toBe(path);
  });

  test("a name that is not a slug, or a folder that is not a git repository, gets no path and creates nothing", async () => {
    const { dir } = repo("bad-names", false);
    for (const name of ["../escape", "a/b", ".hidden", ""]) expect(await create(srv, dir, name)).toEqual({});
    expect(existsSync(join(dir, WORKTREE_DIR))).toBe(false);
    const plain = join(root, "not-a-repo");
    mkdirSync(plain);
    expect(await create(srv, plain, "x")).toEqual({});
  });

  test("WorktreeRemove removes the worktree and its branch; a branch with its own commits is kept", async () => {
    const { dir } = repo("remove", false);
    const clean = (await create(srv, dir, "clean")).hookSpecificOutput!.worktreePath!;
    const worked = (await create(srv, dir, "worked")).hookSpecificOutput!.worktreePath!;
    git(worked, "commit", "-q", "--allow-empty", "-m", "work");
    await remove(srv, dir, clean);
    await remove(srv, dir, worked);
    expect(existsSync(clean)).toBe(false);
    expect(existsSync(worked)).toBe(false);
    expect(git(dir, "branch", "--list", `${WORKTREE_BRANCH_PREFIX}clean`)).toBe("");
    expect(git(dir, "branch", "--list", `${WORKTREE_BRANCH_PREFIX}worked`)).toContain(`${WORKTREE_BRANCH_PREFIX}worked`);
  });

  test("WorktreeRemove leaves alone a path outside <repo>/.claude/worktrees, even a registered worktree", async () => {
    const { dir } = repo("outside", false);
    const elsewhere = join(root, "outside-wt");
    git(dir, "worktree", "add", "-q", "-b", "elsewhere", elsewhere);
    await remove(srv, dir, elsewhere);
    expect(existsSync(elsewhere)).toBe(true);
  });

  test("a consumer layer that answers a worktree path wins, and the default creates nothing", async () => {
    const { dir } = repo("consumer", false);
    expect((await create(own, dir, "mine")).hookSpecificOutput?.worktreePath).toBe(OWN_PATH);
    expect(existsSync(join(dir, WORKTREE_DIR, "mine"))).toBe(false);
  });
});
