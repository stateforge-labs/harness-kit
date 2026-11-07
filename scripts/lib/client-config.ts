// Pure renderers for the configuration each harness needs to talk to the server. No file or process is touched here.
import { adapters, shimPath } from "@homelab/harness-hooks";

export interface RenderOptions {
  /** Base URL of the server, no trailing slash. */
  url: string;
  /** Absolute path of the repository checkout (the shim lives in it). */
  repo: string;
  /** Absolute path of the bun binary. */
  bun: string;
}

/** Claude Code events that cannot use an `http` hook and so go through the command shim (R-2026-11-07-03). */
const CLAUDE_COMMAND_ONLY: ReadonlySet<string> = new Set(["SessionStart", "Setup"]);

const events = (harness: string): string[] => Object.keys(adapters.get(harness)!.jsonSchemas()).sort();
const shim = (o: RenderOptions, harness: string) => `${o.bun} ${shimPath} --harness ${harness}`;

/**
 * The `hooks` block for Claude Code's settings.json: every event the adapter knows. `http` hooks POST straight to the server
 * (`/hook` is the Claude route); SessionStart and Setup use the command shim. No matcher, so each hook sees every occurrence.
 * A failed or refused call never blocks the agent (Claude treats a non-2xx or unreachable http hook as non-blocking).
 */
export function claudeHooks(o: RenderOptions): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const event of events("claude")) {
    const handler = CLAUDE_COMMAND_ONLY.has(event)
      ? { type: "command", command: `HOOK_URL=${o.url} ${shim(o, "claude")}`, timeout: 10 }
      : { type: "http", url: `${o.url}/hook`, timeout: 10 };
    hooks[event] = [{ hooks: [handler] }];
  }
  return { hooks };
}

/** Codex's `hooks.json`: a command hook running the shim on every event the adapter knows. */
export function codexHooks(o: RenderOptions): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const event of events("codex")) {
    hooks[event] = [{ hooks: [{ type: "command", command: `HOOK_URL=${o.url} ${shim(o, "codex")}` }] }];
  }
  return { hooks };
}

/** A systemd user unit that runs the server on loopback with its log under the user's state directory. */
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
    `Environment=PORT=${port}`,
    "Environment=HOOK_HOST=127.0.0.1",
    `Environment=HOOK_LOG_FILE=${stateDir}/events.jsonl`,
    "Restart=on-failure",
    "RestartSec=2",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}
