import { ClaudeHook, EnvDefault, EnvVar, Harness, WORKTREE_TIMEOUT_MS, adapters, shimPath } from "@stateforge-labs/harness-hooks";

export interface RenderOptions {
  url: string;
  repo: string;
  bun: string;
  curlShimFile?: (harness: string) => string;
  socketPath?: string;
}

const CLAUDE_COMMAND_ONLY: ReadonlySet<string> = new Set([ClaudeHook.SessionStart, ClaudeHook.Setup]);
const CLAUDE_WORKTREE_HOOKS: ReadonlySet<string> = new Set([ClaudeHook.WorktreeCreate, ClaudeHook.WorktreeRemove]);
const HOOK_TIMEOUT_S = 10;
const WORKTREE_HOOK_TIMEOUT_S = WORKTREE_TIMEOUT_MS / 1000;

const events = (harness: string): string[] => Object.keys(adapters.get(harness)!.jsonSchemas()).sort();
const shimCommand = (o: RenderOptions, harness: string, event: string): string =>
  o.curlShimFile ? `${o.curlShimFile(harness)} ${event}` : `${EnvVar.HookUrl}=${o.url} ${o.bun} ${shimPath} --harness ${harness}`;

export function claudeHooks(o: RenderOptions): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const event of events(Harness.Claude)) {
    const handler = CLAUDE_COMMAND_ONLY.has(event)
      ? { type: "command", command: shimCommand(o, Harness.Claude, event), timeout: HOOK_TIMEOUT_S }
      : { type: "http", url: `${o.url}/hook`, timeout: CLAUDE_WORKTREE_HOOKS.has(event) ? WORKTREE_HOOK_TIMEOUT_S : HOOK_TIMEOUT_S };
    hooks[event] = [{ hooks: [handler] }];
  }
  return { hooks };
}

export function codexHooks(o: RenderOptions): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const event of events(Harness.Codex)) {
    hooks[event] = [{ hooks: [{ type: "command", command: shimCommand(o, Harness.Codex, event) }] }];
  }
  return { hooks };
}

export function systemdUnit(o: RenderOptions, stateDir: string): string {
  const port = new URL(o.url).port || "80";
  return [
    "[Unit]",
    "Description=harness-hooks: hook server for Claude Code, Codex and OpenCode",
    "After=network.target",
    "",
    "[Service]",
    `WorkingDirectory=${o.repo}`,
    `ExecStart=${o.bun} ${o.repo}/src/server.ts`,
    `Environment=${EnvVar.Port}=${port}`,
    `Environment=${EnvVar.HookHost}=${EnvDefault.HookHost}`,
    ...(o.socketPath ? [`Environment=${EnvVar.HookSocket}=${o.socketPath}`] : []),
    `Environment=${EnvVar.HookLogFile}=${stateDir}/events.jsonl`,
    "Restart=on-failure",
    "RestartSec=2",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}
