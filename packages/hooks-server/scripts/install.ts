// Prints, or with --apply installs, the configuration that connects a harness to the hook server.
//   bun scripts/install.ts opencode  [--apply] [--config-dir <dir>]   copy the plugin into OpenCode's plugins/ directory
//   bun scripts/install.ts claude                                       print the `hooks` block for Claude Code's settings.json
//   bun scripts/install.ts codex     [--apply] [--codex-home <dir>]    print (or write) Codex's hooks.json
//   bun scripts/install.ts service   [--apply] [--unit-dir <dir>] [--no-systemctl]   the systemd user unit that runs the server
// Common: --url <base url> (default http://127.0.0.1:8787).
// Nothing is changed without --apply. Claude's settings are never written: they are managed in dotfiles, so the block is printed
// for you to merge there.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { opencodePluginPath } from "@homelab/harness-hooks";
import { claudeHooks, codexHooks, systemdUnit, type RenderOptions } from "./lib/client-config.ts";

const repo = resolve(import.meta.dir, "..");
const argv = process.argv.slice(2);
const target = argv[0];
const flag = (name: string) => argv.includes(name);
const value = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const fail = (msg: string): never => {
  console.error(`install: ${msg}`);
  process.exit(1);
};

const url = (value("--url") ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
try {
  new URL(url);
} catch {
  fail(`--url is not a URL: ${url}`);
}
const opts: RenderOptions = { url, repo, bun: process.execPath };
const apply = flag("--apply");

/** Writes `content` to `path` (creating folders) unless it is already there; says what it did. Never replaces a different file. */
function writeNew(path: string, content: string): void {
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") === content) return void console.log(`unchanged: ${path}`);
    fail(`${path} already exists with different content; merge it by hand (this script does not overwrite it)`);
  }
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote: ${path}`);
}

switch (target) {
  case "opencode": {
    const dir = value("--config-dir") ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode");
    const from = opencodePluginPath;
    const to = join(dir, "plugins", "harness-hooks.ts");
    if (url !== "http://127.0.0.1:8787") console.error("note: the plugin reads HOOK_URL from OpenCode's environment; --url is not baked into it");
    if (!apply) {
      console.log(`would copy ${from}\n         to ${to}\n(re-run with --apply; restart OpenCode's background service so it loads the plugin)`);
      break;
    }
    if (existsSync(to) && readFileSync(to, "utf8") !== readFileSync(from, "utf8")) console.log(`updating ${to} (it differs from the repository copy)`);
    mkdirSync(join(dir, "plugins"), { recursive: true });
    copyFileSync(from, to);
    console.log(`installed: ${to}`);
    break;
  }
  case "claude": {
    if (apply) fail("claude settings are managed in dotfiles; merge the printed block into settings.json there (no --apply)");
    console.log(JSON.stringify(claudeHooks(opts), null, 2));
    break;
  }
  case "codex": {
    const home = value("--codex-home") ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
    const content = JSON.stringify(codexHooks(opts), null, 2) + "\n";
    if (!apply) {
      console.log(content.trimEnd());
      console.error(`(would be written to ${join(home, "hooks.json")} with --apply)`);
      break;
    }
    writeNew(join(home, "hooks.json"), content);
    break;
  }
  case "service": {
    const unitDir = value("--unit-dir") ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "systemd", "user");
    const stateDir = join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "harness-hooks");
    const unit = systemdUnit(opts, stateDir);
    if (!apply) {
      console.log(unit.trimEnd());
      console.error(`(would be written to ${join(unitDir, "harness-hooks.service")}, then enabled with systemctl --user)`);
      break;
    }
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    writeNew(join(unitDir, "harness-hooks.service"), unit);
    if (!flag("--no-systemctl")) {
      for (const args of [["daemon-reload"], ["enable", "--now", "harness-hooks.service"]]) {
        const r = Bun.spawnSync(["systemctl", "--user", ...args], { stdout: "inherit", stderr: "inherit" });
        if (r.exitCode !== 0) fail(`systemctl --user ${args.join(" ")} failed (exit ${r.exitCode})`);
      }
      console.log("service enabled and started");
    }
    break;
  }
  default:
    fail("usage: install.ts <opencode|claude|codex|service> [--apply] [--url <base>] [--config-dir|--codex-home|--unit-dir <dir>] [--no-systemctl]");
}
