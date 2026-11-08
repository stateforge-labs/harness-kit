import { ClaudeHook, EnvDefault, EnvVar, Harness, adapters, shimPath } from "@homelab/harness-hooks";

export interface RenderOptions {
  url: string;
  repo: string;
  bun: string;
}

const CLAUDE_COMMAND_ONLY: ReadonlySet<string> = new Set([ClaudeHook.SessionStart, ClaudeHook.Setup]);
const HOOK_TIMEOUT_S = 10;

const events = (harness: string): string[] => Object.keys(adapters.get(harness)!.jsonSchemas()).sort();
const shim = (o: RenderOptions, harness: string) => `${o.bun} ${shimPath} --harness ${harness}`;

export function claudeHooks(o: RenderOptions): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const event of events(Harness.Claude)) {
    const handler = CLAUDE_COMMAND_ONLY.has(event)
      ? { type: "command", command: `${EnvVar.HookUrl}=${o.url} ${shim(o, Harness.Claude)}`, timeout: HOOK_TIMEOUT_S }
      : { type: "http", url: `${o.url}/hook`, timeout: HOOK_TIMEOUT_S };
    hooks[event] = [{ hooks: [handler] }];
  }
  return { hooks };
}

export function codexHooks(o: RenderOptions): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const event of events(Harness.Codex)) {
    hooks[event] = [{ hooks: [{ type: "command", command: `${EnvVar.HookUrl}=${o.url} ${shim(o, Harness.Codex)}` }] }];
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
    `Environment=${EnvVar.HookLogFile}=${stateDir}/events.jsonl`,
    "Restart=on-failure",
    "RestartSec=2",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}
